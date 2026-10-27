"""The attempt engine. The server clock is the only clock that counts.

Every entry point locks the attempt row, then calls `sync_attempt`, which
finalises any section whose time (plus grace) has run out. This means an
abandoned attempt is closed the next time anyone looks at it: the student,
the teacher's dashboard, or the result page. No background worker needed.
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from classrooms.models import Enrollment
from exams.models import AttemptAllowance, Exam, Question

from .models import Answer, Attempt, IntegrityEvent, SectionAttempt

# Accept requests this long after a deadline without penalty, to cover network lag
# on a submit pressed in the last second.
NETWORK_LEEWAY = timedelta(seconds=10)
MAX_TEXT_ANSWER_CHARS = 20_000
MAX_INTEGRITY_EVENTS = 500


class Conflict(APIException):
    status_code = 409
    default_detail = "This attempt has changed. Refresh to continue."
    default_code = "conflict"


# ─── Access ───────────────────────────────────────────────────────────────────


def is_enrolled(student, exam: Exam) -> bool:
    return Enrollment.objects.filter(classroom_id=exam.classroom_id, student=student).exists()


def get_student_exam(student, exam_id) -> Exam:
    exam = (
        Exam.objects.select_related("classroom", "teacher")
        .filter(pk=exam_id, is_published=True, classroom__enrollments__student=student)
        .first()
    )
    if exam is None:
        raise NotFound("Exam not found.")
    return exam


def allowed_attempts(exam: Exam, student) -> int:
    extra = AttemptAllowance.objects.filter(exam=exam, student=student).values_list("extra_attempts", flat=True).first()
    return exam.max_attempts + (extra or 0)


def lock_attempt(attempt_id) -> Attempt:
    attempt = (
        Attempt.objects.select_for_update(of=("self",))
        .select_related("exam", "exam__classroom", "student")
        .filter(pk=attempt_id)
        .first()
    )
    if attempt is None:
        raise NotFound("Attempt not found.")
    return attempt


def get_attempt_for_user(user, attempt_id, *, for_update=False) -> Attempt:
    """Students see only their own attempts; teachers only attempts on their exams."""

    attempt = lock_attempt(attempt_id) if for_update else (
        Attempt.objects.select_related("exam", "exam__classroom", "student").filter(pk=attempt_id).first()
    )
    if attempt is None:
        raise NotFound("Attempt not found.")
    if user.is_student and attempt.student_id == user.id:
        return attempt
    if user.is_approved_teacher and attempt.exam.teacher_id == user.id:
        return attempt
    raise NotFound("Attempt not found.")


# ─── Timing ───────────────────────────────────────────────────────────────────


def hard_limit(section_attempt: SectionAttempt, exam: Exam):
    """The last moment the server accepts work for this section."""

    return section_attempt.deadline + exam.grace_period + NETWORK_LEEWAY


def overtime_seconds(section_attempt: SectionAttempt, submitted_at) -> int:
    late_by = submitted_at - (section_attempt.deadline + NETWORK_LEEWAY)
    return max(0, int(late_by.total_seconds()))


def section_deadline(exam: Exam, start, minutes: int):
    return min(start + timedelta(minutes=minutes), exam.available_until)


def sync_attempt(attempt: Attempt, now=None) -> Attempt:
    """Finalise sections whose time is up; complete the attempt when nothing is left."""

    now = now or timezone.now()
    if attempt.status != Attempt.Status.IN_PROGRESS:
        return attempt

    exam = attempt.exam
    section_attempts = list(attempt.section_attempts.all())
    for section_attempt in section_attempts:
        if section_attempt.status == SectionAttempt.Status.IN_PROGRESS:
            limit = hard_limit(section_attempt, exam)
            if now > limit:
                section_attempt.status = SectionAttempt.Status.TIMED_OUT
                section_attempt.submitted_at = section_attempt.deadline + exam.grace_period
                section_attempt.overtime_seconds = int(exam.grace_period.total_seconds())
                section_attempt.save(update_fields=["status", "submitted_at", "overtime_seconds"])
        elif section_attempt.status == SectionAttempt.Status.LOCKED and now >= exam.available_until:
            # The exam closed while the student was on a break; unstarted sections are lost.
            section_attempt.status = SectionAttempt.Status.TIMED_OUT
            section_attempt.submitted_at = exam.available_until
            section_attempt.save(update_fields=["status", "submitted_at"])

    if all(section_attempt.is_finished for section_attempt in section_attempts):
        complete_attempt(attempt, section_attempts, now)
    return attempt


def sync_committed(user, attempt_id, now) -> Attempt:
    """Finalise expired time in its own transaction, so a later error in the same request can't undo it."""

    with transaction.atomic():
        return sync_attempt(get_attempt_for_user(user, attempt_id, for_update=True), now)


def sync_open_attempts(queryset, now=None) -> None:
    """Lazily finalise expired attempts before listing them."""

    now = now or timezone.now()
    for attempt_id in queryset.filter(status=Attempt.Status.IN_PROGRESS).values_list("id", flat=True):
        with transaction.atomic():
            sync_attempt(lock_attempt(attempt_id), now)


# ─── Lifecycle ────────────────────────────────────────────────────────────────


@transaction.atomic
def start_attempt(exam: Exam, student, mode: str, now=None) -> tuple[Attempt, bool]:
    """Returns (attempt, created). An unfinished attempt is resumed instead of duplicated."""

    now = now or timezone.now()
    active = Attempt.objects.filter(exam=exam, student=student, status=Attempt.Status.IN_PROGRESS).first()
    if active:
        active = sync_attempt(lock_attempt(active.pk), now)
        if active.status == Attempt.Status.IN_PROGRESS:
            return active, False

    if not exam.is_open(now):
        raise ValidationError({"detail": "This exam is not open right now."})
    if not is_enrolled(student, exam):
        raise PermissionDenied("You are not in this exam's class.")

    used = Attempt.objects.filter(exam=exam, student=student).count()
    if used >= allowed_attempts(exam, student):
        raise ValidationError({"detail": "You have used all your attempts for this exam."})

    sections = list(exam.sections.prefetch_related("questions"))
    if not sections:
        raise ValidationError({"detail": "This exam has no sections yet."})
    if mode == Attempt.Mode.MODULAR and (not exam.allow_modular or len(sections) < 2):
        raise ValidationError({"detail": "This exam can only be attempted in one go."})

    question_order, option_order = build_shuffles(exam, sections)
    try:
        attempt = Attempt.objects.create(
            exam=exam,
            student=student,
            attempt_number=used + 1,
            mode=mode,
            started_at=now,
            question_order=question_order,
            option_order=option_order,
            max_score=Decimal(sum(q.marks for s in sections for q in s.questions.all())),
        )
    except IntegrityError:
        # A double-click raced us; the other request created the attempt.
        raise Conflict("You already have this exam open. Refresh the page.")

    total_minutes = sum(section.duration_minutes for section in sections)
    for index, section in enumerate(sections):
        section_attempt = SectionAttempt(attempt=attempt, section=section, order=section.order)
        if mode == Attempt.Mode.FULL:
            section_attempt.status = SectionAttempt.Status.IN_PROGRESS
            section_attempt.started_at = now
            section_attempt.deadline = section_deadline(exam, now, total_minutes)
        elif index == 0:
            section_attempt.status = SectionAttempt.Status.IN_PROGRESS
            section_attempt.started_at = now
            section_attempt.deadline = section_deadline(exam, now, section.duration_minutes)
        section_attempt.save()
    return attempt, True


def build_shuffles(exam: Exam, sections) -> tuple[dict, dict]:
    rng = random.SystemRandom()
    question_order, option_order = {}, {}
    for section in sections:
        ids = [q.id for q in section.questions.all()]
        if exam.shuffle_questions:
            rng.shuffle(ids)
        question_order[str(section.id)] = ids
        if exam.shuffle_options:
            for question in section.questions.all():
                if question.type == Question.Type.MCQ:
                    indexes = list(range(len(question.options)))
                    rng.shuffle(indexes)
                    option_order[str(question.id)] = indexes
    return question_order, option_order


def start_next_section(user, attempt_id, now=None) -> Attempt:
    now = now or timezone.now()
    sync_committed(user, attempt_id, now)
    with transaction.atomic():
        return start_next_section_locked(get_attempt_for_user(user, attempt_id, for_update=True), now)


def start_next_section_locked(attempt: Attempt, now) -> Attempt:
    if attempt.status != Attempt.Status.IN_PROGRESS:
        raise Conflict("This attempt has already ended.")
    if attempt.mode != Attempt.Mode.MODULAR:
        raise ValidationError({"detail": "Sections only start separately in section-by-section mode."})

    section_attempts = list(attempt.section_attempts.select_related("section"))
    if any(sa.status == SectionAttempt.Status.IN_PROGRESS for sa in section_attempts):
        return attempt  # already started (e.g. a repeated click)

    next_section = next((sa for sa in section_attempts if sa.status == SectionAttempt.Status.LOCKED), None)
    if next_section is None:
        raise Conflict("There are no sections left to start.")
    next_section.status = SectionAttempt.Status.IN_PROGRESS
    next_section.started_at = now
    next_section.deadline = section_deadline(attempt.exam, now, next_section.section.duration_minutes)
    next_section.save(update_fields=["status", "started_at", "deadline"])
    return attempt


def open_question_map(attempt: Attempt, now) -> dict[int, Question]:
    """Questions the student may currently answer."""

    open_sections = [
        sa.section_id
        for sa in attempt.section_attempts.all()
        if sa.status == SectionAttempt.Status.IN_PROGRESS and now <= hard_limit(sa, attempt.exam)
    ]
    return {q.id: q for q in Question.objects.filter(section_id__in=open_sections)}


def write_answers(attempt: Attempt, items: list[dict], now) -> None:
    if not isinstance(items, list):
        raise ValidationError({"detail": "Answers must be a list."})
    questions = open_question_map(attempt, now)
    existing = {a.question_id: a for a in attempt.answers.filter(question_id__in=questions)}

    for item in items:
        if not isinstance(item, dict):
            raise ValidationError({"detail": "Each answer must be an object."})
        question = questions.get(item.get("question_id"))
        if question is None:
            raise Conflict("That question is no longer open. Refresh to continue.")

        answer = existing.get(question.id) or Answer(attempt=attempt, question=question)
        if question.type == Question.Type.MCQ:
            selected = item.get("selected_option")
            if selected is not None and (not isinstance(selected, int) or not 0 <= selected < len(question.options)):
                raise ValidationError({"detail": "Invalid option selected."})
            answer.selected_option = selected
        else:
            text = item.get("text_answer") or ""
            if not isinstance(text, str):
                raise ValidationError({"detail": "Answer text must be text."})
            if len(text) > MAX_TEXT_ANSWER_CHARS:
                raise ValidationError({"detail": f"Answers are limited to {MAX_TEXT_ANSWER_CHARS:,} characters."})
            answer.text_answer = text
        answer.save()
        existing[question.id] = answer


def save_answers(user, attempt_id, items, now=None) -> Attempt:
    now = now or timezone.now()
    sync_committed(user, attempt_id, now)
    with transaction.atomic():
        attempt = get_attempt_for_user(user, attempt_id, for_update=True)
        if attempt.status != Attempt.Status.IN_PROGRESS:
            raise Conflict("Time is up. This attempt has been submitted.")
        write_answers(attempt, items, now)
        return attempt


@transaction.atomic
def submit_section(user, attempt_id, section_attempt_id=None, items=None, now=None) -> Attempt:
    now = now or timezone.now()
    attempt = get_attempt_for_user(user, attempt_id, for_update=True)
    if attempt.status != Attempt.Status.IN_PROGRESS:
        return attempt  # repeated submit: nothing to do

    if items:
        try:
            write_answers(attempt, items, now)
        except Conflict:
            pass  # the section already expired; sync below finalises it with the saved answers

    attempt = sync_attempt(attempt, now)
    if attempt.status != Attempt.Status.IN_PROGRESS:
        return attempt

    open_sections = [sa for sa in attempt.section_attempts.all() if sa.status == SectionAttempt.Status.IN_PROGRESS]
    if attempt.mode == Attempt.Mode.MODULAR:
        if section_attempt_id is None:
            raise ValidationError({"detail": "Say which section you are submitting."})
        target = next((sa for sa in attempt.section_attempts.all() if sa.id == section_attempt_id), None)
        if target is None:
            raise NotFound("Section not found in this attempt.")
        if target.is_finished:
            return attempt
        if target.status != SectionAttempt.Status.IN_PROGRESS:
            raise Conflict("That section has not started.")
        open_sections = [target]

    for section_attempt in open_sections:
        section_attempt.status = SectionAttempt.Status.SUBMITTED
        section_attempt.submitted_at = now
        section_attempt.overtime_seconds = overtime_seconds(section_attempt, now)
        section_attempt.save(update_fields=["status", "submitted_at", "overtime_seconds"])

    section_attempts = list(attempt.section_attempts.all())
    if all(sa.is_finished for sa in section_attempts):
        complete_attempt(attempt, section_attempts, now)
    return attempt


def complete_attempt(attempt: Attempt, section_attempts: list[SectionAttempt], now) -> None:
    attempt.status = Attempt.Status.COMPLETED
    attempt.completed_at = max((sa.submitted_at for sa in section_attempts if sa.submitted_at), default=now)
    attempt.timed_out = any(sa.status == SectionAttempt.Status.TIMED_OUT for sa in section_attempts)
    # Full mode: every section shares one clock, so they all run over by the same amount.
    overtimes = [sa.overtime_seconds for sa in section_attempts]
    attempt.overtime_seconds = max(overtimes, default=0) if attempt.mode == Attempt.Mode.FULL else sum(overtimes)
    attempt.is_overtime = attempt.overtime_seconds > 0

    questions = list(Question.objects.filter(section__exam_id=attempt.exam_id))
    answered = set(attempt.answers.values_list("question_id", flat=True))
    Answer.objects.bulk_create(
        Answer(attempt=attempt, question=question) for question in questions if question.id not in answered
    )
    auto_grade(attempt)
    recompute_score(attempt)
    attempt.save()


def auto_grade(attempt: Attempt) -> None:
    """MCQs are marked automatically; blank written answers get zero without waiting for the teacher."""

    for answer in attempt.answers.select_related("question"):
        question = answer.question
        if question.type == Question.Type.MCQ:
            correct = answer.selected_option is not None and answer.selected_option == question.correct_option
            answer.marks_awarded = Decimal(question.marks if correct else 0)
        elif answer.is_blank:
            answer.marks_awarded = Decimal(0)
        else:
            continue
        answer.save(update_fields=["marks_awarded"])


def recompute_score(attempt: Attempt) -> None:
    answers = list(attempt.answers.all())
    attempt.score = sum((a.marks_awarded for a in answers if a.marks_awarded is not None), Decimal(0))
    pending = any(a.marks_awarded is None for a in answers)
    attempt.grading_status = Attempt.Grading.PENDING if pending else Attempt.Grading.GRADED


# ─── Grading & integrity ──────────────────────────────────────────────────────


def grade_attempt(teacher, attempt_id, grades: list[dict], now=None) -> Attempt:
    now = now or timezone.now()
    sync_committed(teacher, attempt_id, now)
    with transaction.atomic():
        return grade_attempt_locked(teacher, get_attempt_for_user(teacher, attempt_id, for_update=True), grades, now)


def grade_attempt_locked(teacher, attempt: Attempt, grades: list[dict], now) -> Attempt:
    if attempt.status != Attempt.Status.COMPLETED:
        raise ValidationError({"detail": "You can grade an attempt once the student has finished it."})
    if not isinstance(grades, list):
        raise ValidationError({"detail": "Grades must be a list."})

    answers = {a.question_id: a for a in attempt.answers.select_related("question")}
    for grade in grades:
        answer = answers.get(grade.get("question_id")) if isinstance(grade, dict) else None
        if answer is None:
            raise ValidationError({"detail": "A grade refers to a question that is not in this attempt."})

        marks = grade.get("marks")
        if marks in (None, ""):
            answer.marks_awarded = None
        else:
            try:
                marks = Decimal(str(marks)).quantize(Decimal("0.01"))
            except ArithmeticError:
                raise ValidationError({"detail": "Marks must be a number."})
            if not marks.is_finite():
                raise ValidationError({"detail": "Marks must be a number."})
            if not 0 <= marks <= answer.question.marks:
                raise ValidationError(
                    {"detail": f"Marks for a {answer.question.marks}-mark question must be between 0 and {answer.question.marks}."}
                )
            answer.marks_awarded = marks
        if "feedback" in grade:
            answer.teacher_feedback = str(grade.get("feedback") or "")[:5000]
        answer.graded_by = teacher
        answer.graded_at = now
        answer.save(update_fields=["marks_awarded", "teacher_feedback", "graded_by", "graded_at"])

    recompute_score(attempt)
    attempt.save(update_fields=["score", "grading_status"])
    return attempt


@transaction.atomic
def record_integrity_event(student, attempt_id, kind: str, now=None) -> None:
    attempt = get_attempt_for_user(student, attempt_id, for_update=True)
    if not student.is_student or attempt.status != Attempt.Status.IN_PROGRESS:
        return
    if kind not in IntegrityEvent.Kind.values:
        raise ValidationError({"detail": "Unknown event."})
    if attempt.integrity_events.count() >= MAX_INTEGRITY_EVENTS:
        return
    IntegrityEvent.objects.create(attempt=attempt, kind=kind)

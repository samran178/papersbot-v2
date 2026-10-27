"""Read-only views of an attempt, shaped for whoever is asking.

Students never receive correct answers or marking guidelines while an exam is
open, and never receive questions from sections they haven't reached.
"""

from django.utils import timezone

from exams.models import Exam, Question

from .models import Attempt, IntegrityEvent, SectionAttempt
from .services import NETWORK_LEEWAY


def iso(value):
    return value.isoformat() if value else None


def decimal_out(value):
    return float(value) if value is not None else None


def attempt_summary(attempt: Attempt) -> dict:
    return {
        "id": attempt.id,
        "exam_id": attempt.exam_id,
        "attempt_number": attempt.attempt_number,
        "mode": attempt.mode,
        "status": attempt.status,
        "started_at": iso(attempt.started_at),
        "completed_at": iso(attempt.completed_at),
        "is_overtime": attempt.is_overtime,
        "overtime_seconds": attempt.overtime_seconds,
        "timed_out": attempt.timed_out,
        "grading_status": attempt.grading_status,
        "max_score": decimal_out(attempt.max_score),
    }


def student_score_fields(attempt: Attempt) -> dict:
    graded = attempt.grading_status == Attempt.Grading.GRADED and attempt.status == Attempt.Status.COMPLETED
    return {
        "score": decimal_out(attempt.score) if graded else None,
        "percentage": attempt.percentage if graded else None,
        "passed": attempt.passed if graded else None,
    }


def ordered_questions(attempt: Attempt, section_attempt: SectionAttempt) -> list[Question]:
    questions = {q.id: q for q in section_attempt.section.questions.all()}
    order = attempt.question_order.get(str(section_attempt.section_id)) or list(questions)
    return [questions[qid] for qid in order if qid in questions]


def student_question(attempt: Attempt, question: Question, answer) -> dict:
    data = {
        "id": question.id,
        "type": question.type,
        "text": question.text,
        "marks": question.marks,
        "selected_option": answer.selected_option if answer else None,
        "text_answer": answer.text_answer if answer else "",
    }
    if question.type == Question.Type.MCQ:
        indexes = attempt.option_order.get(str(question.id)) or list(range(len(question.options)))
        data["options"] = [{"index": i, "text": question.options[i]} for i in indexes if i < len(question.options)]
    return data


def student_attempt_view(attempt: Attempt, now=None) -> dict:
    """The live exam screen: timers plus questions of the open section(s) only."""

    now = now or timezone.now()
    exam: Exam = attempt.exam
    answers = {a.question_id: a for a in attempt.answers.all()}
    section_attempts = list(attempt.section_attempts.select_related("section").prefetch_related("section__questions"))

    sections = []
    for sa in section_attempts:
        section = sa.section
        item = {
            "id": sa.id,
            "section_id": section.id,
            "order": sa.order,
            "title": section.title,
            "instructions": section.instructions,
            "duration_minutes": section.duration_minutes,
            "question_count": len(section.questions.all()),
            "marks": sum(q.marks for q in section.questions.all()),
            "status": sa.status,
            "started_at": iso(sa.started_at),
            "deadline": iso(sa.deadline),
            "submitted_at": iso(sa.submitted_at),
            "questions": None,
        }
        if sa.status == SectionAttempt.Status.IN_PROGRESS and attempt.status == Attempt.Status.IN_PROGRESS:
            item["questions"] = [student_question(attempt, q, answers.get(q.id)) for q in ordered_questions(attempt, sa)]
        sections.append(item)

    return {
        **attempt_summary(attempt),
        "server_now": iso(now),
        "grace_seconds": int(exam.grace_period.total_seconds()),
        "leeway_seconds": int(NETWORK_LEEWAY.total_seconds()),
        "exam": {
            "id": exam.id,
            "title": exam.title,
            "instructions": exam.instructions,
            "classroom_name": exam.classroom.name,
            "overtime_policy": exam.overtime_policy,
            "grace_minutes": exam.grace_minutes,
            "available_until": iso(exam.available_until),
        },
        "sections": sections,
    }


def student_result_view(attempt: Attempt, now=None) -> dict:
    """After the attempt: score once fully graded; correct MCQ answers only after the exam closes."""

    now = now or timezone.now()
    exam = attempt.exam
    graded = attempt.grading_status == Attempt.Grading.GRADED
    exam_closed = exam.available_until is not None and now >= exam.available_until
    answers = {a.question_id: a for a in attempt.answers.all()}

    sections = []
    for sa in attempt.section_attempts.select_related("section").prefetch_related("section__questions"):
        questions = []
        for question in ordered_questions(attempt, sa):
            answer = answers.get(question.id)
            item = student_question(attempt, question, answer)
            item["marks_awarded"] = decimal_out(answer.marks_awarded) if answer and graded else None
            item["feedback"] = answer.teacher_feedback if answer and graded else ""
            if question.type == Question.Type.MCQ and exam_closed:
                item["correct_option"] = question.correct_option
            questions.append(item)
        sections.append(
            {
                "id": sa.id,
                "order": sa.order,
                "title": sa.section.title,
                "status": sa.status,
                "started_at": iso(sa.started_at),
                "submitted_at": iso(sa.submitted_at),
                "overtime_seconds": sa.overtime_seconds,
                "questions": questions,
            }
        )

    return {
        **attempt_summary(attempt),
        **student_score_fields(attempt),
        "pass_percentage": exam.pass_percentage,
        "answers_revealed": exam_closed,
        "exam": {
            "id": exam.id,
            "title": exam.title,
            "classroom_name": exam.classroom.name,
            "available_until": iso(exam.available_until),
        },
        "sections": sections,
    }


def integrity_summary(attempt: Attempt) -> dict:
    counts = {kind: 0 for kind in IntegrityEvent.Kind.values}
    for event in attempt.integrity_events.all():
        counts[event.kind] += 1
    return {"total": sum(counts.values()), "by_kind": counts}


def teacher_attempt_row(attempt: Attempt) -> dict:
    """One line in the teacher's attempts table."""

    events = attempt.integrity_events.all()
    duration_seconds = None
    if attempt.completed_at:
        duration_seconds = int((attempt.completed_at - attempt.started_at).total_seconds())
    return {
        **attempt_summary(attempt),
        "score": decimal_out(attempt.score),
        "percentage": attempt.percentage,
        "passed": attempt.passed,
        "duration_seconds": duration_seconds,
        "integrity_event_count": len(events),
        "student": {
            "id": attempt.student_id,
            "full_name": attempt.student.full_name,
            "username": attempt.student.username,
            "roll_number": attempt.student.roll_number,
        },
        "sections": [
            {
                "order": sa.order,
                "title": sa.section.title,
                "status": sa.status,
                "started_at": iso(sa.started_at),
                "deadline": iso(sa.deadline),
                "submitted_at": iso(sa.submitted_at),
                "overtime_seconds": sa.overtime_seconds,
            }
            for sa in attempt.section_attempts.all()
        ],
    }


def teacher_attempt_detail(attempt: Attempt) -> dict:
    """Everything a teacher needs to grade one attempt."""

    answers = {a.question_id: a for a in attempt.answers.select_related("graded_by")}
    sections = []
    for sa in attempt.section_attempts.select_related("section").prefetch_related("section__questions"):
        questions = []
        for question in sa.section.questions.all():
            answer = answers.get(question.id)
            questions.append(
                {
                    "id": question.id,
                    "type": question.type,
                    "text": question.text,
                    "marks": question.marks,
                    "options": question.options,
                    "correct_option": question.correct_option,
                    "marking_guidelines": question.marking_guidelines,
                    "selected_option": answer.selected_option if answer else None,
                    "text_answer": answer.text_answer if answer else "",
                    "marks_awarded": decimal_out(answer.marks_awarded) if answer else None,
                    "ai_suggested_marks": decimal_out(answer.ai_suggested_marks) if answer else None,
                    "ai_feedback": answer.ai_feedback if answer else "",
                    "teacher_feedback": answer.teacher_feedback if answer else "",
                    "graded_by": answer.graded_by.full_name if answer and answer.graded_by else None,
                }
            )
        sections.append({"order": sa.order, "title": sa.section.title, "status": sa.status, "questions": questions})

    return {
        **teacher_attempt_row(attempt),
        "pass_percentage": attempt.exam.pass_percentage,
        "exam": {"id": attempt.exam_id, "title": attempt.exam.title},
        "integrity": integrity_summary(attempt),
        "integrity_events": [{"kind": e.kind, "occurred_at": iso(e.occurred_at)} for e in attempt.integrity_events.all()],
        "question_sections": sections,
    }

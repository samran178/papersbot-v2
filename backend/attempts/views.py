from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsApprovedTeacher, IsStudent
from exams.models import Exam, Section

from . import services
from .models import Attempt
from .serializers import (
    attempt_summary,
    iso,
    student_attempt_view,
    student_result_view,
    student_score_fields,
    teacher_attempt_detail,
)


def student_exam_card(exam: Exam, attempts: list[Attempt], allowed: int, now) -> dict:
    sections = list(exam.sections.all())
    active = next((a for a in attempts if a.status == Attempt.Status.IN_PROGRESS), None)
    used = len(attempts)
    is_open = exam.is_open(now)

    if active:
        state = "in_progress"
    elif is_open and used < allowed:
        state = "available"
    elif exam.opens_at and exam.opens_at > now:
        state = "upcoming"
    elif attempts:
        state = "completed"
    else:
        state = "missed"

    return {
        "id": exam.id,
        "title": exam.title,
        "instructions": exam.instructions,
        "classroom": {"id": exam.classroom_id, "name": exam.classroom.name, "course_code": exam.classroom.course_code},
        "teacher_name": exam.teacher.full_name,
        "opens_at": iso(exam.opens_at),
        "available_until": iso(exam.available_until),
        "total_minutes": sum(s.duration_minutes for s in sections),
        "total_marks": sum(q.marks for s in sections for q in s.questions.all()),
        "sections": [
            {
                "order": s.order,
                "title": s.title,
                "duration_minutes": s.duration_minutes,
                "question_count": len(s.questions.all()),
                "marks": sum(q.marks for q in s.questions.all()),
            }
            for s in sections
        ],
        "allow_modular": exam.allow_modular and len(sections) > 1,
        "overtime_policy": exam.overtime_policy,
        "grace_minutes": exam.grace_minutes,
        "pass_percentage": exam.pass_percentage,
        "attempts_allowed": allowed,
        "attempts_used": used,
        "state": state,
        "can_start": state == "available",
        "active_attempt_id": active.id if active else None,
        "attempts": [{**attempt_summary(a), **student_score_fields(a)} for a in attempts],
    }


def student_exams_queryset(student):
    return (
        Exam.objects.filter(is_published=True, classroom__enrollments__student=student, classroom__is_archived=False)
        .select_related("classroom", "teacher")
        .prefetch_related(Prefetch("sections", queryset=Section.objects.prefetch_related("questions")))
        .order_by("available_until")
    )


class StudentExamListView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        now = timezone.now()
        mine = Attempt.objects.filter(student=request.user)
        services.sync_open_attempts(mine, now)

        exams = list(student_exams_queryset(request.user))
        if classroom_id := request.query_params.get("classroom"):
            exams = [e for e in exams if str(e.classroom_id) == classroom_id]

        attempts_by_exam: dict[int, list[Attempt]] = {}
        for attempt in mine.select_related("exam").order_by("attempt_number"):
            attempts_by_exam.setdefault(attempt.exam_id, []).append(attempt)

        cards = [
            student_exam_card(exam, attempts_by_exam.get(exam.id, []), services.allowed_attempts(exam, request.user), now)
            for exam in exams
        ]
        return Response(cards)


class StudentExamDetailView(APIView):
    permission_classes = [IsStudent]

    def get(self, request, pk):
        now = timezone.now()
        exam = services.get_student_exam(request.user, pk)
        mine = Attempt.objects.filter(student=request.user, exam=exam)
        services.sync_open_attempts(mine, now)
        exam = student_exams_queryset(request.user).get(pk=exam.pk)
        attempts = list(mine.select_related("exam").order_by("attempt_number"))
        return Response(student_exam_card(exam, attempts, services.allowed_attempts(exam, request.user), now))


class StartAttemptView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, pk):
        mode = request.data.get("mode", Attempt.Mode.FULL)
        if mode not in Attempt.Mode.values:
            raise ValidationError({"detail": "Choose how you want to attempt the exam."})
        exam = services.get_student_exam(request.user, pk)
        attempt, created = services.start_attempt(exam, request.user, mode)
        return Response(
            student_attempt_view(attempt),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AttemptDetailView(APIView):
    """Students get the live exam (or their result); teachers get the grading view."""

    def get(self, request, pk):
        now = timezone.now()
        with transaction.atomic():
            attempt = services.sync_attempt(services.get_attempt_for_user(request.user, pk, for_update=True), now)
        if request.user.is_student:
            if attempt.status == Attempt.Status.IN_PROGRESS:
                return Response(student_attempt_view(attempt, now))
            return Response(student_result_view(attempt, now))
        return Response(teacher_attempt_detail(attempt))


class SaveAnswersView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, pk):
        attempt = services.save_answers(request.user, pk, request.data.get("answers", []))
        return Response({"ok": True, "saved_at": iso(timezone.now()), "status": attempt.status})


class SubmitSectionView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, pk):
        section_attempt_id = request.data.get("section_attempt_id")
        if section_attempt_id is not None and not isinstance(section_attempt_id, int):
            raise ValidationError({"detail": "section_attempt_id must be a number."})
        attempt = services.submit_section(
            request.user,
            pk,
            section_attempt_id=section_attempt_id,
            items=request.data.get("answers") or [],
        )
        if attempt.status == Attempt.Status.IN_PROGRESS:
            return Response(student_attempt_view(attempt))
        return Response(student_result_view(attempt))


class NextSectionView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, pk):
        attempt = services.start_next_section(request.user, pk)
        if attempt.status == Attempt.Status.IN_PROGRESS:
            return Response(student_attempt_view(attempt))
        return Response(student_result_view(attempt))


class IntegrityEventView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, pk):
        services.record_integrity_event(request.user, pk, request.data.get("kind", ""))
        return Response(status=status.HTTP_204_NO_CONTENT)


class GradeAttemptView(APIView):
    permission_classes = [IsApprovedTeacher]

    def post(self, request, pk):
        attempt = services.grade_attempt(request.user, pk, request.data.get("grades", []))
        return Response(teacher_attempt_detail(attempt))

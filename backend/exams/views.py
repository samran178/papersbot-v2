from django.db import transaction
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsApprovedTeacher
from attempts.models import Attempt
from attempts.serializers import teacher_attempt_row
from attempts.services import sync_open_attempts
from classrooms.models import Classroom

from .models import AttemptAllowance, Exam, Question, Section
from .serializers import ExamDetailSerializer, ExamListSerializer, ExamWriteSerializer, publish_problems, write_sections


def subquery_total(queryset, exam_path: str, expression):
    return Coalesce(
        Subquery(
            queryset.filter(**{exam_path: OuterRef("pk")})
            .order_by()
            .values(exam_path)
            .annotate(total=expression)
            .values("total")[:1],
            output_field=IntegerField(),
        ),
        0,
    )


def teacher_exam_list(teacher):
    return (
        Exam.objects.filter(teacher=teacher)
        .select_related("classroom")
        .annotate(
            total_minutes=subquery_total(Section.objects, "exam", Sum("duration_minutes")),
            total_marks=subquery_total(Question.objects, "section__exam", Sum("marks")),
            question_count=subquery_total(Question.objects, "section__exam", Count("id")),
            section_count=subquery_total(Section.objects, "exam", Count("id")),
            attempt_count=subquery_total(Attempt.objects, "exam", Count("id")),
            pending_grading_count=subquery_total(
                Attempt.objects.filter(status=Attempt.Status.COMPLETED, grading_status=Attempt.Grading.PENDING),
                "exam",
                Count("id"),
            ),
        )
    )


def detail_queryset():
    return Exam.objects.select_related("classroom").prefetch_related(
        Prefetch("sections", queryset=Section.objects.prefetch_related("questions"))
    )


def get_owned_exam(request, pk) -> Exam:
    exam = detail_queryset().filter(pk=pk, teacher=request.user).first()
    if exam is None:
        raise NotFound("Exam not found.")
    return exam


class ExamListCreateView(APIView):
    permission_classes = [IsApprovedTeacher]

    def get(self, request):
        exams = teacher_exam_list(request.user)
        if classroom_id := request.query_params.get("classroom"):
            exams = exams.filter(classroom_id=classroom_id)
        return Response(ExamListSerializer(exams, many=True).data)

    def post(self, request):
        serializer = ExamWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        exam = serializer.save()
        return Response(ExamDetailSerializer(get_owned_exam(request, exam.pk)).data, status=status.HTTP_201_CREATED)


class ExamDetailView(APIView):
    permission_classes = [IsApprovedTeacher]

    def get(self, request, pk):
        return Response(ExamDetailSerializer(get_owned_exam(request, pk)).data)

    @transaction.atomic
    def patch(self, request, pk):
        exam = get_owned_exam(request, pk)
        serializer = ExamWriteSerializer(exam, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        exam = get_owned_exam(request, pk)
        if exam.is_published and (problems := publish_problems(exam)):
            # Saving must never leave a published exam broken.
            transaction.set_rollback(True)
            raise ValidationError({"detail": "This exam is published, so it must stay complete: " + " ".join(problems)})
        return Response(ExamDetailSerializer(exam).data)

    def delete(self, request, pk):
        exam = get_owned_exam(request, pk)
        if exam.has_attempts:
            raise ValidationError({"detail": "Students have attempted this exam. Close it instead of deleting it."})
        exam.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExamActionView(APIView):
    """POST /api/exams/<id>/<action> with action in publish|unpublish|close."""

    permission_classes = [IsApprovedTeacher]

    def post(self, request, pk, action):
        exam = get_owned_exam(request, pk)
        now = timezone.now()

        if action == "publish":
            if problems := publish_problems(exam, now):
                raise ValidationError({"detail": "Fix these before publishing: " + " ".join(problems), "problems": problems})
            exam.is_published = True
            exam.published_at = exam.published_at or now
            exam.save(update_fields=["is_published", "published_at"])
        elif action == "unpublish":
            if exam.has_attempts:
                raise ValidationError({"detail": "Students have already attempted this exam. Close it instead."})
            exam.is_published = False
            exam.save(update_fields=["is_published"])
        elif action == "close":
            if not exam.is_open(now):
                raise ValidationError({"detail": "This exam is not open."})
            exam.available_until = now
            exam.save(update_fields=["available_until"])
        else:
            raise NotFound("Unknown action.")
        return Response(ExamDetailSerializer(get_owned_exam(request, pk)).data)


class ExamDuplicateView(APIView):
    permission_classes = [IsApprovedTeacher]

    @transaction.atomic
    def post(self, request, pk):
        source = get_owned_exam(request, pk)
        classroom_id = request.data.get("classroom", source.classroom_id)
        classroom = Classroom.objects.filter(pk=classroom_id, teacher=request.user, is_archived=False).first()
        if classroom is None:
            raise ValidationError({"detail": "Choose one of your active classes."})

        copy = Exam.objects.create(
            teacher=request.user,
            classroom=classroom,
            title=f"{source.title} (copy)"[:200],
            instructions=source.instructions,
            max_attempts=source.max_attempts,
            allow_modular=source.allow_modular,
            overtime_policy=source.overtime_policy,
            grace_minutes=source.grace_minutes,
            shuffle_questions=source.shuffle_questions,
            shuffle_options=source.shuffle_options,
            pass_percentage=source.pass_percentage,
        )
        write_sections(
            copy,
            [
                {
                    "title": s.title,
                    "instructions": s.instructions,
                    "duration_minutes": s.duration_minutes,
                    "questions": [
                        {
                            "type": q.type,
                            "text": q.text,
                            "options": q.options,
                            "correct_option": q.correct_option,
                            "marks": q.marks,
                            "marking_guidelines": q.marking_guidelines,
                        }
                        for q in s.questions.all()
                    ],
                }
                for s in source.sections.all()
            ],
        )
        return Response(ExamDetailSerializer(get_owned_exam(request, copy.pk)).data, status=status.HTTP_201_CREATED)


class ExamResultsView(APIView):
    """Teacher dashboard for one exam: headline numbers, every attempt, and who hasn't started."""

    permission_classes = [IsApprovedTeacher]

    def get(self, request, pk):
        exam = get_owned_exam(request, pk)
        sync_open_attempts(exam.attempts.all())

        attempts = list(
            exam.attempts.select_related("student")
            .prefetch_related("section_attempts__section", "integrity_events")
            .order_by("student__full_name", "attempt_number")
        )
        completed = [a for a in attempts if a.status == Attempt.Status.COMPLETED]
        graded = [a for a in completed if a.grading_status == Attempt.Grading.GRADED and a.percentage is not None]
        students = list(
            User.objects.filter(enrollments__classroom=exam.classroom).order_by("full_name").values(
                "id", "full_name", "username", "roll_number"
            )
        )
        attempted_ids = {a.student_id for a in attempts}
        allowances = dict(exam.allowances.values_list("student_id", "extra_attempts"))

        stats = {
            "enrolled_students": len(students),
            "students_attempted": len(attempted_ids),
            "total_attempts": len(attempts),
            "in_progress": sum(a.status == Attempt.Status.IN_PROGRESS for a in attempts),
            "completed": len(completed),
            "within_time": sum(not a.is_overtime and not a.timed_out for a in completed),
            "overtime": sum(a.is_overtime and not a.timed_out for a in completed),
            "timed_out": sum(a.timed_out for a in completed),
            "pending_grading": sum(a.grading_status == Attempt.Grading.PENDING for a in completed),
            "average_percentage": round(sum(a.percentage for a in graded) / len(graded), 1) if graded else None,
            "highest_percentage": max((a.percentage for a in graded), default=None),
            "lowest_percentage": min((a.percentage for a in graded), default=None),
            "pass_count": sum(bool(a.passed) for a in graded),
            "modular_attempts": sum(a.mode == Attempt.Mode.MODULAR for a in attempts),
            "flagged_attempts": sum(len(a.integrity_events.all()) > 0 for a in attempts),
        }
        return Response(
            {
                "exam": ExamDetailSerializer(exam).data,
                "stats": stats,
                "attempts": [teacher_attempt_row(a) for a in attempts],
                "not_attempted": [s for s in students if s["id"] not in attempted_ids],
                "allowances": [{"student_id": sid, "extra_attempts": extra} for sid, extra in allowances.items()],
            }
        )


class AttemptAllowanceView(APIView):
    """Give one student extra attempts (e.g. after a power cut)."""

    permission_classes = [IsApprovedTeacher]

    def post(self, request, pk):
        exam = get_owned_exam(request, pk)
        student_id = request.data.get("student_id")
        try:
            extra = int(request.data.get("extra_attempts", 1))
        except (TypeError, ValueError):
            raise ValidationError({"detail": "Extra attempts must be a number."})
        if not 0 <= extra <= 10:
            raise ValidationError({"detail": "Extra attempts must be between 0 and 10."})
        if not User.objects.filter(pk=student_id, enrollments__classroom=exam.classroom).exists():
            raise ValidationError({"detail": "That student is not in this exam's class."})

        if extra == 0:
            AttemptAllowance.objects.filter(exam=exam, student_id=student_id).delete()
        else:
            AttemptAllowance.objects.update_or_create(exam=exam, student_id=student_id, defaults={"extra_attempts": extra})
        return Response({"student_id": student_id, "extra_attempts": extra})

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsApprovedTeacher
from attempts import services as attempt_services
from attempts.models import Attempt
from attempts.serializers import teacher_attempt_detail

from . import services

LIMITS = {"mcq": 50, "short": 30, "long": 10}


def bounded_int(data, key, default, low, high) -> int:
    try:
        value = int(data.get(key, default))
    except (TypeError, ValueError):
        raise ValidationError({"detail": f"{key} must be a number."})
    if not low <= value <= high:
        raise ValidationError({"detail": f"{key} must be between {low} and {high}."})
    return value


class AppConfigView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"ai_enabled": services.ai_enabled()})


class GenerateQuestionsView(APIView):
    """POST multipart or JSON: text or file (PDF), num_mcq, num_short, num_long, difficulty, focus."""

    permission_classes = [IsApprovedTeacher]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    def post(self, request):
        if not services.ai_enabled():
            raise services.AIUnavailable()
        data = request.data
        counts = {kind: bounded_int(data, f"num_{kind}", 0, 0, LIMITS[kind]) for kind in LIMITS}
        marks = {
            "mcq": bounded_int(data, "marks_mcq", 1, 1, 100),
            "short": bounded_int(data, "marks_short", 5, 1, 100),
            "long": bounded_int(data, "marks_long", 10, 1, 100),
        }
        uploaded = request.FILES.get("file")
        if uploaded is not None:
            if not uploaded.name.lower().endswith(".pdf"):
                raise ValidationError({"detail": "Upload a PDF file."})
            text = services.extract_pdf_text(uploaded)
        else:
            text = str(data.get("text", ""))
        result = services.generate_questions(
            text, counts, str(data.get("difficulty", "medium")), str(data.get("focus", "")), marks
        )
        return Response(result)


class SuggestGradesView(APIView):
    permission_classes = [IsApprovedTeacher]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai"

    def post(self, request, pk):
        if not services.ai_enabled():
            raise services.AIUnavailable()
        attempt = attempt_services.get_attempt_for_user(request.user, pk)
        if attempt.status != Attempt.Status.COMPLETED:
            raise ValidationError({"detail": "The student has not finished this attempt yet."})
        answers = list(attempt.answers.select_related("question"))
        if not any(a.question.is_subjective and not a.is_blank for a in answers):
            raise ValidationError({"detail": "There are no written answers to suggest marks for."})
        services.suggest_grades(answers)
        return Response(teacher_attempt_detail(attempt))

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from classrooms.models import Classroom

from .models import MAX_SECTIONS, Exam, Question, Section

MAX_QUESTIONS_PER_SECTION = 200
MIN_OPTIONS, MAX_OPTIONS = 2, 6

# Fields a teacher may still change after students have started attempting.
EDITABLE_AFTER_ATTEMPTS = {"title", "instructions", "available_until", "max_attempts", "pass_percentage"}


def exam_status(exam: Exam, now=None) -> str:
    now = now or timezone.now()
    if not exam.is_published:
        return "draft"
    if exam.available_until and now >= exam.available_until:
        return "closed"
    if exam.opens_at and exam.opens_at > now:
        return "scheduled"
    return "open"


class QuestionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Question
        fields = ["id", "type", "text", "options", "correct_option", "marks", "marking_guidelines"]
        extra_kwargs = {"marking_guidelines": {"required": False}, "marks": {"required": False}}

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Question text is required.")
        return value

    def validate(self, attrs):
        if attrs["type"] == Question.Type.MCQ:
            raw_options = attrs.get("options") or []
            if not isinstance(raw_options, list) or not all(isinstance(o, str) for o in raw_options):
                raise serializers.ValidationError({"options": "Options must be a list of text values."})
            options = [o.strip() for o in raw_options]
            if not MIN_OPTIONS <= len(options) <= MAX_OPTIONS:
                raise serializers.ValidationError({"options": f"An MCQ needs {MIN_OPTIONS}-{MAX_OPTIONS} options."})
            if any(not o for o in options):
                raise serializers.ValidationError({"options": "Options cannot be empty."})
            if len({o.lower() for o in options}) != len(options):
                raise serializers.ValidationError({"options": "Options must be different from each other."})
            correct = attrs.get("correct_option")
            if correct is None or not 0 <= correct < len(options):
                raise serializers.ValidationError({"correct_option": "Choose the correct option."})
            attrs["options"] = options
        else:
            attrs["options"] = []
            attrs["correct_option"] = None
        return attrs


class SectionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)
    questions = QuestionSerializer(many=True)

    class Meta:
        model = Section
        fields = ["id", "order", "title", "instructions", "duration_minutes", "questions"]
        read_only_fields = ["order"]
        extra_kwargs = {"instructions": {"required": False}}

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Section title is required.")
        return value

    def validate_questions(self, value):
        if len(value) > MAX_QUESTIONS_PER_SECTION:
            raise serializers.ValidationError(f"A section can have at most {MAX_QUESTIONS_PER_SECTION} questions.")
        return value


class ExamWriteSerializer(serializers.ModelSerializer):
    classroom = serializers.PrimaryKeyRelatedField(queryset=Classroom.objects.all())
    sections = SectionSerializer(many=True, required=False)

    class Meta:
        model = Exam
        fields = [
            "classroom",
            "title",
            "instructions",
            "available_from",
            "available_until",
            "max_attempts",
            "allow_modular",
            "overtime_policy",
            "grace_minutes",
            "shuffle_questions",
            "shuffle_options",
            "pass_percentage",
            "sections",
        ]
        extra_kwargs = {"instructions": {"required": False}}

    def validate_classroom(self, classroom):
        if classroom.teacher_id != self.context["request"].user.id:
            raise serializers.ValidationError("Class not found.")
        if classroom.is_archived:
            raise serializers.ValidationError("This class is archived.")
        return classroom

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Exam title is required.")
        return value

    def validate_sections(self, value):
        if not 1 <= len(value) <= MAX_SECTIONS:
            raise serializers.ValidationError(f"An exam needs 1 to {MAX_SECTIONS} sections.")
        return value

    def validate(self, attrs):
        instance: Exam | None = self.instance

        if instance is not None and instance.has_attempts:
            locked = sorted(set(attrs) - EDITABLE_AFTER_ATTEMPTS)
            changed = [field for field in locked if field == "sections" or getattr(instance, field) != attrs[field]]
            if changed:
                raise serializers.ValidationError(
                    {
                        "detail": "Students have already attempted this exam, so its structure and rules are locked. "
                        "You can still change the title, instructions, closing time, attempt limit and pass mark."
                    }
                )

        if instance is None and "sections" not in attrs:
            raise serializers.ValidationError({"sections": "Add at least one section."})

        def current(field):
            return attrs.get(field, getattr(instance, field) if instance else None)

        policy = current("overtime_policy") or Exam.OvertimePolicy.HARD_LOCK
        if policy == Exam.OvertimePolicy.GRACE and not current("grace_minutes"):
            raise serializers.ValidationError({"grace_minutes": "Set how many minutes of grace students get."})

        available_from, available_until = current("available_from"), current("available_until")
        if available_from and available_until and available_until <= available_from:
            raise serializers.ValidationError({"available_until": "Closing time must be after the opening time."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        sections = validated_data.pop("sections")
        exam = Exam.objects.create(teacher=self.context["request"].user, **validated_data)
        write_sections(exam, sections)
        return exam

    @transaction.atomic
    def update(self, instance, validated_data):
        sections = validated_data.pop("sections", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if sections is not None:
            instance.sections.all().delete()
            write_sections(instance, sections)
        return instance


def write_sections(exam: Exam, sections: list[dict]) -> None:
    for section_index, section_data in enumerate(sections, start=1):
        questions = section_data.pop("questions", [])
        section = Section.objects.create(exam=exam, order=section_index, **section_data)
        Question.objects.bulk_create(
            Question(section=section, order=question_index, **question_data)
            for question_index, question_data in enumerate(questions, start=1)
        )


def publish_problems(exam: Exam, now=None) -> list[str]:
    now = now or timezone.now()
    problems = []
    sections = list(exam.sections.prefetch_related("questions"))
    if exam.classroom.is_archived:
        problems.append("The class is archived.")
    if not sections:
        problems.append("Add at least one section.")
    for section in sections:
        if not section.questions.all():
            problems.append(f"{section.title} has no questions.")
    if not exam.available_until:
        problems.append("Set when the exam closes.")
    elif exam.available_until <= now:
        problems.append("The closing time is in the past.")
    return problems


class ExamDetailSerializer(serializers.ModelSerializer):
    """Full teacher view of an exam, including answers and marking guidelines."""

    sections = SectionSerializer(many=True, read_only=True)
    classroom = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    total_minutes = serializers.SerializerMethodField()
    total_marks = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()
    has_attempts = serializers.SerializerMethodField()
    opens_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Exam
        fields = [
            "id",
            "classroom",
            "title",
            "instructions",
            "status",
            "is_published",
            "published_at",
            "available_from",
            "available_until",
            "opens_at",
            "max_attempts",
            "allow_modular",
            "overtime_policy",
            "grace_minutes",
            "shuffle_questions",
            "shuffle_options",
            "pass_percentage",
            "total_minutes",
            "total_marks",
            "question_count",
            "has_attempts",
            "created_at",
            "updated_at",
            "sections",
        ]

    def get_classroom(self, exam):
        return {"id": exam.classroom_id, "name": exam.classroom.name, "course_code": exam.classroom.course_code}

    def get_status(self, exam):
        return exam_status(exam)

    def get_total_minutes(self, exam):
        return sum(section.duration_minutes for section in exam.sections.all())

    def get_total_marks(self, exam):
        return sum(q.marks for section in exam.sections.all() for q in section.questions.all())

    def get_question_count(self, exam):
        return sum(len(section.questions.all()) for section in exam.sections.all())

    def get_has_attempts(self, exam):
        return exam.has_attempts


class ExamListSerializer(serializers.ModelSerializer):
    classroom = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    total_minutes = serializers.IntegerField(read_only=True)
    total_marks = serializers.IntegerField(read_only=True)
    question_count = serializers.IntegerField(read_only=True)
    section_count = serializers.IntegerField(read_only=True)
    attempt_count = serializers.IntegerField(read_only=True)
    pending_grading_count = serializers.IntegerField(read_only=True)
    opens_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Exam
        fields = [
            "id",
            "classroom",
            "title",
            "status",
            "is_published",
            "opens_at",
            "available_until",
            "max_attempts",
            "total_minutes",
            "total_marks",
            "question_count",
            "section_count",
            "attempt_count",
            "pending_grading_count",
            "created_at",
        ]

    def get_classroom(self, exam):
        return {"id": exam.classroom_id, "name": exam.classroom.name, "course_code": exam.classroom.course_code}

    def get_status(self, exam):
        return exam_status(exam)

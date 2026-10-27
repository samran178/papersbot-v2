from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

MAX_SECTIONS = 4


class Exam(models.Model):
    class OvertimePolicy(models.TextChoices):
        HARD_LOCK = "hard_lock", "Lock when time runs out"
        GRACE = "grace", "Allow a grace period (flagged as overtime)"

    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="exams")
    classroom = models.ForeignKey("classrooms.Classroom", on_delete=models.PROTECT, related_name="exams")
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)

    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    # Empty available_from means "from the moment it is published".
    available_from = models.DateTimeField(null=True, blank=True)
    available_until = models.DateTimeField(null=True, blank=True)

    max_attempts = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(10)])
    allow_modular = models.BooleanField(default=True)
    overtime_policy = models.CharField(max_length=10, choices=OvertimePolicy.choices, default=OvertimePolicy.HARD_LOCK)
    grace_minutes = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(120)])
    shuffle_questions = models.BooleanField(default=False)
    shuffle_options = models.BooleanField(default=False)
    pass_percentage = models.PositiveSmallIntegerField(default=50, validators=[MaxValueValidator(100)])

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    @property
    def opens_at(self):
        return self.available_from or self.published_at

    def is_open(self, now=None) -> bool:
        now = now or timezone.now()
        if not self.is_published or not self.available_until:
            return False
        opens_at = self.opens_at
        return (opens_at is None or opens_at <= now) and now < self.available_until

    @property
    def grace_period(self):
        if self.overtime_policy == self.OvertimePolicy.GRACE:
            return timezone.timedelta(minutes=self.grace_minutes)
        return timezone.timedelta(0)

    @property
    def has_attempts(self) -> bool:
        return self.attempts.exists()


class Section(models.Model):
    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="sections")
    order = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(MAX_SECTIONS)])
    title = models.CharField(max_length=100)
    instructions = models.TextField(blank=True)
    duration_minutes = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(600)])

    class Meta:
        ordering = ["order"]
        constraints = [models.UniqueConstraint(fields=["exam", "order"], name="unique_section_order")]

    def __str__(self) -> str:
        return f"{self.exam.title} — {self.title}"


class Question(models.Model):
    class Type(models.TextChoices):
        MCQ = "mcq", "Multiple choice"
        SHORT = "short", "Short answer"
        LONG = "long", "Long answer"

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="questions")
    order = models.PositiveSmallIntegerField()
    type = models.CharField(max_length=5, choices=Type.choices)
    text = models.TextField()
    options = models.JSONField(default=list, blank=True)
    # Index into `options`; stored as an index so two identical option texts can't confuse grading.
    correct_option = models.PositiveSmallIntegerField(null=True, blank=True)
    marks = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(100)])
    marking_guidelines = models.TextField(blank=True)

    class Meta:
        ordering = ["section__order", "order"]

    @property
    def is_subjective(self) -> bool:
        return self.type != self.Type.MCQ


class AttemptAllowance(models.Model):
    """Extra attempts a teacher grants one student on one exam."""

    exam = models.ForeignKey(Exam, on_delete=models.CASCADE, related_name="allowances")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempt_allowances")
    extra_attempts = models.PositiveSmallIntegerField(default=1, validators=[MaxValueValidator(10)])
    granted_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["exam", "student"], name="unique_allowance")]

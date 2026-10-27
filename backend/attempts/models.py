from django.conf import settings
from django.db import models
from django.db.models import Q


class Attempt(models.Model):
    class Mode(models.TextChoices):
        FULL = "full", "Full paper in one go"
        MODULAR = "modular", "Section by section"

    class Status(models.TextChoices):
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"

    class Grading(models.TextChoices):
        PENDING = "pending", "Awaiting grading"
        GRADED = "graded", "Graded"

    exam = models.ForeignKey("exams.Exam", on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attempts")
    attempt_number = models.PositiveSmallIntegerField()
    mode = models.CharField(max_length=10, choices=Mode.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IN_PROGRESS)

    started_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    # Set when the attempt completes, from its sections.
    is_overtime = models.BooleanField(default=False)
    overtime_seconds = models.PositiveIntegerField(default=0)
    timed_out = models.BooleanField(default=False)

    # Per-student shuffles: {"<section_id>": [question ids]} and {"<question_id>": [option indexes]}.
    question_order = models.JSONField(default=dict)
    option_order = models.JSONField(default=dict)

    score = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    max_score = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    grading_status = models.CharField(max_length=10, choices=Grading.choices, default=Grading.PENDING)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(fields=["exam", "student", "attempt_number"], name="unique_attempt_number"),
            models.UniqueConstraint(
                fields=["exam", "student"],
                condition=Q(status="in_progress"),
                name="one_active_attempt_per_exam",
            ),
        ]

    @property
    def percentage(self):
        if self.score is None or not self.max_score:
            return None
        return round(float(self.score) / float(self.max_score) * 100, 1)

    @property
    def passed(self):
        percentage = self.percentage
        if percentage is None or self.grading_status != self.Grading.GRADED:
            return None
        return percentage >= self.exam.pass_percentage


class SectionAttempt(models.Model):
    class Status(models.TextChoices):
        LOCKED = "locked", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        TIMED_OUT = "timed_out", "Timed out"

    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="section_attempts")
    section = models.ForeignKey("exams.Section", on_delete=models.CASCADE, related_name="section_attempts")
    order = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.LOCKED)
    started_at = models.DateTimeField(null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    overtime_seconds = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        constraints = [models.UniqueConstraint(fields=["attempt", "section"], name="unique_section_attempt")]

    @property
    def is_finished(self) -> bool:
        return self.status in {self.Status.SUBMITTED, self.Status.TIMED_OUT}


class Answer(models.Model):
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey("exams.Question", on_delete=models.CASCADE, related_name="answers")
    # Index into the question's original (unshuffled) options.
    selected_option = models.PositiveSmallIntegerField(null=True, blank=True)
    text_answer = models.TextField(blank=True)
    saved_at = models.DateTimeField(auto_now=True)

    marks_awarded = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    ai_suggested_marks = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    ai_feedback = models.TextField(blank=True)
    teacher_feedback = models.TextField(blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="graded_answers"
    )
    graded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["attempt", "question"], name="unique_answer")]

    @property
    def is_blank(self) -> bool:
        if self.question.type == "mcq":
            return self.selected_option is None
        return not self.text_answer.strip()


class IntegrityEvent(models.Model):
    """Browser signals that may indicate cheating. Evidence for the teacher, not proof."""

    class Kind(models.TextChoices):
        TAB_HIDDEN = "tab_hidden", "Switched tab / minimised"
        WINDOW_BLUR = "window_blur", "Left the exam window"
        FULLSCREEN_EXIT = "fullscreen_exit", "Exited full screen"
        COPY = "copy", "Tried to copy"
        PASTE = "paste", "Tried to paste"
        CONTEXT_MENU = "context_menu", "Opened right-click menu"

    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name="integrity_events")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["occurred_at"]

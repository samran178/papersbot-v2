from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        TEACHER = "teacher", "Teacher"
        STUDENT = "student", "Student"

    class Approval(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)
    # Only meaningful for teachers; students and admins are always approved.
    approval_status = models.CharField(max_length=10, choices=Approval.choices, default=Approval.APPROVED)
    full_name = models.CharField(max_length=150)
    roll_number = models.CharField(max_length=50, blank=True)
    department = models.CharField(max_length=150, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_users"
    )
    rejection_reason = models.CharField(max_length=300, blank=True)

    REQUIRED_FIELDS = ["email", "full_name"]

    class Meta:
        ordering = ["-date_joined"]

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
            self.is_staff = True
        if self.role != self.Role.TEACHER:
            self.approval_status = self.Approval.APPROVED
        if not self.full_name:
            self.full_name = self.get_full_name() or self.username
        super().save(*args, **kwargs)

    @property
    def is_admin(self) -> bool:
        return self.role == self.Role.ADMIN

    @property
    def is_teacher(self) -> bool:
        return self.role == self.Role.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == self.Role.STUDENT

    @property
    def is_approved_teacher(self) -> bool:
        return self.is_teacher and self.approval_status == self.Approval.APPROVED

    def __str__(self) -> str:
        return f"{self.full_name} ({self.username})"

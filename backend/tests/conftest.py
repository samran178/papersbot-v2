from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from classrooms.models import Classroom, Enrollment
from exams.models import Exam, Question, Section

PASSWORD = "Strong-pass-2026"


def make_user(username, role, **extra):
    user = User(username=username, email=f"{username}@uog.edu.pk", full_name=username.title(), role=role, **extra)
    user.set_password(PASSWORD)
    user.save()
    return user


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser("admin", "admin@uog.edu.pk", PASSWORD, full_name="Admin")


@pytest.fixture
def teacher(db):
    return make_user("teacher", User.Role.TEACHER, approval_status=User.Approval.APPROVED)


@pytest.fixture
def other_teacher(db):
    return make_user("other_teacher", User.Role.TEACHER, approval_status=User.Approval.APPROVED)


@pytest.fixture
def pending_teacher(db):
    return make_user("pending_teacher", User.Role.TEACHER, approval_status=User.Approval.PENDING)


@pytest.fixture
def student(db):
    return make_user("student", User.Role.STUDENT)


@pytest.fixture
def other_student(db):
    return make_user("other_student", User.Role.STUDENT)


@pytest.fixture
def classroom(teacher, student, other_student):
    classroom = Classroom.objects.create(teacher=teacher, name="BSSE-8A Compiler Construction")
    Enrollment.objects.create(classroom=classroom, student=student)
    Enrollment.objects.create(classroom=classroom, student=other_student)
    return classroom


def build_exam(classroom, *, published=True, sections=2, **fields) -> Exam:
    now = timezone.now()
    exam = Exam.objects.create(
        teacher=classroom.teacher,
        classroom=classroom,
        title="Midterm",
        is_published=published,
        published_at=now - timedelta(minutes=5) if published else None,
        available_until=now + timedelta(days=3),
        **fields,
    )
    for order in range(1, sections + 1):
        section = Section.objects.create(exam=exam, order=order, title=f"Section {'ABCD'[order - 1]}", duration_minutes=30)
        Question.objects.create(
            section=section, order=1, type="mcq", text=f"Q{order}.1", options=["a", "b", "c", "d"], correct_option=2, marks=2
        )
        Question.objects.create(
            section=section, order=2, type="short", text=f"Q{order}.2", marks=5, marking_guidelines="Key points"
        )
    return exam


@pytest.fixture
def exam(classroom):
    return build_exam(classroom)


def client_for(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user)
    return client


@pytest.fixture
def api():
    return client_for

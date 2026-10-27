"""Creates demo accounts and a sample exam so you can click through every panel.

    python manage.py seed_demo

Never run this on a real deployment: the demo passwords are public.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from classrooms.models import Classroom, Enrollment
from exams.models import Exam, Question, Section

DEMO_PASSWORD = "PapersBot@2026"

STUDENTS = [
    ("ali", "Ali Raza", "22011556-001"),
    ("ayesha", "Ayesha Khan", "22011556-002"),
    ("hamza", "Hamza Iqbal", "22011556-003"),
]

MCQS = [
    ("Which phase of a compiler produces tokens?", ["Lexical analysis", "Syntax analysis", "Code generation", "Optimisation"], 0),
    ("Which data structure does a shift-reduce parser use?", ["Queue", "Stack", "Heap", "Hash table"], 1),
    ("A grammar with two leftmost derivations for one string is…", ["Regular", "Left-recursive", "Ambiguous", "Context-sensitive"], 2),
    ("What does a symbol table store?", ["Machine code", "Identifiers and their attributes", "Only keywords", "Parse trees"], 1),
]


class Command(BaseCommand):
    help = "Create demo admin, teacher, students, a class and a published exam."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Run even when DEBUG is off.")

    @transaction.atomic
    def handle(self, *args, force=False, **options):
        if not settings.DEBUG and not force:
            raise CommandError("Refusing to create demo accounts with public passwords while DEBUG is off.")

        admin = self.user("admin", "Site Admin", User.Role.ADMIN, is_superuser=True, is_staff=True)
        teacher = self.user("dr_sana", "Dr. Sana Malik", User.Role.TEACHER, department="Software Engineering")
        self.user("new_teacher", "Usman Tariq", User.Role.TEACHER, department="Computer Science", approval=User.Approval.PENDING)
        students = [self.user(username, name, User.Role.STUDENT, roll_number=roll) for username, name, roll in STUDENTS]

        classroom, _ = Classroom.objects.get_or_create(
            teacher=teacher, name="BSSE 8th A — Compiler Construction", defaults={"course_code": "SE-401"}
        )
        for student in students:
            Enrollment.objects.get_or_create(classroom=classroom, student=student)

        if not Exam.objects.filter(classroom=classroom, title="Midterm — Compiler Construction").exists():
            self.create_exam(teacher, classroom)

        self.stdout.write(self.style.SUCCESS("Demo data ready. Everyone's password is: " + DEMO_PASSWORD))
        self.stdout.write(f"  admin       → {admin.username}")
        self.stdout.write(f"  teacher     → {teacher.username}   (class join code {classroom.join_code})")
        self.stdout.write("  pending     → new_teacher   (approve from the admin panel)")
        self.stdout.write("  students    → " + ", ".join(s.username for s in students))

    def user(self, username, full_name, role, *, approval=User.Approval.APPROVED, **extra):
        user = User.objects.filter(username=username).first()
        if user is None:
            user = User(username=username, email=f"{username}@uog.edu.pk", full_name=full_name, role=role, approval_status=approval, **extra)
            user.set_password(DEMO_PASSWORD)
            user.save()
        return user

    def create_exam(self, teacher, classroom):
        now = timezone.now()
        exam = Exam.objects.create(
            teacher=teacher,
            classroom=classroom,
            title="Midterm — Compiler Construction",
            instructions="Attempt all questions. Write clearly; partial credit is given for working.",
            is_published=True,
            published_at=now,
            available_until=now + timedelta(days=3),
            allow_modular=True,
            overtime_policy=Exam.OvertimePolicy.GRACE,
            grace_minutes=5,
            shuffle_options=True,
        )
        section_a = Section.objects.create(exam=exam, order=1, title="Section A — MCQs", duration_minutes=15)
        for index, (text, options, correct) in enumerate(MCQS, start=1):
            Question.objects.create(section=section_a, order=index, type="mcq", text=text, options=options, correct_option=correct, marks=1)

        section_b = Section.objects.create(exam=exam, order=2, title="Section B — Short questions", duration_minutes=20)
        Question.objects.create(
            section=section_b, order=1, type="short", marks=5,
            text="Differentiate between a compiler and an interpreter.",
            marking_guidelines="Whole program vs line by line (2), output: object code vs direct execution (2), example of each (1).",
        )
        Question.objects.create(
            section=section_b, order=2, type="short", marks=5,
            text="What is left recursion and why must it be removed for top-down parsing?",
            marking_guidelines="Definition A → Aα (2), causes infinite recursion in recursive descent (2), elimination example (1).",
        )
        section_c = Section.objects.create(exam=exam, order=3, title="Section C — Long question", duration_minutes=25)
        Question.objects.create(
            section=section_c, order=1, type="long", marks=10,
            text="Explain the phases of a compiler with a diagram, using the statement  position = initial + rate * 60  as a running example.",
            marking_guidelines="All six phases named in order (3), symbol table and error handler (2), correct tokens / tree / IR for the example (5).",
        )
        return exam

from datetime import timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time

from attempts.models import Attempt, IntegrityEvent
from exams.models import AttemptAllowance, Question

from .conftest import build_exam


@pytest.fixture
def clock():
    with freeze_time(timezone.now()) as frozen:
        yield frozen


def start(api, student, exam, mode="full"):
    return api(student).post(f"/api/student/exams/{exam.id}/start", {"mode": mode}, format="json")


def questions_of(data):
    return [q for s in data["sections"] if s["questions"] for q in s["questions"]]


def answer_all_correctly(api, student, attempt_data, exam):
    items = []
    for q in questions_of(attempt_data):
        if q["type"] == "mcq":
            items.append({"question_id": q["id"], "selected_option": Question.objects.get(pk=q["id"]).correct_option})
        else:
            items.append({"question_id": q["id"], "text_answer": "A thoughtful answer."})
    return api(student).post(f"/api/attempts/{attempt_data['id']}/answers", {"answers": items}, format="json")


# ─── Starting ─────────────────────────────────────────────────────────────────


def test_full_mode_opens_every_section_with_one_deadline(api, exam, student, clock):
    response = start(api, student, exam)
    assert response.status_code == 201
    data = response.json()
    assert all(s["status"] == "in_progress" for s in data["sections"])
    deadlines = {s["deadline"] for s in data["sections"]}
    assert len(deadlines) == 1
    assert len(questions_of(data)) == 4


def test_student_view_hides_answers(api, exam, student):
    data = start(api, student, exam).json()
    for q in questions_of(data):
        assert "correct_option" not in q and "marking_guidelines" not in q


def test_starting_twice_resumes_the_same_attempt(api, exam, student):
    first = start(api, student, exam)
    second = start(api, student, exam)
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert Attempt.objects.count() == 1


def test_modular_not_allowed_when_disabled(api, classroom, student):
    exam = build_exam(classroom, allow_modular=False)
    assert start(api, student, exam, mode="modular").status_code == 400


def test_modular_mode_reveals_one_section_at_a_time(api, exam, student, clock):
    data = start(api, student, exam, mode="modular").json()
    first, second = data["sections"]
    assert first["status"] == "in_progress" and first["questions"]
    assert second["status"] == "locked" and second["questions"] is None

    # Section B questions can't be answered before it starts.
    section_b_question = Question.objects.get(section_id=second["section_id"], type="mcq")
    response = api(student).post(
        f"/api/attempts/{data['id']}/answers",
        {"answers": [{"question_id": section_b_question.id, "selected_option": 0}]},
        format="json",
    )
    assert response.status_code == 409

    data = api(student).post(f"/api/attempts/{data['id']}/submit", {"section_attempt_id": first["id"]}, format="json").json()
    assert data["sections"][0]["status"] == "submitted"
    assert data["sections"][1]["status"] == "locked"

    clock.tick(timedelta(hours=5))  # a long break does not eat into section B's time
    data = api(student).post(f"/api/attempts/{data['id']}/next-section").json()
    section_b = data["sections"][1]
    assert section_b["status"] == "in_progress" and section_b["questions"]
    assert section_b["deadline"] == (timezone.now() + timedelta(minutes=30)).isoformat()


def test_double_submit_is_harmless(api, exam, student):
    data = start(api, student, exam, mode="modular").json()
    first = data["sections"][0]["id"]
    api(student).post(f"/api/attempts/{data['id']}/submit", {"section_attempt_id": first}, format="json")
    again = api(student).post(f"/api/attempts/{data['id']}/submit", {"section_attempt_id": first}, format="json")
    assert again.status_code == 200
    assert again.json()["sections"][1]["status"] == "locked"


# ─── Server-side timing ───────────────────────────────────────────────────────


def test_hard_lock_rejects_late_answers_and_finalises(api, exam, student, clock):
    data = start(api, student, exam).json()
    answer_all_correctly(api, student, data, exam)
    clock.tick(timedelta(minutes=61))
    late = api(student).post(
        f"/api/attempts/{data['id']}/answers",
        {"answers": [{"question_id": questions_of(data)[0]["id"], "selected_option": 0}]},
        format="json",
    )
    assert late.status_code == 409
    attempt = Attempt.objects.get(pk=data["id"])
    assert attempt.status == "completed" and attempt.timed_out
    # The answers saved in time still count.
    assert attempt.answers.get(question__type="mcq", question__section__order=1).marks_awarded == 2


def test_submit_on_time_is_within_time(api, exam, student, clock):
    data = start(api, student, exam).json()
    clock.tick(timedelta(minutes=59))
    result = api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json").json()
    assert result["status"] == "completed"
    assert result["is_overtime"] is False and result["timed_out"] is False


def test_grace_period_submission_is_flagged_overtime(api, classroom, student, clock):
    exam = build_exam(classroom, overtime_policy="grace", grace_minutes=10)
    data = start(api, student, exam).json()
    clock.tick(timedelta(minutes=65))
    assert answer_all_correctly(api, student, data, exam).status_code == 200
    result = api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json").json()
    assert result["is_overtime"] is True
    assert 4 * 60 < result["overtime_seconds"] <= 5 * 60


def test_grace_period_expiry_times_out(api, classroom, student, clock):
    exam = build_exam(classroom, overtime_policy="grace", grace_minutes=10)
    data = start(api, student, exam).json()
    clock.tick(timedelta(minutes=75))
    result = api(student).get(f"/api/attempts/{data['id']}").json()
    assert result["status"] == "completed" and result["timed_out"] is True


def test_deadline_capped_by_exam_closing_time(api, classroom, student, clock):
    exam = build_exam(classroom)
    exam.available_until = timezone.now() + timedelta(minutes=15)
    exam.save()
    data = start(api, student, exam).json()
    assert data["sections"][0]["deadline"] == exam.available_until.isoformat()


def test_exam_closing_during_break_times_out_remaining_sections(api, classroom, student, clock):
    exam = build_exam(classroom)
    exam.available_until = timezone.now() + timedelta(hours=1)
    exam.save()
    data = start(api, student, exam, mode="modular").json()
    api(student).post(f"/api/attempts/{data['id']}/submit", {"section_attempt_id": data["sections"][0]["id"]}, format="json")
    clock.tick(timedelta(hours=2))
    result = api(student).get(f"/api/attempts/{data['id']}").json()
    assert result["status"] == "completed"
    assert result["sections"][1]["status"] == "timed_out"


# ─── Limits ───────────────────────────────────────────────────────────────────


def test_attempt_limit_and_teacher_allowance(api, exam, student, teacher):
    data = start(api, student, exam).json()
    api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json")
    assert start(api, student, exam).status_code == 400

    response = api(teacher).post(
        f"/api/exams/{exam.id}/allowances", {"student_id": student.id, "extra_attempts": 1}, format="json"
    )
    assert response.status_code == 200
    second = start(api, student, exam)
    assert second.status_code == 201
    assert second.json()["attempt_number"] == 2
    assert AttemptAllowance.objects.get().extra_attempts == 1


# ─── Privacy ──────────────────────────────────────────────────────────────────


def test_students_cannot_read_or_write_each_others_attempts(api, exam, student, other_student):
    data = start(api, student, exam).json()
    assert api(other_student).get(f"/api/attempts/{data['id']}").status_code == 404
    response = api(other_student).post(f"/api/attempts/{data['id']}/answers", {"answers": []}, format="json")
    assert response.status_code == 404
    assert api(other_student).post(f"/api/attempts/{data['id']}/submit", {}, format="json").status_code == 404


def test_other_teacher_cannot_see_attempt(api, exam, student, other_teacher):
    data = start(api, student, exam).json()
    assert api(other_teacher).get(f"/api/attempts/{data['id']}").status_code == 404


def test_integrity_events_recorded(api, exam, student, teacher):
    data = start(api, student, exam).json()
    for kind in ("tab_hidden", "paste", "tab_hidden"):
        assert api(student).post(f"/api/attempts/{data['id']}/events", {"kind": kind}, format="json").status_code == 204
    assert api(student).post(f"/api/attempts/{data['id']}/events", {"kind": "bogus"}, format="json").status_code == 400
    assert IntegrityEvent.objects.count() == 3
    detail = api(teacher).get(f"/api/attempts/{data['id']}").json()
    assert detail["integrity"]["by_kind"]["tab_hidden"] == 2


# ─── Grading ──────────────────────────────────────────────────────────────────


def test_grading_flow(api, exam, student, teacher):
    data = start(api, student, exam).json()
    answer_all_correctly(api, student, data, exam)
    result = api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json").json()
    assert result["grading_status"] == "pending"
    assert result["score"] is None  # students don't see partial scores

    detail = api(teacher).get(f"/api/attempts/{data['id']}").json()
    assert detail["score"] == 4.0  # two MCQs auto-marked
    subjective = [q for s in detail["question_sections"] for q in s["questions"] if q["type"] == "short"]

    too_many = [{"question_id": subjective[0]["id"], "marks": 6}]
    assert api(teacher).post(f"/api/attempts/{data['id']}/grade", {"grades": too_many}, format="json").status_code == 400

    grades = [{"question_id": q["id"], "marks": 2.5, "feedback": "Needs detail"} for q in subjective]
    graded = api(teacher).post(f"/api/attempts/{data['id']}/grade", {"grades": grades}, format="json").json()
    assert graded["grading_status"] == "graded"
    assert graded["score"] == 9.0 and graded["percentage"] == 64.3

    student_view = api(student).get(f"/api/attempts/{data['id']}").json()
    assert student_view["score"] == 9.0 and student_view["passed"] is True
    assert student_view["answers_revealed"] is False  # exam still open: no correct answers shown


def test_blank_written_answers_score_zero_automatically(api, exam, student, teacher):
    data = start(api, student, exam).json()
    result = api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json").json()
    assert result["grading_status"] == "graded"
    assert result["score"] == 0.0


def test_student_cannot_grade(api, exam, student):
    data = start(api, student, exam).json()
    api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json")
    assert api(student).post(f"/api/attempts/{data['id']}/grade", {"grades": []}, format="json").status_code == 403


def test_teacher_results_dashboard(api, exam, student, other_student, teacher, clock):
    data = start(api, student, exam).json()
    api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json")
    results = api(teacher).get(f"/api/exams/{exam.id}/results").json()
    assert results["stats"]["enrolled_students"] == 2
    assert results["stats"]["completed"] == 1
    assert results["stats"]["within_time"] == 1
    assert [s["username"] for s in results["not_attempted"]] == ["other_student"]


def test_ai_endpoints_report_unconfigured(api, exam, teacher, settings):
    settings.OPENAI_API_KEY = ""
    response = api(teacher).post("/api/ai/generate-questions", {"text": "x" * 100, "num_mcq": 2}, format="json")
    assert response.status_code == 503


def test_ai_generation_keeps_only_valid_questions(api, teacher, settings, monkeypatch):
    settings.OPENAI_API_KEY = "test-key"
    fake = {
        "title": "Compilers Quiz",
        "questions": [
            {"type": "mcq", "text": "What does a lexer produce?", "options": ["Tokens", "AST", "IR", "Bytecode"], "correct_option": 0},
            {"type": "mcq", "text": "Broken", "options": ["only one"], "correct_option": 0},
            {"type": "long", "text": "Explain LR parsing.", "marking_guidelines": "Shift, reduce, table"},
        ],
    }
    monkeypatch.setattr("ai.services.ask_json", lambda system, user: fake)
    response = api(teacher).post(
        "/api/ai/generate-questions", {"text": "Lexical analysis " * 20, "num_mcq": 2, "num_long": 1}, format="json"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Compilers Quiz"
    assert [q["type"] for q in data["questions"]] == ["mcq", "long"]
    assert data["questions"][1]["marks"] == 10


def test_ai_grade_suggestions_are_clamped(api, exam, student, teacher, settings, monkeypatch):
    settings.OPENAI_API_KEY = "test-key"
    data = start(api, student, exam).json()
    answer_all_correctly(api, student, data, exam)
    api(student).post(f"/api/attempts/{data['id']}/submit", {}, format="json")

    def fake(system, user):
        import json

        ids = [a["id"] for a in json.loads(user)["answers"]]
        return {"grades": [{"id": ids[0], "marks": 99, "feedback": "Ignore me"}, {"id": ids[1], "marks": 3.3, "feedback": "Ok"}]}

    monkeypatch.setattr("ai.services.ask_json", fake)
    detail = api(teacher).post(f"/api/attempts/{data['id']}/ai-suggest").json()
    suggestions = sorted(q["ai_suggested_marks"] for s in detail["question_sections"] for q in s["questions"] if q["type"] == "short")
    assert suggestions == [3.5, 5.0]
    # Suggestions never become marks on their own.
    assert detail["grading_status"] == "pending"

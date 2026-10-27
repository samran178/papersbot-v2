from datetime import timedelta

from django.utils import timezone

from classrooms.models import Classroom

from .conftest import build_exam, make_user


def exam_payload(classroom_id, **overrides):
    payload = {
        "classroom": classroom_id,
        "title": "Final Exam",
        "available_until": (timezone.now() + timedelta(days=2)).isoformat(),
        "sections": [
            {
                "title": "Section A",
                "duration_minutes": 20,
                "questions": [
                    {"type": "mcq", "text": "2+2?", "options": ["3", "4", "5"], "correct_option": 1, "marks": 1},
                    {"type": "long", "text": "Explain OOP.", "marks": 10, "marking_guidelines": "Encapsulation"},
                ],
            }
        ],
    }
    payload.update(overrides)
    return payload


# ─── Classes ──────────────────────────────────────────────────────────────────


def test_student_joins_class_with_code(api, teacher):
    classroom = Classroom.objects.create(teacher=teacher, name="DSA")
    student = make_user("new_student", "student")
    response = api(student).post("/api/classes/join", {"join_code": classroom.join_code.lower()}, format="json")
    assert response.status_code == 201
    assert api(student).post("/api/classes/join", {"join_code": classroom.join_code}, format="json").status_code == 400


def test_closed_class_rejects_join(api, teacher, student):
    classroom = Classroom.objects.create(teacher=teacher, name="DSA", is_joining_open=False)
    assert api(student).post("/api/classes/join", {"join_code": classroom.join_code}, format="json").status_code == 400


def test_teacher_sees_only_own_classes(api, classroom, other_teacher):
    assert api(other_teacher).get("/api/classes/").json() == []
    assert api(other_teacher).get(f"/api/classes/{classroom.id}").status_code == 404


def test_class_with_exams_cannot_be_deleted(api, exam, teacher):
    assert api(teacher).delete(f"/api/classes/{exam.classroom_id}").status_code == 400


# ─── Exam authoring ───────────────────────────────────────────────────────────


def test_teacher_creates_exam_with_sections(api, teacher, classroom):
    response = api(teacher).post("/api/exams/", exam_payload(classroom.id), format="json")
    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["total_marks"] == 11
    assert data["total_minutes"] == 20
    assert data["status"] == "draft"


def test_cannot_create_exam_in_someone_elses_class(api, other_teacher, classroom):
    assert api(other_teacher).post("/api/exams/", exam_payload(classroom.id), format="json").status_code == 400


def test_mcq_validation(api, teacher, classroom):
    payload = exam_payload(classroom.id)
    payload["sections"][0]["questions"][0]["correct_option"] = 7
    assert api(teacher).post("/api/exams/", payload, format="json").status_code == 400
    payload["sections"][0]["questions"][0].update(options=["same", "Same"], correct_option=0)
    assert api(teacher).post("/api/exams/", payload, format="json").status_code == 400


def test_at_most_four_sections(api, teacher, classroom):
    payload = exam_payload(classroom.id)
    payload["sections"] = payload["sections"] * 5
    assert api(teacher).post("/api/exams/", payload, format="json").status_code == 400


def test_grace_policy_needs_minutes(api, teacher, classroom):
    payload = exam_payload(classroom.id, overtime_policy="grace", grace_minutes=0)
    assert api(teacher).post("/api/exams/", payload, format="json").status_code == 400


def test_publish_requires_questions_in_every_section(api, teacher, classroom):
    payload = exam_payload(classroom.id)
    payload["sections"].append({"title": "Empty", "duration_minutes": 10, "questions": []})
    exam_id = api(teacher).post("/api/exams/", payload, format="json").json()["id"]
    response = api(teacher).post(f"/api/exams/{exam_id}/publish")
    assert response.status_code == 400
    assert "Empty has no questions" in response.json()["detail"]


def test_publish_and_student_visibility(api, teacher, classroom, student):
    exam_id = api(teacher).post("/api/exams/", exam_payload(classroom.id), format="json").json()["id"]
    assert api(student).get("/api/student/exams").json() == []
    assert api(teacher).post(f"/api/exams/{exam_id}/publish").json()["status"] == "open"
    cards = api(student).get("/api/student/exams").json()
    assert [c["id"] for c in cards] == [exam_id]
    assert cards[0]["can_start"] is True


def test_unenrolled_student_cannot_see_exam(api, exam):
    outsider = make_user("outsider", "student")
    assert api(outsider).get("/api/student/exams").json() == []
    assert api(outsider).get(f"/api/student/exams/{exam.id}").status_code == 404
    assert api(outsider).post(f"/api/student/exams/{exam.id}/start", {"mode": "full"}, format="json").status_code == 404


def test_students_cannot_touch_teacher_endpoints(api, exam, student):
    client = api(student)
    assert client.get(f"/api/exams/{exam.id}").status_code == 403
    assert client.patch(f"/api/exams/{exam.id}", {"title": "x"}, format="json").status_code == 403
    assert client.delete(f"/api/exams/{exam.id}").status_code == 403
    assert client.post(f"/api/exams/{exam.id}/publish").status_code == 403


def test_other_teacher_cannot_see_exam(api, exam, other_teacher):
    assert api(other_teacher).get(f"/api/exams/{exam.id}").status_code == 404
    assert api(other_teacher).delete(f"/api/exams/{exam.id}").status_code == 404


def test_structure_locked_after_attempts(api, exam, teacher, student):
    api(student).post(f"/api/student/exams/{exam.id}/start", {"mode": "full"}, format="json")
    detail = api(teacher).get(f"/api/exams/{exam.id}").json()
    response = api(teacher).patch(f"/api/exams/{exam.id}", {"sections": detail["sections"]}, format="json")
    assert response.status_code == 400
    assert api(teacher).patch(f"/api/exams/{exam.id}", {"title": "Renamed"}, format="json").status_code == 200
    assert api(teacher).delete(f"/api/exams/{exam.id}").status_code == 400
    assert api(teacher).post(f"/api/exams/{exam.id}/unpublish").status_code == 400


def test_close_exam_stops_new_starts(api, exam, teacher, student):
    assert api(teacher).post(f"/api/exams/{exam.id}/close").status_code == 200
    response = api(student).post(f"/api/student/exams/{exam.id}/start", {"mode": "full"}, format="json")
    assert response.status_code == 400


def test_duplicate_exam_is_a_draft_copy(api, exam, teacher):
    response = api(teacher).post(f"/api/exams/{exam.id}/duplicate", {}, format="json")
    assert response.status_code == 201
    copy = response.json()
    assert copy["status"] == "draft" and copy["question_count"] == 4


def test_scheduled_exam_not_startable_yet(api, classroom, student):
    exam = build_exam(classroom, available_from=timezone.now() + timedelta(hours=2))
    card = api(student).get(f"/api/student/exams/{exam.id}").json()
    assert card["state"] == "upcoming" and card["can_start"] is False

from rest_framework.test import APIClient

from accounts.models import User

from .conftest import PASSWORD


def register(client, **overrides):
    payload = {
        "username": "ali_raza",
        "email": "ali@uog.edu.pk",
        "full_name": "Ali Raza",
        "password": PASSWORD,
        "role": "student",
    }
    payload.update(overrides)
    return client.post("/api/auth/register", payload, format="json")


def test_student_registration_hashes_password_and_logs_in(db):
    client = APIClient()
    response = register(client)
    assert response.status_code == 201
    user = User.objects.get(username="ali_raza")
    assert user.password != PASSWORD and user.check_password(PASSWORD)
    assert user.approval_status == "approved"
    assert client.get("/api/auth/me").json()["user"]["username"] == "ali_raza"


def test_teacher_registration_is_pending_and_cannot_create_classes(db):
    client = APIClient()
    response = register(client, role="teacher")
    assert response.json()["user"]["approval_status"] == "pending"
    assert client.post("/api/classes/", {"name": "OOP"}, format="json").status_code == 403


def test_nobody_can_register_as_admin(db):
    assert register(APIClient(), role="admin").status_code == 400


def test_weak_password_rejected(db):
    response = register(APIClient(), password="12345678")
    assert response.status_code == 400


def test_duplicate_username_is_case_insensitive(student):
    assert register(APIClient(), username="STUDENT", email="new@uog.edu.pk").status_code == 400


def test_login_by_username_or_email(student):
    assert APIClient().post("/api/auth/login", {"username": "student", "password": PASSWORD}).status_code == 200
    assert APIClient().post("/api/auth/login", {"username": "student@uog.edu.pk", "password": PASSWORD}).status_code == 200
    assert APIClient().post("/api/auth/login", {"username": "student", "password": "wrong"}).status_code == 400


def test_login_requires_csrf_token(student):
    client = APIClient(enforce_csrf_checks=True)
    assert client.post("/api/auth/login", {"username": "student", "password": PASSWORD}).status_code == 403

    client.get("/api/auth/csrf")
    token = client.cookies["csrftoken"].value
    response = client.post(
        "/api/auth/login", {"username": "student", "password": PASSWORD}, HTTP_X_CSRFTOKEN=token
    )
    assert response.status_code == 200


def test_deactivated_user_gets_clear_message(student):
    student.is_active = False
    student.save()
    response = APIClient().post("/api/auth/login", {"username": "student", "password": PASSWORD})
    assert response.status_code == 403
    assert "deactivated" in response.json()["detail"]


def test_admin_approves_teacher(api, admin_user, pending_teacher):
    response = api(admin_user).post(f"/api/admin/users/{pending_teacher.id}/approve")
    assert response.status_code == 200
    pending_teacher.refresh_from_db()
    assert pending_teacher.is_approved_teacher
    assert api(pending_teacher).post("/api/classes/", {"name": "OOP"}, format="json").status_code == 201


def test_admin_rejects_teacher_with_reason(api, admin_user, pending_teacher):
    api(admin_user).post(f"/api/admin/users/{pending_teacher.id}/reject", {"reason": "Not faculty"}, format="json")
    pending_teacher.refresh_from_db()
    assert pending_teacher.approval_status == "rejected"
    assert pending_teacher.rejection_reason == "Not faculty"


def test_admin_cannot_deactivate_self(api, admin_user):
    assert api(admin_user).post(f"/api/admin/users/{admin_user.id}/deactivate").status_code == 400


def test_admin_endpoints_are_admin_only(api, teacher, student):
    for user in (teacher, student):
        assert api(user).get("/api/admin/users").status_code == 403
        assert api(user).get("/api/admin/stats").status_code == 403


def test_admin_user_filters(api, admin_user, pending_teacher, student):
    data = api(admin_user).get("/api/admin/users?role=teacher&approval_status=pending").json()
    assert [u["username"] for u in data["results"]] == ["pending_teacher"]


def test_admin_resets_password(api, admin_user, student):
    response = api(admin_user).post(f"/api/admin/users/{student.id}/reset-password")
    assert response.status_code == 200
    temporary = response.json()["temporary_password"]
    student.refresh_from_db()
    assert student.check_password(temporary) and not student.check_password(PASSWORD)
    assert api(student).post(f"/api/admin/users/{admin_user.id}/reset-password").status_code == 403

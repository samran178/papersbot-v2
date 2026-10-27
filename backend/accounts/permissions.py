from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = "Only admins can do this."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


class IsApprovedTeacher(BasePermission):
    message = "Only approved teachers can do this."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_approved_teacher)


class IsStudent(BasePermission):
    message = "Only students can do this."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_student)

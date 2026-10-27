from django.contrib import admin

from .models import Classroom, Enrollment


@admin.register(Classroom)
class ClassroomAdmin(admin.ModelAdmin):
    list_display = ["name", "course_code", "teacher", "join_code", "is_archived", "created_at"]
    search_fields = ["name", "course_code", "join_code", "teacher__full_name"]
    list_filter = ["is_archived"]


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ["classroom", "student", "joined_at"]
    search_fields = ["classroom__name", "student__full_name", "student__username"]

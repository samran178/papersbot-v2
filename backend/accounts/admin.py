from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "full_name", "email", "role", "approval_status", "is_active", "date_joined"]
    list_filter = ["role", "approval_status", "is_active"]
    search_fields = ["username", "full_name", "email", "roll_number"]
    fieldsets = BaseUserAdmin.fieldsets + (
        ("PapersBot", {"fields": ("full_name", "role", "approval_status", "rejection_reason", "roll_number", "department")}),
    )

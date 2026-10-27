from rest_framework import serializers

from .models import Classroom, Enrollment


class ClassroomSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    student_count = serializers.IntegerField(read_only=True, default=0)
    exam_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Classroom
        fields = [
            "id",
            "name",
            "course_code",
            "description",
            "join_code",
            "is_joining_open",
            "is_archived",
            "created_at",
            "teacher_name",
            "student_count",
            "exam_count",
        ]
        read_only_fields = ["id", "join_code", "created_at", "teacher_name", "student_count", "exam_count"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Class name is required.")
        return value


class StudentClassroomSerializer(serializers.ModelSerializer):
    """What a student sees: no join code management, no roster."""

    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)

    class Meta:
        model = Classroom
        fields = ["id", "name", "course_code", "description", "teacher_name", "is_archived"]


class EnrollmentSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source="student.id")
    full_name = serializers.CharField(source="student.full_name")
    username = serializers.CharField(source="student.username")
    email = serializers.CharField(source="student.email")
    roll_number = serializers.CharField(source="student.roll_number")

    class Meta:
        model = Enrollment
        fields = ["id", "student_id", "full_name", "username", "email", "roll_number", "joined_at"]


class JoinClassroomSerializer(serializers.Serializer):
    join_code = serializers.CharField(max_length=12)

    def validate_join_code(self, value):
        return value.strip().upper().replace(" ", "").replace("-", "")

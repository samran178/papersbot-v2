from django.db import IntegrityError
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsApprovedTeacher, IsStudent

from .models import Classroom, Enrollment, generate_join_code
from .serializers import (
    ClassroomSerializer,
    EnrollmentSerializer,
    JoinClassroomSerializer,
    StudentClassroomSerializer,
)


def teacher_classrooms(teacher):
    return Classroom.objects.filter(teacher=teacher).annotate(
        student_count=Count("enrollments", distinct=True),
        exam_count=Count("exams", distinct=True),
    )


def get_owned_classroom(request, pk) -> Classroom:
    classroom = teacher_classrooms(request.user).filter(pk=pk).first()
    if classroom is None:
        raise NotFound("Class not found.")
    return classroom


class ClassroomListView(APIView):
    def get(self, request):
        user = request.user
        if user.is_approved_teacher:
            return Response(ClassroomSerializer(teacher_classrooms(user), many=True).data)
        if user.is_student:
            classrooms = Classroom.objects.filter(enrollments__student=user).select_related("teacher")
            return Response(StudentClassroomSerializer(classrooms, many=True).data)
        raise PermissionDenied("Classes are only available to teachers and students.")

    def post(self, request):
        if not request.user.is_approved_teacher:
            raise PermissionDenied("Only approved teachers can create classes.")
        serializer = ClassroomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = serializer.save(teacher=request.user)
        return Response(ClassroomSerializer(get_owned_classroom(request, classroom.pk)).data, status=status.HTTP_201_CREATED)


class ClassroomDetailView(APIView):
    permission_classes = [IsApprovedTeacher]

    def get(self, request, pk):
        return Response(ClassroomSerializer(get_owned_classroom(request, pk)).data)

    def patch(self, request, pk):
        classroom = get_owned_classroom(request, pk)
        serializer = ClassroomSerializer(classroom, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ClassroomSerializer(get_owned_classroom(request, pk)).data)

    def delete(self, request, pk):
        classroom = get_owned_classroom(request, pk)
        if classroom.exam_count:
            raise ValidationError({"detail": "This class has exams. Archive it instead of deleting it."})
        classroom.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegenerateJoinCodeView(APIView):
    permission_classes = [IsApprovedTeacher]

    def post(self, request, pk):
        classroom = get_owned_classroom(request, pk)
        classroom.join_code = generate_join_code()
        classroom.save(update_fields=["join_code"])
        return Response(ClassroomSerializer(get_owned_classroom(request, pk)).data)


class ClassroomStudentsView(APIView):
    permission_classes = [IsApprovedTeacher]

    def get(self, request, pk):
        classroom = get_owned_classroom(request, pk)
        enrollments = classroom.enrollments.select_related("student")
        search = request.query_params.get("search", "").strip()
        if search:
            enrollments = enrollments.filter(
                Q(student__full_name__icontains=search)
                | Q(student__username__icontains=search)
                | Q(student__roll_number__icontains=search)
            )
        return Response(EnrollmentSerializer(enrollments, many=True).data)


class RemoveStudentView(APIView):
    permission_classes = [IsApprovedTeacher]

    def delete(self, request, pk, enrollment_id):
        classroom = get_owned_classroom(request, pk)
        deleted, _ = Enrollment.objects.filter(classroom=classroom, pk=enrollment_id).delete()
        if not deleted:
            raise NotFound("Student is not in this class.")
        return Response(status=status.HTTP_204_NO_CONTENT)


class JoinClassroomView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        serializer = JoinClassroomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        classroom = Classroom.objects.filter(join_code=serializer.validated_data["join_code"]).first()
        if classroom is None or classroom.is_archived:
            raise ValidationError({"detail": "No class found with that code."})
        if not classroom.is_joining_open:
            raise ValidationError({"detail": "This class is not accepting new students. Ask your teacher."})
        try:
            Enrollment.objects.create(classroom=classroom, student=request.user)
        except IntegrityError:
            raise ValidationError({"detail": "You are already in this class."})
        return Response(StudentClassroomSerializer(classroom).data, status=status.HTTP_201_CREATED)

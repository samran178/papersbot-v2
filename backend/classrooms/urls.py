from django.urls import path

from . import views

urlpatterns = [
    path("", views.ClassroomListView.as_view()),
    path("join", views.JoinClassroomView.as_view()),
    path("<int:pk>", views.ClassroomDetailView.as_view()),
    path("<int:pk>/regenerate-code", views.RegenerateJoinCodeView.as_view()),
    path("<int:pk>/students", views.ClassroomStudentsView.as_view()),
    path("<int:pk>/students/<int:enrollment_id>", views.RemoveStudentView.as_view()),
]

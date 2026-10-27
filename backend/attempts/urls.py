from django.urls import path

from . import views

student_urlpatterns = [
    path("exams", views.StudentExamListView.as_view()),
    path("exams/<int:pk>", views.StudentExamDetailView.as_view()),
    path("exams/<int:pk>/start", views.StartAttemptView.as_view()),
]

attempt_urlpatterns = [
    path("<int:pk>", views.AttemptDetailView.as_view()),
    path("<int:pk>/answers", views.SaveAnswersView.as_view()),
    path("<int:pk>/submit", views.SubmitSectionView.as_view()),
    path("<int:pk>/next-section", views.NextSectionView.as_view()),
    path("<int:pk>/events", views.IntegrityEventView.as_view()),
    path("<int:pk>/grade", views.GradeAttemptView.as_view()),
]

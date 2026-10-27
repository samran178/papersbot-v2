from django.urls import path

from . import views

urlpatterns = [
    path("", views.ExamListCreateView.as_view()),
    path("<int:pk>", views.ExamDetailView.as_view()),
    path("<int:pk>/duplicate", views.ExamDuplicateView.as_view()),
    path("<int:pk>/results", views.ExamResultsView.as_view()),
    path("<int:pk>/allowances", views.AttemptAllowanceView.as_view()),
    path("<int:pk>/<str:action>", views.ExamActionView.as_view()),
]

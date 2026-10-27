from django.urls import path

from . import views

auth_urlpatterns = [
    path("csrf", views.CsrfView.as_view()),
    path("register", views.RegisterView.as_view()),
    path("login", views.LoginView.as_view()),
    path("logout", views.LogoutView.as_view()),
    path("me", views.MeView.as_view()),
    path("change-password", views.ChangePasswordView.as_view()),
]

admin_urlpatterns = [
    path("users", views.AdminUserListView.as_view()),
    path("users/<int:pk>/reset-password", views.AdminResetPasswordView.as_view()),
    path("users/<int:pk>/<str:action>", views.AdminUserActionView.as_view()),
    path("stats", views.AdminStatsView.as_view()),
]

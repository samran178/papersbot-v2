from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path
from django.views.decorators.csrf import ensure_csrf_cookie

from accounts.urls import admin_urlpatterns, auth_urlpatterns
from ai import views as ai_views
from attempts.urls import attempt_urlpatterns, student_urlpatterns


@ensure_csrf_cookie
def spa(request, path=""):
    """Every non-API route returns the React app, which does its own routing."""

    index = settings.FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index.open("rb"), content_type="text/html")
    return HttpResponse(
        "<h1>Frontend not built</h1><p>Run <code>npm run build</code> in the frontend folder, "
        "or use the Vite dev server on port 5173 during development.</p>",
        status=503,
    )


def api_not_found(request, path=""):
    return HttpResponse('{"detail": "Not found."}', status=404, content_type="application/json")


api_urlpatterns = [
    path("auth/", include(auth_urlpatterns)),
    path("admin/", include(admin_urlpatterns)),
    path("config", ai_views.AppConfigView.as_view()),
    path("classes/", include("classrooms.urls")),
    path("exams/", include("exams.urls")),
    path("student/", include(student_urlpatterns)),
    path("attempts/", include(attempt_urlpatterns)),
    path("attempts/<int:pk>/ai-suggest", ai_views.SuggestGradesView.as_view()),
    path("ai/generate-questions", ai_views.GenerateQuestionsView.as_view()),
]

urlpatterns = [
    path("api/", include(api_urlpatterns)),
    re_path(r"^api/(?P<path>.*)$", api_not_found),
    path("django-admin/", admin.site.urls),
    re_path(r"^(?P<path>.*)$", spa),
]

import secrets

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.db.models import Q
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import generics, status
from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import User
from .permissions import IsAdmin
from .serializers import (
    AdminUserSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    UserSerializer,
)


def enforce_csrf(request):
    """DRF skips CSRF for anonymous requests; login/register must not."""

    check = CSRFCheck(lambda req: None)
    check.process_request(request)
    reason = check.process_view(request, None, (), {})
    if reason:
        raise PermissionDenied("Security check failed. Refresh the page and try again.")


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the csrftoken cookie so the SPA can send X-CSRFToken on writes."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"ok": True})


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        enforce_csrf(request)
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        enforce_csrf(request)
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["username"].strip()
        password = serializer.validated_data["password"]

        account = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
        if account and not account.is_active and account.check_password(password):
            raise PermissionDenied("Your account has been deactivated. Contact the administrator.")

        user = authenticate(request, username=account.username if account else identifier, password=password)
        if user is None:
            raise ValidationError({"detail": "Incorrect username or password."})
        login(request, user)
        return Response({"user": UserSerializer(user).data})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"user": None})
        return Response({"user": UserSerializer(request.user).data})

    def patch(self, request):
        if not request.user.is_authenticated:
            return Response({"detail": "Not logged in."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"user": UserSerializer(request.user).data})


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        update_session_auth_hash(request, request.user)
        return Response({"ok": True})


# ─── Admin panel ──────────────────────────────────────────────────────────────


class AdminPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminUserListView(generics.ListAPIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminUserSerializer
    pagination_class = AdminPagination

    def get_queryset(self):
        queryset = User.objects.select_related("reviewed_by").order_by("-date_joined")
        params = self.request.query_params
        if role := params.get("role"):
            queryset = queryset.filter(role=role)
        if approval := params.get("approval_status"):
            queryset = queryset.filter(approval_status=approval)
        if (active := params.get("is_active")) in {"true", "false"}:
            queryset = queryset.filter(is_active=active == "true")
        if search := params.get("search", "").strip():
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(full_name__icontains=search)
                | Q(email__icontains=search)
                | Q(roll_number__icontains=search)
            )
        return queryset


class AdminUserActionView(APIView):
    """POST /api/admin/users/<id>/<action> with action in approve|reject|activate|deactivate."""

    permission_classes = [IsAdmin]
    actions = {"approve", "reject", "activate", "deactivate"}

    def post(self, request, pk, action):
        if action not in self.actions:
            return Response({"detail": "Unknown action."}, status=status.HTTP_404_NOT_FOUND)
        user = generics.get_object_or_404(User, pk=pk)

        if action in {"approve", "reject"}:
            if not user.is_teacher:
                raise ValidationError({"detail": "Only teacher accounts need approval."})
            user.approval_status = User.Approval.APPROVED if action == "approve" else User.Approval.REJECTED
            user.rejection_reason = request.data.get("reason", "")[:300] if action == "reject" else ""
            user.reviewed_at = timezone.now()
            user.reviewed_by = request.user
            user.save(update_fields=["approval_status", "rejection_reason", "reviewed_at", "reviewed_by"])
        else:
            if user.pk == request.user.pk:
                raise ValidationError({"detail": "You cannot change your own account status."})
            user.is_active = action == "activate"
            user.save(update_fields=["is_active"])

        return Response(AdminUserSerializer(user).data)


class AdminResetPasswordView(APIView):
    """No email server is assumed, so the admin hands the user a temporary password."""

    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = generics.get_object_or_404(User, pk=pk)
        if user.pk == request.user.pk:
            raise ValidationError({"detail": "Change your own password from your profile."})
        temporary = "-".join(secrets.token_hex(2) for _ in range(3)) + "Pb"
        user.set_password(temporary)
        user.save(update_fields=["password"])
        # Their existing sessions are invalid now, since the password hash changed.
        return Response({"temporary_password": temporary})


class AdminStatsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        from attempts.models import Attempt
        from classrooms.models import Classroom
        from exams.models import Exam

        users = User.objects.all()
        return Response(
            {
                "students": users.filter(role=User.Role.STUDENT).count(),
                "teachers": users.filter(role=User.Role.TEACHER, approval_status=User.Approval.APPROVED).count(),
                "pending_teachers": users.filter(role=User.Role.TEACHER, approval_status=User.Approval.PENDING).count(),
                "inactive_users": users.filter(is_active=False).count(),
                "classes": Classroom.objects.count(),
                "exams": Exam.objects.count(),
                "published_exams": Exam.objects.filter(is_published=True).count(),
                "attempts": Attempt.objects.count(),
                "attempts_in_progress": Attempt.objects.filter(status=Attempt.Status.IN_PROGRESS).count(),
            }
        )

import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/feedback";
import { homePathFor, useMe } from "@/hooks/useAuth";
import type { Role } from "@/lib/types";

const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const Login = lazy(() => import("@/pages/auth/Login"));
const PendingApproval = lazy(() => import("@/pages/auth/PendingApproval"));
const Register = lazy(() => import("@/pages/auth/Register"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Profile = lazy(() => import("@/pages/Profile"));
const AttemptResultPage = lazy(() => import("@/pages/student/AttemptResult"));
const StudentClasses = lazy(() => import("@/pages/student/StudentClasses"));
const StudentDashboard = lazy(() => import("@/pages/student/StudentDashboard"));
const StudentExam = lazy(() => import("@/pages/student/StudentExam"));
const TakeExam = lazy(() => import("@/pages/student/TakeExam"));
const ClassDetail = lazy(() => import("@/pages/teacher/ClassDetail"));
const Classes = lazy(() => import("@/pages/teacher/Classes"));
const ExamEditor = lazy(() => import("@/pages/teacher/ExamEditor"));
const ExamResultsPage = lazy(() => import("@/pages/teacher/ExamResults"));
const Exams = lazy(() => import("@/pages/teacher/Exams"));
const GradeAttempt = lazy(() => import("@/pages/teacher/GradeAttempt"));
const TeacherDashboard = lazy(() => import("@/pages/teacher/TeacherDashboard"));

const FullPageLoader = () => <LoadingState className="min-h-dvh" />;

const RequireRole = ({ roles, children }: { roles: Role[]; children: ReactNode }) => {
  const { data: user, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  if (user.role === "teacher" && user.approval_status !== "approved") return <Navigate to="/pending" replace />;
  return <>{children}</>;
};

const GuestOnly = ({ children }: { children: ReactNode }) => {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <FullPageLoader />;
  if (user) return <Navigate to={homePathFor(user)} replace />;
  return <>{children}</>;
};

const Home = () => {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <FullPageLoader />;
  return <Navigate to={user ? homePathFor(user) : "/login"} replace />;
};

const shell = (roles: Role[], page: ReactNode) => (
  <RequireRole roles={roles}>
    <AppShell>{page}</AppShell>
  </RequireRole>
);

const App = () => (
  <Suspense fallback={<FullPageLoader />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route path="/pending" element={<PendingApproval />} />

      <Route path="/admin" element={shell(["admin"], <AdminOverview />)} />
      <Route path="/admin/users" element={shell(["admin"], <AdminUsers />)} />

      <Route path="/teacher" element={shell(["teacher"], <TeacherDashboard />)} />
      <Route path="/teacher/classes" element={shell(["teacher"], <Classes />)} />
      <Route path="/teacher/classes/:id" element={shell(["teacher"], <ClassDetail />)} />
      <Route path="/teacher/exams" element={shell(["teacher"], <Exams />)} />
      <Route path="/teacher/exams/new" element={shell(["teacher"], <ExamEditor />)} />
      <Route path="/teacher/exams/:id" element={shell(["teacher"], <ExamResultsPage />)} />
      <Route path="/teacher/exams/:id/edit" element={shell(["teacher"], <ExamEditor />)} />
      <Route path="/teacher/attempts/:id" element={shell(["teacher"], <GradeAttempt />)} />

      <Route path="/student" element={shell(["student"], <StudentDashboard />)} />
      <Route path="/student/classes" element={shell(["student"], <StudentClasses />)} />
      <Route path="/student/exams/:id" element={shell(["student"], <StudentExam />)} />
      <Route path="/student/attempts/:id/result" element={shell(["student"], <AttemptResultPage />)} />
      {/* The exam screen is deliberately outside the app shell: no menus to wander into. */}
      <Route path="/student/attempts/:id" element={<RequireRole roles={["student"]}><TakeExam /></RequireRole>} />

      <Route path="/profile" element={shell(["admin", "teacher", "student"], <Profile />)} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);

export default App;

import { useQueryClient } from "@tanstack/react-query";
import { Clock, XCircle } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

import { Logo } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/feedback";
import { Button, Card } from "@/components/ui/primitives";
import { homePathFor, ME_KEY, useAuthActions, useMe } from "@/hooks/useAuth";

const PendingApproval = () => {
  const { data: user, isLoading, isFetching } = useMe();
  const { logout } = useAuthActions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (isLoading) return <LoadingState className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "teacher" || user.approval_status === "approved") return <Navigate to={homePathFor(user)} replace />;

  const rejected = user.approval_status === "rejected";
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <Logo className="text-lg" />
      <Card className="w-full max-w-md p-6 text-center sm:p-8">
        <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full ${rejected ? "bg-danger-soft" : "bg-warning-soft"}`}>
          {rejected ? <XCircle className="h-7 w-7 text-danger" /> : <Clock className="h-7 w-7 text-warning" />}
        </div>
        <h1 className="text-xl font-bold">{rejected ? "Teacher request declined" : "Waiting for admin approval"}</h1>
        <p className="mt-2 text-sm text-muted">
          {rejected
            ? "The administrator did not approve this teacher account."
            : `Thanks, ${user.full_name}. An administrator needs to approve your teacher account before you can create classes and exams.`}
        </p>
        {rejected && user.rejection_reason && (
          <p className="mt-3 rounded-lg bg-subtle p-3 text-sm">
            <span className="font-medium">Reason:</span> {user.rejection_reason}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!rejected && (
            <Button variant="secondary" loading={isFetching} onClick={() => queryClient.invalidateQueries({ queryKey: ME_KEY })}>
              Check again
            </Button>
          )}
          <Button variant="ghost" onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login") })}>
            Log out
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PendingApproval;

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Copy, KeyRound, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, Input, Select, type BadgeTone } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useAuth";
import { copyText } from "@/hooks/useCopy";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { AdminUser, ApprovalStatus, Paginated } from "@/lib/types";

import { useUserAction } from "./TeacherRequests";

const APPROVAL_TONE: Record<ApprovalStatus, BadgeTone> = { approved: "success", pending: "warning", rejected: "danger" };

const ResetPassword = ({ user }: { user: AdminUser }) => {
  const [confirming, setConfirming] = useState(false);
  const [temporary, setTemporary] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => api.post<{ temporary_password: string }>(`/admin/users/${user.id}/reset-password`),
    onSuccess: (data) => setTemporary(data.temporary_password),
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <KeyRound className="h-4 w-4" /> Reset password
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Reset ${user.full_name}'s password?`}
        description="Their current password stops working and they are logged out everywhere. You'll get a temporary password to give them."
        confirmLabel="Reset password"
        onConfirm={() => reset.mutateAsync()}
      />
      <Modal
        open={temporary !== null}
        onOpenChange={(open) => !open && setTemporary(null)}
        title="Temporary password"
        description={`Give this to ${user.full_name} privately. It is shown only once; ask them to change it from their profile.`}
        size="sm"
        footer={<Button onClick={() => setTemporary(null)}>Done</Button>}
      >
        <button
          type="button"
          onClick={() => temporary && copyText(temporary, "Password copied")}
          className="flex w-full items-center justify-between gap-2 rounded-lg bg-subtle px-4 py-3 font-mono text-lg font-semibold"
        >
          {temporary} <Copy className="h-4 w-4 text-muted" />
        </button>
      </Modal>
    </>
  );
};

const UserRow = ({ user, isSelf }: { user: AdminUser; isSelf: boolean }) => {
  const action = useUserAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{user.full_name}</p>
          <Badge tone={user.role === "admin" ? "primary" : "neutral"} className="capitalize">
            {user.role}
          </Badge>
          {user.role === "teacher" && (
            <Badge tone={APPROVAL_TONE[user.approval_status]} className="capitalize">
              {user.approval_status}
            </Badge>
          )}
          {!user.is_active && <Badge tone="danger">Deactivated</Badge>}
        </div>
        <p className="truncate text-sm text-muted">
          @{user.username} · {user.email}
          {user.roll_number && ` · ${user.roll_number}`}
        </p>
        <p className="text-xs text-muted">
          Joined {formatDate(user.date_joined)} · Last login {user.last_login ? formatDate(user.last_login) : "never"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {user.role === "teacher" && user.approval_status !== "approved" && (
          <Button size="sm" onClick={() => action.mutate({ id: user.id, action: "approve" })} loading={action.isPending}>
            Approve
          </Button>
        )}
        {user.role === "teacher" && user.approval_status === "approved" && !isSelf && (
          <Button size="sm" variant="secondary" onClick={() => action.mutate({ id: user.id, action: "reject" })} loading={action.isPending}>
            Revoke teacher access
          </Button>
        )}
        {!isSelf && <ResetPassword user={user} />}
        {!isSelf &&
          (user.is_active ? (
            <Button size="sm" variant="danger-outline" onClick={() => setConfirming(true)}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => action.mutate({ id: user.id, action: "activate" })} loading={action.isPending}>
              Reactivate
            </Button>
          ))}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Deactivate ${user.full_name}?`}
        description="They will be unable to log in. Their classes, exams and results are kept, and you can reactivate them at any time."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => action.mutateAsync({ id: user.id, action: "deactivate" })}
      />
    </li>
  );
};

const AdminUsers = () => {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const role = params.get("role") ?? "";
  const approval = params.get("approval_status") ?? "";
  const page = Number(params.get("page") ?? "1");

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: true });
  };

  // Debounce typing into the URL.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (params.get("search") ?? "")) update({ search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({ page: String(page) });
  if (role) query.set("role", role);
  if (approval) query.set("approval_status", approval);
  if (params.get("search")) query.set("search", params.get("search")!);

  const users = useQuery({
    queryKey: ["admin", "users", query.toString()],
    queryFn: () => api.get<Paginated<AdminUser>>(`/admin/users?${query}`),
    placeholderData: keepPreviousData,
  });
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.count / 20)) : 1;

  return (
    <>
      <PageHeader title="Users" description="Everyone with a PapersBot account." />

      <Card>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_160px_160px] sm:px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username, email, roll no." className="pl-9" aria-label="Search users" />
          </div>
          <Select value={role} onChange={(e) => update({ role: e.target.value })} aria-label="Filter by role">
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Admins</option>
          </Select>
          <Select value={approval} onChange={(e) => update({ approval_status: e.target.value })} aria-label="Filter by approval">
            <option value="">Any approval</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        {users.isLoading ? (
          <LoadingState />
        ) : users.error ? (
          <div className="p-4">
            <ErrorState error={users.error} onRetry={() => users.refetch()} />
          </div>
        ) : users.data?.results.length ? (
          <ul className="divide-y divide-border">
            {users.data.results.map((user) => (
              <UserRow key={user.id} user={user} isSelf={user.id === me?.id} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="No users match" className="m-4 border-0" />
        )}

        {users.data && users.data.count > 20 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm sm:px-5">
            <span className="text-muted">
              Page {page} of {totalPages} · {users.data.count} users
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={!users.data.previous} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="secondary" disabled={!users.data.next} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
};

export default AdminUsers;

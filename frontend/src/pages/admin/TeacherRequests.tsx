import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { Button, Field, Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { relative } from "@/lib/format";
import type { AdminUser } from "@/lib/types";

export const useUserAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: number; action: "approve" | "reject" | "activate" | "deactivate"; reason?: string }) =>
      api.post<AdminUser>(`/admin/users/${id}/${action}`, reason ? { reason } : {}),
    onSuccess: (user, { action }) => {
      const verbs = { approve: "approved", reject: "rejected", activate: "activated", deactivate: "deactivated" };
      toast.success(`${user.full_name} ${verbs[action]}`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
};

/** One pending teacher with approve / reject actions. */
export const TeacherRequestRow = ({ user }: { user: AdminUser }) => {
  const action = useUserAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = action.isPending;

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="font-medium">{user.full_name}</p>
        <p className="truncate text-sm text-muted">
          @{user.username} · {user.email}
        </p>
        <p className="text-xs text-muted">
          {user.department || "No department given"} · requested {relative(user.date_joined)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="danger-outline" size="sm" onClick={() => setRejecting(true)} disabled={busy}>
          <X className="h-4 w-4" /> Reject
        </Button>
        <Button size="sm" onClick={() => action.mutate({ id: user.id, action: "approve" })} loading={busy && !rejecting}>
          <Check className="h-4 w-4" /> Approve
        </Button>
      </div>

      <Modal
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${user.full_name}?`}
        description="They will see the reason when they log in."
        size="sm"
        locked={busy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                action.mutate({ id: user.id, action: "reject", reason }, { onSuccess: () => setRejecting(false) })
              }
            >
              Reject request
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          {(id) => (
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Not listed as faculty" />
          )}
        </Field>
      </Modal>
    </li>
  );
};

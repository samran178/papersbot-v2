import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ClipboardList, Copy, Plus, RefreshCw, Search, Trash2, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Input, Toggle } from "@/components/ui/primitives";
import { copyText } from "@/hooks/useCopy";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import type { Classroom, Enrollment } from "@/lib/types";

import { BackLink, ExamStatusBadge, useTeacherExams } from "./shared";

const ClassDetail = () => {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<Enrollment | null>(null);
  const [confirm, setConfirm] = useState<"regenerate" | "archive" | "delete" | null>(null);

  const classroom = useQuery({ queryKey: ["classes", id], queryFn: () => api.get<Classroom>(`/classes/${id}`) });
  const students = useQuery({ queryKey: ["classes", id, "students"], queryFn: () => api.get<Enrollment[]>(`/classes/${id}/students`) });
  const exams = useTeacherExams(id);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["classes"] });
  const update = useMutation({
    mutationFn: (changes: Partial<Classroom>) => api.patch<Classroom>(`/classes/${id}`, changes),
    onSuccess: () => refresh(),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const regenerate = useMutation({
    mutationFn: () => api.post<Classroom>(`/classes/${id}/regenerate-code`),
    onSuccess: () => {
      toast.success("New join code created. The old one no longer works.");
      void refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (enrollment: Enrollment) => api.delete(`/classes/${id}/students/${enrollment.id}`),
    onSuccess: () => {
      toast.success("Student removed from class");
      void refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const destroy = useMutation({
    mutationFn: () => api.delete(`/classes/${id}`),
    onSuccess: () => {
      toast.success("Class deleted");
      void refresh();
      navigate("/teacher/classes");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (classroom.isLoading) return <LoadingState />;
  if (classroom.error || !classroom.data) return <ErrorState error={classroom.error} onRetry={() => classroom.refetch()} />;
  const c = classroom.data;

  const filtered = (students.data ?? []).filter((s) =>
    [s.full_name, s.username, s.roll_number].some((value) => value.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      <PageHeader
        back={<BackLink to="/teacher/classes" label="Classes" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name} {c.is_archived && <Badge>Archived</Badge>}
          </span>
        }
        description={[c.course_code, `created ${formatDate(c.created_at)}`].filter(Boolean).join(" · ")}
        actions={
          !c.is_archived && (
            <Button onClick={() => navigate(`/teacher/exams/new?classroom=${c.id}`)}>
              <Plus className="h-4 w-4" /> New exam
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Exams" description="Papers published to this class." />
            {exams.isLoading ? (
              <LoadingState />
            ) : exams.data?.length ? (
              <ul className="divide-y divide-border">
                {exams.data.map((exam) => (
                  <li key={exam.id}>
                    <Link to={`/teacher/exams/${exam.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-subtle sm:px-5">
                      <span className="min-w-0">
                        <span className="block font-medium">{exam.title}</span>
                        <span className="block text-xs text-muted">
                          {exam.available_until ? `Closes ${formatDateTime(exam.available_until)}` : "No closing time set"} ·{" "}
                          {plural(exam.attempt_count, "attempt")}
                        </span>
                      </span>
                      <ExamStatusBadge status={exam.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ClipboardList} title="No exams in this class yet" className="m-4 border-0" />
            )}
          </Card>

          <Card>
            <CardHeader title={`Students (${students.data?.length ?? 0})`} />
            <div className="border-b border-border p-4 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students" className="pl-9" aria-label="Search students" />
              </div>
            </div>
            {students.isLoading ? (
              <LoadingState />
            ) : filtered.length ? (
              <ul className="divide-y divide-border">
                {filtered.map((student) => (
                  <li key={student.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{student.full_name}</p>
                      <p className="truncate text-xs text-muted">
                        @{student.username}
                        {student.roll_number && ` · ${student.roll_number}`} · joined {formatDate(student.joined_at)}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setRemoving(student)} aria-label={`Remove ${student.full_name}`}>
                      <UserMinus className="h-4 w-4 text-muted" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Users}
                title={search ? "No students match" : "No students yet"}
                description={search ? undefined : `Share the join code ${c.join_code} with your students.`}
                className="m-4 border-0"
              />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <p className="text-sm text-muted">Join code</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em]">{c.join_code}</p>
            <p className="mt-2 text-xs text-muted">Students go to “My classes” → “Join a class” and type this code.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => copyText(c.join_code, "Join code copied")}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirm("regenerate")}>
                <RefreshCw className="h-4 w-4" /> New code
              </Button>
            </div>
            <div className="mt-4 border-t border-border pt-4">
              <Toggle
                checked={c.is_joining_open}
                onChange={(value) => update.mutate({ is_joining_open: value })}
                label="Accept new students"
                description="Turn off once everyone has joined."
                disabled={update.isPending || c.is_archived}
              />
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="font-semibold">Manage</h2>
            {c.is_archived ? (
              <Button variant="secondary" className="w-full" onClick={() => update.mutate({ is_archived: false })} loading={update.isPending}>
                Restore class
              </Button>
            ) : (
              <Button variant="secondary" className="w-full" onClick={() => setConfirm("archive")}>
                <Archive className="h-4 w-4" /> Archive class
              </Button>
            )}
            {c.exam_count === 0 && (
              <Button variant="danger-outline" className="w-full" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-4 w-4" /> Delete class
              </Button>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.full_name ?? "student"}?`}
        description="They will lose access to this class's exams. Their past attempts and results are kept."
        confirmLabel="Remove"
        danger
        onConfirm={() => (removing ? remove.mutateAsync(removing) : undefined)}
      />
      <ConfirmDialog
        open={confirm === "regenerate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Create a new join code?"
        description="The current code stops working. Students already in the class stay in it."
        confirmLabel="Create new code"
        onConfirm={() => regenerate.mutateAsync()}
      />
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Archive this class?"
        description="Students will no longer see its exams and nobody can join. You can restore it later."
        confirmLabel="Archive"
        onConfirm={() => update.mutateAsync({ is_archived: true })}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this class?"
        description="This removes the class and its student list permanently."
        confirmLabel="Delete class"
        danger
        onConfirm={() => destroy.mutateAsync()}
      />
    </>
  );
};

export default ClassDetail;

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  PenLine,
  Send,
  Timer,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, PageHeader, Stat } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime, formatDuration, formatMarks, formatMinutes, plural } from "@/lib/format";
import type { ExamDetail, ExamResults, StudentRef, TeacherAttemptRow } from "@/lib/types";

import { BackLink, ExamStatusBadge, useClasses } from "./shared";

type Filter = "all" | "to_grade" | "overtime" | "flagged" | "in_progress";

const FILTERS: { value: Filter; label: string; match: (a: TeacherAttemptRow) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "to_grade", label: "To grade", match: (a) => a.status === "completed" && a.grading_status === "pending" },
  { value: "overtime", label: "Over time", match: (a) => a.is_overtime || a.timed_out },
  { value: "flagged", label: "Flagged", match: (a) => a.integrity_event_count > 0 },
  { value: "in_progress", label: "In progress", match: (a) => a.status === "in_progress" },
];

export const TimingBadge = ({ attempt }: { attempt: TeacherAttemptRow | (Pick<TeacherAttemptRow, "status" | "timed_out" | "is_overtime" | "overtime_seconds">) }) => {
  if (attempt.status === "in_progress") return <Badge tone="primary">In progress</Badge>;
  if (attempt.timed_out) return <Badge tone="danger">Timed out</Badge>;
  if (attempt.is_overtime) return <Badge tone="warning">Over by {formatDuration(attempt.overtime_seconds)}</Badge>;
  return <Badge tone="success">Within time</Badge>;
};

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const downloadCsv = (exam: ExamDetail, attempts: TeacherAttemptRow[]) => {
  const header = ["Student", "Username", "Roll number", "Attempt", "Mode", "Started", "Finished", "Time taken", "Timing", "Score", "Out of", "Percent", "Result", "Flags"];
  const rows = attempts.map((a) => [
    a.student.full_name,
    a.student.username,
    a.student.roll_number,
    a.attempt_number,
    a.mode === "modular" ? "Section by section" : "Full",
    formatDateTime(a.started_at),
    formatDateTime(a.completed_at),
    a.duration_seconds !== null ? formatDuration(a.duration_seconds) : "",
    a.status === "in_progress" ? "In progress" : a.timed_out ? "Timed out" : a.is_overtime ? "Overtime" : "Within time",
    a.score ?? "",
    a.max_score,
    a.percentage ?? "",
    a.grading_status === "pending" ? "Pending" : a.passed ? "Pass" : "Fail",
    a.integrity_event_count,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `${exam.title.replace(/[^\w-]+/g, "_")}_results.csv` });
  link.click();
  URL.revokeObjectURL(url);
};

const AttemptCard = ({ attempt }: { attempt: TeacherAttemptRow }) => (
  <Link to={`/teacher/attempts/${attempt.id}`} className="block px-4 py-3.5 transition-colors hover:bg-subtle sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium">
          {attempt.student.full_name}
          {attempt.attempt_number > 1 && <span className="ml-1.5 text-xs text-muted">attempt {attempt.attempt_number}</span>}
        </p>
        <p className="truncate text-xs text-muted">
          {attempt.student.roll_number || `@${attempt.student.username}`} · {attempt.mode === "modular" ? "Section by section" : "Full paper"}
        </p>
      </div>
      <div className="text-right">
        {attempt.status === "completed" && attempt.grading_status === "pending" ? (
          <p className="tabular text-sm text-muted">
            {formatMarks(attempt.score)} / {formatMarks(attempt.max_score)} so far
          </p>
        ) : attempt.status === "completed" ? (
          <p className="tabular font-semibold">
            {formatMarks(attempt.score)} / {formatMarks(attempt.max_score)}
            {attempt.percentage !== null && <span className="ml-1 text-sm font-normal text-muted">({attempt.percentage}%)</span>}
          </p>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <TimingBadge attempt={attempt} />
      {attempt.status === "completed" &&
        (attempt.grading_status === "pending" ? (
          <Badge tone="warning">
            <PenLine className="h-3 w-3" /> Needs grading
          </Badge>
        ) : attempt.passed ? (
          <Badge tone="success">Passed</Badge>
        ) : (
          <Badge tone="danger">Failed</Badge>
        ))}
      {attempt.integrity_event_count > 0 && (
        <Badge tone="danger">
          <AlertTriangle className="h-3 w-3" /> {plural(attempt.integrity_event_count, "flag")}
        </Badge>
      )}
      <span className="text-xs text-muted">
        {attempt.completed_at ? `Finished ${formatDateTime(attempt.completed_at)}` : `Started ${formatDateTime(attempt.started_at)}`}
        {attempt.duration_seconds !== null && ` · took ${formatDuration(attempt.duration_seconds)}`}
      </span>
    </div>
  </Link>
);

const ExtraAttemptModal = ({ examId, student, onClose }: { examId: number; student: StudentRef | null; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [extra, setExtra] = useState(1);
  const grant = useMutation({
    mutationFn: () => api.post(`/exams/${examId}/allowances`, { student_id: student?.id, extra_attempts: extra }),
    onSuccess: () => {
      toast.success(`${student?.full_name} can now attempt again.`);
      void queryClient.invalidateQueries({ queryKey: ["exam-results", examId] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Modal
      open={student !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Extra attempts for ${student?.full_name ?? ""}`}
      description="Use this when something went wrong, e.g. a power cut or network failure. Set 0 to remove."
      size="sm"
      locked={grant.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => grant.mutate()} loading={grant.isPending}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Extra attempts on top of the normal limit">
        {(id) => <Input id={id} type="number" min={0} max={10} value={extra} onChange={(e) => setExtra(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />}
      </Field>
    </Modal>
  );
};

const ExamResultsPage = () => {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const classes = useClasses();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | "close" | "delete" | null>(null);
  const [duplicateTo, setDuplicateTo] = useState<number | null>(null);
  const [extraFor, setExtraFor] = useState<StudentRef | null>(null);

  const results = useQuery({
    queryKey: ["exam-results", id],
    queryFn: () => api.get<ExamResults>(`/exams/${id}/results`),
    refetchInterval: (query) => ((query.state.data?.stats.in_progress ?? 0) > 0 ? 30_000 : false),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["exam-results", id] });
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
    void queryClient.invalidateQueries({ queryKey: ["exam", id] });
  };
  const action = useMutation({
    mutationFn: (name: "publish" | "unpublish" | "close") => api.post<ExamDetail>(`/exams/${id}/${name}`),
    onSuccess: (_, name) => {
      toast.success({ publish: "Published", unpublish: "Moved back to drafts", close: "Exam closed" }[name]);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/exams/${id}`),
    onSuccess: () => {
      toast.success("Exam deleted");
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      navigate("/teacher/exams");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const duplicate = useMutation({
    mutationFn: (classroom: number) => api.post<ExamDetail>(`/exams/${id}/duplicate`, { classroom }),
    onSuccess: (copy) => {
      toast.success("Copied as a draft");
      void queryClient.invalidateQueries({ queryKey: ["exams"] });
      navigate(`/teacher/exams/${copy.id}/edit`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (results.isLoading) return <LoadingState />;
  if (results.error || !results.data) return <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  const { exam, stats, attempts, not_attempted, allowances } = results.data;
  const shown = attempts.filter(FILTERS.find((f) => f.value === filter)!.match);
  const extraAttemptsOf = (studentId: number) => allowances.find((a) => a.student_id === studentId)?.extra_attempts ?? 0;
  const studentsUsedUp = [...new Map(attempts.filter((a) => a.status === "completed").map((a) => [a.student.id, a.student])).values()];

  return (
    <>
      <PageHeader
        back={<BackLink to="/teacher/exams" label="Exams" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {exam.title} <ExamStatusBadge status={exam.status} />
          </span>
        }
        description={
          <>
            {exam.classroom.name} · {plural(exam.question_count, "question")} · {exam.total_marks} marks · {formatMinutes(exam.total_minutes)}
            {exam.available_until && ` · closes ${formatDateTime(exam.available_until)}`}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/teacher/exams/${id}/edit`)}>
              {exam.has_attempts ? <Lock className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />} Edit
            </Button>
            {exam.status === "draft" && (
              <Button onClick={() => setConfirm("publish")}>
                <Send className="h-4 w-4" /> Publish
              </Button>
            )}
            {exam.status === "open" && (
              <Button variant="secondary" onClick={() => setConfirm("close")}>
                <Timer className="h-4 w-4" /> Close now
              </Button>
            )}
            {exam.is_published && !exam.has_attempts && (
              <Button variant="secondary" onClick={() => setConfirm("unpublish")}>
                <EyeOff className="h-4 w-4" /> Unpublish
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDuplicateTo(exam.classroom.id)}>
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
            {!exam.has_attempts && (
              <Button variant="danger-outline" onClick={() => setConfirm("delete")} aria-label="Delete exam">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Attempted" value={`${stats.students_attempted}/${stats.enrolled_students}`} hint={`${stats.in_progress} in progress now`} icon={Users} tone="primary" />
        <Stat label="Average" value={stats.average_percentage !== null ? `${stats.average_percentage}%` : "—"} hint={stats.highest_percentage !== null ? `High ${stats.highest_percentage}% · Low ${stats.lowest_percentage}%` : "After grading"} icon={CheckCircle2} tone="success" />
        <Stat label="Within time" value={stats.within_time} hint={`${stats.overtime} overtime · ${stats.timed_out} timed out`} icon={Clock} tone={stats.overtime + stats.timed_out ? "warning" : "neutral"} />
        <Stat label="To grade" value={stats.pending_grading} hint={stats.flagged_attempts ? `${stats.flagged_attempts} flagged attempts` : "No integrity flags"} icon={PenLine} tone={stats.pending_grading ? "warning" : "neutral"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <CardHeader
            title="Attempts"
            action={
              attempts.length > 0 && (
                <Button size="sm" variant="secondary" onClick={() => downloadCsv(exam, attempts)}>
                  <Download className="h-4 w-4" /> CSV
                </Button>
              )
            }
          />
          <div className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2 sm:px-5" role="tablist">
            {FILTERS.map(({ value, label, match }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium",
                  filter === value ? "bg-primary text-primary-fg" : "text-muted hover:bg-subtle",
                )}
              >
                {label} <span className="tabular opacity-75">{attempts.filter(match).length}</span>
              </button>
            ))}
          </div>
          {shown.length ? (
            <div className="divide-y divide-border">
              {shown.map((attempt) => (
                <AttemptCard key={attempt.id} attempt={attempt} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Eye} title={attempts.length ? "Nothing in this filter" : "No attempts yet"} description={exam.is_published ? undefined : "Publish the exam so students can attempt it."} className="m-4 border-0" />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={`Not attempted (${not_attempted.length})`} />
            {not_attempted.length ? (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {not_attempted.map((student) => (
                  <li key={student.id} className="px-4 py-2.5 text-sm sm:px-5">
                    <p className="font-medium">{student.full_name}</p>
                    <p className="text-xs text-muted">{student.roll_number || `@${student.username}`}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Everyone in the class has attempted.</p>
            )}
          </Card>
          {studentsUsedUp.length > 0 && (
            <Card>
              <CardHeader title="Re-attempts" description="Let a specific student try again." />
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {studentsUsedUp.map((student) => (
                  <li key={student.id} className="flex items-center justify-between gap-2 px-4 py-2 sm:px-5">
                    <span className="min-w-0 truncate text-sm">
                      {student.full_name}
                      {extraAttemptsOf(student.id) > 0 && <span className="ml-1 text-xs text-success">+{extraAttemptsOf(student.id)}</span>}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setExtraFor(student)} aria-label={`Grant ${student.full_name} another attempt`}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Publish this exam?"
        description={`Students in ${exam.classroom.name} will see it${exam.opens_at && new Date(exam.opens_at) > new Date() ? ` from ${formatDateTime(exam.opens_at)}` : " immediately"}.`}
        confirmLabel="Publish"
        onConfirm={() => action.mutateAsync("publish")}
      />
      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Close this exam now?"
        description="No one can start it any more. Students already mid-exam keep their remaining time for the section they're on."
        confirmLabel="Close exam"
        onConfirm={() => action.mutateAsync("close")}
      />
      <ConfirmDialog
        open={confirm === "unpublish"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Move back to drafts?"
        description="Students will no longer see this exam."
        confirmLabel="Unpublish"
        onConfirm={() => action.mutateAsync("unpublish")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this exam?"
        description="All its sections and questions are deleted permanently."
        confirmLabel="Delete"
        danger
        onConfirm={() => remove.mutateAsync()}
      />
      <Modal
        open={duplicateTo !== null}
        onOpenChange={(open) => !open && setDuplicateTo(null)}
        title="Duplicate exam"
        description="Creates a draft copy with the same questions and rules."
        size="sm"
        locked={duplicate.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicateTo(null)}>
              Cancel
            </Button>
            <Button onClick={() => duplicateTo && duplicate.mutate(duplicateTo)} loading={duplicate.isPending}>
              Duplicate
            </Button>
          </>
        }
      >
        <Field label="Copy into class">
          {(fieldId) => (
            <Select id={fieldId} value={duplicateTo ?? ""} onChange={(e) => setDuplicateTo(Number(e.target.value))}>
              {(classes.data ?? [])
                .filter((c) => !c.is_archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </Modal>
      <ExtraAttemptModal examId={id} student={extraFor} onClose={() => setExtraFor(null)} />
    </>
  );
};

export default ExamResultsPage;

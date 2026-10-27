import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Coffee, FileText, Layers, ShieldAlert, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { ErrorState, LoadingState, Notice, PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime, formatMinutes, minutesUntil, plural } from "@/lib/format";
import type { AttemptMode, LiveAttempt, StudentExamCard } from "@/lib/types";

import { BackLink } from "../teacher/shared";

import { DeadlineText } from "./shared";

const MODES: { value: AttemptMode; title: string; icon: typeof Zap; points: string[] }[] = [
  {
    value: "full",
    title: "Full paper in one go",
    icon: Zap,
    points: ["All sections open together", "One timer for the whole paper", "Move freely between sections"],
  },
  {
    value: "modular",
    title: "Section by section",
    icon: Coffee,
    points: ["One section at a time, each with its own timer", "Take a break between sections", "Can't go back to a submitted section"],
  },
];

const StudentExam = () => {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AttemptMode>("full");
  const [confirming, setConfirming] = useState(false);

  const exam = useQuery({ queryKey: ["student-exam", id], queryFn: () => api.get<StudentExamCard>(`/student/exams/${id}`) });
  const start = useMutation({
    mutationFn: () => api.post<LiveAttempt>(`/student/exams/${id}/start`, { mode }),
    onSuccess: (attempt) => {
      void queryClient.invalidateQueries({ queryKey: ["student-exams"] });
      queryClient.setQueryData(["live-attempt", attempt.id], attempt);
      navigate(`/student/attempts/${attempt.id}`, { replace: true });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirming(false);
      void exam.refetch();
    },
  });

  if (exam.isLoading) return <LoadingState />;
  if (exam.error || !exam.data) return <ErrorState error={exam.error} onRetry={() => exam.refetch()} />;
  const e = exam.data;

  const minutesLeftInWindow = minutesUntil(e.available_until);
  const longestRun = mode === "full" ? e.total_minutes : Math.max(...e.sections.map((s) => s.duration_minutes));
  const windowCutsTime = e.can_start && minutesLeftInWindow < longestRun;
  const attemptsLeft = e.attempts_allowed - e.attempts_used;

  return (
    <>
      <PageHeader back={<BackLink to="/student" label="My exams" />} title={e.title} description={`${e.classroom.name} · ${e.teacher_name}`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6">
          <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
            {[
              { icon: Clock, label: "Time", value: formatMinutes(e.total_minutes) },
              { icon: FileText, label: "Marks", value: e.total_marks },
              { icon: Layers, label: "Sections", value: e.sections.length },
              { icon: CheckCircle2, label: "Pass mark", value: `${e.pass_percentage}%` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                </p>
                <p className="tabular mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </Card>

          {e.instructions && (
            <Card>
              <CardHeader title="Instructions" />
              <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed sm:p-5">{e.instructions}</p>
            </Card>
          )}

          <Card>
            <CardHeader title="Sections" />
            <ul className="divide-y divide-border">
              {e.sections.map((section) => (
                <li key={section.order} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="font-medium">{section.title}</span>
                  <span className="tabular text-sm text-muted">
                    {plural(section.question_count, "question")} · {section.marks} marks · {formatMinutes(section.duration_minutes)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {e.attempts.length > 0 && (
            <Card>
              <CardHeader title="Your attempts" />
              <ul className="divide-y divide-border">
                {e.attempts.map((attempt) => (
                  <li key={attempt.id}>
                    <Link
                      to={attempt.status === "in_progress" ? `/student/attempts/${attempt.id}` : `/student/attempts/${attempt.id}/result`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-subtle sm:px-5"
                    >
                      <span>
                        <span className="block font-medium">Attempt {attempt.attempt_number}</span>
                        <span className="block text-xs text-muted">
                          {attempt.mode === "modular" ? "Section by section" : "Full paper"} · {formatDateTime(attempt.started_at)}
                        </span>
                      </span>
                      {attempt.status === "in_progress" ? (
                        <Badge tone="primary">In progress</Badge>
                      ) : attempt.grading_status === "graded" ? (
                        <Badge tone={attempt.passed ? "success" : "danger"}>
                          {attempt.percentage}% · {attempt.passed ? "Pass" : "Fail"}
                        </Badge>
                      ) : (
                        <Badge tone="warning">Awaiting grading</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <Card className="space-y-4 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-muted" aria-hidden />
              <DeadlineText exam={e} />
            </div>
            <p className="text-sm text-muted">
              {plural(e.attempts_used, "attempt")} used of {e.attempts_allowed}
            </p>

            {e.state === "in_progress" && e.active_attempt_id ? (
              <Button size="lg" className="w-full" onClick={() => navigate(`/student/attempts/${e.active_attempt_id}`)}>
                Resume exam
              </Button>
            ) : e.can_start ? (
              <>
                {e.allow_modular && (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">How do you want to attempt it?</legend>
                    {MODES.map(({ value, title, icon: Icon, points }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        aria-pressed={mode === value}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-colors",
                          mode === value ? "border-primary bg-primary-soft/50 ring-1 ring-primary" : "border-border hover:bg-subtle",
                        )}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          <Icon className={cn("h-4 w-4", mode === value ? "text-primary" : "text-muted")} aria-hidden /> {title}
                        </span>
                        <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-muted">
                          {points.map((point) => (
                            <li key={point} className="list-disc">
                              {point}
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                  </fieldset>
                )}
                <Button size="lg" className="w-full" onClick={() => setConfirming(true)}>
                  Start exam
                </Button>
              </>
            ) : (
              <Notice tone={e.state === "missed" ? "danger" : "primary"}>
                {e.state === "upcoming"
                  ? `This paper opens ${formatDateTime(e.opens_at)}.`
                  : e.state === "missed"
                    ? "This paper closed before you attempted it. Contact your teacher if something went wrong."
                    : attemptsLeft <= 0
                      ? "You've used all your attempts."
                      : "This paper is closed."}
              </Notice>
            )}
          </Card>

          <Notice tone="warning" icon={ShieldAlert} title="Exam rules">
            <ul className="list-disc space-y-0.5 pl-4">
              <li>The timer runs on the server. Closing the tab doesn't pause it.</li>
              <li>
                {e.overtime_policy === "grace"
                  ? `After time is up you get a ${e.grace_minutes}-minute grace period, but submissions are marked overtime.`
                  : "When time is up, your saved answers are submitted automatically."}
              </li>
              <li>Switching tabs, copying and pasting are recorded and shown to your teacher.</li>
            </ul>
          </Notice>
        </div>
      </div>

      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title="Ready to start?"
        description={mode === "modular" ? `${e.sections[0]?.title} starts now with ${formatMinutes(e.sections[0]?.duration_minutes ?? 0)} on the clock.` : `Your ${formatMinutes(e.total_minutes)} timer starts now.`}
        size="sm"
        locked={start.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={start.isPending}>
              Not yet
            </Button>
            <Button onClick={() => start.mutate()} loading={start.isPending}>
              Start now
            </Button>
          </>
        }
      >
        {windowCutsTime && (
          <Notice tone="danger" icon={AlertTriangle}>
            The paper closes in {formatMinutes(Math.max(0, minutesLeftInWindow))}, which is less than the full time. Your timer will end when the paper closes.
          </Notice>
        )}
        {!windowCutsTime && <p className="text-sm text-muted">Make sure you have a stable connection. Your answers save automatically as you type.</p>}
      </Modal>
    </>
  );
};

export default StudentExam;

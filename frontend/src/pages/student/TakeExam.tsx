import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Cloud, CloudOff, Coffee, Loader2, Lock, Maximize, Play, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Logo } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, LoadingState, Notice } from "@/components/ui/feedback";
import { Badge, Button, Card, Textarea } from "@/components/ui/primitives";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn, formatDateTime, formatMinutes, formatSeconds, plural, QUESTION_TYPE_LABEL } from "@/lib/format";
import type { AttemptResult, LiveAttempt, LiveQuestion, LiveSection } from "@/lib/types";

import { clearDrafts, useAnswers, useIntegrityMonitor, useServerNow, type AnswerValue, type SaveState } from "./useExamSession";

type AttemptResponse = LiveAttempt | AttemptResult;
const isLive = (data: AttemptResponse): data is LiveAttempt => data.status === "in_progress" && "server_now" in data;

const OPTION_LETTERS = "ABCDEF";

const isAnswered = (question: LiveQuestion, value: AnswerValue | undefined) =>
  question.type === "mcq" ? value?.selected_option !== null && value?.selected_option !== undefined : Boolean(value?.text_answer?.trim());

const SaveIndicator = ({ state }: { state: SaveState }) => {
  const config = {
    saved: { icon: Cloud, label: "Saved", className: "text-muted" },
    saving: { icon: Loader2, label: "Saving…", className: "text-muted" },
    unsaved: { icon: Cloud, label: "Editing", className: "text-muted" },
    offline: { icon: CloudOff, label: "Not saved — retrying", className: "text-danger" },
  }[state];
  const Icon = config.icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs", config.className)} role="status" aria-live="polite">
      <Icon className={cn("h-3.5 w-3.5", state === "saving" && "animate-spin")} aria-hidden />
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
};

const QuestionCard = ({
  question,
  number,
  value,
  onChange,
}: {
  question: LiveQuestion;
  number: number;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) => (
  <Card id={`q-${question.id}`} className="scroll-mt-36 p-4 sm:p-5">
    <div className="mb-3 flex items-center gap-2">
      <span className="text-sm font-semibold">Question {number}</span>
      <Badge>{QUESTION_TYPE_LABEL[question.type]}</Badge>
      <span className="ml-auto text-xs text-muted">{plural(question.marks, "mark")}</span>
    </div>
    <p className="select-none whitespace-pre-wrap leading-relaxed">{question.text}</p>

    {question.type === "mcq" ? (
      <div className="mt-4 space-y-2" role="radiogroup" aria-label={`Question ${number} options`}>
        {question.options?.map((option, displayIndex) => {
          const selected = value?.selected_option === option.index;
          return (
            <button
              key={option.index}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ selected_option: selected ? null : option.index })}
              className={cn(
                "flex w-full select-none items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors active:scale-[0.99]",
                selected ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "border-border hover:bg-subtle",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  selected ? "border-primary bg-primary text-primary-fg" : "border-border text-muted",
                )}
              >
                {selected ? <Check className="h-4 w-4" /> : OPTION_LETTERS[displayIndex]}
              </span>
              <span className="pt-0.5">{option.text}</span>
            </button>
          );
        })}
        {value?.selected_option !== null && value?.selected_option !== undefined && (
          <p className="text-xs text-muted">Tap your answer again to clear it.</p>
        )}
      </div>
    ) : (
      <div className="mt-4">
        <Textarea
          value={value?.text_answer ?? ""}
          onChange={(e) => onChange({ text_answer: e.target.value })}
          rows={question.type === "long" ? 10 : 4}
          placeholder="Type your answer…"
          spellCheck={false}
          autoCorrect="off"
          autoComplete="off"
          aria-label={`Answer to question ${number}`}
        />
        <p className="mt-1 text-right text-xs text-muted">
          {(value?.text_answer ?? "").trim().split(/\s+/).filter(Boolean).length} words
        </p>
      </div>
    )}
  </Card>
);

const BreakScreen = ({ attempt, onStartNext, starting }: { attempt: LiveAttempt; onStartNext: () => void; starting: boolean }) => {
  const navigate = useNavigate();
  const next = attempt.sections.find((s) => s.status === "locked");
  const done = attempt.sections.filter((s) => s.status === "submitted" || s.status === "timed_out").length;
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <div className="text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-success-soft">
          <CheckCircle2 className="h-7 w-7 text-success" />
        </div>
        <h1 className="text-2xl font-bold">
          {done} of {attempt.sections.length} sections done
        </h1>
        <p className="mt-2 text-muted">Take a break if you need one. The next section's timer starts only when you start it.</p>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {attempt.sections.map((section) => (
            <li key={section.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-medium">{section.title}</span>
              {section.status === "submitted" ? (
                <Badge tone="success">Submitted</Badge>
              ) : section.status === "timed_out" ? (
                <Badge tone="danger">Time ran out</Badge>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted">
                  <Lock className="h-3.5 w-3.5" /> {formatMinutes(section.duration_minutes)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {next && (
        <Notice tone="warning" icon={Timer}>
          Finish before the paper closes on <strong>{formatDateTime(attempt.exam.available_until)}</strong>. Sections not started by then are lost.
        </Notice>
      )}
      <div className="flex flex-col gap-2">
        {next && (
          <Button size="lg" onClick={onStartNext} loading={starting}>
            <Play className="h-4 w-4" /> Start {next.title} ({formatMinutes(next.duration_minutes)})
          </Button>
        )}
        <Button size="lg" variant="secondary" onClick={() => navigate("/student")}>
          <Coffee className="h-4 w-4" /> Take a break
        </Button>
      </div>
    </div>
  );
};

const TakeExam = () => {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const autoSubmitted = useRef(false);

  const attemptQuery = useQuery({
    queryKey: ["live-attempt", id],
    queryFn: () => api.get<AttemptResponse>(`/attempts/${id}`),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const data = attemptQuery.data;
  const attempt = data && isLive(data) ? data : undefined;

  const refetch = useCallback(() => void attemptQuery.refetch(), [attemptQuery]);
  const { answers, setAnswer, saveState, flush, collect, markAllSaved } = useAnswers(attempt, refetch);
  const now = useServerNow(attempt?.server_now, attemptQuery.dataUpdatedAt);

  const openSections = useMemo(() => attempt?.sections.filter((s) => s.status === "in_progress" && s.questions) ?? [], [attempt]);
  const examActive = openSections.length > 0;
  const warnings = useIntegrityMonitor(attempt?.id, examActive);

  // Finished attempts belong on the result page.
  useEffect(() => {
    if (data && data.status === "completed") {
      clearDrafts(data.id);
      navigate(`/student/attempts/${data.id}/result`, { replace: true });
    }
  }, [data, navigate]);

  useEffect(() => {
    if (!examActive) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [examActive]);

  const handleResponse = (response: AttemptResponse) => {
    queryClient.setQueryData(["live-attempt", id], response);
    void queryClient.invalidateQueries({ queryKey: ["student-exams"] });
    void queryClient.invalidateQueries({ queryKey: ["student-exam"] });
  };

  const submit = useMutation({
    mutationFn: async (_reason: "manual" | "timeout") => {
      await flush().catch(() => undefined);
      const questionIds = openSections.flatMap((s) => s.questions?.map((q) => q.id) ?? []);
      const body = {
        section_attempt_id: attempt?.mode === "modular" ? openSections[0]?.id : undefined,
        answers: collect(questionIds),
      };
      return api.post<AttemptResponse>(`/attempts/${id}/submit`, body);
    },
    onSuccess: (response, reason) => {
      markAllSaved();
      setConfirmSubmit(false);
      if (reason === "timeout") toast.info("Time's up. Your answers were submitted.");
      handleResponse(response);
      autoSubmitted.current = false;
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) refetch();
      else toast.error(`${errorMessage(error)} Your answers are kept; try again.`);
      autoSubmitted.current = false;
    },
  });

  const startNext = useMutation({
    mutationFn: () => api.post<AttemptResponse>(`/attempts/${id}/next-section`),
    onSuccess: (response) => {
      handleResponse(response);
      window.scrollTo({ top: 0 });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      refetch();
    },
  });

  // Timing: one deadline per open section (all equal in full mode).
  const deadline = openSections[0]?.deadline ? Date.parse(openSections[0].deadline) : null;
  const graceMs = (attempt?.grace_seconds ?? 0) * 1000;
  const remainingMs = deadline !== null ? deadline - now : 0;
  const inGrace = deadline !== null && remainingMs <= 0 && graceMs > 0 && remainingMs > -graceMs;
  const graceRemainingMs = deadline !== null ? deadline + graceMs - now : 0;
  const expired = deadline !== null && (graceMs > 0 ? graceRemainingMs <= 0 : remainingMs <= 0);

  useEffect(() => {
    if (expired && examActive && !autoSubmitted.current && !submit.isPending) {
      autoSubmitted.current = true;
      submit.mutate("timeout");
    }
  }, [expired, examActive, submit]);

  if (attemptQuery.isLoading) return <LoadingState className="min-h-dvh" label="Opening your exam…" />;
  if (attemptQuery.error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState error={attemptQuery.error} onRetry={refetch} />
      </div>
    );
  }
  if (!attempt) return <LoadingState className="min-h-dvh" />;

  if (!examActive) {
    return (
      <div className="min-h-dvh">
        <header className="flex h-14 items-center border-b border-border bg-surface px-4">
          <Logo className="text-base" />
        </header>
        <BreakScreen attempt={attempt} onStartNext={() => startNext.mutate()} starting={startNext.isPending} />
      </div>
    );
  }

  const questions = openSections.flatMap((section) => (section.questions ?? []).map((q) => ({ section, question: q })));
  const answeredCount = questions.filter(({ question }) => isAnswered(question, answers[question.id])).length;
  const unanswered = questions.length - answeredCount;
  const isFinalSubmit = attempt.mode === "full" || attempt.sections.filter((s) => s.status === "locked").length === 0;
  const submitLabel = isFinalSubmit ? "Submit exam" : `Submit ${openSections[0]?.title}`;

  const timerTone = inGrace ? "bg-warning text-white dark:text-bg" : remainingMs < 60_000 ? "bg-danger text-white dark:text-bg" : remainingMs < 5 * 60_000 ? "bg-warning-soft text-warning" : "bg-subtle text-fg";
  const canFullscreen = typeof document.documentElement.requestFullscreen === "function";
  const sectionLabel = (section: LiveSection) => (attempt.mode === "modular" ? `${section.title} · ${section.order} of ${attempt.sections.length}` : section.title);

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{attempt.exam.title}</p>
            <p className="truncate text-xs text-muted">{attempt.mode === "modular" ? sectionLabel(openSections[0]) : `${answeredCount}/${questions.length} answered`}</p>
          </div>
          <SaveIndicator state={saveState} />
          {canFullscreen && !document.fullscreenElement && (
            <Button size="icon" variant="ghost" className="hidden h-9 w-9 sm:inline-flex" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)} aria-label="Full screen">
              <Maximize className="h-4 w-4" />
            </Button>
          )}
          <div className={cn("tabular flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold", timerTone)} role="timer" aria-label="Time remaining">
            <Timer className="h-4 w-4" aria-hidden />
            {inGrace ? `+${formatSeconds(graceRemainingMs / 1000)}` : formatSeconds(remainingMs / 1000)}
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-4 pb-2" aria-label="Jump to question">
          {questions.map(({ question }, index) => {
            const done = isAnswered(question, answers[question.id]);
            return (
              <a
                key={question.id}
                href={`#q-${question.id}`}
                className={cn(
                  "tabular grid h-8 min-w-8 shrink-0 place-items-center rounded-md px-1.5 text-xs font-semibold transition-colors",
                  done ? "bg-primary text-primary-fg" : "bg-subtle text-muted hover:text-fg",
                )}
                aria-label={`Question ${index + 1}${done ? ", answered" : ""}`}
              >
                {index + 1}
              </a>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {inGrace && (
          <Notice tone="warning" icon={AlertTriangle} title="Time is up — grace period">
            You can still submit for {formatSeconds(graceRemainingMs / 1000)}, but it will be marked as overtime.
          </Notice>
        )}
        {warnings > 0 && (
          <Notice tone="danger" icon={AlertTriangle}>
            Leaving the exam, copying or pasting is recorded and shown to your teacher ({plural(warnings, "event")} so far).
          </Notice>
        )}

        {openSections.map((section) => {
          const offset = questions.findIndex((q) => q.section.id === section.id);
          return (
            <section key={section.id} className="space-y-4">
              <div className="pt-2">
                <h2 className="text-lg font-bold">{section.title}</h2>
                {section.instructions && <p className="text-sm text-muted">{section.instructions}</p>}
              </div>
              {(section.questions ?? []).map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  number={offset + index + 1}
                  value={answers[question.id]}
                  onChange={(value) => setAnswer(question.id, value)}
                />
              ))}
            </section>
          );
        })}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="safe-bottom mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-3 sm:pb-3">
          <p className="tabular text-sm text-muted">
            <span className="font-semibold text-fg">{answeredCount}</span> of {questions.length} answered
          </p>
          <Button size="lg" onClick={() => setConfirmSubmit(true)} loading={submit.isPending}>
            {submitLabel}
          </Button>
        </div>
      </div>

      <Modal
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title={`${submitLabel}?`}
        description={
          isFinalSubmit
            ? "You can't change your answers after this."
            : "You can't come back to this section. You can take a break before starting the next one."
        }
        size="sm"
        locked={submit.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSubmit(false)} disabled={submit.isPending}>
              Keep working
            </Button>
            <Button onClick={() => submit.mutate("manual")} loading={submit.isPending}>
              {submitLabel}
            </Button>
          </>
        }
      >
        {unanswered > 0 ? (
          <Notice tone="warning" icon={AlertTriangle}>
            {plural(unanswered, "question")} {unanswered === 1 ? "is" : "are"} not answered yet.
          </Notice>
        ) : (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> All questions answered.
          </p>
        )}
      </Modal>
    </div>
  );
};

export default TakeExam;

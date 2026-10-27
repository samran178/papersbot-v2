import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { ErrorState, LoadingState, Notice, PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Input, Textarea } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime, formatDuration, formatMarks, plural, QUESTION_TYPE_LABEL } from "@/lib/format";
import type { GradingQuestion, IntegrityKind, TeacherAttemptDetail } from "@/lib/types";

import { TimingBadge } from "./ExamResults";
import { BackLink } from "./shared";

type Draft = { marks: string; feedback: string };

const INTEGRITY_LABEL: Record<IntegrityKind, string> = {
  tab_hidden: "Switched tab / minimised",
  window_blur: "Left the exam window",
  fullscreen_exit: "Exited full screen",
  copy: "Tried to copy",
  paste: "Tried to paste",
  context_menu: "Right-click menu",
};

const OPTION_LETTERS = "ABCDEF";

const draftsFrom = (detail: TeacherAttemptDetail): Record<number, Draft> =>
  Object.fromEntries(
    detail.question_sections.flatMap((section) =>
      section.questions.map((q) => [q.id, { marks: q.marks_awarded === null ? "" : String(q.marks_awarded), feedback: q.teacher_feedback }]),
    ),
  );

const McqAnswer = ({ question }: { question: GradingQuestion }) => (
  <ul className="space-y-1.5">
    {question.options.map((option, index) => {
      const chosen = question.selected_option === index;
      const correct = question.correct_option === index;
      return (
        <li
          key={index}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            correct ? "border-success/50 bg-success-soft/50" : chosen ? "border-danger/50 bg-danger-soft/50" : "border-border",
          )}
        >
          <span className="font-semibold">{OPTION_LETTERS[index]}.</span>
          <span className="flex-1">{option}</span>
          {chosen && <Badge tone={correct ? "success" : "danger"}>Student's answer</Badge>}
          {correct && <Check className="h-4 w-4 text-success" aria-label="Correct answer" />}
        </li>
      );
    })}
    {question.selected_option === null && <li className="text-sm italic text-muted">Not answered</li>}
  </ul>
);

const GradeAttempt = () => {
  const id = Number(useParams().id);
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["attempt", id], queryFn: () => api.get<TeacherAttemptDetail>(`/attempts/${id}`) });
  const config = useQuery({ queryKey: ["config"], queryFn: () => api.get<{ ai_enabled: boolean }>("/config"), staleTime: Infinity });
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (detail.data && !dirty) setDrafts(draftsFrom(detail.data));
  }, [detail.data, dirty]);

  const onSaved = (data: TeacherAttemptDetail) => {
    queryClient.setQueryData(["attempt", id], data);
    void queryClient.invalidateQueries({ queryKey: ["exam-results", data.exam.id] });
    void queryClient.invalidateQueries({ queryKey: ["exams"] });
  };

  const save = useMutation({
    mutationFn: () => {
      const grades = Object.entries(drafts).map(([questionId, draft]) => ({
        question_id: Number(questionId),
        marks: draft.marks === "" ? null : Number(draft.marks),
        feedback: draft.feedback,
      }));
      return api.post<TeacherAttemptDetail>(`/attempts/${id}/grade`, { grades });
    },
    onSuccess: (data) => {
      setDirty(false);
      onSaved(data);
      toast.success(data.grading_status === "graded" ? "Grades saved. The student can now see the result." : "Saved. Some answers still need marks.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const suggest = useMutation({
    mutationFn: () => api.post<TeacherAttemptDetail>(`/attempts/${id}/ai-suggest`),
    onSuccess: (data) => {
      queryClient.setQueryData(["attempt", id], data);
      toast.success("AI suggestions ready. Review them, then accept or change the marks.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const runningTotal = useMemo(() => Object.values(drafts).reduce((sum, d) => sum + (d.marks === "" ? 0 : Number(d.marks) || 0), 0), [drafts]);

  if (detail.isLoading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const attempt = detail.data;
  const editable = attempt.status === "completed";
  const ungraded = Object.values(drafts).filter((d) => d.marks === "").length;
  const hasWritten = attempt.question_sections.some((s) => s.questions.some((q) => q.type !== "mcq" && q.text_answer.trim()));

  const setDraft = (questionId: number, changes: Partial<Draft>) => {
    setDrafts((all) => ({ ...all, [questionId]: { ...all[questionId], ...changes } }));
    setDirty(true);
  };
  const acceptAllSuggestions = () => {
    attempt.question_sections.forEach((s) =>
      s.questions.forEach((q) => {
        if (q.ai_suggested_marks !== null && drafts[q.id]?.marks === "") {
          setDraft(q.id, { marks: String(q.ai_suggested_marks), feedback: drafts[q.id].feedback || q.ai_feedback });
        }
      }),
    );
  };

  return (
    <div className="pb-24">
      <PageHeader
        back={<BackLink to={`/teacher/exams/${attempt.exam.id}`} label={attempt.exam.title} />}
        title={attempt.student.full_name}
        description={`${attempt.student.roll_number || "@" + attempt.student.username} · attempt ${attempt.attempt_number} · ${attempt.mode === "modular" ? "section by section" : "full paper"}`}
        actions={
          editable &&
          config.data?.ai_enabled &&
          hasWritten && (
            <Button variant="secondary" onClick={() => suggest.mutate()} loading={suggest.isPending}>
              <Sparkles className="h-4 w-4" /> {suggest.isPending ? "Asking AI…" : "AI suggest marks"}
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="space-y-6">
          {!editable && (
            <Notice tone="primary" title="Still in progress">
              You can grade once the student submits or their time runs out.
            </Notice>
          )}
          {attempt.question_sections.map((section) => (
            <Card key={section.order}>
              <CardHeader title={section.title} description={section.status === "timed_out" ? "Time ran out on this section" : undefined} />
              <div className="divide-y divide-border">
                {section.questions.map((question, index) => {
                  const draft = drafts[question.id] ?? { marks: "", feedback: "" };
                  const invalid = draft.marks !== "" && (Number(draft.marks) < 0 || Number(draft.marks) > question.marks || Number.isNaN(Number(draft.marks)));
                  return (
                    <div key={question.id} className="space-y-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">Q{index + 1}</span>
                        <Badge>{QUESTION_TYPE_LABEL[question.type]}</Badge>
                        <Badge tone="primary">{plural(question.marks, "mark")}</Badge>
                        {question.graded_by && <span className="text-xs text-muted">graded by {question.graded_by}</span>}
                      </div>
                      <p className="whitespace-pre-wrap">{question.text}</p>

                      {question.type === "mcq" ? (
                        <McqAnswer question={question} />
                      ) : (
                        <>
                          <div className="rounded-lg bg-subtle p-3">
                            <p className="mb-1 text-xs font-medium text-muted">Student's answer</p>
                            {question.text_answer.trim() ? (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">{question.text_answer}</p>
                            ) : (
                              <p className="text-sm italic text-muted">Not answered (scored 0 automatically)</p>
                            )}
                          </div>
                          {question.marking_guidelines && (
                            <p className="text-sm text-muted">
                              <span className="font-medium text-fg">Guidelines:</span> {question.marking_guidelines}
                            </p>
                          )}
                          {question.ai_suggested_marks !== null && (
                            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary-soft/40 p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-medium text-primary">
                                  <Sparkles className="mr-1 inline h-4 w-4" /> AI suggests {formatMarks(question.ai_suggested_marks)} / {question.marks}
                                </p>
                                <p className="mt-0.5 text-fg/80">{question.ai_feedback}</p>
                              </div>
                              {editable && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setDraft(question.id, { marks: String(question.ai_suggested_marks), feedback: draft.feedback || question.ai_feedback })}
                                >
                                  Use
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                        <label className="space-y-1">
                          <span className="block text-xs font-medium text-muted">Marks (out of {question.marks})</span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={question.marks}
                            step={0.5}
                            value={draft.marks}
                            onChange={(e) => setDraft(question.id, { marks: e.target.value })}
                            disabled={!editable}
                            className={cn(invalid && "border-danger")}
                            placeholder="—"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="block text-xs font-medium text-muted">Feedback to student (optional)</span>
                          <Textarea
                            value={draft.feedback}
                            onChange={(e) => setDraft(question.id, { feedback: e.target.value })}
                            rows={1}
                            className="min-h-[40px]"
                            disabled={!editable}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          <Card className="p-5">
            <p className="text-sm text-muted">Score</p>
            <p className="tabular mt-1 text-3xl font-bold">
              {formatMarks(runningTotal)} <span className="text-lg font-medium text-muted">/ {formatMarks(attempt.max_score)}</span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {attempt.max_score ? `${Math.round((runningTotal / attempt.max_score) * 1000) / 10}%` : "—"} · pass mark {attempt.pass_percentage}%
            </p>
            <p className={cn("mt-3 flex items-center gap-1.5 text-sm", ungraded ? "text-warning" : "text-success")}>
              {ungraded ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {ungraded ? `${ungraded} answer${ungraded === 1 ? "" : "s"} still need marks` : "Fully graded"}
            </p>
            {editable && config.data?.ai_enabled && attempt.question_sections.some((s) => s.questions.some((q) => q.ai_suggested_marks !== null)) && ungraded > 0 && (
              <Button size="sm" variant="ghost" className="mt-2 px-0 text-primary" onClick={acceptAllSuggestions}>
                Fill blanks with AI suggestions
              </Button>
            )}
          </Card>

          <Card className="space-y-3 p-5 text-sm">
            <h2 className="font-semibold">Timing</h2>
            <TimingBadge attempt={attempt} />
            <dl className="space-y-1.5 text-muted">
              <div className="flex justify-between gap-2">
                <dt>Started</dt>
                <dd className="text-right text-fg">{formatDateTime(attempt.started_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Finished</dt>
                <dd className="text-right text-fg">{formatDateTime(attempt.completed_at)}</dd>
              </div>
              {attempt.duration_seconds !== null && (
                <div className="flex justify-between gap-2">
                  <dt>Elapsed</dt>
                  <dd className="text-right text-fg">{formatDuration(attempt.duration_seconds)}</dd>
                </div>
              )}
            </dl>
            {attempt.mode === "modular" && (
              <ul className="space-y-1 border-t border-border pt-3">
                {attempt.sections.map((s) => (
                  <li key={s.order} className="flex justify-between gap-2">
                    <span>{s.title}</span>
                    <span className={cn("text-right", s.status === "timed_out" ? "text-danger" : s.overtime_seconds ? "text-warning" : "text-muted")}>
                      {s.status === "locked" ? "Not started" : s.status === "timed_out" ? "Timed out" : s.overtime_seconds ? `+${formatDuration(s.overtime_seconds)}` : s.status === "submitted" ? "On time" : "In progress"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3 p-5 text-sm">
            <h2 className="font-semibold">Integrity signals</h2>
            {attempt.integrity.total === 0 ? (
              <p className="flex items-center gap-1.5 text-success">
                <Check className="h-4 w-4" /> None recorded
              </p>
            ) : (
              <>
                <ul className="space-y-1">
                  {(Object.entries(attempt.integrity.by_kind) as [IntegrityKind, number][])
                    .filter(([, count]) => count > 0)
                    .map(([kind, count]) => (
                      <li key={kind} className="flex justify-between gap-2">
                        <span>{INTEGRITY_LABEL[kind]}</span>
                        <span className="tabular font-semibold text-danger">{count}×</span>
                      </li>
                    ))}
                </ul>
                <p className="text-xs text-muted">Signals from the student's browser. They suggest, not prove, that something happened.</p>
              </>
            )}
          </Card>
        </div>
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur lg:left-64">
          <div className="safe-bottom mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6 sm:pb-3">
            <p className="text-sm text-muted">{dirty ? "Unsaved changes" : "All changes saved"}</p>
            <div className="flex gap-2">
              {dirty && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDirty(false);
                    setDrafts(draftsFrom(attempt));
                  }}
                >
                  <X className="h-4 w-4" /> Discard
                </Button>
              )}
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
                Save grades
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradeAttempt;

import { useQuery } from "@tanstack/react-query";
import { Check, Clock, Hourglass, Trophy, X } from "lucide-react";
import { useParams } from "react-router-dom";

import { ErrorState, LoadingState, Notice, PageHeader } from "@/components/ui/feedback";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatDuration, formatMarks, plural, QUESTION_TYPE_LABEL } from "@/lib/format";
import type { AttemptResult, ResultQuestion } from "@/lib/types";

import { BackLink } from "../teacher/shared";

const OPTION_LETTERS = "ABCDEF";

const McqReview = ({ question, revealed }: { question: ResultQuestion; revealed: boolean }) => (
  <ul className="mt-3 space-y-1.5">
    {question.options?.map((option, displayIndex) => {
      const chosen = question.selected_option === option.index;
      const correct = revealed && question.correct_option === option.index;
      return (
        <li
          key={option.index}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
            correct ? "border-success/50 bg-success-soft/50" : chosen && revealed ? "border-danger/50 bg-danger-soft/50" : chosen ? "border-primary/50 bg-primary-soft/40" : "border-border",
          )}
        >
          <span className="font-semibold">{OPTION_LETTERS[displayIndex]}.</span>
          <span className="flex-1">{option.text}</span>
          {chosen && <Badge tone="primary">Your answer</Badge>}
          {correct && <Check className="h-4 w-4 text-success" aria-label="Correct answer" />}
        </li>
      );
    })}
    {question.selected_option === null && <li className="text-sm italic text-muted">Not answered</li>}
  </ul>
);

const AttemptResultPage = () => {
  const id = Number(useParams().id);
  const result = useQuery({ queryKey: ["attempt-result", id], queryFn: () => api.get<AttemptResult>(`/attempts/${id}`) });

  if (result.isLoading) return <LoadingState />;
  if (result.error || !result.data) return <ErrorState error={result.error} onRetry={() => result.refetch()} />;
  const r = result.data;
  const graded = r.grading_status === "graded" && r.score !== null;
  const elapsed = r.completed_at ? (Date.parse(r.completed_at) - Date.parse(r.started_at)) / 1000 : null;

  return (
    <>
      <PageHeader back={<BackLink to={`/student/exams/${r.exam.id}`} label={r.exam.title} />} title="Your result" description={`${r.exam.classroom_name} · attempt ${r.attempt_number}`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-6 lg:order-2">
          <Card className="p-6 text-center">
            {graded ? (
              <>
                <div className={cn("mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full", r.passed ? "bg-success-soft" : "bg-danger-soft")}>
                  {r.passed ? <Trophy className="h-7 w-7 text-success" /> : <X className="h-7 w-7 text-danger" />}
                </div>
                <p className="tabular text-4xl font-bold">{r.percentage}%</p>
                <p className="tabular mt-1 text-muted">
                  {formatMarks(r.score)} / {formatMarks(r.max_score)} marks
                </p>
                <Badge tone={r.passed ? "success" : "danger"} className="mt-3 text-sm">
                  {r.passed ? "Passed" : "Not passed"} · pass mark {r.pass_percentage}%
                </Badge>
              </>
            ) : (
              <>
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-warning-soft">
                  <Hourglass className="h-7 w-7 text-warning" />
                </div>
                <p className="text-lg font-semibold">Submitted — awaiting grading</p>
                <p className="mt-1 text-sm text-muted">Your teacher is marking the written answers. Your score appears here when they finish.</p>
              </>
            )}
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Clock className="h-4 w-4 text-muted" /> Timing
            </p>
            <p className="text-muted">Started {formatDateTime(r.started_at)}</p>
            <p className="text-muted">Finished {formatDateTime(r.completed_at)}</p>
            {elapsed !== null && <p className="text-muted">Elapsed {formatDuration(elapsed)}</p>}
            {r.timed_out ? <Badge tone="danger">Submitted automatically when time ran out</Badge> : r.is_overtime ? <Badge tone="warning">Submitted {formatDuration(r.overtime_seconds)} late</Badge> : <Badge tone="success">Submitted within time</Badge>}
          </Card>
        </div>

        <div className="space-y-6 lg:order-1">
          {!r.answers_revealed && (
            <Notice tone="primary">Correct MCQ answers are shown after the paper closes on {formatDateTime(r.exam.available_until)}, so classmates can't share them.</Notice>
          )}
          {r.sections.map((section) => (
            <Card key={section.id}>
              <CardHeader title={section.title} description={section.status === "timed_out" ? "Time ran out on this section" : undefined} />
              <div className="divide-y divide-border">
                {section.questions.map((question, index) => (
                  <div key={question.id} className="p-4 sm:p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">Q{index + 1}</span>
                      <Badge>{QUESTION_TYPE_LABEL[question.type]}</Badge>
                      <span className="tabular ml-auto text-sm font-medium">
                        {graded ? `${formatMarks(question.marks_awarded)} / ${question.marks}` : plural(question.marks, "mark")}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{question.text}</p>
                    {question.type === "mcq" ? (
                      <McqReview question={question} revealed={r.answers_revealed} />
                    ) : (
                      <div className="mt-3 rounded-lg bg-subtle p-3 text-sm">
                        {question.text_answer.trim() ? <p className="whitespace-pre-wrap leading-relaxed">{question.text_answer}</p> : <p className="italic text-muted">Not answered</p>}
                      </div>
                    )}
                    {question.feedback && (
                      <p className="mt-3 rounded-lg border border-primary/25 bg-primary-soft/40 p-3 text-sm">
                        <span className="font-medium">Teacher's feedback:</span> {question.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
};

export default AttemptResultPage;

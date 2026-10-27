import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, Layers } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, Card, type BadgeTone } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatMinutes, minutesUntil, plural, relative } from "@/lib/format";
import type { StudentExamCard, StudentExamState } from "@/lib/types";

export const useStudentExams = () =>
  useQuery({ queryKey: ["student-exams"], queryFn: () => api.get<StudentExamCard[]>("/student/exams"), refetchInterval: 60_000 });

const STATE_BADGE: Record<StudentExamState, { label: string; tone: BadgeTone }> = {
  in_progress: { label: "In progress", tone: "primary" },
  available: { label: "Open", tone: "success" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  completed: { label: "Done", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
};

export const DeadlineText = ({ exam }: { exam: StudentExamCard }) => {
  if (exam.state === "upcoming" && exam.opens_at) return <span>Opens {relative(exam.opens_at)}</span>;
  const minutes = minutesUntil(exam.available_until);
  if (minutes <= 0) return <span>Closed {formatDateTime(exam.available_until)}</span>;
  const urgent = minutes < 6 * 60;
  const soon = minutes < 24 * 60;
  return (
    <span className={cn(urgent ? "font-semibold text-danger" : soon ? "font-medium text-warning" : undefined)}>
      Closes {relative(exam.available_until)}
    </span>
  );
};

export const ExamCard = ({ exam }: { exam: StudentExamCard }) => {
  const latest = exam.attempts.at(-1);
  const graded = latest?.status === "completed" && latest.grading_status === "graded";
  return (
    <Link to={exam.state === "in_progress" && exam.active_attempt_id ? `/student/attempts/${exam.active_attempt_id}` : `/student/exams/${exam.id}`} className="group block min-w-0">
      <Card className="h-full p-4 transition-shadow group-hover:shadow-md sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold group-hover:text-primary">{exam.title}</p>
            <p className="truncate text-sm text-muted">
              {exam.classroom.name} · {exam.teacher_name}
            </p>
          </div>
          <Badge tone={STATE_BADGE[exam.state].tone}>{STATE_BADGE[exam.state].label}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden /> {formatMinutes(exam.total_minutes)}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" aria-hidden /> {plural(exam.sections.length, "section")} · {exam.total_marks} marks
          </span>
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> <DeadlineText exam={exam} />
          </span>
        </div>
        {latest?.status === "completed" && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-subtle px-3 py-2 text-sm">
            <span className="text-muted">{exam.attempts.length > 1 ? `Attempt ${latest.attempt_number}` : "Your result"}</span>
            {graded ? (
              <span className={cn("tabular font-semibold", latest.passed ? "text-success" : "text-danger")}>
                {latest.percentage}% · {latest.passed ? "Pass" : "Fail"}
              </span>
            ) : (
              <span className="font-medium text-warning">Awaiting grading</span>
            )}
          </div>
        )}
        {exam.state === "in_progress" && <p className="mt-3 text-sm font-medium text-primary">Resume →</p>}
      </Card>
    </Link>
  );
};

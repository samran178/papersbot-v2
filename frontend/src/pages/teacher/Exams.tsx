import { ClipboardList, Clock, FileText, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, Select } from "@/components/ui/primitives";
import { cn, formatDateTime, formatMinutes, plural } from "@/lib/format";
import type { ExamListItem, ExamStatus } from "@/lib/types";

import { ExamStatusBadge, useClasses, useTeacherExams } from "./shared";

export const ExamRow = ({ exam }: { exam: ExamListItem }) => (
  <Link to={`/teacher/exams/${exam.id}`} className="block px-4 py-4 transition-colors hover:bg-subtle sm:px-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium">{exam.title}</p>
        <p className="text-sm text-muted">{exam.classroom.name}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {exam.pending_grading_count > 0 && <Badge tone="warning">{exam.pending_grading_count} to grade</Badge>}
        <ExamStatusBadge status={exam.status} />
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1">
        <FileText className="h-3.5 w-3.5" aria-hidden />
        {plural(exam.question_count, "question")} · {exam.total_marks} marks
      </span>
      <span className="flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        {formatMinutes(exam.total_minutes)} · {plural(exam.section_count, "section")}
      </span>
      <span>{plural(exam.attempt_count, "attempt")}</span>
      {exam.available_until && <span>Closes {formatDateTime(exam.available_until)}</span>}
    </div>
  </Link>
);

const FILTERS: { value: ExamStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "open", label: "Open" },
  { value: "scheduled", label: "Scheduled" },
  { value: "closed", label: "Closed" },
];

const Exams = () => {
  const navigate = useNavigate();
  const classes = useClasses();
  const [classroomId, setClassroomId] = useState<number | undefined>();
  const [filter, setFilter] = useState<ExamStatus | "all">("all");
  const exams = useTeacherExams(classroomId);
  const shown = (exams.data ?? []).filter((exam) => filter === "all" || exam.status === filter);
  const hasClasses = (classes.data ?? []).some((c) => !c.is_archived);

  return (
    <>
      <PageHeader
        title="Exams"
        description="Create papers, publish them to a class, and grade the results."
        actions={
          <Button onClick={() => navigate("/teacher/exams/new")} disabled={!hasClasses}>
            <Plus className="h-4 w-4" /> New exam
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                filter === value ? "bg-primary text-primary-fg" : "text-muted hover:bg-subtle hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Select
          className="sm:w-64"
          value={classroomId ?? ""}
          onChange={(e) => setClassroomId(e.target.value ? Number(e.target.value) : undefined)}
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {exams.isLoading ? (
        <LoadingState />
      ) : exams.error ? (
        <ErrorState error={exams.error} onRetry={() => exams.refetch()} />
      ) : !hasClasses && !exams.data?.length ? (
        <EmptyState
          icon={ClipboardList}
          title="Create a class first"
          description="Every exam is published to a class, so you need at least one."
          action={<Button onClick={() => navigate("/teacher/classes")}>Go to classes</Button>}
        />
      ) : shown.length ? (
        <Card>
          <div className="divide-y divide-border">
            {shown.map((exam) => (
              <ExamRow key={exam.id} exam={exam} />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={filter === "all" ? "No exams yet" : "Nothing here"}
          action={filter === "all" && <Button onClick={() => navigate("/teacher/exams/new")}>Create an exam</Button>}
        />
      )}
    </>
  );
};

export default Exams;

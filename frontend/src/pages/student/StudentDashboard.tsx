import { useQuery } from "@tanstack/react-query";
import { ClipboardList, GraduationCap } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/feedback";
import { Button } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import type { StudentClassroom, StudentExamCard, StudentExamState } from "@/lib/types";

import { ExamCard, useStudentExams } from "./shared";

const GROUPS: { state: StudentExamState; title: string; description?: string }[] = [
  { state: "in_progress", title: "Continue where you left off", description: "Your timer is running on the server for the active section." },
  { state: "available", title: "Open now" },
  { state: "upcoming", title: "Coming up" },
  { state: "completed", title: "Done" },
  { state: "missed", title: "Missed", description: "These closed before you attempted them." },
];

const StudentDashboard = () => {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const exams = useStudentExams();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api.get<StudentClassroom[]>("/classes/") });
  const [classFilter, setClassFilter] = useState<number | null>(null);

  if (exams.isLoading || classes.isLoading) return <LoadingState />;
  if (exams.error) return <ErrorState error={exams.error} onRetry={() => exams.refetch()} />;

  const all = (exams.data ?? []).filter((e) => classFilter === null || e.classroom.id === classFilter);
  const byState = (state: StudentExamState): StudentExamCard[] => all.filter((e) => e.state === state);

  return (
    <>
      <PageHeader title={`Hi, ${me?.full_name.split(" ")[0] ?? ""}`} description="Your papers from every class you've joined." />

      {!classes.data?.length ? (
        <EmptyState
          icon={GraduationCap}
          title="Join your first class"
          description="Ask your teacher for the class join code. Papers they publish will appear here."
          action={<Button onClick={() => navigate("/student/classes")}>Join a class</Button>}
        />
      ) : (
        <>
          {classes.data.length > 1 && (
            <div className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter by class">
              {[{ id: null, name: "All classes" }, ...classes.data].map((c) => (
                <button
                  key={c.id ?? "all"}
                  type="button"
                  role="tab"
                  aria-selected={classFilter === c.id}
                  onClick={() => setClassFilter(c.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    classFilter === c.id ? "bg-primary text-primary-fg" : "text-muted hover:bg-subtle hover:text-fg",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {all.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No papers yet" description="When your teachers publish a paper, it shows up here." />
          ) : (
            <div className="space-y-8">
              {GROUPS.map(({ state, title, description }) => {
                const items = byState(state);
                if (!items.length) return null;
                return (
                  <section key={state}>
                    <h2 className="text-lg font-semibold">{title}</h2>
                    {description && <p className="text-sm text-muted">{description}</p>}
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((exam) => (
                        <ExamCard key={exam.id} exam={exam} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
};

export default StudentDashboard;

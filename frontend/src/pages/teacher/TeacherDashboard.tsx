import { CheckSquare, ClipboardList, GraduationCap, PenLine, Plus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState, PageHeader, Stat } from "@/components/ui/feedback";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useAuth";

import { CreateClassModal } from "./Classes";
import { ExamRow } from "./Exams";
import { useClasses, useTeacherExams } from "./shared";

const TeacherDashboard = () => {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const classes = useClasses();
  const exams = useTeacherExams();
  const [creatingClass, setCreatingClass] = useState(false);

  if (classes.isLoading || exams.isLoading) return <LoadingState />;
  if (classes.error || exams.error) return <ErrorState error={classes.error ?? exams.error} onRetry={() => { void classes.refetch(); void exams.refetch(); }} />;

  const activeClasses = (classes.data ?? []).filter((c) => !c.is_archived);
  const allExams = exams.data ?? [];
  const toGrade = allExams.filter((e) => e.pending_grading_count > 0);
  const open = allExams.filter((e) => e.status === "open");
  const drafts = allExams.filter((e) => e.status === "draft");
  const students = activeClasses.reduce((sum, c) => sum + c.student_count, 0);

  return (
    <>
      <PageHeader
        title={`Assalam-o-Alaikum, ${me?.full_name.split(" ")[0] ?? ""}`}
        description="Here's what needs your attention."
        actions={
          activeClasses.length > 0 && (
            <Button onClick={() => navigate("/teacher/exams/new")}>
              <Plus className="h-4 w-4" /> New exam
            </Button>
          )
        }
      />

      {activeClasses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Start by creating a class"
          description="A class groups your students. You publish exams to it, and students join with a code."
          action={<Button onClick={() => setCreatingClass(true)}>Create a class</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="To grade" value={toGrade.reduce((sum, e) => sum + e.pending_grading_count, 0)} icon={PenLine} tone={toGrade.length ? "warning" : "neutral"} />
            <Stat label="Open exams" value={open.length} icon={CheckSquare} tone="success" />
            <Stat label="Classes" value={activeClasses.length} icon={GraduationCap} tone="primary" />
            <Stat label="Students" value={students} icon={Users} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Needs grading" description="Attempts with written answers waiting for marks." />
              {toGrade.length ? (
                <div className="divide-y divide-border">{toGrade.map((exam) => <ExamRow key={exam.id} exam={exam} />)}</div>
              ) : (
                <EmptyState icon={CheckSquare} title="All caught up" className="m-4 border-0" />
              )}
            </Card>
            <Card>
              <CardHeader
                title="Open now"
                action={
                  <Link to="/teacher/exams" className="text-sm font-medium text-primary hover:underline">
                    All exams
                  </Link>
                }
              />
              {open.length ? (
                <div className="divide-y divide-border">{open.map((exam) => <ExamRow key={exam.id} exam={exam} />)}</div>
              ) : (
                <EmptyState icon={ClipboardList} title="No open exams" className="m-4 border-0" />
              )}
            </Card>
          </div>

          {drafts.length > 0 && (
            <Card className="mt-6">
              <CardHeader title="Drafts" description="Not visible to students until you publish." />
              <div className="divide-y divide-border">{drafts.map((exam) => <ExamRow key={exam.id} exam={exam} />)}</div>
            </Card>
          )}
        </>
      )}
      <CreateClassModal open={creatingClass} onOpenChange={setCreatingClass} />
    </>
  );
};

export default TeacherDashboard;

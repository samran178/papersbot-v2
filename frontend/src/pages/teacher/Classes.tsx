import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, GraduationCap, Plus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { copyText } from "@/hooks/useCopy";
import { api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/format";
import type { Classroom } from "@/lib/types";

import { useClasses } from "./shared";

export const CreateClassModal = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", course_code: "", description: "" });
  const create = useMutation({
    mutationFn: () => api.post<Classroom>("/classes/", form),
    onSuccess: (classroom) => {
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success("Class created. Share the join code with your students.");
      onOpenChange(false);
      setForm({ name: "", course_code: "", description: "" });
      navigate(`/teacher/classes/${classroom.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New class" description="Students join with a code you share." locked={create.isPending}>
      <form id="create-class" onSubmit={submit} className="space-y-4">
        <Field label="Class name">
          {(id) => (
            <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. BSSE 8th A — Compiler Construction" required autoFocus />
          )}
        </Field>
        <Field label="Course code (optional)">
          {(id) => <Input id={id} value={form.course_code} onChange={(e) => setForm({ ...form, course_code: e.target.value })} placeholder="e.g. SE-401" />}
        </Field>
        <Field label="Description (optional)">
          {(id) => <Textarea id={id} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />}
        </Field>
      </form>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="create-class" loading={create.isPending}>
          Create class
        </Button>
      </div>
    </Modal>
  );
};

const ClassCard = ({ classroom }: { classroom: Classroom }) => (
  <Card className="flex flex-col p-4 transition-shadow hover:shadow-md sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Link to={`/teacher/classes/${classroom.id}`} className="font-semibold hover:text-primary hover:underline">
          {classroom.name}
        </Link>
        {classroom.course_code && <p className="text-sm text-muted">{classroom.course_code}</p>}
      </div>
      {classroom.is_archived ? <Badge>Archived</Badge> : !classroom.is_joining_open && <Badge tone="warning">Joining closed</Badge>}
    </div>
    <div className="mt-4 flex items-center gap-4 text-sm text-muted">
      <span className="flex items-center gap-1.5">
        <Users className="h-4 w-4" aria-hidden /> {plural(classroom.student_count, "student")}
      </span>
      <span>{plural(classroom.exam_count, "exam")}</span>
    </div>
    <div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2">
      <span className="text-xs text-muted">Join code</span>
      <button
        type="button"
        onClick={() => copyText(classroom.join_code, "Join code copied")}
        className="flex items-center gap-2 font-mono text-sm font-semibold tracking-widest hover:text-primary"
        aria-label={`Copy join code ${classroom.join_code}`}
      >
        {classroom.join_code} <Copy className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  </Card>
);

const Classes = () => {
  const classes = useClasses();
  const [creating, setCreating] = useState(false);
  const active = classes.data?.filter((c) => !c.is_archived) ?? [];
  const archived = classes.data?.filter((c) => c.is_archived) ?? [];

  return (
    <>
      <PageHeader
        title="Classes"
        description="Exams are published to a class. Students join with its code."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New class
          </Button>
        }
      />
      {classes.isLoading ? (
        <LoadingState />
      ) : classes.error ? (
        <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
      ) : !classes.data?.length ? (
        <EmptyState
          icon={GraduationCap}
          title="No classes yet"
          description="Create a class for each course section you teach, then share its join code."
          action={<Button onClick={() => setCreating(true)}>Create your first class</Button>}
        />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((classroom) => (
              <ClassCard key={classroom.id} classroom={classroom} />
            ))}
          </div>
          {archived.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-muted">Archived</h2>
              <div className="grid gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                {archived.map((classroom) => (
                  <ClassCard key={classroom.id} classroom={classroom} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <CreateClassModal open={creating} onOpenChange={setCreating} />
    </>
  );
};

export default Classes;

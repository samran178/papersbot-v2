import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/feedback";
import { Button, Card, Input } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api";
import type { StudentClassroom } from "@/lib/types";

const StudentClasses = () => {
  const queryClient = useQueryClient();
  const classes = useQuery({ queryKey: ["classes"], queryFn: () => api.get<StudentClassroom[]>("/classes/") });
  const [code, setCode] = useState("");
  const join = useMutation({
    mutationFn: () => api.post<StudentClassroom>("/classes/join", { join_code: code }),
    onSuccess: (classroom) => {
      toast.success(`You joined ${classroom.name}`);
      setCode("");
      void queryClient.invalidateQueries({ queryKey: ["classes"] });
      void queryClient.invalidateQueries({ queryKey: ["student-exams"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim()) join.mutate();
  };

  return (
    <>
      <PageHeader title="My classes" description="Join a class with the code your teacher gives you." />

      <Card className="mb-6 p-4 sm:p-5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1.5">
            <span className="block text-sm font-medium">Join a class</span>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7MX9QP"
              className="font-mono text-lg uppercase tracking-[0.2em]"
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Class join code"
            />
          </label>
          <Button type="submit" size="lg" loading={join.isPending} disabled={!code.trim()}>
            <LogIn className="h-4 w-4" /> Join
          </Button>
        </form>
      </Card>

      {classes.isLoading ? (
        <LoadingState />
      ) : classes.error ? (
        <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
      ) : classes.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.data.map((c) => (
            <Card key={c.id} className="p-4 sm:p-5">
              <p className="font-semibold">{c.name}</p>
              {c.course_code && <p className="text-sm text-muted">{c.course_code}</p>}
              <p className="mt-2 text-sm text-muted">Teacher: {c.teacher_name}</p>
              {c.description && <p className="mt-2 line-clamp-3 text-sm">{c.description}</p>}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="You haven't joined any classes" />
      )}
    </>
  );
};

export default StudentClasses;

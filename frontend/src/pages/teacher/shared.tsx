import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, type BadgeTone } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { Classroom, ExamListItem, ExamStatus } from "@/lib/types";

const STATUS: Record<ExamStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "primary" },
  open: { label: "Open", tone: "success" },
  closed: { label: "Closed", tone: "warning" },
};

export const ExamStatusBadge = ({ status }: { status: ExamStatus }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;

export const BackLink = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
    <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
  </Link>
);

export const useClasses = () => useQuery({ queryKey: ["classes"], queryFn: () => api.get<Classroom[]>("/classes/") });

export const useTeacherExams = (classroomId?: number) =>
  useQuery({
    queryKey: ["exams", { classroomId }],
    queryFn: () => api.get<ExamListItem[]>(classroomId ? `/exams/?classroom=${classroomId}` : "/exams/"),
  });

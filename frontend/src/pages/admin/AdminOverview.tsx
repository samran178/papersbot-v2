import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardList, GraduationCap, Hourglass, UserCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState, PageHeader, Stat } from "@/components/ui/feedback";
import { Card, CardHeader } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { AdminStats, AdminUser, Paginated } from "@/lib/types";

import { TeacherRequestRow } from "./TeacherRequests";

const AdminOverview = () => {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<AdminStats>("/admin/stats") });
  const pending = useQuery({
    queryKey: ["admin", "users", "pending-teachers"],
    queryFn: () => api.get<Paginated<AdminUser>>("/admin/users?role=teacher&approval_status=pending&page_size=50"),
  });

  return (
    <>
      <PageHeader title="Admin overview" description="Approve teachers and keep an eye on the whole system." />

      {stats.isLoading ? (
        <LoadingState />
      ) : stats.error ? (
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        stats.data && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <Stat label="Pending teachers" value={stats.data.pending_teachers} icon={Hourglass} tone={stats.data.pending_teachers ? "warning" : "neutral"} />
            <Stat label="Approved teachers" value={stats.data.teachers} icon={BookOpen} tone="primary" />
            <Stat label="Students" value={stats.data.students} icon={GraduationCap} tone="primary" />
            <Stat label="Classes" value={stats.data.classes} icon={Users} />
            <Stat label="Exams" value={stats.data.exams} hint={`${stats.data.published_exams} published`} icon={ClipboardList} />
            <Stat label="Attempts" value={stats.data.attempts} hint={`${stats.data.attempts_in_progress} in progress now`} icon={UserCheck} />
          </div>
        )
      )}

      <Card className="mt-6">
        <CardHeader
          title="Teacher requests"
          description="Teachers can't create classes or exams until you approve them."
          action={
            <Link to="/admin/users?role=teacher" className="text-sm font-medium text-primary hover:underline">
              All teachers
            </Link>
          }
        />
        {pending.isLoading ? (
          <LoadingState />
        ) : pending.error ? (
          <div className="p-4">
            <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
          </div>
        ) : pending.data?.results.length ? (
          <ul className="divide-y divide-border">
            {pending.data.results.map((user) => (
              <TeacherRequestRow key={user.id} user={user} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={UserCheck} title="No pending requests" description="New teacher sign-ups will appear here." className="m-4 border-0" />
        )}
      </Card>
    </>
  );
};

export default AdminOverview;

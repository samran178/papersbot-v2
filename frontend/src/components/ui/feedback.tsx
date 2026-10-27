import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";

import { Button, Card, Spinner } from "./primitives";

export const PageHeader = ({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) => (
  <div className="mb-6 space-y-2">
    {back}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  </div>
);

export const LoadingState = ({ label = "Loading…", className }: { label?: string; className?: string }) => (
  <div className={cn("flex items-center justify-center gap-3 py-16 text-sm text-muted", className)}>
    <Spinner />
    {label}
  </div>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
    <AlertTriangle className="h-8 w-8 text-warning" aria-hidden />
    <p className="font-medium">{errorMessage(error)}</p>
    {onRetry && (
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    )}
  </Card>
);

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center", className)}>
    <div className="mb-1 rounded-full bg-subtle p-3">
      <Icon className="h-6 w-6 text-muted" aria-hidden />
    </div>
    <p className="font-semibold">{title}</p>
    {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export const Stat = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
}) => {
  const tones = {
    neutral: "bg-subtle text-muted",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {Icon && (
          <span className={cn("rounded-lg p-1.5", tones[tone])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="tabular mt-2 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
};

export const Notice = ({
  tone = "primary",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: "primary" | "warning" | "danger" | "success";
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) => {
  const tones = {
    primary: "border-primary/25 bg-primary-soft/60 text-fg",
    warning: "border-warning/30 bg-warning-soft/70 text-fg",
    danger: "border-danger/30 bg-danger-soft/70 text-fg",
    success: "border-success/30 bg-success-soft/70 text-fg",
  };
  const iconTones = { primary: "text-primary", warning: "text-warning", danger: "text-danger", success: "text-success" };
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", tones[tone], className)}>
      {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconTones[tone])} aria-hidden />}
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg/80">{children}</div>}
      </div>
    </div>
  );
};

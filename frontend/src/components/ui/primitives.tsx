import { Loader2 } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/format";

const BUTTON_VARIANTS = {
  primary: "bg-primary text-primary-fg hover:bg-primary/90 shadow-sm",
  secondary: "border border-border bg-surface text-fg hover:bg-subtle",
  ghost: "text-fg hover:bg-subtle",
  danger: "bg-danger text-white hover:bg-danger/90 shadow-sm dark:text-bg",
  "danger-outline": "border border-danger/40 text-danger hover:bg-danger-soft",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 gap-1.5 rounded-md px-3 text-sm",
  md: "h-10 gap-2 rounded-lg px-4 text-sm",
  lg: "min-h-12 gap-2 rounded-lg px-5 py-2 text-base",
  icon: "h-10 w-10 rounded-lg",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, className, children, disabled, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-medium transition-[background-color,transform,opacity] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

const FIELD_BASE =
  "w-full rounded-lg border border-border bg-surface px-3 text-fg placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(FIELD_BASE, "h-10 text-base sm:text-sm", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(FIELD_BASE, "min-h-[96px] py-2 text-base leading-relaxed sm:text-sm", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(FIELD_BASE, "h-10 pr-8 text-base sm:text-sm", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (id: string) => ReactNode;
};

/** Label + control + hint/error, with the ids wired up for screen readers. */
export const Field = ({ label, hint, error, className, children }: FieldProps) => {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
};

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

export const Toggle = ({ checked, onChange, label, description, disabled }: ToggleProps) => (
  <label className={cn("flex cursor-pointer items-start justify-between gap-4 py-1", disabled && "cursor-not-allowed opacity-60")}>
    <span className="min-w-0">
      <span className="block text-sm font-medium">{label}</span>
      {description && <span className="block text-xs text-muted">{description}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  </label>
);

const BADGE_TONES = {
  neutral: "bg-subtle text-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export const Badge = ({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) => (
  <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", BADGE_TONES[tone], className)}>
    {children}
  </span>
);

export const Card = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-w-0 rounded-xl border border-border bg-surface shadow-card", className)} {...props}>
    {children}
  </div>
);

export const CardHeader = ({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
    <div className="min-w-0">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
    </div>
    {action}
  </div>
);

export const Spinner = ({ className }: { className?: string }) => (
  <Loader2 className={cn("h-5 w-5 animate-spin text-muted", className)} aria-label="Loading" />
);

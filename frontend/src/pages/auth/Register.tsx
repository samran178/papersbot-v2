import { BookOpen, GraduationCap, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Notice } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/primitives";
import { homePathFor, useAuthActions, type RegisterInput } from "@/hooks/useAuth";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/format";

import { AuthLayout } from "./AuthLayout";

const ROLES: { value: RegisterInput["role"]; label: string; description: string; icon: LucideIcon }[] = [
  { value: "student", label: "Student", description: "Join classes and attempt papers", icon: GraduationCap },
  { value: "teacher", label: "Teacher", description: "Needs admin approval first", icon: BookOpen },
];

const fieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiError) || !error.data || typeof error.data !== "object" || !("errors" in error.data)) return {};
  const errors = (error.data as { errors: Record<string, unknown> }).errors;
  return Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [key, Array.isArray(value) ? String(value[0]) : String(value)]),
  );
};

const Register = () => {
  const { register } = useAuthActions();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterInput>({
    username: "",
    email: "",
    full_name: "",
    password: "",
    role: "student",
    roll_number: "",
    department: "",
  });
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const set = <K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const errors = fieldErrors(register.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    register.mutate(form, { onSuccess: ({ user }) => user && navigate(homePathFor(user), { replace: true }) });
  };

  return (
    <AuthLayout title="Create your account" subtitle="Students can start right away. Teacher accounts are activated by the admin.">
      <form onSubmit={submit} className="space-y-4">
        {register.error && !Object.keys(errors).length && <Notice tone="danger">{errorMessage(register.error)}</Notice>}

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => set("role", value)}
                aria-pressed={form.role === value}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  form.role === value ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "border-border hover:bg-subtle",
                )}
              >
                <Icon className={cn("mb-2 h-5 w-5", form.role === value ? "text-primary" : "text-muted")} aria-hidden />
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Full name" error={errors.full_name}>
          {(id) => <Input id={id} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} autoComplete="name" required />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" error={errors.username}>
            {(id) => <Input id={id} value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="username" required />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" required />}
          </Field>
        </div>
        {form.role === "student" ? (
          <Field label="Roll number (optional)" error={errors.roll_number}>
            {(id) => <Input id={id} value={form.roll_number} onChange={(e) => set("roll_number", e.target.value)} placeholder="e.g. 22011556-045" />}
          </Field>
        ) : (
          <Field label="Department" error={errors.department} hint="Helps the admin verify you.">
            {(id) => <Input id={id} value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Software Engineering" required />}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" error={errors.password} hint="At least 8 characters, not just numbers.">
            {(id) => (
              <Input id={id} type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" required />
            )}
          </Field>
          <Field label="Confirm password" error={mismatch ? "Passwords don't match." : undefined}>
            {(id) => <Input id={id} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />}
          </Field>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          {form.role === "teacher" ? "Request teacher account" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Register;

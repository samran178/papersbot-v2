import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Notice } from "@/components/ui/feedback";
import { Button, Field, Input } from "@/components/ui/primitives";
import { homePathFor, useAuthActions } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/api";

import { AuthLayout } from "./AuthLayout";

const Login = () => {
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: ({ user }) => {
          if (!user) return;
          const from = (location.state as { from?: string } | null)?.from;
          navigate(from && from !== "/" ? from : homePathFor(user), { replace: true });
        },
      },
    );
  };

  return (
    <AuthLayout title="Log in" subtitle="Welcome back. Use your username or email.">
      <form onSubmit={submit} className="space-y-4">
        {login.error && <Notice tone="danger">{errorMessage(login.error)}</Notice>}
        <Field label="Username or email">
          {(id) => (
            <Input id={id} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          )}
        </Field>
        <Field label="Password">
          {(id) => (
            <div className="relative">
              <Input
                id={id}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to PapersBot?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
};

export default Login;

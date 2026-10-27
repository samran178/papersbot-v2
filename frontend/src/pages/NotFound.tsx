import { Link } from "react-router-dom";

import { Logo } from "@/components/layout/AppShell";

const NotFound = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
    <Logo className="text-lg" />
    <p className="text-6xl font-bold text-muted/40">404</p>
    <h1 className="text-xl font-semibold">This page doesn't exist</h1>
    <Link to="/" className="font-medium text-primary hover:underline">
      Go to your dashboard
    </Link>
  </div>
);

export default NotFound;

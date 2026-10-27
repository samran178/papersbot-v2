import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/layout/AppShell";

const POINTS = [
  "Timers enforced by the server, not the browser",
  "Attempt the paper in one go or section by section",
  "Automatic MCQ marking, AI-assisted written grading",
];

export const AuthLayout = ({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) => (
  <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,1.1fr)]">
    <div className="relative hidden overflow-hidden bg-[#1e3a8a] p-10 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/5" aria-hidden />
      <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5" aria-hidden />
      <span className="relative flex items-center gap-2 text-lg font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-[#1e3a8a]">P</span>
        PapersBot
      </span>
      <div className="relative max-w-md space-y-6">
        <h2 className="text-3xl font-bold leading-tight">Online exams for University of Gujrat, done properly.</h2>
        <ul className="space-y-3 text-white/85">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-sm text-white/60">Samran Taimoor · Arzoo Fatima — Final Year Project</p>
    </div>

    <div className="flex flex-col justify-center px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-md">
        <Logo className="mb-8 text-lg lg:hidden" />
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  </div>
);

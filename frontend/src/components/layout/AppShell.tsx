import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { LoadingState } from "@/components/ui/feedback";
import { useAuthActions, useMe } from "@/hooks/useAuth";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { cn } from "@/lib/format";
import type { Role } from "@/lib/types";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const NAV: Record<Role, NavItem[]> = {
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/admin/users", label: "Users", icon: Users },
  ],
  teacher: [
    { to: "/teacher", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/teacher/classes", label: "Classes", icon: GraduationCap },
    { to: "/teacher/exams", label: "Exams", icon: ClipboardList },
  ],
  student: [
    { to: "/student", label: "My exams", icon: ClipboardList, end: true },
    { to: "/student/classes", label: "My classes", icon: GraduationCap },
  ],
};

const ROLE_LABEL: Record<Role, string> = { admin: "Admin panel", teacher: "Teacher panel", student: "Student panel" };
const ROLE_ICON: Record<Role, LucideIcon> = { admin: ShieldCheck, teacher: BookOpen, student: GraduationCap };

export const Logo = ({ className }: { className?: string }) => (
  <span className={cn("flex items-center gap-2 font-bold tracking-tight", className)}>
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-fg">P</span>
    PapersBot
  </span>
);

const NavLinks = ({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) => (
  <nav className="space-y-1">
    {items.map(({ to, label, icon: Icon, end }) => (
      <NavLink
        key={to}
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isActive ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
          )
        }
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
        {label}
      </NavLink>
    ))}
  </nav>
);

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const UserMenu = () => {
  const { data: user } = useMe();
  const { logout } = useAuthActions();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  if (!user) return null;

  const itemClass = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[highlighted]:bg-subtle";
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-subtle">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-subtle text-sm font-semibold uppercase">
          {user.full_name.charAt(0)}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium">{user.full_name}</span>
          <span className="block truncate text-xs capitalize text-muted">{user.role}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-lg animate-fade-in"
        >
          <div className="px-2 py-2">
            <p className="truncate text-sm font-medium">{user.full_name}</p>
            <p className="truncate text-xs text-muted">@{user.username}</p>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item className={itemClass} onSelect={() => navigate("/profile")}>
            <UserCircle className="h-4 w-4" /> Profile & password
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted">Theme</p>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-1.5 text-xs",
                  theme === value ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item className={cn(itemClass, "text-danger")} onSelect={() => logout.mutate(undefined, { onSettled: () => navigate("/login") })}>
            <LogOut className="h-4 w-4" /> Log out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
};

export const AppShell = ({ children }: { children?: ReactNode }) => {
  const { data: user } = useMe();
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (!user) return null;

  const items = NAV[user.role];
  const RoleIcon = ROLE_ICON[user.role];
  const roleBadge = (
    <p className="flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
      <RoleIcon className="h-3.5 w-3.5" aria-hidden /> {ROLE_LABEL[user.role]}
    </p>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {roleBadge}
          <NavLinks items={items} />
        </div>
        <p className="px-5 py-4 text-xs text-muted">University of Gujrat</p>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <Dialog.Trigger className="-ml-2 rounded-lg p-2 hover:bg-subtle" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 animate-fade-in lg:hidden" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl animate-slide-in-left lg:hidden">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Description className="sr-only">Main menu</Dialog.Description>
                <div className="flex h-16 items-center justify-between px-4">
                  <Logo />
                  <Dialog.Close className="rounded-lg p-2 hover:bg-subtle" aria-label="Close menu">
                    <X className="h-5 w-5" />
                  </Dialog.Close>
                </div>
                <div className="space-y-3 px-3 py-2">
                  {roleBadge}
                  <NavLinks items={items} onNavigate={() => setDrawerOpen(false)} />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Logo className="text-base" />
        </div>
        <div className="hidden lg:block" />
        <UserMenu />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<LoadingState />}>{children ?? <Outlet />}</Suspense>
      </main>
    </div>
  );
};

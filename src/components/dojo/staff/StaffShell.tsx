import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarDays,
  ClipboardList,
  Eye,
  FileBadge,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  QrCode,
  ShieldAlert,
  Store,
  Tag,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { staffSupabase as supabase } from "@/lib/dojo/staff-auth/staff-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DojoLogo } from "@/components/dojo/DojoLogo";
import { visibleStaffModules, type StaffModule } from "@/lib/dojo/staff-modules";
import { useStaff } from "@/components/dojo/staff/staff-context";

const ICONS: Record<StaffModule["icon"], React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  students: Users,
  schedule: CalendarDays,
  checkin: QrCode,
  graduations: Award,
  evaluations: ClipboardList,
  announcements: Megaphone,
  competitions: Trophy,
  belts: Layers,
  certificates: FileBadge,
  store: Store,
  sales: Tag,
};

export function StaffShell({ children }: { children: ReactNode }) {
  const staff = useStaff();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // A lista é calculada a partir do mapa efetivo recebido da sessão.
  // O helper também aplica defaults de cargo para registros vazios.
  const modules = visibleStaffModules(staff.permissions, (staff as any).role);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/dojo/staff/auth", replace: true });
  };

  const isActive = (to: string) => (to === "/dojo/staff" ? pathname === to : pathname.startsWith(to));

  return (
    <div className="min-h-screen bg-neutral-50 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-700 via-red-600 to-red-500" />
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 md:h-16 md:px-4">
          {staff.academy?.logo_url ? (
            <img
              src={staff.academy.logo_url}
              alt={staff.academy.trade_name ?? "Logotipo do dojo"}
              className="h-9 w-9 rounded-lg border border-border bg-white object-contain"
            />
          ) : (
            <DojoLogo className="h-9 w-auto" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-tight text-neutral-950">
              {staff.academy?.trade_name ?? staff.academy?.legal_name ?? "Portal da Equipe"}
            </div>
            <div className="flex items-center gap-1.5 truncate text-[11px] text-neutral-500">
              <span className="truncate">{staff.full_name ?? staff.email}</span>
              <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-neutral-300" />
              <span className="shrink-0 font-medium text-primary">Portal da Equipe</span>
            </div>
          </div>
          <Link to="/dojo/staff/profile" aria-label="Meu perfil">
            <Button variant="ghost" size="icon" className="text-neutral-600 hover:text-neutral-900">
              <UserCircle className="h-5 w-5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            aria-label="Sair do portal"
            className="text-neutral-600 hover:text-neutral-900"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-3 py-5 pb-28 md:px-4 md:py-6 md:pb-8">
        <nav className="hidden w-56 shrink-0 md:block" aria-label="Navegação do professor">
          <div className="sticky top-24 rounded-xl border border-border bg-white p-2 shadow-xs">
            <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
              Módulos
            </div>
            <ul className="space-y-0.5">
              {modules.map((m) => {
                const Icon = ICONS[m.icon];
                const active = isActive(m.to);
                return (
                  <li key={m.key}>
                    <Link
                      to={m.to}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-red-50 font-semibold text-red-800"
                          : "font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-neutral-400")} />
                      <span className="truncate">{m.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Navegação mobile — professor usa o sistema durante a aula */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação do professor"
      >
        <ul className="flex overflow-x-auto px-1">
          {modules.map((m) => {
            const Icon = ICONS[m.icon];
            const active = isActive(m.to);
            return (
              <li key={m.key} className="flex-1">
                <Link
                  to={m.to}
                  className={cn(
                    "flex min-w-[68px] flex-col items-center gap-1 px-2 pb-2 pt-2.5 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-neutral-500",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-11 place-items-center rounded-full transition-colors",
                      active ? "bg-red-50" : "bg-transparent",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{m.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function StaffPageHeader({
  title,
  subtitle,
  readOnly,
  action,
}: {
  title: string;
  subtitle?: string;
  readOnly?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-neutral-950 md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {readOnly && (
          <Badge variant="secondary" className="gap-1">
            <Eye className="h-3 w-3" /> Somente leitura
          </Badge>
        )}
        {action}
      </div>
    </div>
  );
}

export function StaffNoAccess({ label }: { label?: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <div className="mb-1 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <div className="text-sm font-medium">Você não possui permissão para acessar este recurso.</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        {label ? `O módulo "${label}" não foi liberado para a sua conta.` : "Solicite a liberação ao dono do dojo."}
      </p>
      <Link to="/dojo/staff">
        <Button variant="outline" size="sm" className="mt-2">
          Voltar ao início
        </Button>
      </Link>
    </Card>
  );
}

export function StaffEmpty({ message }: { message: string }) {
  return (
    <Card className="border-dashed p-10 text-center text-sm text-muted-foreground shadow-none">{message}</Card>
  );
}

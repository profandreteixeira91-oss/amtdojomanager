import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Library, FileText, ListChecks, FolderTree,
  Dumbbell, History, Settings as SettingsIcon, ClipboardCheck,
} from "lucide-react";
import { DojoPageHero, SUBNAV_CLS, SUBNAV_ROW_CLS, subnavItemClass } from "@/components/dojo/DojoPageHero";

export const Route = createFileRoute("/dojo/app/evaluations")({
  head: () => ({
    meta: [
      { title: "Avaliações — AMT Dojo Manager" },
      { name: "description", content: "Painel de avaliações: modelos, sessões e histórico de desempenho dos alunos." },
      { property: "og:title", content: "Avaliações — AMT Dojo Manager" },
      { property: "og:description", content: "Gerencie modelos, sessões e histórico de avaliações com padrão premium." },
    ],
  }),
  component: EvaluationsLayout,
});

const NAV = [
  { to: "/dojo/app/evaluations", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/dojo/app/evaluations/library", label: "Biblioteca", icon: Library },
  { to: "/dojo/app/evaluations/templates", label: "Modelos", icon: FileText },
  { to: "/dojo/app/evaluations/sessions", label: "Avaliações", icon: ListChecks },
  { to: "/dojo/app/evaluations/categories", label: "Categorias", icon: FolderTree },
  { to: "/dojo/app/evaluations/techniques", label: "Técnicas", icon: Dumbbell },
  { to: "/dojo/app/evaluations/history", label: "Histórico", icon: History },
  { to: "/dojo/app/evaluations/settings", label: "Configurações", icon: SettingsIcon },
];

function EvaluationsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 md:gap-7">
      <DojoPageHero
        icon={ClipboardCheck}
        eyebrow="Avaliações"
        title="Cada aluno, um diagnóstico afiado."
        description="Monte modelos, aplique sessões e acompanhe o progresso técnico com precisão cirúrgica."
        footer={
          <nav aria-label="Seções de avaliações" className={SUBNAV_CLS}>
            <div className={SUBNAV_ROW_CLS}>
              {NAV.map((item) => {
                const active = item.exact
                  ? pathname === item.to
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to} className={subnavItemClass(active)}>
                    <Icon />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        }
      />

      <Outlet />
    </div>
  );
}

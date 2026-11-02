import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Library, Dumbbell, History, BookOpen } from "lucide-react";
import { DojoPageHero, SUBNAV_CLS, SUBNAV_ROW_CLS, subnavItemClass } from "@/components/dojo/DojoPageHero";

export const Route = createFileRoute("/dojo/app/lesson-plans")({
  head: () => ({
    meta: [
      { title: "Planos de Aula — AMT Dojo Manager" },
      { name: "description", content: "Planeje, aplique modelos e acompanhe todas as suas aulas com o AMT Dojo Manager." },
      { property: "og:title", content: "Planos de Aula — AMT Dojo Manager" },
      { property: "og:description", content: "Painel para planejar aulas, biblioteca e técnicas." },
    ],
  }),
  component: LessonPlansLayout,
});

const NAV = [
  { to: "/dojo/app/lesson-plans", label: "Painel", icon: LayoutDashboard, exact: true },
  { to: "/dojo/app/lesson-plans/library", label: "Biblioteca", icon: Library },
  { to: "/dojo/app/lesson-plans/techniques", label: "Técnicas", icon: Dumbbell },
  { to: "/dojo/app/lesson-plans/history", label: "Histórico", icon: History },
];

function LessonPlansLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 md:gap-7">
      <DojoPageHero
        icon={BookOpen}
        eyebrow="Planos de Aula"
        title="Planeje cada aula como um round."
        description="Monte cronogramas, aplique modelos e mantenha sua biblioteca de técnicas afiada."
        footer={
          <nav aria-label="Seções de planos de aula" className={SUBNAV_CLS}>
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


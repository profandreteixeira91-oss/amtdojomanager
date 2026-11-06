import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

// Endereços antigos do app do aluno que já saíram em notificações push e em
// dojo_student_notifications.link. As rotas reais têm prioridade sobre esta
// (rota "splat"); aqui só se redireciona o que é legado e o resto é 404.
const LEGACY_PATHS: Record<string, string> = {
  financeiro: "/app/finance",
  plan: "/app/finance",
  graduacoes: "/app/graduations",
  certificados: "/app/certificates",
  avaliacoes: "/app/evaluations",
  contratos: "/app/documents",
};

export const Route = createFileRoute("/app/$")({
  beforeLoad: ({ params }) => {
    const parts = (params._splat ?? "").split("/").filter(Boolean);
    if (parts.length === 2 && parts[0] === "announcements") {
      throw redirect({ href: `/app/announcements?open=${encodeURIComponent(parts[1])}`, replace: true });
    }
    const target = parts.length === 1 ? LEGACY_PATHS[parts[0]] : undefined;
    if (target) throw redirect({ href: target, replace: true });
    throw notFound();
  },
});

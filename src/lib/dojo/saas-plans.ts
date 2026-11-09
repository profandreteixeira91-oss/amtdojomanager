// Planos de assinatura do AMT Dojo Manager — fonte única (site, assinatura,
// bloqueio de módulos e cobrança). Funções puras: rodam no cliente e no servidor.
//
// Contas criadas antes dos planos ficam em `legacy`: tudo liberado, mesmo valor
// e mesma cobrança de antes. Contas novas testam o Premium por 14 dias e
// escolhem um plano ao assinar.
//
// Os limites (alunos ativos, unidades, usuários do sistema) são garantidos no
// banco por `dojo_plan_limit()` (migration `dojo_planos_saas` no amtfightwear):
// manter os números daqui iguais aos de lá.

export type SaasPlanCode = "essencial" | "profissional" | "premium";
export type PlanCode = SaasPlanCode | "legacy";

/** Recursos que nem todo plano libera. O que não está aqui vale para todos. */
export type PlanFeature =
  | "evaluations"
  | "certificates"
  | "lesson_plans"
  | "videos"
  | "ranking"
  | "competitions"
  | "contracts"
  | "team"
  | "whatsapp"
  | "units"
  | "corporate_benefits";

export type PlanLimits = {
  /** Alunos com status "active". `null` = ilimitado. */
  students: number | null;
  /** Unidades ativas. */
  units: number | null;
  /** Logins de equipe ativos (Usuários do Sistema). */
  systemUsers: number | null;
};

export type SaasPlan = {
  code: SaasPlanCode;
  name: string;
  price: number;
  tagline: string;
  features: PlanFeature[];
  limits: PlanLimits;
  /** Itens de vitrine (site e tela de assinatura). */
  highlights: string[];
};

const PRO_FEATURES: PlanFeature[] = [
  "evaluations",
  "certificates",
  "lesson_plans",
  "videos",
  "ranking",
  "competitions",
  "contracts",
  "team",
  "whatsapp",
];

export const SAAS_PLANS: Record<SaasPlanCode, SaasPlan> = {
  essencial: {
    code: "essencial",
    name: "Essencial",
    price: 99.9,
    tagline: "O dia a dia da academia organizado",
    features: [],
    limits: { students: 100, units: 1, systemUsers: 2 },
    highlights: [
      "Até 100 alunos ativos",
      "Alunos, matrículas e planos de mensalidade",
      "Agenda, turmas e check-in",
      "Financeiro completo e AMT Pay",
      "Modalidades, faixas e graduações",
      "App do Aluno com push e carteirinha",
      "Quadro de avisos e vendas avulsas",
      "AMT Store integrada",
      "1 unidade · 2 usuários do sistema",
    ],
  },
  profissional: {
    code: "profissional",
    name: "Profissional",
    price: 159.9,
    tagline: "Ensino, equipe e competição",
    features: PRO_FEATURES,
    limits: { students: 300, units: 1, systemUsers: 5 },
    highlights: [
      "Tudo do Essencial",
      "Até 300 alunos ativos",
      "Avaliações e certificados",
      "Planos de aula e biblioteca de vídeos",
      "Ranking e competições",
      "Central de contratos",
      "Equipe: folha e escalas",
      "WhatsApp da academia",
      "1 unidade · 5 usuários do sistema",
    ],
  },
  premium: {
    code: "premium",
    name: "Premium",
    price: 229.9,
    tagline: "Para redes e academias em expansão",
    features: [...PRO_FEATURES, "units", "corporate_benefits"],
    limits: { students: null, units: null, systemUsers: null },
    highlights: [
      "Tudo do Profissional",
      "Alunos ilimitados",
      "Unidades, filiais e rede de afiliados",
      "Benefícios corporativos (Gympass, TotalPass)",
      "Usuários do sistema ilimitados",
    ],
  },
};

export const SAAS_PLAN_ORDER: SaasPlanCode[] = ["essencial", "profissional", "premium"];

export function isSaasPlanCode(v: unknown): v is SaasPlanCode {
  return v === "essencial" || v === "profissional" || v === "premium";
}

/** Nome exibido do recurso (tela de upgrade). */
export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  evaluations: "Avaliações",
  certificates: "Certificados",
  lesson_plans: "Planos de Aula",
  videos: "Vídeos",
  ranking: "Ranking",
  competitions: "Competições",
  contracts: "Central de Contratos",
  team: "Equipe",
  whatsapp: "WhatsApp",
  units: "Unidades e Filiais",
  corporate_benefits: "Benefícios Corporativos",
};

/** Rotas do painel protegidas por cada recurso (prefixo). */
const FEATURE_ROUTES: Record<PlanFeature, string[]> = {
  evaluations: ["/dojo/app/evaluations"],
  certificates: ["/dojo/app/certificates"],
  lesson_plans: ["/dojo/app/lesson-plans"],
  videos: ["/dojo/app/videos"],
  ranking: ["/dojo/app/ranking"],
  competitions: ["/dojo/app/competitions"],
  contracts: ["/dojo/app/contracts", "/dojo/app/contract-templates"],
  team: ["/dojo/app/team"],
  whatsapp: ["/dojo/app/whatsapp"],
  units: ["/dojo/app/units"],
  corporate_benefits: ["/dojo/app/corporate-benefits"],
};

export function featureForPath(pathname: string): PlanFeature | null {
  for (const [feature, routes] of Object.entries(FEATURE_ROUTES) as [PlanFeature, string[]][]) {
    for (const r of routes) {
      if (pathname === r || pathname.startsWith(r + "/") || pathname.startsWith(r + "?"))
        return feature;
    }
  }
  return null;
}

/**
 * Plano que vale agora para os recursos:
 * - `legacy` (contas anteriores aos planos) → tudo liberado;
 * - em teste grátis → Premium;
 * - sem assinatura ainda (antes da primeira leitura criar o teste) → Premium.
 * Bloqueio por falta de pagamento é outro controle (TrialExpiredOverlay).
 */
export function effectivePlanCode(
  sub: { plan_code?: string | null; status?: string | null } | null | undefined,
): PlanCode {
  if (!sub) return "premium";
  const code = sub.plan_code ?? "legacy";
  if (code === "legacy") return "legacy";
  if (sub.status === "trialing") return "premium";
  return isSaasPlanCode(code) ? code : "legacy";
}

export function planHasFeature(plan: PlanCode, feature: PlanFeature): boolean {
  if (plan === "legacy") return true;
  return SAAS_PLANS[plan].features.includes(feature);
}

export function planLimits(plan: PlanCode): PlanLimits {
  if (plan === "legacy") return { students: null, units: null, systemUsers: null };
  return SAAS_PLANS[plan].limits;
}

/** Plano mais barato que libera o recurso. */
export function minPlanForFeature(feature: PlanFeature): SaasPlan {
  const code = SAAS_PLAN_ORDER.find((c) => SAAS_PLANS[c].features.includes(feature)) ?? "premium";
  return SAAS_PLANS[code];
}

export function formatBRL(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

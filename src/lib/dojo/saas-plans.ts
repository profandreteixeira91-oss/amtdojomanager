// Planos de assinatura do AMT Dojo Manager — fonte única (site, assinatura,
// bloqueio de módulos e cobrança). Funções puras: rodam no cliente e no servidor.
//
// Contas criadas antes dos planos ficam em `legacy`: tudo liberado, mesmo valor
// e mesma cobrança de antes. Contas novas escolhem o plano em /dojo/planos,
// testam esse plano por 14 dias e podem trocar ao assinar.
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
 * - conta nova (em teste ou paga) → o plano escolhido;
 * - sem assinatura ainda (antes do cadastro criar a linha) → Premium.
 * Bloqueio por falta de pagamento é outro controle (TrialExpiredOverlay).
 */
export function effectivePlanCode(
  sub: { plan_code?: string | null; status?: string | null } | null | undefined,
): PlanCode {
  if (!sub) return "premium";
  const code = sub.plan_code ?? "legacy";
  if (code === "legacy") return "legacy";
  return isSaasPlanCode(code) ? code : "legacy";
}

/** Linha da comparação detalhada (/dojo/planos). */
export type ComparisonRow = {
  label: string;
  hint?: string;
  /** Recurso que define em quais planos aparece; sem ele = todos os planos. */
  feature?: PlanFeature;
  /** Valor por plano (limites); substitui o ✓/✗. */
  values?: Record<SaasPlanCode, string>;
};

const limitText = (v: number | null) => (v === null ? "Ilimitados" : `Até ${v}`);

export const PLAN_COMPARISON: { group: string; rows: ComparisonRow[] }[] = [
  {
    group: "Limites",
    rows: [
      {
        label: "Alunos ativos",
        values: {
          essencial: limitText(SAAS_PLANS.essencial.limits.students),
          profissional: limitText(SAAS_PLANS.profissional.limits.students),
          premium: "Ilimitados",
        },
      },
      {
        label: "Unidades",
        values: { essencial: "1", profissional: "1", premium: "Ilimitadas" },
      },
      {
        label: "Usuários do sistema",
        hint: "Logins da equipe com permissões por módulo",
        values: {
          essencial: String(SAAS_PLANS.essencial.limits.systemUsers),
          profissional: String(SAAS_PLANS.profissional.limits.systemUsers),
          premium: "Ilimitados",
        },
      },
    ],
  },
  {
    group: "Gestão do dia a dia",
    rows: [
      { label: "Alunos e matrículas", hint: "Ficha completa, anamnese, importação por planilha" },
      { label: "Agenda e turmas", hint: "Horários, espaços, professores e ocupação" },
      { label: "Check-in", hint: "QR Code, PIN e quiosque em tela cheia" },
      { label: "Quadro de avisos", hint: "Comunicados no App do Aluno" },
      { label: "Modalidades, faixas e graus", hint: "Belt Studio com ilustrações por modalidade" },
      { label: "Graduações", hint: "Cerimônias, critérios e histórico" },
    ],
  },
  {
    group: "Financeiro",
    rows: [
      { label: "Planos de mensalidade e matrículas" },
      { label: "Financeiro completo", hint: "Contas a receber e a pagar, fluxo de caixa, relatórios" },
      { label: "AMT Pay", hint: "PIX, cartão e boleto com 2% por transação" },
      { label: "Vendas avulsas", hint: "Produtos, taxas e serviços" },
      { label: "AMT Store integrada", hint: "Faixas, kimonos e patches com preço de atacado" },
    ],
  },
  {
    group: "App do Aluno",
    rows: [
      { label: "App do Aluno (PWA)", hint: "Carteirinha digital, faturas e agenda" },
      { label: "Notificações push" },
      { label: "WhatsApp da academia", hint: "Lembretes e avisos pelo número da academia", feature: "whatsapp" },
    ],
  },
  {
    group: "Ensino e competição",
    rows: [
      { label: "Avaliações", hint: "Provas teóricas e práticas por fundamento", feature: "evaluations" },
      { label: "Certificados", hint: "Editor de modelos e PDF A4", feature: "certificates" },
      { label: "Planos de aula", hint: "Biblioteca e banco de técnicas", feature: "lesson_plans" },
      { label: "Vídeos", hint: "Biblioteca de conteúdos por categoria", feature: "videos" },
      { label: "Ranking", hint: "Classificação por check-ins", feature: "ranking" },
      { label: "Competições", hint: "Calendário, atletas, medalhas e finanças", feature: "competitions" },
    ],
  },
  {
    group: "Equipe e jurídico",
    rows: [
      { label: "Central de contratos", hint: "Modelos, emissão e histórico", feature: "contracts" },
      { label: "Equipe", hint: "Colaboradores, folha e escalas", feature: "team" },
    ],
  },
  {
    group: "Rede",
    rows: [
      { label: "Unidades e filiais", hint: "Rede de afiliados com visão consolidada", feature: "units" },
      { label: "Benefícios corporativos", hint: "Gympass, TotalPass e parceiros", feature: "corporate_benefits" },
    ],
  },
];

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

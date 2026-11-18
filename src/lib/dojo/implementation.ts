// Implantação assistida (grátis): o que o dono preenche para a AMT implantar a
// academia. Funções puras — rodam no navegador e no servidor.
//
// Fluxo: o dono preenche e envia em /dojo/app/implantacao → a AMT revisa no
// Control Center (amtsistemas.com.br/admin, Edge Function `implementation`) e
// aplica com `dojo_apply_implementation` (migration no amtfightwear). Os nomes
// das chaves aqui são lidos por essa função SQL: mudar um exige mudar lá.

import { z } from "zod";

export const IMPLEMENTATION_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada para a AMT",
  em_implantacao: "Em implantação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const IMPLEMENTATION_PLAN_FREQUENCIES = [
  ["monthly", "Mensal"],
  ["bimonthly", "Bimestral"],
  ["quarterly", "Trimestral"],
  ["semiannual", "Semestral"],
  ["annual", "Anual"],
] as const;

export const IMPLEMENTATION_PAYMENT_METHODS = [
  ["pix", "Pix"],
  ["cash", "Dinheiro"],
  ["card_machine", "Maquininha"],
  ["payment_link", "Link de pagamento"],
] as const;

export const IMPLEMENTATION_TEAM_ROLES = [
  ["teacher", "Professor(a)"],
  ["instructor", "Instrutor(a)"],
  ["assistant", "Auxiliar"],
  ["receptionist", "Recepção"],
  ["finance", "Financeiro"],
  ["manager", "Gerente"],
  ["other", "Outro"],
] as const;

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const text = (max: number) => z.string().trim().max(max).optional().default("");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido");

export const academySchema = z.object({
  trade_name: text(200),
  legal_name: text(200),
  cnpj: text(20),
  responsible_name: text(200),
  whatsapp: text(20),
  email: text(200),
  instagram: text(120),
  zip: text(10),
  address: text(200),
  address_number: text(20),
  address_complement: text(120),
  neighborhood: text(120),
  city: text(120),
  state: text(2),
  modalities: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  logo_url: z.string().url().max(500).or(z.literal("")).optional().default(""),
});

export const planSchema = z.object({
  name: z.string().trim().min(1, "Nome do plano").max(120),
  amount: z.number().min(0).max(100000),
  frequency: z
    .enum(["monthly", "bimonthly", "quarterly", "semiannual", "annual"])
    .default("monthly"),
  enrollment_fee: z.number().min(0).max(100000).default(0),
  payment_methods: z
    .array(z.enum(["pix", "cash", "card_machine", "payment_link"]))
    .max(4)
    .default(["pix", "cash"]),
  description: text(500),
});

export const classSchema = z.object({
  name: z.string().trim().min(1, "Nome da turma").max(120),
  modality: text(60),
  level: z.enum(["iniciante", "intermediário", "avançado", "todos"]).default("todos"),
  teacher_name: text(200),
  max_students: z.number().int().min(1).max(500).default(30),
  schedules: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), start_time: time, end_time: time }))
    .max(14)
    .default([])
    .refine(
      (list) => list.every((s) => s.end_time > s.start_time),
      "Horário final deve ser depois do inicial",
    ),
});

export const teamSchema = z.object({
  full_name: z.string().trim().min(2, "Nome da pessoa").max(200),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .max(200)
    .or(z.literal(""))
    .optional()
    .default(""),
  phone: text(20),
  role: z
    .enum(["teacher", "instructor", "assistant", "receptionist", "finance", "manager", "other"])
    .default("teacher"),
});

/** Linha da planilha: colunas do importador de alunos + plano, turmas, faixa e vencimento. */
export const studentSchema = z
  .object({
    full_name: z.string().trim().min(2, "Nome do aluno com ao menos 2 letras").max(200),
    birth_date: z
      .string()
      .optional()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Nascimento no formato AAAA-MM-DD"),
    email: z.string().trim().email("E-mail inválido").max(200).or(z.literal("")).optional(),
    status: z.enum(["active", "inactive", "frozen"]).optional(),
    due_day: z
      .string()
      .optional()
      .refine(
        (v) => !v || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 28),
        "Vencimento entre 1 e 28",
      ),
    degree: z
      .string()
      .optional()
      .refine((v) => !v || /^\d{1,2}$/.test(v), "Grau deve ser um número"),
  })
  .catchall(z.string().max(2000));

export const billingSchema = z.object({
  due_day_default: z.number().int().min(1).max(28).default(10),
  /** Mês (AAAA-MM) em que o sistema começa a gerar as mensalidades. */
  start_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido"),
});

export const implementationPayloadSchema = z.object({
  academy: academySchema.prefault({}),
  plans: z.array(planSchema).max(50).default([]),
  classes: z.array(classSchema).max(100).default([]),
  team: z.array(teamSchema).max(50).default([]),
  students: z.array(studentSchema).max(2000).default([]),
  billing: billingSchema.default(() => ({ due_day_default: 10, start_month: nextMonthISO() })),
  notes: text(2000),
});

export type ImplementationPayload = z.infer<typeof implementationPayloadSchema>;
export type ImplementationPlan = z.infer<typeof planSchema>;
export type ImplementationClass = z.infer<typeof classSchema>;
export type ImplementationTeam = z.infer<typeof teamSchema>;
export type ImplementationStudent = z.infer<typeof studentSchema>;

/** AAAA-MM do mês seguinte (horário de Brasília). */
export function nextMonthISO(now = new Date()): string {
  const br = new Date(now.getTime() - 3 * 3600_000);
  const y = br.getUTCFullYear();
  const m = br.getUTCMonth() + 1;
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function emptyImplementationPayload(): ImplementationPayload {
  return implementationPayloadSchema.parse({});
}

/** Lê o que veio do banco sem quebrar com rascunho antigo ou incompleto. */
export function readImplementationPayload(raw: unknown): ImplementationPayload {
  const parsed = implementationPayloadSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const base = emptyImplementationPayload();
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <S extends z.ZodTypeAny>(
    schema: S,
    value: unknown,
    fallback: z.infer<S>,
  ): z.infer<S> => {
    const r = schema.safeParse(value);
    return r.success ? r.data : fallback;
  };
  const list = <S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S>[] =>
    Array.isArray(value)
      ? value.flatMap((v) => {
          const r = schema.safeParse(v);
          return r.success ? [r.data] : [];
        })
      : [];
  return {
    academy: pick(academySchema, obj.academy, base.academy),
    plans: list(planSchema, obj.plans),
    classes: list(classSchema, obj.classes),
    team: list(teamSchema, obj.team),
    students: list(studentSchema, obj.students),
    billing: pick(billingSchema, obj.billing, base.billing),
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 2000) : "",
  };
}

/**
 * O que falta para enviar. Lista vazia = pode enviar. Também confere se plano e
 * turmas citados na planilha existem no formulário (senão a AMT não consegue ligar).
 */
export function implementationIssues(p: ImplementationPayload): string[] {
  const issues: string[] = [];
  if (p.academy.trade_name.trim().length < 2) issues.push("Academia: informe o nome da academia.");
  if (!p.academy.whatsapp.trim()) issues.push("Academia: informe o WhatsApp.");
  if (p.academy.modalities.length === 0) issues.push("Academia: escolha ao menos uma modalidade.");
  if (p.plans.length === 0) issues.push("Planos: cadastre ao menos um plano.");
  p.plans.forEach((plan, i) => {
    if (plan.payment_methods.length === 0)
      issues.push(`Planos: "${plan.name || `plano ${i + 1}`}" precisa de uma forma de pagamento.`);
  });
  const planNames = new Set(p.plans.map((x) => key(x.name)));
  const classNames = new Set(p.classes.map((x) => key(x.name)));
  if (new Set(p.plans.map((x) => key(x.name))).size !== p.plans.length)
    issues.push("Planos: há dois planos com o mesmo nome.");
  if (new Set(p.classes.map((x) => key(x.name))).size !== p.classes.length)
    issues.push("Turmas: há duas turmas com o mesmo nome.");
  p.classes.forEach((c) => {
    if (c.schedules.length === 0) issues.push(`Turmas: "${c.name}" está sem dia e horário.`);
  });
  const unknownPlans = new Set<string>();
  const unknownClasses = new Set<string>();
  for (const s of p.students) {
    if (s.plan && !planNames.has(key(s.plan))) unknownPlans.add(s.plan);
    for (const c of splitClasses(s.classes)) if (!classNames.has(key(c))) unknownClasses.add(c);
  }
  if (unknownPlans.size)
    issues.push(
      `Alunos: plano(s) da planilha que não estão em Planos: ${[...unknownPlans].join(", ")}.`,
    );
  if (unknownClasses.size)
    issues.push(
      `Alunos: turma(s) da planilha que não estão em Turmas: ${[...unknownClasses].join(", ")}.`,
    );
  return issues;
}

export function splitClasses(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function key(v: string) {
  return v.trim().toLowerCase();
}

/** Ajustes comuns de planilha brasileira: nascimento DD/MM/AAAA vira AAAA-MM-DD. */
export function normalizeImplementationStudent(
  row: Record<string, string>,
): Record<string, string> {
  const out = { ...row };
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(out.birth_date ?? "");
  if (br) out.birth_date = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return out;
}

/** Valida as linhas da planilha; devolve mensagens com o número da linha. */
export function validateImplementationStudents(rows: Record<string, string>[]): string[] {
  return rows.flatMap((row, index) => {
    const parsed = studentSchema.safeParse(row);
    return parsed.success
      ? []
      : [`Linha ${index + 2}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`];
  });
}

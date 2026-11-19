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

/* Rascunho: o formulário salva sozinho enquanto o dono digita, então linhas
 * incompletas (pessoa sem nome, e-mail pela metade, horário vazio) precisam ser
 * aceitas e voltar intactas. A validação completa fica para o envio
 * (`implementationIssues` + `implementationPayloadSchema`). */
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "";
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown, max: number): Record<string, unknown>[] =>
  Array.isArray(v) ? v.slice(0, max).map(obj) : [];

const FREQUENCIES = ["monthly", "bimonthly", "quarterly", "semiannual", "annual"] as const;
const PAYMENT_METHODS = ["pix", "cash", "card_machine", "payment_link"] as const;
const LEVELS = ["iniciante", "intermediário", "avançado", "todos"] as const;
const TEAM_ROLES = [
  "teacher",
  "instructor",
  "assistant",
  "receptionist",
  "finance",
  "manager",
  "other",
] as const;
const STUDENT_STATUSES = ["active", "inactive", "frozen"] as const;

/** Lê rascunho (do banco ou do formulário) sem quebrar com linha incompleta ou antiga. */
export function readImplementationPayload(raw: unknown): ImplementationPayload {
  const o = obj(raw);
  const a = obj(o.academy);
  const b = obj(o.billing);
  const startMonth = str(b.start_month, 7);
  return {
    academy: {
      trade_name: str(a.trade_name, 200),
      legal_name: str(a.legal_name, 200),
      cnpj: str(a.cnpj, 20),
      responsible_name: str(a.responsible_name, 200),
      whatsapp: str(a.whatsapp, 20),
      email: str(a.email, 200),
      instagram: str(a.instagram, 120),
      zip: str(a.zip, 10),
      address: str(a.address, 200),
      address_number: str(a.address_number, 20),
      address_complement: str(a.address_complement, 120),
      neighborhood: str(a.neighborhood, 120),
      city: str(a.city, 120),
      state: str(a.state, 2),
      modalities: Array.isArray(a.modalities)
        ? a.modalities
            .map((m) => str(m, 60).trim())
            .filter(Boolean)
            .slice(0, 20)
        : [],
      logo_url: str(a.logo_url, 500),
    },
    plans: arr(o.plans, 50).map((p) => ({
      name: str(p.name, 120),
      amount: num(p.amount, 0),
      frequency: oneOf(p.frequency, FREQUENCIES, "monthly"),
      enrollment_fee: num(p.enrollment_fee, 0),
      payment_methods: Array.isArray(p.payment_methods)
        ? [...new Set(p.payment_methods)].filter((m): m is (typeof PAYMENT_METHODS)[number] =>
            (PAYMENT_METHODS as readonly unknown[]).includes(m),
          )
        : ["pix", "cash"],
      description: str(p.description, 500),
    })),
    classes: arr(o.classes, 100).map((c) => ({
      name: str(c.name, 120),
      modality: str(c.modality, 60),
      level: oneOf(c.level, LEVELS, "todos"),
      teacher_name: str(c.teacher_name, 200),
      max_students: num(c.max_students, 30),
      schedules: arr(c.schedules, 14).map((s) => ({
        weekday: num(s.weekday, 1),
        start_time: str(s.start_time, 5),
        end_time: str(s.end_time, 5),
      })),
    })),
    team: arr(o.team, 50).map((m) => ({
      full_name: str(m.full_name, 200),
      email: str(m.email, 200),
      phone: str(m.phone, 20),
      role: oneOf(m.role, TEAM_ROLES, "teacher"),
    })),
    students: arr(o.students, 2000).map((row) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        const value = str(v, 2000);
        if (value) out[k.slice(0, 60)] = value;
      }
      if (out.status && !(STUDENT_STATUSES as readonly string[]).includes(out.status))
        delete out.status;
      return { ...out, full_name: out.full_name ?? "" } as ImplementationStudent;
    }),
    billing: {
      due_day_default: num(b.due_day_default, 10),
      start_month: /^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) ? startMonth : nextMonthISO(),
    },
    notes: str(o.notes, 2000),
  };
}

const SECTION_LABELS: Record<string, (i: number) => string> = {
  academy: () => "Academia",
  plans: (i) => `Planos, plano ${i + 1}`,
  classes: (i) => `Turmas, turma ${i + 1}`,
  team: (i) => `Equipe, pessoa ${i + 1}`,
  students: (i) => `Alunos, linha ${i + 2} da planilha`,
  billing: () => "Cobrança",
  notes: () => "Observações",
};

const FIELD_MESSAGES: Record<string, string> = {
  full_name: "informe o nome (ao menos 2 letras)",
  name: "informe o nome",
  email: "e-mail inválido",
  amount: "valor inválido",
  enrollment_fee: "taxa de matrícula inválida",
  max_students: "limite de alunos entre 1 e 500",
  start_time: "horário inicial inválido",
  end_time: "horário final inválido",
  schedules: "o horário final deve ser depois do inicial",
  weekday: "dia da semana inválido",
  logo_url: "endereço do logo inválido",
  birth_date: "nascimento no formato DD/MM/AAAA",
  due_day: "vencimento entre 1 e 28",
  degree: "grau deve ser um número",
  due_day_default: "vencimento padrão entre 1 e 28",
  start_month: "mês de início inválido",
  payment_methods: "forma de pagamento inválida",
};

/** Traduz o que o formato completo recusa em mensagens por seção e linha. */
function schemaIssues(p: ImplementationPayload, limit = 10): string[] {
  const parsed = implementationPayloadSchema.safeParse(p);
  if (parsed.success) return [];
  const messages = new Set<string>();
  for (const issue of parsed.error.issues) {
    const [section, index] = issue.path;
    const where = SECTION_LABELS[String(section)]?.(typeof index === "number" ? index : 0);
    const field = [...issue.path]
      .reverse()
      .find((k) => typeof k === "string" && k in FIELD_MESSAGES);
    const what = field ? FIELD_MESSAGES[String(field)] : issue.message;
    messages.add(`${where ?? "Dados"}: ${what}.`);
  }
  const all = [...messages];
  return all.length > limit
    ? [...all.slice(0, limit), `E mais ${all.length - limit} correções.`]
    : all;
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
  return [...issues, ...schemaIssues(p)];
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

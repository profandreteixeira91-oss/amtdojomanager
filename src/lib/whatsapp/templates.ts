// Texto das mensagens de WhatsApp aos alunos (usado no servidor e na tela de
// personalização). Por padrão nenhuma mensagem leva link: o aluno é convidado
// a abrir o app com uma frase de acordo com o tipo de aviso. O dono pode trocar
// o modelo de cada tipo; o rodapé do SAIR é sempre acrescentado.

export const WHATSAPP_ACTIONS: Record<string, string> = {
  class_reminder: "ver os detalhes da sua aula",
  attendance_confirmed: "acompanhar sua frequência",
  schedule_change: "ver a grade de aulas atualizada",
  invoice_due_soon: "ver e pagar sua mensalidade",
  invoice_overdue: "regularizar sua mensalidade",
  payment_received: "ver seu histórico de pagamentos",
  plan_change: "ver os detalhes do seu plano",
  announcement: "ler o aviso completo",
  contract: "ver e assinar o seu contrato",
  new_video: "assistir ao novo vídeo",
  graduation: "ver sua graduação",
  evaluation: "ver o resultado da sua avaliação",
  competition: "ver os detalhes da competição",
};
const DEFAULT_ACTION = "ver mais detalhes";

export const DEFAULT_WHATSAPP_TEMPLATE =
  "{saudacao}\n\n*{titulo}*\n{mensagem}\n\nAcesse o app do aluno para {acao}.\n\n_{academia}_";

export const WHATSAPP_OPT_OUT_FOOTER = "_Para não receber mais mensagens, responda SAIR._";

export const WHATSAPP_TEMPLATE_MAX = 1000;

export const WHATSAPP_TEMPLATE_VARS: Array<{ key: string; label: string }> = [
  { key: "saudacao", label: "Saudação (“Olá, Maria!” ou, para o responsável, “Olá! Mensagem sobre Maria:”)" },
  { key: "primeiro_nome", label: "Primeiro nome do aluno" },
  { key: "aluno", label: "Nome completo do aluno" },
  { key: "academia", label: "Nome da academia" },
  { key: "titulo", label: "Título do aviso" },
  { key: "mensagem", label: "Texto do aviso" },
  { key: "acao", label: "O que fazer no app (ex.: “ver e pagar sua mensalidade”)" },
];

export type WhatsAppTemplateVars = Record<(typeof WHATSAPP_TEMPLATE_VARS)[number]["key"], string>;

export function whatsappActionFor(category: string | null | undefined): string {
  return (category && WHATSAPP_ACTIONS[category]) || DEFAULT_ACTION;
}

/**
 * Tira links de títulos e textos que vêm do sistema (o WhatsApp não leva
 * links): sai a frase inteira que tinha o link, para não sobrar "Pague em".
 */
export function stripLinks(text: string): string {
  return text
    .replace(/[^.!?\n]*(?:\bhttps?:\/\/|\bwww\.)\S+[^.!?\n]*[.!?]?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Variáveis escritas no modelo que não existem (o editor avisa o dono). */
export function unknownTemplateVars(template: string): string[] {
  const known = new Set(WHATSAPP_TEMPLATE_VARS.map((v) => v.key));
  const found = Array.from(template.matchAll(/\{([^{}\s]+)\}/g), (m) => m[1]);
  return Array.from(new Set(found.filter((k) => !known.has(k))));
}

export function buildWhatsAppVars(opts: {
  studentName: string | null;
  guardian: boolean;
  academyName: string | null;
  title: string;
  body?: string | null;
  category?: string | null;
}): WhatsAppTemplateVars {
  const aluno = String(opts.studentName ?? "").trim().replace(/\s+/g, " ");
  const primeiro = aluno.split(" ")[0] ?? "";
  const saudacao = opts.guardian
    ? primeiro
      ? `Olá! Mensagem sobre *${primeiro}*:`
      : "Olá!"
    : primeiro
      ? `Olá, ${primeiro}!`
      : "Olá!";
  return {
    saudacao,
    primeiro_nome: primeiro,
    aluno,
    academia: String(opts.academyName ?? "").trim(),
    titulo: stripLinks(opts.title ?? ""),
    mensagem: stripLinks(opts.body ?? ""),
    acao: whatsappActionFor(opts.category),
  };
}

/**
 * Preenche o modelo e limpa o que ficou vazio (ex.: academia sem nome deixando
 * só "__"). Variável desconhecida não vai na mensagem (o editor avisa o dono).
 */
export function renderWhatsAppTemplate(template: string | null | undefined, vars: WhatsAppTemplateVars): string {
  const tpl = (template ?? "").trim() || DEFAULT_WHATSAPP_TEMPLATE;
  const filled = tpl
    .replace(/\{([^{}\s]+)\}/g, (_all, key: string) => (key in vars ? (vars as Record<string, string>)[key] : ""))
    .replace(/(\*\*|__|~~)/g, "");
  const lines = filled
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .filter((l) => l === "" || !/^[\s*_~]+$/.test(l));
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return `${text}\n\n${WHATSAPP_OPT_OUT_FOOTER}`;
}

/** Normaliza o que o dono salvou: só tipos conhecidos, texto não vazio e com limite. */
export function cleanWhatsAppTemplates(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(k in WHATSAPP_ACTIONS) || typeof v !== "string") continue;
    const t = v.replace(/\r\n/g, "\n").trim();
    if (t && t !== DEFAULT_WHATSAPP_TEMPLATE) out[k] = t.slice(0, WHATSAPP_TEMPLATE_MAX);
  }
  return out;
}

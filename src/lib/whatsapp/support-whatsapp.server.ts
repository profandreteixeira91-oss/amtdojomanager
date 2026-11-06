// Suporte AMT por WhatsApp (Evolution API, instância própria do suporte).
//
// Ida: cada chamado novo e cada mensagem do cliente no /dojo/app/support vira
// uma mensagem de WhatsApp para o número da equipe (SUPPORT_WHATSAPP_TO), com o
// código do chamado (#a1b2c3d4).
// Volta: a equipe responde CITANDO a mensagem; o webhook
// /api/public/hooks/support-whatsapp acha o chamado pelo código na citação e
// grava a resposta como mensagem do suporte — o cliente vê na tela do chamado.
//
// Configuração (segredos da hospedagem / .env.local, nunca VITE_):
//   SUPPORT_WHATSAPP_INSTANCE        — instância na Evolution (padrão amt-suporte)
//   SUPPORT_WHATSAPP_TO              — número da equipe (padrão 551151040791)
//   SUPPORT_WHATSAPP_WEBHOOK_SECRET  — segredo do webhook (obrigatório p/ respostas)
//   SUPPORT_WHATSAPP_AUTHOR_ID       — usuário que assina as respostas (opcional;
//                                      sem ele, o primeiro amt_admin)
// Usa também EVOLUTION_API_URL / EVOLUTION_API_KEY, como o WhatsApp das academias.

import { phoneKey, normalizePhone } from "./dojo-whatsapp.server";

const DEFAULT_INSTANCE = "amt-suporte";
const DEFAULT_TO = "551151040791";
const MAX_BODY = 1500;

export function supportWhatsAppConfig() {
  return {
    instance: (process.env.SUPPORT_WHATSAPP_INSTANCE ?? "").trim() || DEFAULT_INSTANCE,
    to: normalizePhone(process.env.SUPPORT_WHATSAPP_TO) ?? DEFAULT_TO,
    webhookSecret: (process.env.SUPPORT_WHATSAPP_WEBHOOK_SECRET ?? "").trim(),
    authorId: (process.env.SUPPORT_WHATSAPP_AUTHOR_ID ?? "").trim(),
  };
}

/** Código curto do chamado: 8 primeiros caracteres do UUID. */
export function ticketCode(ticketId: string): string {
  return ticketId.slice(0, 8).toLowerCase();
}

/** Acha o código #xxxxxxxx num texto (citação ou resposta). */
export function findTicketCode(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(/#([0-9a-f]{8})\b/i);
  return m ? m[1].toLowerCase() : null;
}

/** O remetente é o número da equipe de suporte? */
export function isSupportTeamNumber(phone: string | null | undefined): boolean {
  const key = phoneKey(phone);
  return !!key && key === phoneKey(supportWhatsAppConfig().to);
}

async function academyLabel(ownerId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: prof }, { data: user }] = await Promise.all([
    supabaseAdmin
      .from("dojo_academy_profile")
      .select("trade_name, legal_name")
      .eq("owner_id", ownerId)
      .maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(ownerId),
  ]);
  const name = (prof as any)?.trade_name || (prof as any)?.legal_name || "Academia sem nome";
  const email = user?.user?.email;
  return email ? `${name} (${email})` : name;
}

const CATEGORY_LABEL: Record<string, string> = {
  duvida: "Dúvida",
  solicitacao: "Solicitação",
  modulo: "Módulo",
  sugestao: "Sugestão",
  bug: "Erro / bug",
  outro: "Outro",
};

/**
 * Avisa a equipe no WhatsApp. Nunca lança: falha de WhatsApp não pode impedir
 * o cliente de abrir o chamado ou mandar mensagem. Sempre chamar com `await`.
 */
export async function notifySupportWhatsApp(args: {
  ticket: { id: string; owner_id: string; subject: string; category?: string | null; priority?: string | null };
  body: string;
  isNew: boolean;
}): Promise<void> {
  try {
    const { evolutionConfig, evolutionSendText } = await import("./evolution.server");
    if (!evolutionConfig()) return;
    const cfg = supportWhatsAppConfig();
    const code = ticketCode(args.ticket.id);
    const academy = await academyLabel(args.ticket.owner_id);
    const body = args.body.length > MAX_BODY ? `${args.body.slice(0, MAX_BODY)}…` : args.body;
    const lines = args.isNew
      ? [
          `🆘 *Novo chamado #${code}*`,
          `*Academia:* ${academy}`,
          `*Assunto:* ${args.ticket.subject}`,
          `*Tipo:* ${CATEGORY_LABEL[args.ticket.category ?? ""] ?? args.ticket.category ?? "—"} · *Prioridade:* ${args.ticket.priority ?? "normal"}`,
        ]
      : [`💬 *Nova mensagem no chamado #${code}*`, `*Academia:* ${academy}`, `*Assunto:* ${args.ticket.subject}`];
    const text = [
      ...lines,
      "",
      body,
      "",
      "_Para responder ao cliente, responda CITANDO esta mensagem._",
    ].join("\n");
    await evolutionSendText(cfg.instance, cfg.to, text);
  } catch (err: any) {
    console.warn("[support-whatsapp] aviso não enviado:", err?.message ?? err);
  }
}

/** Avisa a equipe no próprio WhatsApp (ex.: resposta sem citação). Nunca lança. */
export async function replyToSupportTeam(text: string): Promise<void> {
  try {
    const { evolutionSendText } = await import("./evolution.server");
    const cfg = supportWhatsAppConfig();
    await evolutionSendText(cfg.instance, cfg.to, text);
  } catch (err: any) {
    console.warn("[support-whatsapp] retorno à equipe não enviado:", err?.message ?? err);
  }
}

/** Usuário que assina as respostas vindas do WhatsApp (author_id é obrigatório). */
export async function supportAuthorId(): Promise<string | null> {
  const fromEnv = supportWhatsAppConfig().authorId;
  if (/^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "amt_admin" as never)
    .limit(1)
    .maybeSingle();
  return ((data as any)?.user_id as string | undefined) ?? null;
}

/** Chamado pelo código de 8 caracteres (faixa de UUIDs com esse prefixo). */
export async function findTicketByCode(code: string): Promise<{ id: string; owner_id: string; subject: string; status: string } | null> {
  if (!/^[0-9a-f]{8}$/.test(code)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("dojo_support_tickets")
    .select("id, owner_id, subject, status")
    .gte("id", `${code}-0000-0000-0000-000000000000`)
    .lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
}

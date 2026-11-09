// Respostas do suporte AMT vindas de fora do Dojo Manager (caixa de entrada do
// Control Center em amtsistemas.com.br/admin, Edge Function support-inbox).
//
// A regra do chamado fica só aqui: grava a mensagem como "support", tira o
// chamado de "aberto" e avisa o dono por push. O contador unread_by_client e o
// last_message_at são atualizados pelo trigger dojo_support_touch_ticket.

export const SUPPORT_TICKET_STATUSES = ["aberto", "em_atendimento", "resolvido", "fechado"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

type TicketRow = { id: string; owner_id: string; subject: string; status: string };

/** Código curto do chamado (exibido para o cliente e no AMT Sistemas): 8 primeiros caracteres do UUID. */
export function ticketCode(ticketId: string): string {
  return ticketId.slice(0, 8).toLowerCase();
}

async function db(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Chamado pelo id completo ou pelo código de 8 caracteres. */
export async function findTicket(ref: { ticketId?: string; code?: string }): Promise<TicketRow | null> {
  const sb = await db();
  const cols = "id, owner_id, subject, status";
  if (ref.ticketId) {
    const { data } = await sb.from("dojo_support_tickets").select(cols).eq("id", ref.ticketId).maybeSingle();
    return data ?? null;
  }
  const code = String(ref.code ?? "").replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(code)) return null;
  const { data } = await sb
    .from("dojo_support_tickets")
    .select(cols)
    .gte("id", `${code}-0000-0000-0000-000000000000`)
    .lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Usuário que assina as respostas (author_id é obrigatório): SUPPORT_AUTHOR_ID ou o primeiro amt_admin. */
async function supportAuthorId(): Promise<string | null> {
  const fromEnv = (process.env.SUPPORT_AUTHOR_ID ?? "").trim();
  if (/^[0-9a-f-]{36}$/i.test(fromEnv)) return fromEnv;
  const sb = await db();
  const { data } = await sb.from("user_roles").select("user_id").eq("role", "amt_admin").limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

export async function recordSupportReply(args: {
  ticket: TicketRow;
  body: string;
  status?: SupportTicketStatus;
}): Promise<{ messageId: string; status: string }> {
  const authorId = await supportAuthorId();
  if (!authorId) throw new Error("Nenhum usuário de suporte para assinar a resposta (SUPPORT_AUTHOR_ID / amt_admin).");
  const sb = await db();
  const { data: msg, error } = await sb
    .from("dojo_support_messages")
    .insert({ ticket_id: args.ticket.id, author_id: authorId, author_role: "support", body: args.body })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const nextStatus = args.status ?? (args.ticket.status === "aberto" ? "em_atendimento" : args.ticket.status);
  if (nextStatus !== args.ticket.status) {
    await sb.from("dojo_support_tickets").update({ status: nextStatus }).eq("id", args.ticket.id);
  }

  await notifyOwnerSupportReply(args.ticket, args.body);
  if (nextStatus !== args.ticket.status && (nextStatus === "resolvido" || nextStatus === "fechado")) {
    await notifyOwnerSupportStatus(args.ticket, nextStatus);
  }

  return { messageId: msg.id as string, status: nextStatus };
}

/**
 * Push para o dono quando o suporte AMT responde um chamado (categoria
 * "support" das notificações do painel). Vale para todo caminho de resposta:
 * caixa do AMT Sistemas / Control Center (support-reply) e resposta dada dentro
 * do próprio Dojo Manager por um admin AMT. Nunca lança.
 */
export async function notifyOwnerSupportReply(
  ticket: { id: string; owner_id: string; subject: string },
  body: string,
): Promise<void> {
  const { sendPushToDojoOwner } = await import("@/lib/push/dojo-owner-push.server");
  await sendPushToDojoOwner(ticket.owner_id, "support", {
    title: "Suporte AMT respondeu seu chamado",
    body: `${ticket.subject}: ${body.slice(0, 120)}`,
    url: "/dojo/app/support",
    tag: `support-${ticket.id}`,
  });
}

/** Push quando o suporte AMT conclui o chamado (resolvido/fechado). Nunca lança. */
export async function notifyOwnerSupportStatus(
  ticket: { id: string; owner_id: string; subject: string },
  status: "resolvido" | "fechado",
): Promise<void> {
  const { sendPushToDojoOwner } = await import("@/lib/push/dojo-owner-push.server");
  await sendPushToDojoOwner(ticket.owner_id, "support", {
    title: status === "resolvido" ? "Chamado resolvido pelo suporte AMT" : "Chamado encerrado pelo suporte AMT",
    body: ticket.subject,
    url: "/dojo/app/support",
    tag: `support-${ticket.id}`,
  });
}

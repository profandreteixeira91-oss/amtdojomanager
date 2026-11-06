// Webhook da instância de WhatsApp do suporte AMT (Evolution API).
//
// A equipe responde, no número SUPPORT_WHATSAPP_TO, CITANDO o aviso do
// chamado; a resposta vira mensagem do suporte no chamado (o cliente vê em
// /dojo/app/support e recebe push).
//
// Segurança: segredo próprio (header x-amt-webhook-secret ou ?secret=) e só
// aceita mensagens vindas do número da equipe — qualquer outra pessoa que
// escreva para o número do suporte é ignorada.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function textOf(message: any): string {
  return String(
    message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
      message?.ephemeralMessage?.message?.conversation ??
      "",
  ).trim();
}

/** Texto da mensagem citada (a resposta "deslizando" no WhatsApp). */
function quotedTextOf(msg: any): string {
  const ctx =
    msg?.message?.extendedTextMessage?.contextInfo ??
    msg?.message?.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ??
    msg?.contextInfo ??
    null;
  return textOf(ctx?.quotedMessage);
}

/** Telefone de quem mandou (ignora grupos e ids @lid sem número). */
function senderPhone(data: any): string | null {
  const key = data?.key ?? {};
  const candidates = [key.remoteJid, key.senderPn, key.remoteJidAlt, key.participantAlt, data?.sender];
  for (const c of candidates) {
    const v = String(c ?? "");
    if (v.endsWith("@s.whatsapp.net")) return v.split("@")[0];
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/support-whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          supportWhatsAppConfig,
          isSupportTeamNumber,
          findTicketCode,
          findTicketByCode,
          supportAuthorId,
          replyToSupportTeam,
        } = await import("@/lib/whatsapp/support-whatsapp.server");
        const cfg = supportWhatsAppConfig();
        const provided =
          request.headers.get("x-amt-webhook-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
        if (!cfg.webhookSecret || !provided || !sameSecret(provided, cfg.webhookSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const instanceName = String(body?.instance?.instanceName ?? body?.instance ?? "").trim();
        if (instanceName && instanceName !== cfg.instance) {
          return Response.json({ ignored: true, reason: "other-instance" });
        }

        const event = String(body?.event ?? "").toLowerCase().replace(/_/g, ".");
        if (event !== "messages.upsert") return Response.json({ ignored: true, event });

        const data = body?.data ?? {};
        const msg = Array.isArray(data?.messages) ? data.messages[0] : data;
        if (msg?.key?.fromMe) return Response.json({ ignored: true, reason: "from-me" });
        if (String(msg?.key?.remoteJid ?? "").endsWith("@g.us")) {
          return Response.json({ ignored: true, reason: "group" });
        }
        const from = senderPhone(msg);
        if (!isSupportTeamNumber(from)) {
          console.warn("[support-whatsapp] mensagem de número fora da equipe ignorada", from ?? msg?.key?.remoteJid);
          return Response.json({ ignored: true, reason: "not-support-team" });
        }

        const reply = textOf(msg?.message);
        const code = findTicketCode(quotedTextOf(msg)) ?? findTicketCode(reply);
        if (!code) {
          await replyToSupportTeam(
            "⚠️ Não identifiquei o chamado. Para responder ao cliente, *responda citando* (deslize para o lado) a mensagem do chamado.",
          );
          return Response.json({ ignored: true, reason: "no-ticket-code" });
        }
        if (!reply) {
          await replyToSupportTeam(`⚠️ Chamado #${code}: por enquanto só respostas em texto chegam ao cliente.`);
          return Response.json({ ignored: true, reason: "no-text" });
        }
        const ticket = await findTicketByCode(code);
        if (!ticket) {
          await replyToSupportTeam(`⚠️ Chamado #${code} não encontrado. A resposta não foi enviada.`);
          return Response.json({ ignored: true, reason: "ticket-not-found" });
        }
        const authorId = await supportAuthorId();
        if (!authorId) {
          console.error("[support-whatsapp] sem SUPPORT_WHATSAPP_AUTHOR_ID e nenhum amt_admin encontrado");
          await replyToSupportTeam(`⚠️ Chamado #${code}: resposta não registrada (configuração do suporte incompleta).`);
          return Response.json({ ok: false, reason: "no-author" }, { status: 500 });
        }

        // Tira o código do texto, se a equipe o digitou na própria resposta.
        const clean = reply.replace(new RegExp(`#${code}\\b`, "ig"), "").trim() || reply;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("dojo_support_messages").insert({
          ticket_id: ticket.id,
          author_id: authorId,
          author_role: "support",
          body: clean.slice(0, 4000),
        } as never);
        if (error) {
          console.error("[support-whatsapp] falha ao gravar resposta", ticket.id, error.message);
          await replyToSupportTeam(`⚠️ Chamado #${code}: falha ao registrar a resposta. Tente de novo.`);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (ticket.status === "aberto") {
          await supabaseAdmin
            .from("dojo_support_tickets")
            .update({ status: "em_atendimento" } as never)
            .eq("id", ticket.id);
        }

        const { sendPushToDojoOwner } = await import("@/lib/push/dojo-owner-push.server");
        await sendPushToDojoOwner(ticket.owner_id, "support", {
          title: "Suporte AMT respondeu",
          body: `${ticket.subject}: ${clean.slice(0, 120)}`,
          url: "/dojo/app/support",
          tag: `support-${ticket.id}`,
        });

        return Response.json({ ok: true, ticket: ticket.id });
      },
    },
  },
});

// Resposta do suporte AMT a um chamado, enviada pela caixa de entrada do
// Control Center (amtsistemas.com.br/admin → Edge Function support-inbox).
//
// POST, header x-amt-webhook-secret = SUPPORT_WHATSAPP_WEBHOOK_SECRET
// Corpo: { ticket_id?: uuid, code?: "a1b2c3d4", body: string, status?: aberto|em_atendimento|resolvido|fechado }
// Efeitos: mensagem do suporte no chamado (o cliente vê em /dojo/app/support),
// unread_by_client +1 e last_message_at (trigger), "aberto" → "em_atendimento"
// (ou o status enviado) e push "Suporte AMT respondeu" para o dono.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const Body = z
  .object({
    ticket_id: z.string().uuid().optional(),
    code: z.string().trim().regex(/^#?[0-9a-fA-F]{8}$/).optional(),
    body: z.string().trim().min(1).max(4000),
    status: z.enum(["aberto", "em_atendimento", "resolvido", "fechado"]).optional(),
  })
  .refine((b) => b.ticket_id || b.code, { message: "Informe ticket_id ou code." });

export const Route = createFileRoute("/api/public/hooks/support-reply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env.SUPPORT_WHATSAPP_WEBHOOK_SECRET ?? "").trim();
        const provided = request.headers.get("x-amt-webhook-secret") ?? "";
        if (!secret || !provided || !sameSecret(provided, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ ok: false, error: "JSON inválido" }, { status: 400 });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Corpo inválido" }, { status: 400 });
        }

        const { findTicket, recordSupportReply, ticketCode } = await import("@/lib/dojo/support-reply.server");
        const ticket = await findTicket({ ticketId: parsed.data.ticket_id, code: parsed.data.code });
        if (!ticket) return Response.json({ ok: false, error: "Chamado não encontrado" }, { status: 404 });

        try {
          const result = await recordSupportReply({ ticket, body: parsed.data.body, status: parsed.data.status });
          return Response.json({
            ok: true,
            ticket_id: ticket.id,
            code: ticketCode(ticket.id),
            message_id: result.messageId,
            status: result.status,
          });
        } catch (err: any) {
          console.error("[support-reply]", ticket.id, err?.message ?? err);
          return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
        }
      },
    },
  },
});

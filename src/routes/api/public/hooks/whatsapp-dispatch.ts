// Cron — envia a fila de WhatsApp dos alunos (a cada minuto, pg_cron
// dojo-whatsapp-dispatch). Lote limitado por academia; o restante fica para
// o próximo minuto.
import { createFileRoute } from "@tanstack/react-router";
import { checkInternalHookAuth } from "@/lib/security/hook-auth";

export const Route = createFileRoute("/api/public/hooks/whatsapp-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkInternalHookAuth(request);
        if (denied) return denied;
        try {
          const { dispatchWhatsAppOutbox } = await import("@/lib/whatsapp/dojo-whatsapp.server");
          const result = await dispatchWhatsAppOutbox();
          return Response.json({ ok: true, ...result });
        } catch (err: any) {
          console.error("[whatsapp-dispatch]", err?.message ?? err);
          return Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
        }
      },
    },
  },
});

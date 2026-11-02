// Webhook da Evolution API (uma instância de WhatsApp por academia).
//
// Autenticação própria: cada instância tem um segredo aleatório, enviado
// pela Evolution no header x-amt-webhook-secret (v2) ou na query ?secret=.
// Eventos tratados:
// - connection.update: mantém o status da conexão no painel;
// - messages.upsert: resposta SAIR/PARAR desliga o WhatsApp do aluno (ou do
//   responsável); VOLTAR religa.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const OPT_OUT = new Set(["SAIR", "PARAR", "STOP", "CANCELAR", "DESCADASTRAR"]);
const OPT_IN = new Set(["VOLTAR", "ATIVAR", "RECEBER"]);

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
      "",
  );
}

/** Telefone de quem mandou a mensagem (ignora grupos e ids @lid sem número). */
function senderPhone(data: any): string | null {
  const key = data?.key ?? {};
  const candidates = [key.remoteJid, key.senderPn, key.remoteJidAlt, key.participantAlt, data?.sender];
  for (const c of candidates) {
    const v = String(c ?? "");
    if (v.endsWith("@s.whatsapp.net")) return v.split("@")[0];
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/evolution")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const instanceName = String(body?.instance?.instanceName ?? body?.instance ?? "").trim();
        if (!instanceName) return new Response("Missing instance", { status: 400 });

        const { adminDb, INSTANCES_TABLE, phoneKey } = await import("@/lib/whatsapp/dojo-whatsapp.server");
        const db = await adminDb();
        const { data: inst } = await db
          .from(INSTANCES_TABLE)
          .select("owner_id, instance_name, webhook_secret, status")
          .eq("instance_name", instanceName)
          .maybeSingle();
        const provided =
          request.headers.get("x-amt-webhook-secret") ?? new URL(request.url).searchParams.get("secret") ?? "";
        if (!inst || !provided || !sameSecret(provided, String(inst.webhook_secret))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const event = String(body?.event ?? "").toLowerCase().replace(/_/g, ".");
        const data = body?.data ?? {};

        if (event === "connection.update") {
          const state = String(data?.state ?? "").toLowerCase();
          const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
          const patch: Record<string, unknown> = { status, last_status_at: new Date().toISOString() };
          if (status === "connected") {
            patch.connected_at = new Date().toISOString();
            const jid = String(data?.wuid ?? body?.sender ?? "");
            const number = jid.split("@")[0].replace(/\D/g, "");
            if (number) patch.phone_number = number;
            if (data?.profileName) patch.profile_name = String(data.profileName);
          }
          await db.from(INSTANCES_TABLE).update(patch).eq("owner_id", inst.owner_id);
          return Response.json({ ok: true, status });
        }

        if (event === "messages.upsert") {
          const msg = Array.isArray(data?.messages) ? data.messages[0] : data;
          if (msg?.key?.fromMe) return Response.json({ ignored: true });
          const word = textOf(msg?.message).trim().toUpperCase().replace(/[^A-Z]/g, "");
          const optOut = OPT_OUT.has(word);
          const optIn = OPT_IN.has(word);
          if (!optOut && !optIn) return Response.json({ ignored: true });
          const from = senderPhone(msg);
          const key = phoneKey(from);
          if (!from || !key) return Response.json({ ignored: true, reason: "no-phone" });

          const { data: students } = await db
            .from("dojo_students")
            .select("id, phone, guardian_phone")
            .eq("owner_id", inst.owner_id);
          const ids = ((students ?? []) as any[])
            .filter((s) => phoneKey(s.phone) === key || phoneKey(s.guardian_phone) === key)
            .map((s) => s.id as string);
          if (ids.length) {
            await db.from("dojo_students").update({ whatsapp_opt_out: optOut }).in("id", ids);
            if (optOut) {
              // tira da fila o que ainda não saiu para esse número
              await db
                .from("dojo_whatsapp_outbox")
                .update({ status: "skipped", last_error: "Aluno respondeu SAIR" })
                .eq("owner_id", inst.owner_id)
                .in("student_id", ids)
                .eq("status", "pending");
            }
          }
          try {
            const { evolutionSendText } = await import("@/lib/whatsapp/evolution.server");
            await evolutionSendText(
              instanceName,
              from,
              optOut
                ? "Pronto! Você não vai mais receber as notificações da academia por WhatsApp. Para voltar a receber, responda VOLTAR."
                : "Pronto! Você voltou a receber as notificações da academia por WhatsApp.",
            );
          } catch (err: any) {
            console.warn("[evolution-webhook] confirmação não enviada:", err?.message ?? err);
          }
          return Response.json({ ok: true, students: ids.length, optOut });
        }

        return Response.json({ ignored: true, event });
      },
    },
  },
});

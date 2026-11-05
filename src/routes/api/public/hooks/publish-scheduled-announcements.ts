import { createFileRoute } from "@tanstack/react-router";
import { checkInternalHookAuth } from "@/lib/security/hook-auth";
import { notifyStudentsForAnnouncement } from "@/lib/dojo/announcements.functions";

// Cron executado a cada minuto para publicar avisos agendados no horário definido.
export const Route = createFileRoute("/api/public/hooks/publish-scheduled-announcements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkInternalHookAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: due, error } = await (supabaseAdmin as any)
          .from("dojo_announcements")
          .select("*")
          .eq("status", "scheduled")
          .lte("publish_at", now)
          .order("publish_at", { ascending: true })
          .limit(100);

        if (error) return Response.json({ error: error.message }, { status: 500 });

        let published = 0;
        let archived = 0;
        let notificationsAttempted = 0;

        for (const announcement of due ?? []) {
          try {
            if (announcement.expires_at && announcement.expires_at <= now) {
              const { error: archiveError } = await (supabaseAdmin as any)
                .from("dojo_announcements")
                .update({ status: "archived" })
                .eq("id", announcement.id)
                .eq("status", "scheduled");
              if (archiveError) throw archiveError;
              archived++;
              continue;
            }

            // A transição condicional evita publicação/notificação duplicada
            // quando duas execuções do cron coincidem.
            const { data: row, error: publishError } = await (supabaseAdmin as any)
              .from("dojo_announcements")
              .update({ status: "published" })
              .eq("id", announcement.id)
              .eq("status", "scheduled")
              .select("*")
              .maybeSingle();

            if (publishError) throw publishError;
            if (!row) continue;

            published++;
            if (row.send_notification) {
              await notifyStudentsForAnnouncement(supabaseAdmin, row.owner_id, row);
              notificationsAttempted++;
            }
          } catch (err: any) {
            console.error("[publish-scheduled-announcements] falha", announcement.id, err?.message ?? err);
          }
        }

        return Response.json({
          ok: true,
          checked: due?.length ?? 0,
          published,
          archived,
          notificationsAttempted,
          at: now,
        });
      },
    },
  },
});

// Cron — dispara lembretes de aulas para o app do aluno.
// Roda a cada 5 minutos (pg_cron → dojo_hook_post) e, para cada antecedência
// configurada (em minutos), procura as aulas de hoje que começam dentro da
// janela de ±TOLERANCE minutos.
//
// Regras:
// - academia sem linha em dojo_student_notification_prefs usa os padrões
//   (categoria ligada, antecedências [60, 15]) — é o que a tela de
//   configuração mostra e o que push.server.ts documenta;
// - idempotência por "reserva antes do envio": a linha em
//   dojo_class_reminders_sent (índice único) é inserida ANTES do push, com
//   ON CONFLICT DO NOTHING; só quem foi reservado nesta execução recebe. Duas
//   execuções simultâneas (ou janelas sobrepostas) nunca mandam o mesmo
//   lembrete duas vezes;
// - consultas em lote por aula: o Worker tem limite de subrequisições.
import { createFileRoute } from "@tanstack/react-router";
import { checkInternalHookAuth } from "@/lib/security/hook-auth";
import { DEFAULT_NOTIFICATION_EXTRAS } from "@/lib/student-app/notification-prefs.functions";

// Não existe fuso por academia no banco (dojo_checkin_settings não tem
// coluna de timezone); todas as academias seguem o horário de Brasília.
const TIMEZONE = "America/Sao_Paulo";
const TOLERANCE = 3;
const DEFAULT_OFFSETS = DEFAULT_NOTIFICATION_EXTRAS.class_reminder_offsets_min;
const INELIGIBLE_STATUS = new Set(["frozen", "cancelled", "inactive"]);

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {} as Record<string, string>);
  const hour = parts.hour === "24" ? 0 : parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const weekday = WEEKDAY_MAP[parts.weekday] ?? 0;
  const dateISO = `${parts.year}-${parts.month}-${parts.day}`;
  return { weekday, minuteOfDay: hour * 60 + minute, dateISO };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
}

/** Antecedências do dono; lista vazia = lembrete de aula desligado. */
function ownerOffsets(row: { categories?: unknown; extras?: unknown }): number[] {
  const categories = (row.categories ?? {}) as Record<string, unknown>;
  if (categories.class_reminder === false) return [];
  const extras = (row.extras ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(extras.class_reminder_offsets_min)
    ? (extras.class_reminder_offsets_min as unknown[])
    : DEFAULT_OFFSETS;
  return raw
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 720);
}

export const Route = createFileRoute("/api/public/hooks/send-class-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkInternalHookAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPushToStudents } = await import("@/lib/push/push.server");
        const db = supabaseAdmin as any;

        const { data: prefsRows, error: prefsErr } = await db
          .from("dojo_student_notification_prefs")
          .select("owner_id, categories, extras");
        if (prefsErr) {
          return Response.json({ ok: false, error: prefsErr.message }, { status: 500 });
        }

        const offsetsByOwner = new Map<string, number[]>();
        const candidateOffsets = new Set<number>(DEFAULT_OFFSETS);
        for (const row of prefsRows ?? []) {
          const offs = ownerOffsets(row);
          offsetsByOwner.set(row.owner_id, offs);
          offs.forEach((o) => candidateOffsets.add(o));
        }

        const { weekday, minuteOfDay, dateISO } = localParts(new Date(), TIMEZONE);
        let scanned = 0;
        let sent = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const off of candidateOffsets) {
          // Aulas cujo início cai em [agora + off ± TOLERANCE], no dia de hoje.
          const from = Math.max(0, minuteOfDay + off - TOLERANCE);
          const to = Math.min(24 * 60 - 1, minuteOfDay + off + TOLERANCE);
          if (from > to) continue;

          const { data: schedules, error: schedErr } = await db
            .from("dojo_class_schedules")
            .select("owner_id, class_id, start_time, dojo_classes!inner(name, status)")
            .eq("weekday", weekday)
            .gte("start_time", minutesToTime(from))
            .lte("start_time", minutesToTime(to));
          if (schedErr) {
            errors.push(`schedules(${off}): ${schedErr.message}`);
            continue;
          }

          for (const s of schedules ?? []) {
            const offsets = offsetsByOwner.get(s.owner_id) ?? DEFAULT_OFFSETS;
            if (!offsets.includes(off)) continue;
            const cls = s.dojo_classes as { name?: string; status?: string } | null;
            if (cls?.status && cls.status !== "active") continue;
            scanned++;

            const { data: enrolls } = await db
              .from("dojo_class_students")
              .select("student_id")
              .eq("class_id", s.class_id)
              .eq("status", "active");
            const studentIds = Array.from(
              new Set((enrolls ?? []).map((e: any) => e.student_id).filter(Boolean)),
            ) as string[];
            if (studentIds.length === 0) continue;

            const { data: students } = await db
              .from("dojo_students")
              .select("id, status, cancelled_at")
              .in("id", studentIds);
            const eligible: string[] = (students ?? [])
              .filter((st: any) => !st.cancelled_at && !INELIGIBLE_STATUS.has(st.status))
              .map((st: any) => st.id as string);
            if (eligible.length === 0) continue;

            const startTime = String(s.start_time);
            const { data: claimed, error: claimErr } = await db
              .from("dojo_class_reminders_sent")
              .upsert(
                eligible.map((studentId) => ({
                  owner_id: s.owner_id,
                  student_id: studentId,
                  class_id: s.class_id,
                  occurrence_date: dateISO,
                  occurrence_start_time: startTime,
                  offset_minutes: off,
                })),
                {
                  onConflict: "student_id,class_id,occurrence_date,occurrence_start_time,offset_minutes",
                  ignoreDuplicates: true,
                },
              )
              .select("student_id");
            if (claimErr) {
              errors.push(`claim(${s.class_id}): ${claimErr.message}`);
              continue;
            }
            const claimedIds = (claimed ?? []).map((c: any) => c.student_id as string);
            skipped += eligible.length - claimedIds.length;
            if (claimedIds.length === 0) continue;

            const startMin = timeToMinutes(startTime);
            const hhmm = minutesToTime(startMin).slice(0, 5);
            const className = cls?.name ?? "Aula";
            const result = await sendPushToStudents(
              claimedIds,
              {
                title: "Lembrete de aula",
                body: off === 0
                  ? `${className} começa agora (${hhmm})`
                  : `${className} começa em ${off} min · ${hhmm}`,
                url: "/app/schedule",
                tag: `class-${s.class_id}-${dateISO}-${off}`,
                data: { classId: s.class_id, date: dateISO, startTime, offsetMinutes: off },
              },
              "class_reminder",
            );
            sent += result.sent;
            failed += result.failed;
          }
        }

        if (errors.length) console.warn("[send-class-reminders]", errors);
        return Response.json({ ok: errors.length === 0, scanned, sent, skipped, failed, errors });
      },
    },
  },
});

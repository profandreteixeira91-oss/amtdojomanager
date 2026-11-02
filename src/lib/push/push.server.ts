// Push para alunos (app do aluno), sobre o núcleo único de envio.
//
// Regras: cada academia liga/desliga categorias em
// dojo_student_notification_prefs (sem linha ou categoria ausente = ligada);
// o aparelho recebe pelo aluno inscrito em dojo_push_subscriptions.
// A mesma notificação entra na fila de WhatsApp da academia (quando o dono
// conectou o WhatsApp) — ver src/lib/whatsapp/dojo-whatsapp.server.ts.

import {
  deliverPush,
  EMPTY_DELIVERY,
  type PushDeliveryResult,
  type PushPayload,
} from "./push-core.server";

export type StudentNotificationCategory =
  | "class_reminder"
  | "invoice_due_soon"
  | "invoice_overdue"
  | "payment_received"
  | "announcement"
  | "graduation"
  | "new_video"
  | "evaluation"
  | "attendance_confirmed"
  | "contract"
  | "competition"
  | "plan_change"
  | "schedule_change";

/** Alunos cuja academia não desligou a categoria. */
async function filterByAcademyPrefs(
  studentIds: string[],
  category: StudentNotificationCategory | undefined,
): Promise<string[]> {
  if (!category || studentIds.length === 0) return studentIds;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: students, error } = await supabaseAdmin
    .from("dojo_students")
    .select("id, owner_id")
    .in("id", studentIds);
  if (error) {
    console.warn("[push:student] falha ao ler alunos, seguindo com envio:", error.message);
    return studentIds;
  }
  const ownerIds = Array.from(new Set((students ?? []).map((s: any) => s.owner_id as string)));
  if (ownerIds.length === 0) return studentIds;
  const { data: prefs, error: prefsErr } = await supabaseAdmin
    .from("dojo_student_notification_prefs")
    .select("owner_id, categories")
    .in("owner_id", ownerIds);
  if (prefsErr) {
    console.warn("[push:student] falha ao ler preferências, seguindo com envio:", prefsErr.message);
    return studentIds;
  }
  const disabledOwners = new Set(
    (prefs ?? [])
      .filter((p: any) => (p.categories as Record<string, boolean> | null)?.[category] === false)
      .map((p: any) => p.owner_id as string),
  );
  if (disabledOwners.size === 0) return studentIds;
  const ownerOf = new Map((students ?? []).map((s: any) => [s.id as string, s.owner_id as string]));
  return studentIds.filter((id) => !disabledOwners.has(ownerOf.get(id) ?? ""));
}

/** Envia o mesmo push a vários alunos (avisos, mudança de grade…). */
export async function sendPushToStudents(
  studentIds: Array<string | null | undefined>,
  payload: PushPayload,
  category?: StudentNotificationCategory,
): Promise<PushDeliveryResult> {
  try {
    const unique = Array.from(new Set(studentIds.filter((id): id is string => !!id)));
    const allowed = await filterByAcademyPrefs(unique, category);
    if (allowed.length === 0) return { ...EMPTY_DELIVERY };

    const { enqueueStudentWhatsApp } = await import("@/lib/whatsapp/dojo-whatsapp.server");
    await enqueueStudentWhatsApp(allowed, payload, category);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error } = await supabaseAdmin
      .from("dojo_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("student_id", allowed);
    if (error) {
      console.error("[push:student] falha ao buscar inscrições:", error.message);
      return { ...EMPTY_DELIVERY };
    }
    return await deliverPush("dojo_push_subscriptions", (subs ?? []) as any[], payload);
  } catch (err: any) {
    console.warn("[push:student] envio falhou:", err?.message ?? err);
    return { ...EMPTY_DELIVERY };
  }
}

export async function sendPushToStudent(
  studentId: string | null | undefined,
  payload: PushPayload,
  category?: StudentNotificationCategory,
): Promise<PushDeliveryResult> {
  return sendPushToStudents([studentId], payload, category);
}

/**
 * Notifica o aluno sem nunca quebrar o fluxo de quem chama. Sempre com
 * `await`: no Worker, envio solto é cortado quando a resposta sai.
 */
export async function safeNotifyStudent(
  studentId: string | null | undefined,
  payload: PushPayload,
  category?: StudentNotificationCategory,
): Promise<void> {
  await sendPushToStudents([studentId], payload, category);
}

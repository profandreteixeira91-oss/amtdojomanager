// Push para os administradores AMT (papel amt_admin), sobre o núcleo único de envio.
// Regra: cada admin desliga eventos em store_admin_notification_prefs
// (sem linha = ligado).
import {
  deliverPush,
  EMPTY_DELIVERY,
  type PushDeliveryResult,
  type PushPayload,
} from "./push-core.server";

export type AdminPushPayload = PushPayload;

/** Envia a todos os admins AMT inscritos que não desligaram o evento. Nunca lança. */
export async function sendPushToAmtAdmins(
  payload: AdminPushPayload,
  event?: string,
): Promise<PushDeliveryResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "amt_admin");
    const adminIds = (admins ?? []).map((r: any) => r.user_id as string).filter(Boolean);
    if (adminIds.length === 0) return { ...EMPTY_DELIVERY };

    let allowed = adminIds;
    if (event) {
      const { data: prefs } = await supabaseAdmin
        .from("store_admin_notification_prefs")
        .select("user_id, enabled")
        .eq("event", event)
        .in("user_id", adminIds);
      const disabled = new Set(
        (prefs ?? []).filter((p: any) => p.enabled === false).map((p: any) => p.user_id as string),
      );
      allowed = adminIds.filter((id) => !disabled.has(id));
    }
    if (allowed.length === 0) return { ...EMPTY_DELIVERY };

    const { data: subs } = await supabaseAdmin
      .from("store_admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", allowed);
    return await deliverPush("store_admin_push_subscriptions", (subs ?? []) as any[], payload);
  } catch (err: any) {
    console.warn("[push:admin] envio falhou:", err?.message ?? err);
    return { ...EMPTY_DELIVERY };
  }
}

/** Envia só aos aparelhos de um usuário (teste de notificação). Nunca lança. */
export async function sendPushToUser(
  userId: string,
  payload: AdminPushPayload,
): Promise<PushDeliveryResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("store_admin_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    return await deliverPush("store_admin_push_subscriptions", (subs ?? []) as any[], payload);
  } catch (err: any) {
    console.warn("[push:admin] envio falhou:", err?.message ?? err);
    return { ...EMPTY_DELIVERY };
  }
}

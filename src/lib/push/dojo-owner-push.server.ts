// Push para o dono do dojo (painel Dojo Manager), sobre o núcleo único de envio.
// Regra: cada aparelho do dono escolhe as categorias que recebe
// (dojo_owner_push_subscriptions.categories; ausente = ligada).
import type { OwnerPushCategory } from "@/lib/dojo/owner-push.functions";
import {
  deliverPush,
  EMPTY_DELIVERY,
  type PushDeliveryResult,
  type PushPayload,
} from "./push-core.server";

export type DojoOwnerPushPayload = PushPayload;

/** Nunca lança; sempre chamar com `await`. */
export async function sendPushToDojoOwner(
  userId: string,
  category: OwnerPushCategory,
  payload: DojoOwnerPushPayload,
): Promise<PushDeliveryResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error } = await supabaseAdmin
      .from("dojo_owner_push_subscriptions")
      .select("id, endpoint, p256dh, auth, categories")
      .eq("user_id", userId);
    if (error) {
      console.error("[push:owner] falha ao buscar inscrições:", error.message);
      return { ...EMPTY_DELIVERY };
    }
    const enabled = (subs ?? []).filter((s: any) => {
      const cats = (s.categories ?? {}) as Record<string, boolean | undefined>;
      return cats[category] !== false;
    });
    return await deliverPush("dojo_owner_push_subscriptions", enabled as any[], payload);
  } catch (err: any) {
    console.warn("[push:owner] envio falhou:", err?.message ?? err);
    return { ...EMPTY_DELIVERY };
  }
}

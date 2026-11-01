import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Ctx = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
};

/**
 * Dono efetivo dos dados do painel: o próprio usuário quando é dono de academia;
 * num login de equipe (Usuários do Sistema), o dono ao qual ele está vinculado.
 * Mesma regra de getMyTeamPermissions.
 *
 * Use para filtrar leituras do painel por academia além da RLS (unidades,
 * planos, faixas, modelos de certificado), para que nenhum login veja dados
 * de outra academia mesmo que uma policy fique mais permissiva.
 */
export async function resolveDojoOwnerId(context: Ctx): Promise<string> {
  const [{ data: ownerProfile }, { data: rows }] = await Promise.all([
    context.supabase
      .from("dojo_academy_profile")
      .select("owner_id")
      .eq("owner_id", context.userId)
      .maybeSingle(),
    context.supabase.rpc("dojo_my_team_permissions"),
  ]);
  if (ownerProfile) return context.userId;
  const row = Array.isArray(rows) ? rows[0] : null;
  return (row?.owner_id as string | undefined) ?? context.userId;
}

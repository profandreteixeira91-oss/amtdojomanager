import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Ctx = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
};

export type DojoTeamLink = {
  member_id: string;
  owner_id: string;
  role: string;
  full_name: string;
  permissions: Record<string, unknown> | null;
};

export type DojoIdentity =
  | { isOwner: true; ownerId: string; member: null }
  | { isOwner: false; ownerId: string; member: DojoTeamLink };

/**
 * Quem está logado no painel do Dojo:
 * - dono: tem perfil de academia ou identidade `owner` em dojo_users — sempre
 *   acesso total, mesmo que o e-mail também esteja na equipe de outro dojo;
 * - equipe: vínculo ATIVO em dojo_team_members — permissões do dono pai;
 * - sem nenhum dos dois: conta própria (ex.: novo cadastro em trial) = dono.
 */
export async function resolveDojoIdentity(context: Ctx): Promise<DojoIdentity> {
  const [{ data: ownerProfile }, { data: ownerIdentity }, { data: links }] = await Promise.all([
    context.supabase
      .from("dojo_academy_profile")
      .select("owner_id")
      .eq("owner_id", context.userId)
      .maybeSingle(),
    context.supabase
      .from("dojo_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .eq("owner_id", context.userId)
      .eq("role", "owner")
      .limit(1),
    context.supabase
      .from("dojo_team_members")
      .select("id, owner_id, role, full_name, permissions")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  const link = Array.isArray(links) ? links[0] : null;
  if (ownerProfile || (ownerIdentity?.length ?? 0) > 0 || !link || link.owner_id === context.userId) {
    return { isOwner: true, ownerId: context.userId, member: null };
  }
  return {
    isOwner: false,
    ownerId: link.owner_id as string,
    member: {
      member_id: link.id as string,
      owner_id: link.owner_id as string,
      role: String(link.role ?? ""),
      full_name: String(link.full_name ?? ""),
      permissions: (link.permissions ?? null) as Record<string, unknown> | null,
    },
  };
}

/**
 * Dono efetivo dos dados do painel: o próprio usuário quando é dono de academia;
 * num login de equipe (Usuários do Sistema), o dono ao qual ele está vinculado.
 *
 * Use para filtrar leituras do painel por academia além da RLS (unidades,
 * planos, faixas, modelos de certificado), para que nenhum login veja dados
 * de outra academia mesmo que uma policy fique mais permissiva.
 */
export async function resolveDojoOwnerId(context: Ctx): Promise<string> {
  return (await resolveDojoIdentity(context)).ownerId;
}

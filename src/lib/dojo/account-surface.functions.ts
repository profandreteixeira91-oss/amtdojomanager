import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Para qual superfície a conta logada deve ir. Fonte ÚNICA desta decisão para o
 * login do painel (/dojo/auth) e para o gate do painel (/dojo/app).
 *
 * O Auth é compartilhado: o mesmo e-mail é UMA conta, que pode ao mesmo tempo
 * ser dona de academia, colaboradora de outra e aluna de uma terceira (inclusive
 * o dono cadastrado como aluno de teste na própria academia). Por isso a ordem
 * de precedência é fixa:
 *
 *   1. owner   — perfil de academia ou identidade `owner` ativa em dojo_users.
 *                Sempre vai ao painel, mesmo que também seja aluno ou equipe.
 *   2. staff   — conta ativa em dojo_staff_accounts → Portal da Equipe.
 *   3. student — matrícula vinculada (dojo_students.user_id) ou student_accounts
 *                → App do Aluno; nunca entra no painel.
 *   4. new     — nenhum vínculo: conta própria nova, segue como dono (trial).
 *
 * A identidade vem SEMPRE do user_id do token, nunca do e-mail: um e-mail
 * coincidente em dojo_students não prova que a conta é daquele aluno.
 * Lê com service role para não depender das policies de cada tabela.
 */
export type AccountSurface = "owner" | "staff" | "student" | "new";

export const resolveAccountSurface = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ surface: AccountSurface }> => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profileRes, ownerRes, staffRes, studentRes, studentAccRes] = await Promise.all([
      supabaseAdmin.from("dojo_academy_profile").select("owner_id").eq("owner_id", userId).limit(1),
      supabaseAdmin
        .from("dojo_users")
        .select("id")
        .eq("auth_user_id", userId)
        .eq("owner_id", userId)
        .eq("role", "owner")
        .eq("status", "active")
        .limit(1),
      supabaseAdmin
        .from("dojo_staff_accounts")
        .select("id")
        .eq("auth_user_id", userId)
        .eq("status", "active")
        .limit(1),
      supabaseAdmin.from("dojo_students").select("id").eq("user_id", userId).limit(1),
      supabaseAdmin.from("student_accounts").select("id").eq("auth_user_id", userId).limit(1),
    ]);

    for (const res of [profileRes, ownerRes, staffRes, studentRes, studentAccRes]) {
      if (res.error) throw new Error(`Não foi possível verificar a conta: ${res.error.message}`);
    }

    const has = (res: { data: unknown[] | null }) => (res.data ?? []).length > 0;

    if (has(profileRes) || has(ownerRes)) return { surface: "owner" };
    if (has(staffRes)) return { surface: "staff" };
    if (has(studentRes) || has(studentAccRes)) return { surface: "student" };
    return { surface: "new" };
  });

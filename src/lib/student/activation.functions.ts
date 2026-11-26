import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { canStudentUseApp } from "@/lib/student-auth/status-access";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * `ilike` trata `_` e `%` como curingas: "a_b@x.com" casaria com "axb@x.com".
 * Escapa-os para a comparação ser exata (só sem diferenciar maiúsculas).
 */
function exactEmailPattern(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const EmailSchema = z.object({ email: z.string().trim().email().toLowerCase() });

/**
 * Verifica se o e-mail está cadastrado em dojo_students.
 * Retorna somente booleanos — sem PII, sem revelar em qual dojo.
 *
 * Regras multi-dojo:
 *  - "activated" = QUALQUER registro com o e-mail já possui user_id vinculado
 *    (o aluno já criou senha no Supabase Auth, único por e-mail).
 *  - "blocked" = TODOS os registros com o e-mail estão em status não elegível.
 */
export const checkStudentAccess = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmailSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("dojo_students")
      .select("id, user_id, status")
      .ilike("email", exactEmailPattern(data.email));
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) {
      return { exists: false as const, activated: false as const, blocked: false as const };
    }
    const eligible = list.filter((r) => canStudentUseApp(r.status));

    // Regra do plano: "Bloquear acesso após X dias corridos do vencimento".
    // O acesso só é liberado se ao menos uma ficha elegível não estiver bloqueada.
    let financeBlocked = false;
    if (eligible.length > 0) {
      const { evaluateFinancialBlock } = await import("@/lib/dojo/financial-block.server");
      const results = await Promise.all(
        eligible.map((r) => evaluateFinancialBlock(supabaseAdmin, r.id)),
      );
      financeBlocked = results.every((r) => r.loginBlocked);
    }

    return {
      exists: true as const,
      activated: list.some((r) => !!r.user_id),
      blocked: eligible.length === 0,
      financeBlocked,
    };
  });

const ActivateSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
});

/**
 * Primeiro acesso: cria o usuário no Auth (email/senha) e vincula ao
 * dojo_students.user_id. Um usuário Auth é único por e-mail (Supabase).
 *
 * Se o mesmo e-mail existir em mais de um dojo (pessoa realmente inscrita em
 * academias distintas), TODAS as inscrições elegíveis daquele e-mail que ainda
 * não foram vinculadas passam a apontar para o mesmo user_id — isso NÃO cruza
 * dados: as RLS em cada tabela filtram por `owner_id` do dono do dojo e por
 * `user_id`/`get_my_student_id()` do próprio aluno, e as consultas do app
 * usam `.limit(1)` sobre a linha do aluno correspondente. Cada dojo continua
 * enxergando apenas seus próprios alunos e o aluno vê apenas seu registro.
 */
export const activateStudentAccount = createServerFn({ method: "POST" })
  .validator((input: unknown) => ActivateSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error: sErr } = await supabaseAdmin
      .from("dojo_students")
      .select("id, user_id, full_name, email, owner_id, status, created_at")
      .ilike("email", exactEmailPattern(data.email))
      .order("created_at", { ascending: false });
    if (sErr) throw new Error(sErr.message);
    if (!rows || rows.length === 0) {
      throw new Error("E-mail não cadastrado. Fale com sua academia.");
    }

    const eligible = rows.filter((r) => canStudentUseApp(r.status));
    if (eligible.length === 0) {
      throw new Error("Sua matrícula está inativa. Fale com sua academia.");
    }
    if (eligible.every((r) => !!r.user_id)) {
      throw new Error("Este e-mail já criou uma senha. Faça login normalmente.");
    }

    const primary = eligible[0];

    // Cria (ou reaproveita) o usuário no Auth. E-mail é único no Supabase Auth.
    let userId: string | null = null;
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: primary.full_name, dojo_student_id: primary.id },
    });

    if (cErr || !created?.user) {
      const already = cErr?.message?.toLowerCase().includes("already");
      if (!already) throw new Error(cErr?.message ?? "Falha ao criar acesso");

      // SEGURANÇA: e-mail já possui conta no Auth. Aqui NADA é alterado: nem a
      // senha (tomaria a conta) nem o vínculo da matrícula. Ligar a matrícula a
      // uma conta existente sem a senha dela deixava qualquer pessoa transformar
      // a conta de um dono em "aluno" e trancá-lo fora do próprio painel.
      // O vínculo só acontece depois do login com a senha (linkMyStudentEnrollments).
      return { ok: false as const, existingAccount: true as const };
    } else {

      userId = created.user.id;
    }

    // Vincula user_id a todas as matrículas elegíveis com esse e-mail que
    // ainda não tinham vínculo. Não sobrescreve vínculos existentes.
    const toLinkIds = eligible.filter((r) => !r.user_id).map((r) => r.id);
    if (toLinkIds.length > 0) {
      const { error: linkErr } = await supabaseAdmin
        .from("dojo_students")
        .update({ user_id: userId })
        .in("id", toLinkIds);
      if (linkErr) throw new Error(linkErr.message);

      // CRÍTICO: Cria o student_account para estabelecer o contexto de aluno
      const studentAccounts = toLinkIds.map(sid => ({
        auth_user_id: userId,
        student_id: sid,
        email: data.email,
        first_access_at: new Date().toISOString()
      }));

      const { error: accErr } = await supabaseAdmin
        .from("student_accounts")
        .upsert(studentAccounts, { onConflict: 'auth_user_id, student_id' });
      
      if (accErr) console.error("Erro ao criar student_account:", accErr);
    }

    return { ok: true as const, existingAccount: false as const };
  });

/**
 * Depois do login com senha no App do Aluno: vincula à conta as matrículas
 * elegíveis com o mesmo e-mail que ainda não têm vínculo (ex.: aluno que já
 * tinha senha e foi matriculado em outra academia).
 *
 * Só vincula contas que NÃO são de dono nem de equipe. O e-mail de uma conta de
 * dono não é comprovado por e-mail (o cadastro é pelo WhatsApp) e o dono costuma
 * se cadastrar como aluno de teste; vincular essas contas misturava as
 * identidades e tirava o dono do painel. Dono que também treina em outra
 * academia usa outro e-mail no App do Aluno.
 */
export const linkMyStudentEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const email = String((context.claims?.email as string | undefined) ?? "").trim().toLowerCase();
    if (!email) return { linked: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profileRes, ownerRes, staffRes] = await Promise.all([
      supabaseAdmin.from("dojo_academy_profile").select("owner_id").eq("owner_id", userId).limit(1),
      supabaseAdmin
        .from("dojo_users")
        .select("id")
        .eq("auth_user_id", userId)
        .eq("role", "owner")
        .limit(1),
      supabaseAdmin.from("dojo_staff_accounts").select("id").eq("auth_user_id", userId).limit(1),
    ]);
    const isPanelAccount = [profileRes, ownerRes, staffRes].some((r) => (r.data ?? []).length > 0);
    if (isPanelAccount) return { linked: 0 };

    const { data: rows, error } = await supabaseAdmin
      .from("dojo_students")
      .select("id, user_id, status")
      .ilike("email", exactEmailPattern(email))
      .is("user_id", null);
    if (error) throw new Error(error.message);
    const toLink = (rows ?? []).filter((r) => canStudentUseApp(r.status)).map((r) => r.id);
    if (toLink.length === 0) return { linked: 0 };

    const { error: linkErr } = await supabaseAdmin
      .from("dojo_students")
      .update({ user_id: userId })
      .in("id", toLink)
      .is("user_id", null);
    if (linkErr) throw new Error(linkErr.message);

    const { error: accErr } = await supabaseAdmin.from("student_accounts").upsert(
      toLink.map((sid) => ({
        auth_user_id: userId,
        student_id: sid,
        email,
        first_access_at: new Date().toISOString(),
      })),
      { onConflict: "auth_user_id, student_id" },
    );
    if (accErr) console.error("Erro ao criar student_account:", accErr);

    return { linked: toLink.length };
  });

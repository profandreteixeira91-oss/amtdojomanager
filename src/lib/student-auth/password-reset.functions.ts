import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canStudentUseApp } from "@/lib/student-auth/status-access";
import { translateRecoveryError } from "@/lib/student-auth/recovery";
import {
  RESET_CODE_MAX_ATTEMPTS,
  RESET_CODE_TTL_MINUTES,
  RESET_METADATA_KEY,
  RESET_REQUEST_COOLDOWN_MINUTES,
  escapeIlike,
  generateResetCode,
  hashResetCode,
  isResetCodeUsable,
  normalizeResetCode,
  safeEqualHex,
  type StoredResetCode,
} from "@/lib/student-auth/password-reset";

const UUID = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "UUID inválido");
const REQUEST_METADATA_KEY = "student_pw_reset_requested_at";
const INVALID_CODE = "Código inválido ou expirado. Peça um novo código à sua academia.";

function resetSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Redefinição de senha indisponível no momento.");
  return secret;
}

/**
 * Conta de dono, equipe ou admin nunca é redefinida por aqui: o vínculo de
 * aluno é criado só pelo e-mail, então um dono mal-intencionado poderia
 * cadastrar o e-mail de outra pessoa como aluno e tomar a conta dela.
 */
async function isPrivilegedAccount(admin: any, userId: string): Promise<boolean> {
  const checks = await Promise.all([
    admin.from("dojo_academy_profile").select("owner_id").eq("owner_id", userId).limit(1),
    admin.from("dojo_students").select("id").eq("owner_id", userId).limit(1),
    admin.from("dojo_staff_accounts").select("id").eq("auth_user_id", userId).limit(1),
    admin.from("user_roles").select("id").eq("user_id", userId).neq("role", "user").limit(1),
  ]);
  return checks.some((r: any) => r.error || (r.data?.length ?? 0) > 0);
}

/** Fichas elegíveis com exatamente este e-mail (sem curingas do ilike). */
async function eligibleStudentsByEmail(admin: any, email: string) {
  const { data, error } = await admin
    .from("dojo_students")
    .select("id, owner_id, user_id, full_name, email, status, cancelled_at")
    .ilike("email", escapeIlike(email));
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).filter(
    (r) => String(r.email ?? "").trim().toLowerCase() === email && !r.cancelled_at && canStudentUseApp(r.status),
  );
}

// ============ Painel: dono gera o código ============

export const generateStudentPasswordResetCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ studentId: UUID }).parse(i))
  .handler(async ({ data, context }) => {
    // RLS: só devolve o aluno se ele pertence a quem está logado no painel.
    const { data: student, error } = await context.supabase
      .from("dojo_students")
      .select("id, owner_id, user_id, email, status, cancelled_at")
      .eq("id", data.studentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!student) throw new Error("Aluno não encontrado");
    const s = student as any;
    if (s.cancelled_at || !canStudentUseApp(s.status)) {
      throw new Error("A matrícula deste aluno não está ativa — o app fica bloqueado.");
    }
    if (!s.user_id) {
      throw new Error("Este aluno ainda não ativou o app. No primeiro acesso ele mesmo cria a senha.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: got, error: uErr } = await supabaseAdmin.auth.admin.getUserById(s.user_id);
    if (uErr || !got?.user) throw new Error("Conta de acesso do aluno não encontrada.");
    const user = got.user;

    const cadastro = String(s.email ?? "").trim().toLowerCase();
    if (!cadastro || user.email?.toLowerCase() !== cadastro) {
      throw new Error(
        "O acesso deste aluno está ligado a outro e-mail. Corrija o e-mail do acesso antes de gerar o código.",
      );
    }
    if (await isPrivilegedAccount(supabaseAdmin, user.id)) {
      throw new Error("Este e-mail também é usado por uma conta de gestão. A senha não pode ser redefinida por aqui.");
    }

    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60_000).toISOString();
    const stored: StoredResetCode = {
      hash: await hashResetCode(code, user.id, resetSecret()),
      owner_id: s.owner_id,
      expires_at: expiresAt,
      attempts: 0,
    };
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { [RESET_METADATA_KEY]: stored, [REQUEST_METADATA_KEY]: null },
    });
    if (upErr) throw new Error(upErr.message);

    return { code, expiresAt };
  });

// ============ App do aluno (sem login) ============

const EmailSchema = z.object({ email: z.string().trim().email().toLowerCase() });

/**
 * "Avisar minha academia": manda push ao dono pedindo o código. Resposta é
 * sempre genérica para não revelar se o e-mail existe.
 */
export const requestStudentPasswordReset = createServerFn({ method: "POST" })
  .validator((i: unknown) => EmailSchema.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = (await eligibleStudentsByEmail(supabaseAdmin, data.email)).filter((r) => !!r.user_id);
    const userIds = [...new Set(rows.map((r) => r.user_id as string))];
    if (userIds.length !== 1) return { ok: true as const };

    const { data: got } = await supabaseAdmin.auth.admin.getUserById(userIds[0]);
    const user = got?.user;
    if (!user) return { ok: true as const };

    const last = (user.app_metadata as any)?.[REQUEST_METADATA_KEY] as string | undefined;
    if (last && Date.now() - new Date(last).getTime() < RESET_REQUEST_COOLDOWN_MINUTES * 60_000) {
      return { ok: true as const };
    }
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: { [REQUEST_METADATA_KEY]: new Date().toISOString() },
    });

    const { sendPushToDojoOwner } = await import("@/lib/push/dojo-owner-push.server");
    for (const r of rows) {
      await sendPushToDojoOwner(r.owner_id, "system", {
        title: "Pedido de nova senha do app",
        body: `${r.full_name ?? "Um aluno"} pediu um código para redefinir a senha do app.`,
        url: `/dojo/app/students/${r.id}`,
        tag: `student-pw-reset-${r.id}`,
      });
    }
    return { ok: true as const };
  });

const RedeemSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  code: z.string().max(20),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(72),
});

/** Aluno digita o código da academia e define a nova senha. */
export const redeemStudentPasswordReset = createServerFn({ method: "POST" })
  .validator((i: unknown) => RedeemSchema.parse(i))
  .handler(async ({ data }) => {
    const code = normalizeResetCode(data.code);
    if (code.length !== 6) throw new Error(INVALID_CODE);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = (await eligibleStudentsByEmail(supabaseAdmin, data.email)).filter((r) => !!r.user_id);
    const userIds = [...new Set(rows.map((r) => r.user_id as string))];
    if (userIds.length !== 1) throw new Error(INVALID_CODE);

    const { data: got } = await supabaseAdmin.auth.admin.getUserById(userIds[0]);
    const user = got?.user;
    if (!user || user.email?.toLowerCase() !== data.email) throw new Error(INVALID_CODE);

    const stored = (user.app_metadata as any)?.[RESET_METADATA_KEY] as StoredResetCode | undefined;
    // O código só vale enquanto a academia que o gerou ainda tem este aluno ativo.
    if (!isResetCodeUsable(stored) || !rows.some((r) => r.owner_id === stored.owner_id)) {
      throw new Error(INVALID_CODE);
    }

    const hash = await hashResetCode(code, user.id, resetSecret());
    if (!safeEqualHex(hash, stored.hash)) {
      const attempts = (stored.attempts ?? 0) + 1;
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: { [RESET_METADATA_KEY]: attempts >= RESET_CODE_MAX_ATTEMPTS ? null : { ...stored, attempts } },
      });
      throw new Error(
        attempts >= RESET_CODE_MAX_ATTEMPTS
          ? "Muitas tentativas. Peça um novo código à sua academia."
          : "Código incorreto. Confira com a sua academia.",
      );
    }
    if (await isPrivilegedAccount(supabaseAdmin, user.id)) throw new Error(INVALID_CODE);

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: data.password,
      app_metadata: { [RESET_METADATA_KEY]: null, [REQUEST_METADATA_KEY]: null },
    });
    if (error) throw new Error(translateRecoveryError(error.message));

    return { ok: true as const };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isPasswordStrong } from "@/components/auth/PasswordStrength";

/**
 * Cadastro de dono do Dojo Manager SEM e-mail de confirmação.
 *
 * A confirmação de e-mail do Supabase é do projeto inteiro (vale também para a
 * loja AMT Fight Wear), então não é desligada lá: a conta do Dojo Manager é
 * criada aqui, pelo servidor, já confirmada — e o navegador entra em seguida
 * com e-mail e senha. Nenhum e-mail é enviado.
 */
export const createDojoOwnerAccount = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        email: z.string().trim().toLowerCase().email().max(254),
        password: z.string().min(8).max(72),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    if (!isPasswordStrong(data.password)) {
      throw new Error("Senha fraca: use letras maiúsculas e minúsculas, número e símbolo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Colaborador não cria conta de dono: o login dele vem do módulo Equipe.
    const { data: team } = await supabaseAdmin
      .from("dojo_team_members")
      .select("id")
      .ilike("email", data.email)
      .limit(1);
    if (team?.length) {
      throw new Error(
        "Este e-mail é de um membro de equipe. Peça ao dono do dojo para criar seu login no módulo Equipe.",
      );
    }

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name, account_type: "dojo_manager" },
    });
    if (error) {
      // Mesmo texto que o cliente já traduz ("already registered").
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

/**
 * Contas de dono criadas no fluxo antigo (signUp com confirmação por e-mail)
 * que nunca confirmaram: libera no login, para não ficarem presas. Só vale para
 * `account_type: dojo_manager` — contas da loja seguem a regra do projeto.
 * Não dá acesso sozinho: o navegador ainda precisa entrar com a senha correta.
 */
export const releasePendingDojoOwner = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(254) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let page = 1; page <= 50; page++) {
      const { data: res, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      const user = res.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
      if (user) {
        if (user.email_confirmed_at || user.user_metadata?.account_type !== "dojo_manager") {
          return { released: false as const };
        }
        const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          email_confirm: true,
        });
        if (upErr) throw new Error(upErr.message);
        return { released: true as const };
      }
      if (res.users.length < 1000) break;
    }
    return { released: false as const };
  });

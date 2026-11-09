import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { isPasswordStrong } from "@/components/auth/PasswordStrength";

/**
 * Cadastro de dono do Dojo Manager com código de confirmação por WhatsApp.
 *
 * 1. `requestDojoSignupCode`: valida os dados, aplica limites de envio e manda
 *    um código de 6 dígitos pelo WhatsApp da AMT (Evolution API).
 * 2. `verifyDojoSignupCode`: confere o código e só então cria a conta, já
 *    confirmada (sem e-mail de confirmação). O navegador entra em seguida com
 *    e-mail e senha.
 *
 * A confirmação de e-mail do Supabase é do projeto inteiro (vale também para a
 * loja AMT Fight Wear), por isso não é desligada lá: a conta do Dojo Manager é
 * criada aqui, pelo servidor. Os códigos ficam em `dojo_signup_codes` (só o
 * servidor acessa), guardados como HMAC — nunca o código em si.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_INTERVAL_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_PHONE_HOUR = 5;
const MAX_PER_EMAIL_HOUR = 5;
const MAX_PER_IP_HOUR = 15;

const signupFields = {
  name: z.string().trim().min(2, "Informe seu nome.").max(200),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
  phone: z.string().trim().min(10, "Informe o WhatsApp com DDD.").max(20),
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Celular em dígitos com DDI 55. Só celulares brasileiros (DDD + 9 dígitos). */
function normalizeMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 11) d = `55${d}`;
  if (!/^55\d{2}9\d{8}$/.test(d)) return null;
  return d;
}

function maskMobile(d: string): string {
  return `(${d.slice(2, 4)}) •••••-${d.slice(-4)}`;
}

function clientIp(): string | null {
  try {
    const h = getRequest().headers;
    return (
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      null
    );
  } catch {
    return null;
  }
}

async function hashCode(id: string, code: string): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!secret) throw new Error("Servidor sem chave para proteger os códigos.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}:${code}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Usuário do Auth pelo e-mail (a API admin não filtra por e-mail). */
async function findAuthUserByEmail(email: string) {
  const db = await admin();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const user = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function assertCanCreateOwner(email: string) {
  const db = await admin();
  // Colaborador não cria conta de dono: o login dele vem do módulo Equipe.
  const { data: team } = await db.from("dojo_team_members").select("id").ilike("email", email).limit(1);
  if (team?.length) {
    throw new Error(
      "Este e-mail é de um membro de equipe. Peça ao dono do dojo para criar seu login no módulo Equipe.",
    );
  }
  if (await findAuthUserByEmail(email)) {
    throw new Error("Este e-mail já possui conta. Use “Entrar” ou “Esqueci minha senha”.");
  }
}

/** Passo 1: envia o código pelo WhatsApp. */
export const requestDojoSignupCode = createServerFn({ method: "POST" })
  .validator((i: unknown) => z.object(signupFields).parse(i))
  .handler(async ({ data }) => {
    const phone = normalizeMobile(data.phone);
    if (!phone) throw new Error("Informe um celular brasileiro com DDD, ex.: (11) 91234-5678.");
    await assertCanCreateOwner(data.email);

    const db = await admin();
    const ip = clientIp();
    const hourAgo = new Date(Date.now() - HOUR_MS).toISOString();
    const count = async (col: "phone" | "email" | "ip", value: string) => {
      const { count: c } = await db
        .from("dojo_signup_codes")
        .select("id", { count: "exact", head: true })
        .eq(col, value)
        .gte("created_at", hourAgo);
      return c ?? 0;
    };
    const { data: last } = await db
      .from("dojo_signup_codes")
      .select("created_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_INTERVAL_MS) {
      throw new Error("Aguarde 1 minuto para pedir um novo código.");
    }
    const [byPhone, byEmail, byIp] = await Promise.all([
      count("phone", phone),
      count("email", data.email),
      ip ? count("ip", ip) : Promise.resolve(0),
    ]);
    if (byPhone >= MAX_PER_PHONE_HOUR || byEmail >= MAX_PER_EMAIL_HOUR || byIp >= MAX_PER_IP_HOUR) {
      throw new Error("Muitos códigos pedidos. Tente novamente em 1 hora.");
    }

    const id = crypto.randomUUID();
    const code = randomCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error: insErr } = await db.from("dojo_signup_codes").insert({
      id,
      phone,
      email: data.email,
      code_hash: await hashCode(id, code),
      expires_at: expiresAt,
      ip,
    });
    if (insErr) throw new Error("Não foi possível gerar o código agora. Tente novamente.");

    const instance = (
      process.env.AUTH_WHATSAPP_INSTANCE ||
      process.env.SUPPORT_WHATSAPP_INSTANCE ||
      ""
    ).trim();
    try {
      if (!instance) throw new Error("Instância de WhatsApp do cadastro não configurada.");
      const { evolutionSendText } = await import("@/lib/whatsapp/evolution.server");
      await evolutionSendText(
        instance,
        phone,
        `*AMT Dojo Manager*\n\nSeu código de confirmação é *${code}*.\n\nEle vale por 10 minutos. Não compartilhe este código com ninguém.`,
      );
    } catch (err) {
      await db.from("dojo_signup_codes").delete().eq("id", id);
      const msg = String((err as Error)?.message ?? err);
      console.error("[dojo-signup] falha ao enviar código:", msg);
      if (/exists|not.*whatsapp|jid|number/i.test(msg)) {
        throw new Error("Não encontramos WhatsApp neste número. Confira o DDD e o celular.");
      }
      throw new Error("Não foi possível enviar o código pelo WhatsApp agora. Tente novamente em instantes.");
    }

    return { codeId: id, phoneMasked: maskMobile(phone), expiresAt };
  });

/** Passo 2: confere o código e cria a conta já confirmada. */
export const verifyDojoSignupCode = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    z
      .object({
        ...signupFields,
        codeId: z.string().uuid(),
        code: z.string().trim().regex(/^\d{6}$/, "O código tem 6 números."),
        password: z.string().min(8).max(72),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    if (!isPasswordStrong(data.password)) {
      throw new Error("Senha fraca: use letras maiúsculas e minúsculas, número e símbolo.");
    }
    const phone = normalizeMobile(data.phone);
    const db = await admin();
    const { data: row } = await db.from("dojo_signup_codes").select("*").eq("id", data.codeId).maybeSingle();
    if (!row || row.consumed_at || row.email !== data.email || row.phone !== phone) {
      throw new Error("Código inválido. Peça um novo código.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("Código expirado. Peça um novo código.");
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new Error("Muitas tentativas erradas. Peça um novo código.");
    }
    if (!sameHex(await hashCode(row.id, data.code), row.code_hash)) {
      await db.from("dojo_signup_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw new Error(left > 0 ? `Código incorreto. Restam ${left} tentativa(s).` : "Código incorreto. Peça um novo código.");
    }

    // Consome antes de criar: o mesmo código não serve duas vezes.
    const { data: claimed } = await db
      .from("dojo_signup_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consumed_at", null)
      .select("id");
    if (!claimed?.length) throw new Error("Código já utilizado. Peça um novo código.");

    await assertCanCreateOwner(data.email);
    const { error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.name, account_type: "dojo_manager", whatsapp: phone },
    });
    if (error) throw new Error(error.message);
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
    const user = await findAuthUserByEmail(data.email);
    if (!user || user.email_confirmed_at || user.user_metadata?.account_type !== "dojo_manager") {
      return { released: false as const };
    }
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(user.id, { email_confirm: true });
    if (error) throw new Error(error.message);
    return { released: true as const };
  });

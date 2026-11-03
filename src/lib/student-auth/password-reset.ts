// Redefinição de senha do Portal do Aluno pelo site (sem e-mail) — funções puras.
//
// Fluxo: a academia gera no painel um código de 6 dígitos para o aluno; o aluno
// digita o código no app e cria a nova senha. O código fica no `app_metadata`
// do usuário Auth (gravável só pelo servidor) como HMAC — nunca em texto puro.

export const RESET_CODE_TTL_MINUTES = 15;
export const RESET_CODE_MAX_ATTEMPTS = 5;
export const RESET_REQUEST_COOLDOWN_MINUTES = 10;

/** Chave em `auth.users.app_metadata`. */
export const RESET_METADATA_KEY = "student_pw_reset";

export type StoredResetCode = {
  hash: string;
  owner_id: string;
  expires_at: string;
  attempts: number;
};

/** Código numérico de 6 dígitos, sem viés de módulo. */
export function generateResetCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** Mantém só os dígitos digitados (aceita "123 456", "123-456"). */
export function normalizeResetCode(input: string): string {
  return input.replace(/\D/g, "");
}

/** HMAC-SHA256(código, chave do servidor), amarrado ao usuário. */
export async function hashResetCode(code: string, userId: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${userId}:${code}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante de dois hex do mesmo tamanho. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isResetCodeUsable(stored: StoredResetCode | null | undefined, now = new Date()): stored is StoredResetCode {
  if (!stored?.hash || !stored.expires_at) return false;
  if ((stored.attempts ?? 0) >= RESET_CODE_MAX_ATTEMPTS) return false;
  return new Date(stored.expires_at).getTime() > now.getTime();
}

/** Escapa curingas do `ilike` (% _ \) para busca literal de e-mail. */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

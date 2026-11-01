// Núcleo único de envio de Web Push (VAPID), compatível com Cloudflare Workers.
//
// Regras de entrega (valem para aluno, dono e admin AMT):
// - todo envio é aguardado: no Worker, promessa solta morre quando a resposta
//   sai, então ninguém chama isto sem `await`;
// - consultas e atualizações em lote: um aviso para 120 alunos não pode virar
//   centenas de subrequisições (o Worker tem limite por requisição);
// - um push por aparelho (endpoint), mesmo que o aparelho esteja inscrito por
//   vários alunos do mesmo login;
// - inscrição expirada (404/410) é apagada; outras falhas ficam em last_error.
// Criptografia e VAPID em webpush-crypto.server.ts (padrão aes128gcm).

import { buildWebPushRequest, type VapidConfig } from "./webpush-crypto.server";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushTable =
  | "dojo_push_subscriptions"
  | "dojo_owner_push_subscriptions"
  | "store_admin_push_subscriptions";

export type PushDeliveryResult = { sent: number; failed: number; removed: number };

export const EMPTY_DELIVERY: PushDeliveryResult = { sent: 0, failed: 0, removed: 0 };

const CONCURRENCY = 8;
const SEND_TIMEOUT_MS = 10_000;
const TTL_SECONDS = 60 * 60 * 24;

/** Chave pública VAPID: segredo da hospedagem ou, na falta dele, a do build (pública). */
export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
}

function getVapidConfig(): VapidConfig {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("Chaves VAPID ausentes (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  }
  return {
    subject: process.env.VAPID_SUBJECT || "mailto:contato@amtfightwear.com.br",
    publicKey,
    privateKey,
  };
}

type SendOutcome = { ok: true } | { ok: false; expired: boolean; error: string };

async function sendOne(
  vapid: VapidConfig,
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<SendOutcome> {
  try {
    const req = await buildWebPushRequest(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      JSON.stringify(payload),
      vapid,
      TTL_SECONDS,
    );
    const res = await fetch(sub.endpoint, { ...req, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      expired: res.status === 404 || res.status === 410,
      error: `HTTP ${res.status} ${text}`.slice(0, 500),
    };
  } catch (err: any) {
    return { ok: false, expired: false, error: String(err?.message || err).slice(0, 500) };
  }
}

/**
 * Entrega um payload a um conjunto de inscrições de uma tabela e registra o
 * resultado nela. Nunca lança: falha de configuração vira `failed`.
 */
export async function deliverPush(
  table: PushTable,
  rows: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<PushDeliveryResult> {
  // Um envio por aparelho; ids das linhas repetidas recebem o mesmo resultado.
  const byEndpoint = new Map<string, { sub: PushSubscriptionRow; ids: string[] }>();
  for (const r of rows) {
    if (!r?.endpoint || !r.p256dh || !r.auth) continue;
    const entry = byEndpoint.get(r.endpoint);
    if (entry) entry.ids.push(r.id);
    else byEndpoint.set(r.endpoint, { sub: r, ids: [r.id] });
  }
  const targets = Array.from(byEndpoint.values());
  if (targets.length === 0) return { ...EMPTY_DELIVERY };

  let vapid: VapidConfig;
  try {
    vapid = getVapidConfig();
  } catch (err: any) {
    console.error(`[push] ${err?.message ?? err}`);
    return { sent: 0, failed: targets.length, removed: 0 };
  }

  const result: PushDeliveryResult = { ...EMPTY_DELIVERY };
  const okIds: string[] = [];
  const expiredIds: string[] = [];
  const errorsByMessage = new Map<string, string[]>();

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(batch.map((t) => sendOne(vapid, t.sub, payload)));
    outcomes.forEach((o, idx) => {
      const ids = batch[idx].ids;
      if (o.ok) {
        result.sent++;
        okIds.push(...ids);
      } else if (o.expired) {
        result.removed++;
        expiredIds.push(...ids);
      } else {
        result.failed++;
        errorsByMessage.set(o.error, [...(errorsByMessage.get(o.error) ?? []), ...ids]);
      }
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = () => supabaseAdmin.from(table as never) as any;
  const writes: PromiseLike<unknown>[] = [];
  if (okIds.length) {
    writes.push(from().update({ last_success_at: new Date().toISOString(), last_error: null }).in("id", okIds));
  }
  if (expiredIds.length) writes.push(from().delete().in("id", expiredIds));
  for (const [message, ids] of errorsByMessage) {
    console.warn(`[push:${table}] falha em ${ids.length} inscrição(ões): ${message}`);
    writes.push(from().update({ last_error: message }).in("id", ids));
  }
  await Promise.allSettled(writes);
  return result;
}

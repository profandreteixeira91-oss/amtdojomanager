// AMT Pay (Asaas) — modelo subconta.
//
// Cada academia cobra na própria subconta Asaas (cobrança no CPF/CNPJ do dojo,
// dinheiro cai direto na conta dele) e o Asaas repassa a comissão da AMT por
// split para a carteira central (ASAAS_WALLET_ID_AMT).
//
// A API key da subconta fica em dojo_asaas_credentials, que só o service role
// lê — nunca em dojo_academy_profile, que alunos e equipe conseguem ler.

import { getRequest } from "@tanstack/react-start/server";
import { DOJO_HOST, dojoOriginFromRequest } from "@/lib/dojo-hosts";
import type { AsaasSplit } from "./client.server";

/** Comissão da AMT sobre cada cobrança da academia, em %. */
export const AMT_COMMISSION_PERCENT = 2;

export type DojoAsaasCredentials = {
  /** subaccount: cobra na subconta aprovada com split; manual: sem AMT Pay. */
  mode: "subaccount" | "manual";
  /** API key da subconta (só no modo subaccount). */
  apiKey: string | undefined;
  split: AsaasSplit[];
  subaccountId: string | null;
  walletId: string | null;
  status: string | null;
};

const CREDENTIALS_TABLE = "dojo_asaas_credentials";

export function isAsaasApproved(status: string | null | undefined): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === "APPROVED" || s === "ACTIVE";
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getDojoAsaasApiKey(ownerId: string): Promise<string | null> {
  const db = await admin();
  const { data, error } = await (db.from(CREDENTIALS_TABLE as never) as any)
    .select("api_key")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    console.warn("[amtpay] falha ao ler credencial da subconta:", error.message);
    return null;
  }
  const key = String((data as any)?.api_key ?? "").trim();
  return key || null;
}

/** Antes de criar a subconta: sem onde guardar a key, não cria (evita subconta órfã). */
export async function assertCredentialStoreReady(): Promise<void> {
  const db = await admin();
  const { error } = await (db.from(CREDENTIALS_TABLE as never) as any).select("owner_id").limit(1);
  if (error) {
    throw new Error("AMT Pay em configuração — a ativação ainda não está disponível. Tente novamente mais tarde.");
  }
}

export async function saveDojoAsaasApiKey(ownerId: string, apiKey: string): Promise<void> {
  const db = await admin();
  const { error } = await (db.from(CREDENTIALS_TABLE as never) as any).upsert(
    { owner_id: ownerId, api_key: apiKey, updated_at: new Date().toISOString() },
    { onConflict: "owner_id" },
  );
  if (error) throw new Error(`Não foi possível guardar a credencial da subconta: ${error.message}`);
}

export async function deleteDojoAsaasApiKey(ownerId: string): Promise<void> {
  const db = await admin();
  const { error } = await (db.from(CREDENTIALS_TABLE as never) as any).delete().eq("owner_id", ownerId);
  if (error) console.warn("[amtpay] falha ao apagar credencial da subconta:", error.message);
}

/** Credenciais e split de cobrança da academia. */
export async function getDojoAsaasCredentials(ownerId: string): Promise<DojoAsaasCredentials> {
  const db = await admin();
  const { data: profile } = await db
    .from("dojo_academy_profile")
    .select("asaas_subaccount_id, asaas_wallet_id, asaas_onboarding_status")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const subaccountId = ((profile as any)?.asaas_subaccount_id as string | null) ?? null;
  const walletId = ((profile as any)?.asaas_wallet_id as string | null) ?? null;
  const status = ((profile as any)?.asaas_onboarding_status as string | null) ?? null;
  const apiKey = subaccountId ? await getDojoAsaasApiKey(ownerId) : null;

  if (!subaccountId || !apiKey || !isAsaasApproved(status)) {
    return { mode: "manual", apiKey: undefined, split: [], subaccountId, walletId, status };
  }
  const amtWalletId = process.env.ASAAS_WALLET_ID_AMT?.trim();
  return {
    mode: "subaccount",
    apiKey,
    split: amtWalletId ? [{ walletId: amtWalletId, percentualValue: AMT_COMMISSION_PERCENT }] : [],
    subaccountId,
    walletId,
    status,
  };
}

/** Nenhuma cobrança AMT Pay sai sem a comissão da AMT no split. */
export function assertAmtCommission(creds: DojoAsaasCredentials): void {
  if (creds.mode === "subaccount" && creds.split.length === 0) {
    throw new Error("Comissão AMT não configurada (ASAAS_WALLET_ID_AMT) — cobrança não criada.");
  }
}

/**
 * Lê a situação real da subconta no Asaas (GET /myAccount/status com a key da
 * própria subconta — o objeto da subconta não traz aprovação), grava no perfil
 * e garante o webhook. É a aprovação que libera as cobranças com split.
 */
export async function syncDojoSubaccountStatus(
  ownerId: string,
): Promise<{ status: string | null; webhook?: string }> {
  const apiKey = await getDojoAsaasApiKey(ownerId);
  if (!apiKey) return { status: null };
  const { asaasGetMyAccountStatus } = await import("./client.server");
  const remote = await asaasGetMyAccountStatus(apiKey);
  const status = String(remote.general ?? "").trim().toUpperCase() || "PENDING";

  const hook = await ensureDojoAsaasWebhook(apiKey);
  const webhook = hook.ok ? hook.action : `erro: ${hook.error}`;
  if (!hook.ok) console.error("[amtpay] webhook da subconta não configurado:", hook.error);

  const db = await admin();
  await db
    .from("dojo_academy_profile")
    .update({ asaas_onboarding_status: status })
    .eq("owner_id", ownerId);
  return { status, webhook };
}

/** Origem pública do Dojo Manager (links de pagamento e webhooks). */
export function dojoPublicOrigin(): string {
  const configured = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  try {
    return dojoOriginFromRequest(getRequest());
  } catch {
    return `https://${DOJO_HOST}`;
  }
}

const WEBHOOK_NAME = "AMT Dojo Manager";
const WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_AWAITING_RISK_ANALYSIS",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "TRANSFER_CREATED",
  "TRANSFER_PENDING",
  "TRANSFER_DONE",
  "TRANSFER_FAILED",
  "TRANSFER_CANCELLED",
];

/**
 * Garante o webhook da subconta apontando para /api/public/hooks/asaas.
 * Sem ele, o Asaas não avisa os pagamentos feitos na subconta e a mensalidade
 * fica pendente para sempre. Nunca lança.
 */
export async function ensureDojoAsaasWebhook(
  apiKey: string,
): Promise<{ ok: true; action: "created" | "updated" } | { ok: false; error: string }> {
  const authToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!authToken) return { ok: false, error: "ASAAS_WEBHOOK_TOKEN não configurado" };
  const input = {
    name: WEBHOOK_NAME,
    url: `${dojoPublicOrigin()}/api/public/hooks/asaas`,
    email: process.env.ASAAS_WEBHOOK_EMAIL?.trim() || "contato@amtfightwear.com.br",
    enabled: true,
    interrupted: false,
    apiVersion: 3 as const,
    authToken,
    sendType: "SEQUENTIALLY" as const,
    events: WEBHOOK_EVENTS,
  };
  try {
    const { asaasListWebhooks, asaasCreateWebhook, asaasUpdateWebhook } = await import("./client.server");
    const { data } = await asaasListWebhooks(apiKey);
    const existing = (data ?? []).find(
      (w) => w.name === WEBHOOK_NAME || String(w.url ?? "").endsWith("/api/public/hooks/asaas"),
    );
    if (existing) {
      await asaasUpdateWebhook(existing.id, input, apiKey);
      return { ok: true, action: "updated" };
    }
    await asaasCreateWebhook(input, apiKey);
    return { ok: true, action: "created" };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 300) };
  }
}

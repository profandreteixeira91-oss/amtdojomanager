import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, assertControlCenterAdmin, corsHeaders, errorResponse, HttpError, json, withCors } from "../_shared/control-center.ts";

// Atendimento da AMT pelo Control Center (amtsistemas.com.br/admin): WhatsApp do suporte (Evolution API,
// instância amt-suporte, o número 551151040791 conectado), chamados do Dojo Manager e o chat do site.
//
// Três entradas:
// - Webhook da Evolution: POST ?hook=1 com o cabeçalho x-amt-token (derivado da chave da API). Grava as
//   mensagens em support_wa_chats / support_wa_messages, no mesmo esquema da caixa da loja na AMT Fight Wear.
// - Painel: POST { action, ... } com o token de sessão do Control Center (ver _shared/control-center.ts).
//   Os chamados do Dojo são lidos direto do banco e respondidos pelo endpoint support-reply do Dojo.
// - Chat do site: POST { action: "site_*" } sem login (limitado por IP). O visitante informa nome, WhatsApp e
//   mensagem; o número do suporte manda uma confirmação para o WhatsApp dele e a conversa segue no WhatsApp
//   (celular do suporte e /admin), com a janela do site mostrando a conversa ao vivo.
//
// Segredos (supabase secrets set --project-ref gudjmkiyprgwgxmzbgji):
//   EVOLUTION_API_URL, EVOLUTION_API_KEY          — servidor Evolution da AMT (os mesmos do Dojo)
//   SUPPORT_WHATSAPP_INSTANCE                     — instância do suporte (padrão amt-suporte)
//   SUPPORT_WHATSAPP_TO                           — número conectado na instância (conversa consigo mesmo)
//   SUPPORT_WHATSAPP_WEBHOOK_SECRET               — segredo do endpoint support-reply do Dojo
//   SUPPORT_REPLY_URL                             — opcional; padrão https://amtdojomanager.com.br/api/public/hooks/support-reply
//
// Deploy: npx supabase functions deploy support-inbox --project-ref gudjmkiyprgwgxmzbgji --use-api --no-verify-jwt

const TIMEOUT_MS = 20_000;
const enc = encodeURIComponent;
const DEFAULT_REPLY_URL = "https://amtdojomanager.com.br/api/public/hooks/support-reply";
const CLOSED_TICKET_STATUSES = ["resolvido", "fechado", "concluido", "closed", "resolved"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------ Configuração ------------------------------ */

type Config = { url: string; apiKey: string; instance: string; ownPhone: string | null; replyUrl: string; replySecret: string };

function config(): Config | null {
  const url = (Deno.env.get("EVOLUTION_API_URL") ?? "").trim().replace(/\/+$/, "");
  const apiKey = (Deno.env.get("EVOLUTION_API_KEY") ?? "").trim();
  if (!url || !apiKey) return null;
  return {
    url,
    apiKey,
    instance: (Deno.env.get("SUPPORT_WHATSAPP_INSTANCE") ?? "").trim() || "amt-suporte",
    ownPhone: normalizePhone(Deno.env.get("SUPPORT_WHATSAPP_TO")),
    replyUrl: (Deno.env.get("SUPPORT_REPLY_URL") ?? "").trim() || DEFAULT_REPLY_URL,
    replySecret: (Deno.env.get("SUPPORT_WHATSAPP_WEBHOOK_SECRET") ?? "").trim(),
  };
}

function requireConfig(): Config {
  const cfg = config();
  if (!cfg) throw new HttpError(503, "WhatsApp do suporte não configurado (EVOLUTION_API_URL / EVOLUTION_API_KEY).");
  return cfg;
}

const hookUrl = () => `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/support-inbox?hook=1`;

/** Token que a Evolution envia no cabeçalho do webhook (derivado da chave da API). */
async function webhookToken(apiKey: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("amt-suporte:whatsapp-webhook"));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Dígitos com DDI 55 (ex.: 5582999998888). Mesma regra de public.support_wa_normalize_phone. */
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 ? digits : null;
}

/* ------------------------------ Evolution API ------------------------------ */

function messageOf(body: any, status: number): string {
  const raw = body?.response?.message ?? body?.message ?? body?.error ?? `HTTP ${status}`;
  const text = Array.isArray(raw) ? raw.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("; ") : String(raw);
  return text.slice(0, 300);
}

class EvolutionError extends HttpError {}

async function evo<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const { url, apiKey } = requireConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url + path, {
      method,
      headers: { apikey: apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text.slice(0, 300) };
    }
    if (!res.ok) throw new EvolutionError(res.status === 404 ? 404 : 502, messageOf(data, res.status));
    return data as T;
  } catch (err: any) {
    if (err instanceof EvolutionError) throw err;
    throw new EvolutionError(502, err?.name === "AbortError" ? "Servidor de WhatsApp não respondeu a tempo." : String(err?.message ?? err));
  } finally {
    clearTimeout(timer);
  }
}

type State = "open" | "connecting" | "close";

async function connectionState(): Promise<State | null> {
  const { instance } = requireConfig();
  try {
    const res = await evo("GET", `/instance/connectionState/${enc(instance)}`);
    const state = String(res?.instance?.state ?? res?.state ?? "close").toLowerCase();
    return state === "open" ? "open" : state === "connecting" ? "connecting" : "close";
  } catch (err) {
    if (err instanceof EvolutionError && err.status === 404) return null;
    throw err;
  }
}

async function instanceInfo(): Promise<{ number: string | null; profileName: string | null }> {
  const { instance } = requireConfig();
  const res = await evo<any>("GET", `/instance/fetchInstances?instanceName=${enc(instance)}`);
  const list: any[] = Array.isArray(res) ? res : res ? [res] : [];
  const row = list.find((r) => (r?.name ?? r?.instance?.instanceName ?? r?.instanceName) === instance) ?? list[0];
  const inst = row?.instance ?? row ?? {};
  const digits = String(inst.ownerJid ?? inst.owner ?? inst.number ?? "").split("@")[0].replace(/\D/g, "");
  return { number: digits || null, profileName: (inst.profileName as string) ?? null };
}

function readQr(raw: any): { base64: string | null; pairingCode: string | null } {
  const q = raw?.qrcode ?? raw ?? {};
  const base64 = typeof q.base64 === "string" && q.base64 ? q.base64 : null;
  return {
    base64: base64 && !base64.startsWith("data:") ? `data:image/png;base64,${base64}` : base64,
    pairingCode: typeof q.pairingCode === "string" ? q.pairingCode : null,
  };
}

/**
 * Conecta o número do suporte: sem `number` devolve o QR Code; com `number`, o código de pareamento
 * (na v2 o código só sai para instância criada já com o número, então ela é recriada).
 */
async function startConnection(number: string | null) {
  const { instance } = requireConfig();
  const state = await connectionState();
  if (state === "open") throw new HttpError(409, "O WhatsApp do suporte já está conectado.");
  if (number) {
    if (state !== null) await evo("DELETE", `/instance/delete/${enc(instance)}`).catch(() => undefined);
    const created = await evo("POST", "/instance/create", { instanceName: instance, qrcode: true, integration: "WHATSAPP-BAILEYS", number });
    const fromCreate = readQr(created?.qrcode ?? {});
    if (fromCreate.pairingCode) return fromCreate;
    return readQr(await evo("GET", `/instance/connect/${enc(instance)}?number=${enc(number)}`));
  }
  if (state === null) {
    const created = await evo("POST", "/instance/create", { instanceName: instance, qrcode: true, integration: "WHATSAPP-BAILEYS" });
    const fromCreate = readQr(created?.qrcode ?? {});
    if (fromCreate.base64) return fromCreate;
  }
  return readQr(await evo("GET", `/instance/connect/${enc(instance)}`));
}

async function setWebhook() {
  const cfg = requireConfig();
  await evo("POST", `/webhook/set/${enc(cfg.instance)}`, {
    webhook: {
      enabled: true,
      url: hookUrl(),
      headers: { "x-amt-token": await webhookToken(cfg.apiKey) },
      byEvents: false,
      base64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"],
    },
  });
}

async function findWebhook(): Promise<{ enabled: boolean; url: string | null } | null> {
  const { instance } = requireConfig();
  const res = await evo<any>("GET", `/webhook/find/${enc(instance)}`);
  return res ? { enabled: !!res.enabled, url: res.url ?? null } : null;
}

/** Destino aceito pela Evolution: telefone (dígitos) ou identificador do WhatsApp (…@lid). */
function recipient(to: string): string | null {
  return to.includes("@") ? to.trim() : normalizePhone(to);
}

/* ------------------------- Conversas e mensagens ------------------------- */

type Parsed = {
  message_id: string; remote_jid: string; phone: string | null; from_me: boolean; push_name: string | null;
  type: string; body: string | null; media_mime: string | null; media_name: string | null;
  quoted_body: string | null; status: string | null; sent_at: string;
};

const STATUS: Record<string, string> = { ERROR: "error", PENDING: "pending", SERVER_ACK: "sent", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read" };
const STATUS_RANK: Record<string, number> = { error: 0, pending: 1, sent: 2, delivered: 3, read: 4 };

/** Grupos, status, canais e transmissões não entram na caixa. */
const isIgnoredJid = (jid: string) => !jid || /@(g\.us|broadcast|newsletter)$/.test(jid) || jid === "status@broadcast";

function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return null;
  return normalizePhone(jid.split("@")[0].split(":")[0]);
}

function textOf(m: any): string | null {
  if (!m) return null;
  return m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? m.documentMessage?.caption ?? null;
}

/** Converte uma mensagem da Evolution (webhook, envio ou histórico). null = ignorar. */
function parseMessage(raw: any): Parsed | null {
  const key = raw?.key ?? {};
  const id: string | undefined = key.id;
  const jid: string = key.remoteJid ?? "";
  if (!id || isIgnoredJid(jid)) return null;
  const m = raw.message ?? {};
  const kind: string = raw.messageType ?? Object.keys(m).find((k) => k.endsWith("Message") || k === "conversation") ?? "unknown";
  let type = "text";
  let body: string | null = null;
  let mime: string | null = null;
  let name: string | null = null;
  switch (kind) {
    case "conversation":
    case "extendedTextMessage":
      body = textOf(m);
      break;
    case "imageMessage":
      type = "image"; body = m.imageMessage?.caption || null; mime = m.imageMessage?.mimetype ?? null;
      break;
    case "videoMessage":
      type = "video"; body = m.videoMessage?.caption || null; mime = m.videoMessage?.mimetype ?? null;
      break;
    case "audioMessage":
      type = "audio"; mime = m.audioMessage?.mimetype ?? null;
      break;
    case "documentMessage":
    case "documentWithCaptionMessage": {
      const doc = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
      type = "document"; body = doc?.caption || null; mime = doc?.mimetype ?? null; name = doc?.fileName ?? doc?.title ?? null;
      break;
    }
    case "stickerMessage":
      type = "sticker";
      break;
    case "locationMessage":
      type = "location"; body = `📍 Localização${m.locationMessage?.name ? `: ${m.locationMessage.name}` : ""}`;
      break;
    case "contactMessage":
      type = "contact"; body = `👤 Contato: ${m.contactMessage?.displayName ?? ""}`.trim();
      break;
    case "protocolMessage":
    case "reactionMessage":
    case "senderKeyDistributionMessage":
    case "messageContextInfo":
    case "editedMessage":
    case "pollUpdateMessage":
      return null;
    default:
      body = textOf(m) ?? m.interactiveMessage?.body?.text ?? m.buttonsResponseMessage?.selectedDisplayText ?? m.listResponseMessage?.title ?? null;
      if (!body) type = "other";
  }
  const ts = Number(raw.messageTimestamp ?? 0);
  const quoted = raw.contextInfo?.quotedMessage ?? m?.[kind]?.contextInfo?.quotedMessage;
  const fromMe = !!key.fromMe;
  const altJid = [key.remoteJidAlt, key.senderPn].find((j: unknown) => typeof j === "string" && String(j).endsWith("@s.whatsapp.net")) as string | undefined;
  return {
    message_id: id,
    remote_jid: jid,
    phone: phoneFromJid(jid) ?? phoneFromJid(altJid),
    from_me: fromMe,
    push_name: !fromMe && raw.pushName && raw.pushName !== "Você" ? String(raw.pushName).slice(0, 120) : null,
    type,
    body: body ? String(body).slice(0, 8000) : null,
    media_mime: mime,
    media_name: name,
    quoted_body: quoted ? (textOf(quoted) ?? "Mídia")?.slice(0, 300) ?? null : null,
    status: STATUS[String(raw.status ?? "")] ?? (fromMe ? "sent" : null),
    sent_at: new Date(ts > 0 ? (ts > 1e12 ? ts : ts * 1000) : Date.now()).toISOString(),
  };
}

async function upsertChat(sb: SupabaseClient, jid: string, info: { phone?: string | null; name?: string | null }): Promise<string> {
  const { data: existing, error } = await sb.from("support_wa_chats").select("id, phone_normalized, name").eq("remote_jid", jid).maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) {
    const patch: Record<string, string> = {};
    if (info.phone && !existing.phone_normalized) patch.phone_normalized = info.phone;
    if (info.name && !existing.name) patch.name = info.name;
    if (Object.keys(patch).length) await sb.from("support_wa_chats").update(patch).eq("id", existing.id);
    return existing.id;
  }
  const { data: created, error: cErr } = await sb
    .from("support_wa_chats")
    .upsert({ remote_jid: jid, phone_normalized: info.phone ?? null, name: info.name ?? null }, { onConflict: "remote_jid" })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  return created.id;
}

async function insertMessages(sb: SupabaseClient, chatId: string, list: Parsed[]): Promise<number> {
  if (!list.length) return 0;
  const rows = list
    .slice()
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
    .map((p) => ({
      chat_id: chatId, message_id: p.message_id, from_me: p.from_me, type: p.type, body: p.body, media_mime: p.media_mime,
      media_name: p.media_name, quoted_body: p.quoted_body, status: p.status, sent_at: p.sent_at,
    }));
  const { data, error } = await sb.from("support_wa_messages").upsert(rows, { onConflict: "message_id", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

async function updateStatus(sb: SupabaseClient, messageId: string, status: string) {
  const { data } = await sb.from("support_wa_messages").select("id, status").eq("message_id", messageId).maybeSingle();
  if (!data || (STATUS_RANK[status] ?? -1) <= (STATUS_RANK[data.status ?? ""] ?? -1)) return;
  await sb.from("support_wa_messages").update({ status }).eq("id", data.id);
}

async function handleEvent(sb: SupabaseClient, payload: any) {
  const event = String(payload?.event ?? "").toLowerCase().replace(/_/g, ".");
  const data = payload?.data;
  const items: any[] = Array.isArray(data) ? data : data ? [data] : [];
  if (event === "messages.upsert" || event === "send.message") {
    for (const raw of items) {
      const p = parseMessage(raw);
      if (!p) continue;
      const chatId = await upsertChat(sb, p.remote_jid, { phone: p.phone, name: p.push_name });
      await insertMessages(sb, chatId, [p]);
    }
  } else if (event === "messages.update") {
    for (const u of items) {
      const id = u?.keyId ?? u?.key?.id;
      const status = STATUS[String(u?.status ?? "")];
      if (id && status) await updateStatus(sb, String(id), status);
    }
  }
}

/** Envio feito pelo painel: grava a mensagem e aprende o telefone da conversa (@lid). */
async function recordOutgoing(sb: SupabaseClient, to: string, res: any, fallback: { type: string; body: string | null; mime?: string; name?: string }) {
  const jid: string | undefined = res?.key?.remoteJid;
  const id: string | undefined = res?.key?.id;
  if (!jid || !id || isIgnoredJid(jid)) return;
  const sentTo = to.includes("@") ? phoneFromJid(to) : normalizePhone(to);
  const parsed = parseMessage({ ...res, key: { ...res.key, fromMe: true } });
  const p: Parsed = parsed ?? {
    message_id: id, remote_jid: jid, phone: null, from_me: true, push_name: null, type: fallback.type, body: fallback.body,
    media_mime: fallback.mime ?? null, media_name: fallback.name ?? null, quoted_body: null, status: "sent", sent_at: new Date().toISOString(),
  };
  if (!p.body && fallback.body) p.body = fallback.body;
  const chatId = await upsertChat(sb, jid, { phone: p.phone ?? sentTo });
  await insertMessages(sb, chatId, [p]);
}

/* ------------------------------- Painel -------------------------------- */

const CHAT_COLUMNS =
  "id, remote_jid, phone_normalized, name, academy_owner_id, last_message_at, last_message_preview, last_message_from_me, unread_count, tags, archived, follow_up_at, follow_up_note";

type Chat = {
  id: string; remote_jid: string; phone_normalized: string | null; name: string | null; academy_owner_id: string | null;
  last_message_at: string | null; last_message_preview: string | null; last_message_from_me: boolean | null; unread_count: number;
  tags: string[]; archived: boolean; follow_up_at: string | null; follow_up_note: string | null;
};

async function academyNames(sb: SupabaseClient, ownerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [{ data: profiles }, { data: users }] = await Promise.all([
    sb.from("dojo_academy_profile").select("owner_id, trade_name, legal_name").in("owner_id", ids),
    sb.from("dojo_users").select("owner_id, name, email").eq("role", "owner").in("owner_id", ids),
  ]);
  const names = new Map<string, string>();
  for (const u of users ?? []) if (u.name || u.email) names.set(u.owner_id, u.name || u.email);
  for (const p of profiles ?? []) if (p.trade_name || p.legal_name) names.set(p.owner_id, p.trade_name || p.legal_name);
  return names;
}

async function withAcademy(sb: SupabaseClient, chats: Chat[]) {
  const names = await academyNames(sb, chats.map((c) => c.academy_owner_id ?? ""));
  const own = config()?.ownPhone ?? null;
  return chats.map((c) => ({
    ...c,
    academy: c.academy_owner_id && names.has(c.academy_owner_id) ? { owner_id: c.academy_owner_id, name: names.get(c.academy_owner_id)! } : null,
    is_self: !!own && c.phone_normalized === own,
  }));
}

async function chatById(sb: SupabaseClient, id: string): Promise<Chat> {
  if (!UUID_RE.test(id)) throw new HttpError(400, "Conversa inválida.");
  const { data, error } = await sb.from("support_wa_chats").select(CHAT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Conversa não encontrada.");
  return data as Chat;
}

type Subscription = { status: string; plan_amount: number | null; trial_ends_at: string | null; current_period_end: string | null; next_due_date: string | null; current_payment_status: string | null; subscription_type: string | null; updated_at: string };

function subscriptionGroup(s: Subscription | null): string {
  if (!s) return "sem_assinatura";
  if (s.status === "active" || s.status === "authorized") return s.current_payment_status === "approved" ? "pagante" : "liberado";
  if (s.status === "trialing" || s.status === "trial") return s.trial_ends_at && new Date(s.trial_ends_at).getTime() < Date.now() ? "teste_vencido" : "teste";
  if (s.status === "cancelled" || s.status === "canceled") return "cancelado";
  return "pendente";
}

async function academySummary(sb: SupabaseClient, ownerId: string) {
  if (!UUID_RE.test(ownerId)) throw new HttpError(400, "Academia inválida.");
  const [profile, owner, subs, students, tickets, auth] = await Promise.all([
    sb.from("dojo_academy_profile").select("trade_name, legal_name, email, phone, whatsapp, city, state, slug").eq("owner_id", ownerId).maybeSingle(),
    sb.from("dojo_users").select("name, email").eq("owner_id", ownerId).eq("role", "owner").limit(1).maybeSingle(),
    sb.from("dojo_subscriptions").select("status, plan_amount, trial_ends_at, current_period_end, next_due_date, current_payment_status, subscription_type, updated_at").eq("owner_id", ownerId).order("updated_at", { ascending: false }).limit(1),
    sb.from("dojo_students").select("status").eq("owner_id", ownerId),
    sb.from("dojo_support_tickets").select("id, subject, status, priority, last_message_at, created_at").eq("owner_id", ownerId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(20),
    sb.auth.admin.getUserById(ownerId),
  ]);
  const p = profile.data;
  const sub = (subs.data?.[0] ?? null) as Subscription | null;
  if (!p && !owner.data && !sub) return null;
  const studentRows = students.data ?? [];
  return {
    owner_id: ownerId,
    name: p?.trade_name || p?.legal_name || owner.data?.name || auth.data?.user?.email || "Academia sem nome",
    owner_name: owner.data?.name ?? null,
    email: p?.email || owner.data?.email || auth.data?.user?.email || null,
    phone: p?.whatsapp || p?.phone || null,
    city: p?.city ? [p.city, p.state].filter(Boolean).join("/") : null,
    subscription: sub
      ? { status: sub.status, group: subscriptionGroup(sub), amount_monthly: sub.plan_amount === null ? null : Number(sub.plan_amount), trial_ends_at: sub.trial_ends_at, current_period_end: sub.current_period_end, next_due_date: sub.next_due_date }
      : { status: null, group: "sem_assinatura", amount_monthly: null, trial_ends_at: null, current_period_end: null, next_due_date: null },
    students: studentRows.length,
    active_students: studentRows.filter((s) => s.status === "active" || s.status === "ativo").length,
    open_tickets: (tickets.data ?? [])
      .filter((t) => !CLOSED_TICKET_STATUSES.includes(t.status))
      .map((t) => ({ id: t.id, code: String(t.id).slice(0, 8), subject: t.subject, status: t.status, priority: t.priority, last_message_at: t.last_message_at ?? t.created_at })),
  };
}

type QuickReply = { id: string; title: string; body: string };
const QUICK_KEY = "support_whatsapp_quick_replies";
const DEFAULT_QUICK: QuickReply[] = [
  { id: "saudacao", title: "Saudação", body: "Olá, {nome}! Aqui é o suporte da AMT Sistemas. Como posso ajudar?" },
  { id: "detalhes", title: "Pedir detalhes", body: "Para eu verificar, me envie um print da tela e conte o passo a passo do que aconteceu." },
  { id: "analise", title: "Em análise", body: "{nome}, já estou verificando e te retorno por aqui em instantes." },
  { id: "resolvido", title: "Resolvido", body: "Prontinho, {nome}! Pode testar de novo? Se precisar de algo mais, é só chamar." },
];

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const IMPORT_DAYS = 90;
const IMPORT_MESSAGES = 40;
const IMPORT_BATCH = 6;
const FILTERS = ["todas", "nao_lidas", "academias", "sem_academia", "retorno", "arquivadas"];

async function panel(sb: SupabaseClient, body: Record<string, unknown>): Promise<unknown> {
  const action = String(body.action ?? "");
  switch (action) {
    case "status": {
      const cfg = config();
      const { count } = await sb.from("support_wa_chats").select("id", { count: "exact", head: true });
      if (!cfg) return { configured: false, instance: null, state: null, connected: false, number: null, profileName: null, webhookActive: false, ticketReplies: false, chats: count ?? 0, error: null };
      try {
        const [state, hook] = await Promise.all([connectionState(), findWebhook().catch(() => null)]);
        const info = state === "open" ? await instanceInfo().catch(() => ({ number: null, profileName: null })) : { number: null, profileName: null };
        return {
          configured: true, instance: cfg.instance, state, connected: state === "open", ...info,
          webhookActive: !!hook?.enabled && hook.url === hookUrl(), ticketReplies: !!cfg.replySecret, chats: count ?? 0, error: null,
        };
      } catch (err) {
        return { configured: true, instance: cfg.instance, state: null, connected: false, number: null, profileName: null, webhookActive: false, ticketReplies: !!cfg.replySecret, chats: count ?? 0, error: err instanceof Error ? err.message : String(err) };
      }
    }
    case "connect": {
      const number = body.number ? normalizePhone(String(body.number)) : null;
      if (body.number && !number) throw new HttpError(400, "Número inválido. Use DDD + número.");
      return await startConnection(number);
    }
    case "logout": {
      await evo("DELETE", `/instance/logout/${enc(requireConfig().instance)}`);
      return { ok: true };
    }
    case "activate": {
      await setWebhook();
      return { ok: true };
    }
    case "import": {
      const cfg = requireConfig();
      const cursor = Math.max(0, Number(body.cursor ?? 0) | 0);
      const since = new Date(Date.now() - IMPORT_DAYS * 86400000).toISOString();
      const all = await evo<any>("POST", `/chat/findChats/${enc(cfg.instance)}`, {});
      const chats = (Array.isArray(all) ? all : [])
        .filter((c: any) => c.remoteJid && !isIgnoredJid(c.remoteJid) && String(c.updatedAt ?? "") >= since)
        .sort((a: any, b: any) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const slice = chats.slice(cursor, cursor + IMPORT_BATCH);
      let messages = 0;
      for (const c of slice) {
        const res = await evo<any>("POST", `/chat/findMessages/${enc(cfg.instance)}`, { where: { key: { remoteJid: c.remoteJid } }, page: 1, offset: IMPORT_MESSAGES });
        const parsed = ((res?.messages?.records ?? []) as any[]).map(parseMessage).filter((p): p is Parsed => !!p);
        const name = parsed.find((p) => p.push_name)?.push_name ?? (c.pushName && c.pushName !== "Você" ? c.pushName : null);
        const chatId = await upsertChat(sb, c.remoteJid, { phone: parsed.find((p) => p.phone)?.phone ?? null, name });
        messages += await insertMessages(sb, chatId, parsed);
        // Importar não é "mensagem nova": as não lidas seguem o que o WhatsApp mostra.
        await sb.from("support_wa_chats").update({ unread_count: Math.max(0, Number(c.unreadCount ?? 0)) }).eq("id", chatId);
      }
      const next = cursor + slice.length;
      return { total: chats.length, next, done: next >= chats.length, messages };
    }
    case "list": {
      const filter = FILTERS.includes(String(body.filter)) ? String(body.filter) : "todas";
      let q = sb.from("support_wa_chats").select(CHAT_COLUMNS).order("last_message_at", { ascending: false, nullsFirst: false }).limit(400);
      q = filter === "arquivadas" ? q.eq("archived", true) : q.eq("archived", false);
      if (filter === "nao_lidas") q = q.gt("unread_count", 0);
      if (filter === "academias") q = q.not("academy_owner_id", "is", null);
      if (filter === "sem_academia") q = q.is("academy_owner_id", null);
      if (filter === "retorno") q = q.not("follow_up_at", "is", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return await withAcademy(sb, (data ?? []) as Chat[]);
    }
    case "get": {
      const chat = await chatById(sb, String(body.id));
      const { data, error } = await sb
        .from("support_wa_messages")
        .select("id, message_id, from_me, type, body, media_mime, media_name, quoted_body, status, sent_at, source")
        .eq("chat_id", chat.id)
        .eq("hidden", false)
        .order("sent_at", { ascending: false })
        .limit(150);
      if (error) throw new Error(error.message);
      const [withName] = await withAcademy(sb, [chat]);
      return { chat: withName, messages: (data ?? []).reverse() };
    }
    case "read": {
      const chat = await chatById(sb, String(body.id));
      if (!chat.unread_count) return { ok: true };
      await sb.from("support_wa_chats").update({ unread_count: 0 }).eq("id", chat.id);
      const { data: unread } = await sb.from("support_wa_messages").select("message_id").eq("chat_id", chat.id).eq("from_me", false).eq("source", "whatsapp")
        .order("sent_at", { ascending: false }).limit(Math.min(chat.unread_count, 20));
      try {
        const ids = (unread ?? []).map((m) => m.message_id);
        if (ids.length) {
          await evo("POST", `/chat/markMessageAsRead/${enc(requireConfig().instance)}`, { readMessages: ids.map((id) => ({ id, fromMe: false, remoteJid: chat.remote_jid })) });
        }
      } catch (err) {
        console.error("support-inbox: não marcou como lida no WhatsApp", err instanceof Error ? err.message : err);
      }
      return { ok: true };
    }
    case "send_text": {
      const chat = await chatById(sb, String(body.id));
      const text = str(body.text, 4000);
      if (!text) throw new HttpError(400, "Escreva a mensagem.");
      const number = recipient(chat.remote_jid);
      if (!number) throw new HttpError(400, "Número inválido.");
      const res = await evo<any>("POST", `/message/sendText/${enc(requireConfig().instance)}`, { number, text, delay: 600 });
      await recordOutgoing(sb, number, res, { type: "text", body: text });
      return { ok: true };
    }
    case "send_media": {
      const chat = await chatById(sb, String(body.id));
      const base64 = String(body.base64 ?? "");
      const mimetype = str(body.mimetype, 120) || "application/octet-stream";
      const fileName = str(body.fileName, 200) || "arquivo";
      if (base64.length < 10) throw new HttpError(400, "Arquivo vazio.");
      if ((base64.length * 3) / 4 > MAX_MEDIA_BYTES) throw new HttpError(413, "Arquivo maior que 8 MB.");
      const mediatype = mimetype.startsWith("image/") ? "image" : mimetype.startsWith("video/") ? "video" : "document";
      const caption = str(body.caption, 1000);
      const number = recipient(chat.remote_jid);
      if (!number) throw new HttpError(400, "Número inválido.");
      const res = await evo<any>("POST", `/message/sendMedia/${enc(requireConfig().instance)}`, { number, mediatype, mimetype, fileName, caption, media: base64, delay: 800 });
      await recordOutgoing(sb, number, res, { type: mediatype, body: caption || null, mime: mimetype, name: fileName });
      return { ok: true };
    }
    case "media": {
      const messageId = str(body.message_id, 200);
      if (messageId.length < 4) throw new HttpError(400, "Mensagem inválida.");
      const res = await evo<any>("POST", `/chat/getBase64FromMediaMessage/${enc(requireConfig().instance)}`, { message: { key: { id: messageId } }, convertToMp4: false });
      if (!res?.base64) throw new HttpError(404, "Mídia indisponível no WhatsApp.");
      return { dataUrl: `data:${res.mimetype ?? "application/octet-stream"};base64,${res.base64}`, fileName: res.fileName ?? null };
    }
    case "update": {
      const chat = await chatById(sb, String(body.id));
      const patch: Record<string, unknown> = {};
      if (Array.isArray(body.tags)) patch.tags = (body.tags as unknown[]).map((t) => str(t, 40)).filter(Boolean).slice(0, 12);
      if (typeof body.archived === "boolean") patch.archived = body.archived;
      if (body.follow_up_at !== undefined) patch.follow_up_at = body.follow_up_at ? str(body.follow_up_at, 10) : null;
      if (body.follow_up_note !== undefined) patch.follow_up_note = body.follow_up_note ? str(body.follow_up_note, 300) : null;
      if (body.academy_owner_id !== undefined) {
        const owner = body.academy_owner_id ? String(body.academy_owner_id) : null;
        if (owner && !UUID_RE.test(owner)) throw new HttpError(400, "Academia inválida.");
        patch.academy_owner_id = owner;
      }
      const { error } = await sb.from("support_wa_chats").update(patch).eq("id", chat.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "academies": {
      const [{ data: profiles }, { data: owners }] = await Promise.all([
        sb.from("dojo_academy_profile").select("owner_id, trade_name, legal_name, email, phone, whatsapp, city, state"),
        sb.from("dojo_users").select("owner_id, name, email").eq("role", "owner"),
      ]);
      const list = new Map<string, { owner_id: string; name: string; email: string | null; phone: string | null; city: string | null }>();
      for (const o of owners ?? []) list.set(o.owner_id, { owner_id: o.owner_id, name: o.name || o.email || "Academia sem nome", email: o.email ?? null, phone: null, city: null });
      for (const p of profiles ?? []) {
        const prev = list.get(p.owner_id);
        list.set(p.owner_id, {
          owner_id: p.owner_id,
          name: p.trade_name || p.legal_name || prev?.name || "Academia sem nome",
          email: p.email || prev?.email || null,
          phone: p.whatsapp || p.phone || null,
          city: p.city ? [p.city, p.state].filter(Boolean).join("/") : null,
        });
      }
      return [...list.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    case "academy": {
      return await academySummary(sb, String(body.owner_id ?? ""));
    }
    case "quick_list": {
      const { data } = await sb.from("app_settings").select("value").eq("key", QUICK_KEY).maybeSingle();
      const list = Array.isArray(data?.value) ? (data!.value as QuickReply[]).filter((r) => r && r.title && r.body) : [];
      return list.length ? list : DEFAULT_QUICK;
    }
    case "quick_save": {
      const list = (Array.isArray(body.replies) ? body.replies : [])
        .map((r: any) => ({ id: str(r?.id, 40) || crypto.randomUUID().slice(0, 8), title: str(r?.title, 60), body: str(r?.body, 1000) }))
        .filter((r: QuickReply) => r.title && r.body)
        .slice(0, 40);
      const { error } = await sb.from("app_settings").upsert({ key: QUICK_KEY, value: list }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    case "tickets_list": {
      let q = sb.from("dojo_support_tickets").select(TICKET_COLUMNS).order("last_message_at", { ascending: false, nullsFirst: false }).limit(300);
      if (body.filter !== "todos") q = q.not("status", "in", `(${CLOSED_TICKET_STATUSES.join(",")})`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const names = await academyNames(sb, (data ?? []).map((t) => t.owner_id));
      return (data ?? []).map((t) => ({ ...t, code: String(t.id).slice(0, 8), academy_name: names.get(t.owner_id) ?? "Academia sem nome" }));
    }
    case "ticket_get": {
      const id = String(body.id ?? "");
      if (!UUID_RE.test(id)) throw new HttpError(400, "Chamado inválido.");
      const [{ data: ticket, error }, { data: messages }] = await Promise.all([
        sb.from("dojo_support_tickets").select(TICKET_COLUMNS).eq("id", id).maybeSingle(),
        sb.from("dojo_support_messages").select("id, author_role, body, created_at").eq("ticket_id", id).order("created_at").limit(300),
      ]);
      if (error) throw new Error(error.message);
      if (!ticket) throw new HttpError(404, "Chamado não encontrado.");
      // Abrir no painel = lido pela AMT (o Dojo faz o mesmo na tela dele).
      if (ticket.unread_by_admin) await sb.from("dojo_support_tickets").update({ unread_by_admin: 0 }).eq("id", id);
      const names = await academyNames(sb, [ticket.owner_id]);
      return {
        ticket: { ...ticket, unread_by_admin: 0, code: id.slice(0, 8), academy_name: names.get(ticket.owner_id) ?? "Academia sem nome" },
        messages: messages ?? [],
      };
    }
    case "ticket_reply": {
      const cfg = config();
      if (!cfg?.replySecret) throw new HttpError(503, "Resposta a chamados não configurada (SUPPORT_WHATSAPP_WEBHOOK_SECRET).");
      const id = String(body.id ?? "");
      const text = str(body.body, 4000);
      if (!UUID_RE.test(id)) throw new HttpError(400, "Chamado inválido.");
      if (!text) throw new HttpError(400, "Escreva a resposta.");
      const status = TICKET_STATUSES.includes(String(body.status)) ? String(body.status) : undefined;
      let res: Response;
      try {
        res = await fetch(cfg.replyUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "x-amt-webhook-secret": cfg.replySecret },
          body: JSON.stringify({ ticket_id: id, body: text, ...(status ? { status } : {}) }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new HttpError(502, "O Dojo Manager não respondeu. Tente de novo em instantes.");
      }
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        const reason = res.status === 404 && !data.error
          ? "O Dojo Manager ainda não publicou o endpoint de respostas (support-reply)."
          : String(data.error ?? `O Dojo Manager recusou a resposta (HTTP ${res.status}).`);
        throw new HttpError(502, reason);
      }
      return data;
    }
    default:
      throw new HttpError(400, "Ação inválida.");
  }
}

const TICKET_COLUMNS = "id, owner_id, subject, category, status, priority, last_message_at, unread_by_admin, unread_by_client, created_at";
const TICKET_STATUSES = ["aberto", "em_atendimento", "resolvido", "fechado"];

/* ------------------------------ Chat do site ------------------------------ */

const SITE_STARTS_PER_IP_HOUR = 3;
const SITE_STARTS_PER_HOUR = 60;
const SITE_MESSAGES_PER_10_MIN = 15;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

type SiteMessage = { id: string; from_me: boolean; type: string; body: string | null; sent_at: string };

async function siteMessages(sb: SupabaseClient, chatId: string): Promise<SiteMessage[]> {
  const { data } = await sb
    .from("support_wa_messages")
    .select("id, from_me, type, body, sent_at")
    .eq("chat_id", chatId)
    .eq("hidden", false)
    .order("sent_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as SiteMessage[]).reverse();
}

/** Mensagem que o sistema mandou e não deve aparecer como resposta do suporte (confirmação ou cópia). */
async function markSystemMessage(sb: SupabaseClient, chatId: string, res: any, body: string, source: "auto" | "relay") {
  const id: string | undefined = res?.key?.id;
  if (!id) return;
  const row = { chat_id: chatId, message_id: id, from_me: true, type: "text", body, status: "sent", sent_at: new Date().toISOString(), source, hidden: source === "relay" };
  await sb.from("support_wa_messages").upsert(row, { onConflict: "message_id", ignoreDuplicates: true });
  // O webhook pode ter gravado antes como mensagem comum: corrige a origem.
  await sb.from("support_wa_messages").update({ source, hidden: source === "relay" }).eq("message_id", id);
}

/** Depois de uma mensagem do visitante, a conversa mostra a mensagem dele e fica como não lida. */
async function touchFromVisitor(sb: SupabaseClient, chatId: string, text: string, at: string) {
  const { data } = await sb.from("support_wa_chats").select("unread_count").eq("id", chatId).maybeSingle();
  await sb.from("support_wa_chats").update({
    last_message_at: at,
    last_message_preview: text.slice(0, 160),
    last_message_from_me: false,
    unread_count: Math.max(1, Number(data?.unread_count ?? 0)),
    archived: false,
  }).eq("id", chatId);
}

async function siteSession(sb: SupabaseClient, token: unknown): Promise<{ id: string; chat_id: string }> {
  const raw = String(token ?? "");
  if (!/^[0-9a-f]{64}$/.test(raw)) throw new HttpError(401, "Conversa expirada. Comece de novo.");
  const { data } = await sb.from("support_site_sessions").select("id, chat_id").eq("token_hash", await sha256Hex(raw)).maybeSingle();
  if (!data) throw new HttpError(401, "Conversa expirada. Comece de novo.");
  await sb.from("support_site_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

async function site(req: Request, sb: SupabaseClient, body: Record<string, unknown>): Promise<unknown> {
  const action = String(body.action ?? "");
  const cfg = requireConfig();
  if (action === "site_start") {
    if (str(body.website, 200)) throw new HttpError(400, "Não foi possível iniciar a conversa.");
    const name = str(body.name, 80);
    const phone = normalizePhone(String(body.phone ?? ""));
    const text = str(body.message, 1000);
    if (name.length < 2) throw new HttpError(400, "Informe o seu nome.");
    if (!phone) throw new HttpError(400, "Informe um WhatsApp válido, com DDD.");
    if (text.length < 2) throw new HttpError(400, "Escreva a sua mensagem.");

    const ipHash = await sha256Hex(`${clientIp(req)}|${cfg.apiKey.slice(0, 12)}`);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const [{ count: byIp }, { count: total }] = await Promise.all([
      sb.from("support_site_sessions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
      sb.from("support_site_sessions").select("id", { count: "exact", head: true }).gte("created_at", hourAgo),
    ]);
    if ((byIp ?? 0) >= SITE_STARTS_PER_IP_HOUR || (total ?? 0) >= SITE_STARTS_PER_HOUR) {
      throw new HttpError(429, "Muitas conversas iniciadas agora. Tente de novo em alguns minutos.");
    }
    if ((await connectionState()) !== "open") throw new HttpError(503, "O atendimento por WhatsApp está indisponível agora. Use o formulário de contato.");

    // O número precisa ter WhatsApp: a conversa continua lá.
    const check = await evo<any>("POST", `/chat/whatsappNumbers/${enc(cfg.instance)}`, { numbers: [phone] });
    const found = (Array.isArray(check) ? check : []).find((r: any) => r?.exists);
    if (!found) throw new HttpError(400, "Esse número não tem WhatsApp. Confira o DDD e o número.");

    const firstName = name.split(/\s+/)[0];
    const greeting = `Olá, ${firstName}! Aqui é a AMT Sistemas. Recebemos sua mensagem pelo site:\n\n“${text}”\n\nJá vamos te responder por aqui.`;
    const sent = await evo<any>("POST", `/message/sendText/${enc(cfg.instance)}`, { number: phone, text: greeting, delay: 0 });
    const jid: string = sent?.key?.remoteJid || found.jid || `${phone}@s.whatsapp.net`;
    const chatId = await upsertChat(sb, jid, { phone, name });
    const { data: chat } = await sb.from("support_wa_chats").select("tags, name").eq("id", chatId).maybeSingle();
    await sb.from("support_wa_chats").update({
      tags: [...new Set([...(chat?.tags ?? []), "Site"])],
      ...(chat?.name ? {} : { name }),
    }).eq("id", chatId);

    const at = new Date(Date.now() - 1000).toISOString();
    await sb.from("support_wa_messages").insert({ chat_id: chatId, message_id: `site-${crypto.randomUUID()}`, from_me: false, type: "text", body: text, sent_at: at, source: "site" });
    await markSystemMessage(sb, chatId, sent, greeting, "auto");
    await touchFromVisitor(sb, chatId, text, at);

    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("support_site_sessions").insert({ chat_id: chatId, token_hash: await sha256Hex(token), ip_hash: ipHash, visitor_name: name });
    if (error) throw new Error(error.message);
    return { token, chat_id: chatId, messages: await siteMessages(sb, chatId) };
  }

  const session = await siteSession(sb, body.token);
  // chat_id: o servidor do site usa para ligar o lead à conversa (/admin/whatsapp?conversa=).
  if (action === "site_poll") return { chat_id: session.chat_id, messages: await siteMessages(sb, session.chat_id) };
  if (action === "site_send") {
    const text = str(body.text, 1000);
    if (!text) throw new HttpError(400, "Escreva a mensagem.");
    const since = new Date(Date.now() - 600_000).toISOString();
    const { count } = await sb.from("support_wa_messages").select("id", { count: "exact", head: true })
      .eq("chat_id", session.chat_id).eq("source", "site").gte("sent_at", since);
    if ((count ?? 0) >= SITE_MESSAGES_PER_10_MIN) throw new HttpError(429, "Muitas mensagens seguidas. Aguarde um pouco ou continue pelo WhatsApp.");
    const { data: chat } = await sb.from("support_wa_chats").select("remote_jid, phone_normalized").eq("id", session.chat_id).maybeSingle();
    if (!chat) throw new HttpError(401, "Conversa expirada. Comece de novo.");
    const at = new Date().toISOString();
    await sb.from("support_wa_messages").insert({ chat_id: session.chat_id, message_id: `site-${crypto.randomUUID()}`, from_me: false, type: "text", body: text, sent_at: at, source: "site" });
    // Cópia no WhatsApp: é o único jeito de a mensagem do site aparecer no celular do suporte, na mesma conversa.
    try {
      const relay = `📝 Mensagem enviada pelo site:\n“${text}”`;
      const sent = await evo<any>("POST", `/message/sendText/${enc(cfg.instance)}`, { number: chat.phone_normalized ?? recipient(chat.remote_jid), text: relay, delay: 0 });
      await markSystemMessage(sb, session.chat_id, sent, relay, "relay");
    } catch (err) {
      console.error("support-inbox: cópia da mensagem do site não enviada", err instanceof Error ? err.message : err);
    }
    await touchFromVisitor(sb, session.chat_id, text, at);
    return { messages: await siteMessages(sb, session.chat_id) };
  }
  throw new HttpError(400, "Ação inválida.");
}

/* ------------------------------- Entrada ------------------------------- */

async function webhook(req: Request): Promise<Response> {
  const cfg = config();
  if (!cfg) return json({ ok: false }, 503);
  if (!safeEqual(req.headers.get("x-amt-token") ?? "", await webhookToken(cfg.apiKey))) return json({ ok: false }, 401);
  const raw = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false }, 400);
  }
  const instance = String(payload?.instance?.instanceName ?? payload?.instance ?? "").trim();
  if (instance && instance !== cfg.instance) return json({ ignored: true });
  try {
    await handleEvent(adminClient(), payload);
    return json({ ok: true });
  } catch (err) {
    console.error("support-inbox: webhook", err instanceof Error ? err.message : err);
    return json({ ok: false }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (new URL(req.url).searchParams.get("hook") === "1") {
    return req.method === "POST" ? webhook(req) : json({ ok: true, service: "support-inbox-webhook" });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    // Chat do site: público, limitado por IP e por sessão.
    if (String(body.action ?? "").startsWith("site_")) return withCors(req, json(await site(req, adminClient(), body)));
    await assertControlCenterAdmin(req);
    return withCors(req, json(await panel(adminClient(), body)));
  } catch (error) {
    return withCors(req, errorResponse("support-inbox", error));
  }
});

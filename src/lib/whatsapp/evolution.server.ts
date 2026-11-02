// Cliente da Evolution API (WhatsApp via instância por academia).
//
// Servidor próprio da AMT (Docker), configurado por segredos do Worker:
//   EVOLUTION_API_URL  — ex.: https://whatsapp.amtsistemas.com.br
//   EVOLUTION_API_KEY  — AUTHENTICATION_API_KEY global da Evolution
// Sem eles o WhatsApp fica desligado e nada quebra (push segue normal).
//
// Feito para a v2; os formatos da v1 são aceitos nas respostas e, quando a
// v2 recusa o corpo, o envio tenta de novo no formato antigo.

const TIMEOUT_MS = 15_000;

export class EvolutionError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function evolutionConfig(): { url: string; apiKey: string } | null {
  const url = (process.env.EVOLUTION_API_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.EVOLUTION_API_KEY ?? "").trim();
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

function requireConfig() {
  const cfg = evolutionConfig();
  if (!cfg) throw new EvolutionError("Servidor de WhatsApp não configurado (EVOLUTION_API_URL / EVOLUTION_API_KEY).", 503);
  return cfg;
}

function messageOf(body: any, status: number): string {
  const raw = body?.response?.message ?? body?.message ?? body?.error ?? `HTTP ${status}`;
  const text = Array.isArray(raw) ? raw.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("; ") : String(raw);
  return text.slice(0, 300);
}

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
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text.slice(0, 300) };
    }
    if (!res.ok) throw new EvolutionError(messageOf(json, res.status), res.status);
    return json as T;
  } catch (err: any) {
    if (err instanceof EvolutionError) throw err;
    const msg = err?.name === "AbortError" ? "Servidor de WhatsApp não respondeu a tempo." : String(err?.message ?? err);
    throw new EvolutionError(msg, 0);
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export type EvolutionQr = { base64: string | null; code: string | null; pairingCode: string | null };

function readQr(raw: any): EvolutionQr {
  const q = raw?.qrcode ?? raw ?? {};
  const base64 = typeof q.base64 === "string" && q.base64 ? q.base64 : null;
  return {
    base64: base64 && !base64.startsWith("data:") ? `data:image/png;base64,${base64}` : base64,
    code: typeof q.code === "string" ? q.code : null,
    pairingCode: typeof q.pairingCode === "string" ? q.pairingCode : null,
  };
}

/**
 * Cria a instância e devolve o token dela e o primeiro QR (se veio). Para
 * conectar por código de pareamento, a instância precisa nascer com o número
 * (na v2.3 o código não sai para instância criada sem ele).
 */
export async function evolutionCreateInstance(
  instanceName: string,
  number?: string,
): Promise<{ token: string | null; qr: EvolutionQr }> {
  const res = await evo("POST", "/instance/create", {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    ...(number ? { number } : {}),
  });
  const hash = res?.hash;
  const token = typeof hash === "string" ? hash : typeof hash?.apikey === "string" ? hash.apikey : null;
  return { token, qr: readQr(res?.qrcode ?? {}) };
}

/** QR atual (cada chamada pode gerar um novo). Com `number`, devolve código de pareamento. */
export async function evolutionConnect(instanceName: string, number?: string): Promise<EvolutionQr> {
  const q = number ? `?number=${enc(number)}` : "";
  return readQr(await evo("GET", `/instance/connect/${enc(instanceName)}${q}`));
}

export type EvolutionState = "open" | "connecting" | "close";

export async function evolutionConnectionState(instanceName: string): Promise<EvolutionState> {
  const res = await evo("GET", `/instance/connectionState/${enc(instanceName)}`);
  const state = String(res?.instance?.state ?? res?.state ?? "close").toLowerCase();
  return state === "open" ? "open" : state === "connecting" ? "connecting" : "close";
}

/** Número e nome do perfil conectado (formatos v2 e v1). */
export async function evolutionInstanceInfo(
  instanceName: string,
): Promise<{ number: string | null; profileName: string | null }> {
  const res = await evo<any>("GET", `/instance/fetchInstances?instanceName=${enc(instanceName)}`);
  const list: any[] = Array.isArray(res) ? res : res ? [res] : [];
  const row = list.find((r) => (r?.name ?? r?.instance?.instanceName ?? r?.instanceName) === instanceName) ?? list[0];
  const inst = row?.instance ?? row ?? {};
  const jid: string = String(inst.ownerJid ?? inst.owner ?? inst.number ?? "");
  const digits = jid.split("@")[0].replace(/\D/g, "");
  return { number: digits || null, profileName: (inst.profileName as string) ?? null };
}

export const EVOLUTION_WEBHOOK_EVENTS = ["CONNECTION_UPDATE", "QRCODE_UPDATED", "MESSAGES_UPSERT"];

/** Webhook da instância com o segredo no header e na URL (versões sem header). */
export async function evolutionSetWebhook(instanceName: string, url: string, secret: string): Promise<void> {
  const withSecret = `${url}${url.includes("?") ? "&" : "?"}secret=${enc(secret)}`;
  try {
    await evo("POST", `/webhook/set/${enc(instanceName)}`, {
      webhook: {
        enabled: true,
        url: withSecret,
        headers: { "x-amt-webhook-secret": secret },
        byEvents: false,
        base64: false,
        events: EVOLUTION_WEBHOOK_EVENTS,
      },
    });
  } catch (err) {
    if (!(err instanceof EvolutionError) || err.status !== 400) throw err;
    await evo("POST", `/webhook/set/${enc(instanceName)}`, {
      enabled: true,
      url: withSecret,
      webhook_by_events: false,
      events: EVOLUTION_WEBHOOK_EVENTS,
    });
  }
}

export async function evolutionLogout(instanceName: string): Promise<void> {
  await evo("DELETE", `/instance/logout/${enc(instanceName)}`);
}

export async function evolutionDeleteInstance(instanceName: string): Promise<void> {
  await evo("DELETE", `/instance/delete/${enc(instanceName)}`);
}

export async function evolutionSendText(instanceName: string, number: string, text: string): Promise<void> {
  try {
    await evo("POST", `/message/sendText/${enc(instanceName)}`, { number, text });
  } catch (err) {
    if (!(err instanceof EvolutionError) || err.status !== 400 || !/textMessage/i.test(err.message)) throw err;
    await evo("POST", `/message/sendText/${enc(instanceName)}`, { number, textMessage: { text } });
  }
}

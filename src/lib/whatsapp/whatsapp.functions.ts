// Painel do dono: conectar o WhatsApp da academia (Evolution API) e
// configurar o envio das notificações dos alunos. Só o dono acessa — o
// número conectado é dele; logins de equipe recebem erro.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveDojoIdentity } from "@/lib/dojo/owner-scope";

type Ctx = Parameters<typeof resolveDojoIdentity>[0];

async function requireOwner(context: Ctx): Promise<string> {
  const identity = await resolveDojoIdentity(context);
  if (!identity.isOwner) throw new Error("Somente o dono do dojo pode configurar o WhatsApp da academia.");
  return identity.ownerId;
}

async function server() {
  const evo = await import("./evolution.server");
  const dom = await import("./dojo-whatsapp.server");
  return { ...evo, ...dom };
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function publicInstance(row: any) {
  if (!row) return null;
  return {
    status: row.status as "disconnected" | "connecting" | "connected",
    phone_number: (row.phone_number as string) ?? null,
    profile_name: (row.profile_name as string) ?? null,
    enabled: row.enabled !== false,
    categories: (row.categories ?? {}) as Record<string, boolean>,
    templates: (row.templates ?? {}) as Record<string, string>,
    connected_at: (row.connected_at as string) ?? null,
  };
}

/** Lê a conexão na Evolution e grava no banco (número e perfil ao conectar). */
async function syncStatus(ownerId: string): Promise<any> {
  const s = await server();
  const db = await s.adminDb();
  const { data: row } = await db.from(s.INSTANCES_TABLE).select("*").eq("owner_id", ownerId).maybeSingle();
  if (!row || !s.evolutionConfig()) return row;
  let state: "open" | "connecting" | "close";
  try {
    state = await s.evolutionConnectionState(row.instance_name);
  } catch (err: any) {
    // instância apagada no servidor: volta a "desconectado"
    if (err?.status === 404) state = "close";
    else return row;
  }
  const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
  const patch: Record<string, unknown> = { status, last_status_at: new Date().toISOString() };
  if (status === "connected" && (row.status !== "connected" || !row.phone_number)) {
    patch.connected_at = row.status === "connected" ? row.connected_at : new Date().toISOString();
    try {
      const info = await s.evolutionInstanceInfo(row.instance_name);
      if (info.number) patch.phone_number = info.number;
      if (info.profileName) patch.profile_name = info.profileName;
    } catch {
      /* segue só com o status */
    }
  }
  const { data: updated } = await db
    .from(s.INSTANCES_TABLE)
    .update(patch)
    .eq("owner_id", ownerId)
    .select("*")
    .maybeSingle();
  return updated ?? { ...row, ...patch };
}

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    const configured = !!s.evolutionConfig();
    const row = configured ? await syncStatus(ownerId) : null;

    const db = await s.adminDb();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [sent, pending, failed, profile] = await Promise.all([
      db.from(s.OUTBOX_TABLE).select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("status", "sent").gte("sent_at", since),
      db.from(s.OUTBOX_TABLE).select("id", { count: "exact", head: true }).eq("owner_id", ownerId).in("status", ["pending", "sending"]),
      db.from(s.OUTBOX_TABLE).select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("status", "failed").gte("created_at", since),
      db.from("dojo_academy_profile").select("trade_name, legal_name").eq("owner_id", ownerId).maybeSingle(),
    ]);
    return {
      configured,
      academyName: ((profile.data as any)?.trade_name || (profile.data as any)?.legal_name || null) as string | null,
      instance: publicInstance(row),
      stats: { sent24h: sent.count ?? 0, pending: pending.count ?? 0, failed24h: failed.count ?? 0 },
    };
  });

/**
 * Inicia a conexão: cria a instância da academia (se ainda não existe),
 * configura o webhook e devolve o QR Code. Com `phone`, devolve o código de
 * pareamento de 8 dígitos (alternativa ao QR).
 */
export const startWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { phone?: string | null }) => ({ phone: input?.phone ? String(input.phone) : null }))
  .handler(async ({ data, context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    if (!s.evolutionConfig()) throw new Error("O servidor de WhatsApp ainda não foi configurado pela AMT.");
    const db = await s.adminDb();

    let { data: row } = await db.from(s.INSTANCES_TABLE).select("*").eq("owner_id", ownerId).maybeSingle();
    const instanceName = row?.instance_name ?? `amtdojo-${ownerId.replace(/-/g, "")}`;
    let firstQr: Awaited<ReturnType<typeof s.evolutionConnect>> | null = null;

    if (!row) {
      const secret = randomSecret();
      let token: string | null = null;
      try {
        const created = await s.evolutionCreateInstance(instanceName);
        token = created.token;
        firstQr = created.qr;
      } catch (err: any) {
        // já existe no servidor (ex.: registro local apagado): reaproveita
        if (!/already|exist|in use/i.test(String(err?.message))) throw err;
      }
      const ins = await db
        .from(s.INSTANCES_TABLE)
        .insert({ owner_id: ownerId, instance_name: instanceName, instance_token: token, webhook_secret: secret, status: "connecting" })
        .select("*")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      row = ins.data;
    }

    const { dojoPublicOrigin } = await import("@/lib/asaas/dojo-credentials.server");
    try {
      await s.evolutionSetWebhook(instanceName, `${dojoPublicOrigin()}/api/public/hooks/evolution`, row.webhook_secret);
    } catch (err: any) {
      console.warn("[whatsapp] webhook não configurado:", err?.message ?? err);
    }

    const state = await s.evolutionConnectionState(instanceName).catch(() => "close" as const);
    if (state === "open") {
      const synced = await syncStatus(ownerId);
      return { status: "connected" as const, qr: null, pairingCode: null, instance: publicInstance(synced) };
    }

    const phone = data.phone ? s.normalizePhone(data.phone) : null;
    if (data.phone && !phone) throw new Error("Informe o celular com DDD (ex.: 11 98765-4321).");
    let qr = firstQr?.base64 ? firstQr : null;
    if (phone) {
      // Código de pareamento: recria a instância (ainda não conectada) já com o número.
      await s.evolutionDeleteInstance(instanceName).catch(() => undefined);
      const created = await s.evolutionCreateInstance(instanceName, phone);
      if (created.token) await db.from(s.INSTANCES_TABLE).update({ instance_token: created.token }).eq("owner_id", ownerId);
      try {
        await s.evolutionSetWebhook(instanceName, `${dojoPublicOrigin()}/api/public/hooks/evolution`, row.webhook_secret);
      } catch (err: any) {
        console.warn("[whatsapp] webhook não configurado:", err?.message ?? err);
      }
      qr = null;
      for (let i = 0; i < 6 && !qr?.pairingCode; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        qr = await s.evolutionConnect(instanceName, phone);
      }
      if (!qr?.pairingCode) throw new Error("O WhatsApp não gerou o código agora. Tente de novo ou use o QR Code.");
    } else if (!qr) {
      qr = await s.evolutionConnect(instanceName);
    }
    await db.from(s.INSTANCES_TABLE).update({ status: "connecting", last_status_at: new Date().toISOString() }).eq("owner_id", ownerId);
    return { status: "connecting" as const, qr: qr.base64, pairingCode: qr.pairingCode, instance: publicInstance({ ...row, status: "connecting" }) };
  });

/** Acompanha a leitura do QR. Com `refreshQr`, pede um QR novo (o anterior expira). */
export const pollWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { refreshQr?: boolean }) => ({ refreshQr: !!input?.refreshQr }))
  .handler(async ({ data, context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    const row = await syncStatus(ownerId);
    if (!row) return { status: "disconnected" as const, qr: null, instance: null };
    if (row.status === "connected") return { status: "connected" as const, qr: null, instance: publicInstance(row) };
    let qr: string | null = null;
    if (data.refreshQr) {
      try {
        qr = (await s.evolutionConnect(row.instance_name)).base64;
      } catch {
        qr = null;
      }
    }
    return { status: row.status as "connecting" | "disconnected", qr, instance: publicInstance(row) };
  });

/** Desconecta o número e apaga a instância (a próxima conexão começa do zero). */
export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    const db = await s.adminDb();
    const { data: row } = await db.from(s.INSTANCES_TABLE).select("instance_name").eq("owner_id", ownerId).maybeSingle();
    if (row && s.evolutionConfig()) {
      await s.evolutionLogout(row.instance_name).catch(() => undefined);
      await s.evolutionDeleteInstance(row.instance_name).catch(() => undefined);
    }
    await db.from(s.INSTANCES_TABLE).delete().eq("owner_id", ownerId);
    await db
      .from(s.OUTBOX_TABLE)
      .update({ status: "skipped", last_error: "WhatsApp desconectado pela academia" })
      .eq("owner_id", ownerId)
      .eq("status", "pending");
    return { ok: true };
  });

export const saveWhatsAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { enabled?: boolean; categories?: Record<string, boolean>; templates?: Record<string, string> }) => input)
  .handler(async ({ data, context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    const db = await s.adminDb();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (data.categories && typeof data.categories === "object") {
      const clean: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(data.categories)) {
        if (/^[a-z_]{2,40}$/.test(k) && typeof v === "boolean") clean[k] = v;
      }
      patch.categories = clean;
    }
    if (data.templates && typeof data.templates === "object") {
      const { cleanWhatsAppTemplates } = await import("./templates");
      patch.templates = cleanWhatsAppTemplates(data.templates);
    }
    const { data: row, error } = await db.from(s.INSTANCES_TABLE).update(patch).eq("owner_id", ownerId).select("*").maybeSingle();
    if (error) {
      if (/templates/.test(error.message)) throw new Error("A personalização das mensagens ainda não foi ativada no banco (migration pendente).");
      throw new Error(error.message);
    }
    if (!row) throw new Error("Conecte o WhatsApp antes de ajustar o envio.");
    return { ok: true, instance: publicInstance(row) };
  });

/** Mensagem de teste direta (não passa pela fila). */
export const sendWhatsAppTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { phone: string }) => ({ phone: String(input?.phone ?? "") }))
  .handler(async ({ data, context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    const phone = s.normalizePhone(data.phone);
    if (!phone) throw new Error("Informe o celular com DDD (ex.: 11 98765-4321).");
    const row = await syncStatus(ownerId);
    if (!row || row.status !== "connected") throw new Error("O WhatsApp da academia não está conectado.");
    const db = await s.adminDb();
    const { data: profile } = await db
      .from("dojo_academy_profile")
      .select("trade_name, legal_name")
      .eq("owner_id", ownerId)
      .maybeSingle();
    const name = profile?.trade_name || profile?.legal_name || "sua academia";
    await s.evolutionSendText(
      row.instance_name,
      phone,
      `✅ Teste do AMT Dojo Manager\n\nO WhatsApp de *${name}* está conectado. As notificações dos alunos (mensalidades, aulas, graduações e avisos) vão chegar por aqui.`,
    );
    return { ok: true };
  });

export const listWhatsAppMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ownerId = await requireOwner(context);
    const s = await server();
    const db = await s.adminDb();
    const { data, error } = await db
      .from(s.OUTBOX_TABLE)
      .select("id, student_id, phone, category, message, status, attempts, last_error, created_at, sent_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set(((data ?? []) as any[]).map((r) => r.student_id).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: st } = await db.from("dojo_students").select("id, full_name").in("id", ids).eq("owner_id", ownerId);
      for (const r of (st ?? []) as any[]) names.set(r.id, r.full_name);
    }
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      student_name: r.student_id ? names.get(r.student_id) ?? null : null,
      phone: r.phone as string,
      category: (r.category as string) ?? null,
      preview: String(r.message).split("\n").find((l: string) => l.startsWith("*"))?.replace(/\*/g, "") ?? String(r.message).slice(0, 80),
      status: r.status as "pending" | "sending" | "sent" | "failed" | "skipped",
      last_error: (r.last_error as string) ?? null,
      created_at: r.created_at as string,
      sent_at: (r.sent_at as string) ?? null,
    }));
  });

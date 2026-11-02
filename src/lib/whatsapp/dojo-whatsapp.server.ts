// WhatsApp dos alunos: fila e envio pela instância Evolution de cada academia.
//
// Regras:
// - toda notificação que passa por sendPushToStudents entra na fila (mesmas
//   categorias e preferências da academia do push);
// - só academias com WhatsApp conectado e ligado, e categoria não desligada
//   no WhatsApp (categoria ausente = ligada);
// - aluno menor de idade com telefone de responsável recebe no responsável;
//   quem respondeu SAIR (whatsapp_opt_out) não recebe;
// - o envio sai pelo cron (whatsapp-dispatch), até 25 por minuto por academia,
//   com intervalo entre mensagens para não sobrecarregar o número do dono.

import type { PushPayload } from "@/lib/push/push-core.server";

export type WhatsAppInstanceRow = {
  owner_id: string;
  instance_name: string;
  instance_token: string | null;
  webhook_secret: string;
  status: "disconnected" | "connecting" | "connected";
  phone_number: string | null;
  profile_name: string | null;
  enabled: boolean;
  categories: Record<string, boolean> | null;
  connected_at: string | null;
  last_status_at: string | null;
};

type OutboxRow = {
  id: string;
  owner_id: string;
  student_id: string | null;
  phone: string;
  category: string | null;
  message: string;
  status: string;
  attempts: number;
};

export const INSTANCES_TABLE = "dojo_whatsapp_instances";
export const OUTBOX_TABLE = "dojo_whatsapp_outbox";

const PER_OWNER_PER_RUN = 25;
const GAP_MS = 1_100;
const RUN_BUDGET_MS = 42_000;
const MAX_ATTEMPTS = 3;

export async function adminDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Telefone em dígitos com DDI. Números brasileiros sem 55 ganham o 55. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/**
 * Chave para comparar números (resposta SAIR): no Brasil o WhatsApp pode
 * devolver o celular sem o nono dígito, então compara DDD + 8 últimos.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  if (!n) return null;
  if (n.startsWith("55") && n.length >= 12) return `55${n.slice(2, 4)}${n.slice(-8)}`;
  return n;
}

function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

type StudentContact = {
  id: string;
  owner_id: string;
  full_name: string | null;
  phone: string | null;
  guardian_phone: string | null;
  birth_date: string | null;
  whatsapp_opt_out: boolean | null;
};

/** Para quem vai a mensagem do aluno: menor com responsável → responsável. */
export function recipientFor(s: StudentContact): { phone: string; guardian: boolean } | null {
  const age = ageFrom(s.birth_date);
  const guardian = normalizePhone(s.guardian_phone);
  const own = normalizePhone(s.phone);
  if (age != null && age < 18 && guardian) return { phone: guardian, guardian: true };
  if (own) return { phone: own, guardian: false };
  if (guardian) return { phone: guardian, guardian: true };
  return null;
}

function firstName(name: string | null | undefined): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function buildWhatsAppMessage(opts: {
  payload: PushPayload;
  studentName: string | null;
  guardian: boolean;
  academyName: string | null;
  origin: string | null;
}): string {
  const { payload, guardian, academyName, origin } = opts;
  const first = firstName(opts.studentName);
  const greeting = guardian
    ? first
      ? `Olá! Mensagem sobre *${first}*:`
      : "Olá!"
    : first
      ? `Olá, ${first}!`
      : "Olá!";
  const lines = [greeting, "", `*${payload.title.trim()}*`];
  if (payload.body?.trim()) lines.push(payload.body.trim());
  if (payload.url && origin) {
    const link = /^https?:\/\//i.test(payload.url) ? payload.url : `${origin}${payload.url.startsWith("/") ? "" : "/"}${payload.url}`;
    lines.push("", `Abrir no app: ${link}`);
  }
  if (academyName) lines.push("", `_${academyName}_`);
  lines.push("_Para não receber mais mensagens, responda SAIR._");
  return lines.join("\n");
}

function categoryOn(categories: Record<string, boolean> | null | undefined, category: string | undefined): boolean {
  if (!category) return true;
  return (categories ?? {})[category] !== false;
}

/**
 * Coloca na fila o WhatsApp de uma notificação de alunos. Nunca lança: o
 * push e o fluxo de quem chamou seguem mesmo se o WhatsApp falhar.
 */
export async function enqueueStudentWhatsApp(
  studentIds: string[],
  payload: PushPayload,
  category?: string,
): Promise<number> {
  try {
    const { evolutionConfig } = await import("./evolution.server");
    if (!evolutionConfig() || studentIds.length === 0) return 0;
    const db = await adminDb();

    const { data: students, error } = await db
      .from("dojo_students")
      .select("id, owner_id, full_name, phone, guardian_phone, birth_date, whatsapp_opt_out")
      .in("id", studentIds);
    if (error || !students?.length) return 0;

    const ownerIds = Array.from(new Set((students as StudentContact[]).map((s) => s.owner_id)));
    const { data: instances } = await db
      .from(INSTANCES_TABLE)
      .select("owner_id, status, enabled, categories")
      .in("owner_id", ownerIds)
      .eq("status", "connected")
      .eq("enabled", true);
    const activeOwners = new Set(
      ((instances ?? []) as WhatsAppInstanceRow[])
        .filter((i) => categoryOn(i.categories, category))
        .map((i) => i.owner_id),
    );
    if (activeOwners.size === 0) return 0;

    const { data: profiles } = await db
      .from("dojo_academy_profile")
      .select("owner_id, trade_name, legal_name")
      .in("owner_id", Array.from(activeOwners));
    const academyName = new Map<string, string | null>(
      ((profiles ?? []) as any[]).map((p) => [p.owner_id, p.trade_name || p.legal_name || null]),
    );

    let origin: string | null = null;
    try {
      const { dojoPublicOrigin } = await import("@/lib/asaas/dojo-credentials.server");
      origin = dojoPublicOrigin();
    } catch {
      origin = null;
    }

    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    for (const s of students as StudentContact[]) {
      if (!activeOwners.has(s.owner_id) || s.whatsapp_opt_out) continue;
      const to = recipientFor(s);
      if (!to) continue;
      const message = buildWhatsAppMessage({
        payload,
        studentName: s.full_name,
        guardian: to.guardian,
        academyName: academyName.get(s.owner_id) ?? null,
        origin,
      });
      const key = `${s.owner_id}|${to.phone}|${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ owner_id: s.owner_id, student_id: s.id, phone: to.phone, category: category ?? null, message });
    }
    if (rows.length === 0) return 0;

    const { error: insErr } = await db.from(OUTBOX_TABLE).insert(rows);
    if (insErr) {
      console.warn("[whatsapp] falha ao enfileirar:", insErr.message);
      return 0;
    }
    return rows.length;
  } catch (err: any) {
    console.warn("[whatsapp] enfileiramento falhou:", err?.message ?? err);
    return 0;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function looksDisconnected(message: string): boolean {
  return /connection closed|not connected|disconnected|instance.*(does not exist|not found)|close|não respondeu/i.test(message);
}

/** Envia o próximo lote da fila (chamado pelo cron a cada minuto). */
export async function dispatchWhatsAppOutbox(): Promise<{ claimed: number; sent: number; failed: number; skipped: number }> {
  const result = { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  const { evolutionConfig, evolutionSendText, evolutionConnectionState } = await import("./evolution.server");
  if (!evolutionConfig()) return result;
  const db = await adminDb();
  const started = Date.now();

  const { data: claimed, error } = await db.rpc("dojo_whatsapp_claim", { _limit_per_owner: PER_OWNER_PER_RUN });
  if (error) throw new Error(`dojo_whatsapp_claim: ${error.message}`);
  const rows = (claimed ?? []) as OutboxRow[];
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  const byOwner = new Map<string, OutboxRow[]>();
  for (const r of rows) byOwner.set(r.owner_id, [...(byOwner.get(r.owner_id) ?? []), r]);

  const { data: instances } = await db
    .from(INSTANCES_TABLE)
    .select("owner_id, instance_name, status, enabled")
    .in("owner_id", Array.from(byOwner.keys()));
  const instanceOf = new Map<string, WhatsAppInstanceRow>(
    ((instances ?? []) as WhatsAppInstanceRow[]).map((i) => [i.owner_id, i]),
  );

  const finish = async (ids: string[], patch: Record<string, unknown>) => {
    if (ids.length) await db.from(OUTBOX_TABLE).update(patch).in("id", ids);
  };

  await Promise.all(
    Array.from(byOwner.entries()).map(async ([ownerId, list]) => {
      const inst = instanceOf.get(ownerId);
      if (!inst || inst.status !== "connected" || !inst.enabled) {
        result.skipped += list.length;
        await finish(
          list.map((r) => r.id),
          { status: "skipped", last_error: inst?.enabled === false ? "WhatsApp pausado pela academia" : "WhatsApp desconectado" },
        );
        return;
      }
      for (let i = 0; i < list.length; i++) {
        const row = list[i];
        if (Date.now() - started > RUN_BUDGET_MS) {
          // devolve o resto para o próximo minuto sem gastar tentativa
          await Promise.all(
            list.slice(i).map((r) =>
              finish([r.id], { status: "pending", attempts: Math.max(0, r.attempts - 1), next_attempt_at: new Date().toISOString() }),
            ),
          );
          return;
        }
        try {
          await evolutionSendText(inst.instance_name, row.phone, row.message);
          result.sent++;
          await finish([row.id], { status: "sent", sent_at: new Date().toISOString(), last_error: null });
        } catch (err: any) {
          const message = String(err?.message ?? err).slice(0, 300);
          const finalFail = row.attempts >= MAX_ATTEMPTS;
          if (finalFail) result.failed++;
          await finish([row.id], {
            status: finalFail ? "failed" : "pending",
            last_error: message,
            next_attempt_at: new Date(Date.now() + 2 ** row.attempts * 60_000).toISOString(),
          });
          if (looksDisconnected(message)) {
            // confere o estado real; desconectado → para esta academia neste minuto
            const state = await evolutionConnectionState(inst.instance_name).catch(() => "close" as const);
            if (state !== "open") {
              await db
                .from(INSTANCES_TABLE)
                .update({ status: "disconnected", last_status_at: new Date().toISOString() })
                .eq("owner_id", ownerId);
              await finish(
                list.slice(i + 1).map((r) => r.id),
                { status: "pending", next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() },
              );
              return;
            }
          }
        }
        if (i < list.length - 1) await sleep(GAP_MS);
      }
    }),
  );

  // Limpeza: histórico de 60 dias basta para o painel.
  await db
    .from(OUTBOX_TABLE)
    .delete()
    .lt("created_at", new Date(Date.now() - 60 * 86_400_000).toISOString())
    .then(
      () => undefined,
      () => undefined,
    );
  return result;
}

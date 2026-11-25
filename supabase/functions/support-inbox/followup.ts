import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Follow-up do teste grátis pelo WhatsApp do suporte (instância amt-suporte).
//
// Para quem testou o AMT Dojo Manager e não assinou: 3 mensagens, nos dias 1, 3 e 7 depois do fim do
// teste, em horário comercial (seg–sáb, 9h–19h de Brasília). Liga/desliga em app_settings
// 'trial_followup' (/admin › WhatsApp › Follow-up do teste).
//
// A sequência para sozinha quando:
//   - a academia assina (dojo_subscriptions.status = 'active');
//   - o cliente responde qualquer coisa (a conversa fica com a equipe, assistente virtual pausado);
//   - o cliente responde SAIR (não recebe mais);
//   - o cliente pede MAIS 7 DIAS (fica marcado no /admin para liberar com um clique).
// Liberados os 7 dias, quando o novo prazo acabar começa um 2º ciclo, sem a oferta de prorrogação.
//
// Tabelas (service role): trial_followups (cada mensagem enviada) e trial_followup_state (situação por
// academia). Chamado de hora em hora pelo pg_cron (support-inbox?cron=followup).

export const FOLLOWUP_SETTINGS_KEY = "trial_followup";
const SYSTEM = "dojo";
const SUBSCRIBE_URL = "https://amtdojomanager.com.br/dojo/app/subscription";
/** Dias depois do fim do teste em que cada mensagem pode sair. */
const STEP_DAYS = [1, 3, 7];
/** Intervalo mínimo (dias) desde a mensagem anterior. */
const MIN_GAP_DAYS = [0, 2, 3];
/** Teste que acabou há mais tempo que isto não começa a sequência (não incomodar contas antigas). */
const START_WINDOW_DAYS = 10;
/** Assistente virtual fica quieto na conversa depois de um follow-up: quem responde é a equipe. */
const BOT_PAUSE_DAYS = 10;
const EXTENSION_DAYS = 7;
const MAX_SENDS_PER_RUN = 15;
const NOT_CONVERTED = ["trialing", "pending", "suspended", "expired", "inactive", "past_due", "trial_expired"];

export type FollowupSettings = { enabled: boolean };

export type FollowupDeps = {
  sendText: (to: string, text: string) => Promise<any>;
  /** Grava a mensagem na caixa do /admin e devolve o id da conversa. */
  recordOutgoing: (to: string, res: any, text: string) => Promise<string | null>;
  normalizePhone: (raw: string | null | undefined) => string | null;
};

type Sub = { owner_id: string; status: string; plan_code: string | null; trial_ends_at: string | null };
type State = {
  system: string; owner_id: string; cycle: number; trial_ends_at: string | null;
  stopped_at: string | null; stop_reason: string | null; chat_id: string | null; phone: string | null;
};
type Sent = { owner_id: string; cycle: number; step: number; status: string; sent_at: string; chat_id: string | null };

/* --------------------------------- Datas --------------------------------- */

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const brDay = (d: Date | string) => dayFmt.format(typeof d === "string" ? new Date(d) : d);
const brDate = (day: string) => day.split("-").reverse().join("/");
const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/** Seg–sáb, 9h às 19h em Brasília. */
export function isBusinessHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return weekday !== "Sun" && hour >= 9 && hour < 19;
}

/* ------------------------------- Mensagens ------------------------------- */

type MessageCtx = { firstName: string | null; academy: string | null; endDay: string; offerExtension: boolean };

export function followupMessage(step: number, ctx: MessageCtx): string {
  const hi = ctx.firstName ? `Olá, ${ctx.firstName}!` : "Olá!";
  const academy = ctx.academy ? ` da *${ctx.academy}*` : "";
  const offer = ctx.offerExtension
    ? "\n\nPrecisa de mais tempo para testar? Responda *MAIS 7 DIAS* que liberamos para você."
    : "";
  const out = "\n\n_Para não receber mais estes lembretes, responda SAIR._";
  if (step === 1) {
    return `${hi} Aqui é a equipe da AMT Sistemas 👋\n\nO teste grátis do *AMT Dojo Manager*${academy} terminou em ${brDate(ctx.endDay)}. Fique tranquilo: alunos, turmas e tudo o que você cadastrou continuam guardados.\n\nPara continuar usando, é só escolher o plano:\n${SUBSCRIBE_URL}${offer}${out}`;
  }
  if (step === 2) {
    return `${hi} Ficou alguma dúvida sobre o *AMT Dojo Manager*?\n\nPosso te ajudar a configurar mensalidades, check-in ou o app do aluno — é só responder por aqui que a equipe te atende.${offer}${out}`;
  }
  return `${hi} Último lembrete: os dados${academy} seguem guardados no *AMT Dojo Manager*.\n\nPara voltar a usar, escolha o plano em:\n${SUBSCRIBE_URL}${offer}\n\nQualquer dúvida, estamos por aqui. 🥋${out}`;
}

/* --------------------------- Configuração e dados --------------------------- */

export async function followupSettings(sb: SupabaseClient): Promise<FollowupSettings> {
  const { data } = await sb.from("app_settings").select("value").eq("key", FOLLOWUP_SETTINGS_KEY).maybeSingle();
  const v = (data?.value ?? {}) as Partial<FollowupSettings>;
  return { enabled: v.enabled === true };
}

export async function saveFollowupSettings(sb: SupabaseClient, patch: Partial<FollowupSettings>): Promise<FollowupSettings> {
  const next = { ...(await followupSettings(sb)), ...patch };
  const { error } = await sb.from("app_settings").upsert({ key: FOLLOWUP_SETTINGS_KEY, value: next }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return next;
}

type Contact = { phone: string | null; firstName: string | null; academy: string | null };

async function contactOf(sb: SupabaseClient, ownerId: string, deps: FollowupDeps): Promise<Contact> {
  const { data: profile } = await sb.from("dojo_academy_profile").select("trade_name, legal_name, whatsapp, phone").eq("owner_id", ownerId).maybeSingle();
  let meta: Record<string, any> = {};
  let authPhone: string | null = null;
  try {
    const { data } = await sb.auth.admin.getUserById(ownerId);
    meta = (data?.user?.user_metadata ?? {}) as Record<string, any>;
    authPhone = data?.user?.phone ?? null;
  } catch {
    /* sem conta de login: usa só o perfil */
  }
  const raw = profile?.whatsapp || meta.whatsapp || meta.phone || profile?.phone || authPhone || null;
  const fullName = String(meta.full_name ?? meta.name ?? "").trim();
  const first = fullName.split(/\s+/)[0] ?? "";
  return {
    phone: deps.normalizePhone(raw),
    firstName: first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : null,
    academy: (profile?.trade_name || profile?.legal_name || null) as string | null,
  };
}

async function loadStates(sb: SupabaseClient, ownerIds: string[]): Promise<Map<string, State>> {
  if (!ownerIds.length) return new Map();
  const { data } = await sb.from("trial_followup_state").select("*").eq("system", SYSTEM).in("owner_id", ownerIds);
  return new Map(((data ?? []) as State[]).map((s) => [s.owner_id, s]));
}

async function loadSent(sb: SupabaseClient, ownerIds: string[]): Promise<Map<string, Sent[]>> {
  const map = new Map<string, Sent[]>();
  if (!ownerIds.length) return map;
  const { data } = await sb.from("trial_followups").select("owner_id, cycle, step, status, sent_at, chat_id").eq("system", SYSTEM).in("owner_id", ownerIds).order("sent_at");
  for (const r of (data ?? []) as Sent[]) map.set(r.owner_id, [...(map.get(r.owner_id) ?? []), r]);
  return map;
}

async function saveState(sb: SupabaseClient, state: Partial<State> & { owner_id: string }) {
  const { error } = await sb.from("trial_followup_state").upsert({ system: SYSTEM, ...state, updated_at: new Date().toISOString() }, { onConflict: "system,owner_id" });
  if (error) throw new Error(error.message);
}

/** Estado do ciclo atual: um prazo novo (teste prorrogado) abre outro ciclo. */
export function currentState(sub: Sub, state: State | undefined): State {
  const base: State = state ?? { system: SYSTEM, owner_id: sub.owner_id, cycle: 1, trial_ends_at: sub.trial_ends_at, stopped_at: null, stop_reason: null, chat_id: null, phone: null };
  if (state && sub.trial_ends_at && state.trial_ends_at && new Date(sub.trial_ends_at).getTime() > new Date(state.trial_ends_at).getTime() + 3600_000) {
    return { ...base, cycle: state.cycle + 1, trial_ends_at: sub.trial_ends_at, stopped_at: null, stop_reason: null };
  }
  return { ...base, trial_ends_at: base.trial_ends_at ?? sub.trial_ends_at };
}

type Plan =
  | { kind: "send"; step: number }
  | { kind: "wait"; step: number; day: string }
  | { kind: "done" }
  | { kind: "stopped"; reason: string };

/** O que fazer com esta academia agora (sem enviar nada). */
export function planFor(sub: Sub, state: State, sent: Sent[], today: string): Plan {
  if (sub.status === "active") return { kind: "stopped", reason: "subscribed" };
  if (state.stopped_at) return { kind: "stopped", reason: state.stop_reason ?? "manual" };
  if (!sub.trial_ends_at || new Date(sub.trial_ends_at).getTime() > Date.now()) return { kind: "done" };
  const cycleSent = sent.filter((s) => s.cycle === state.cycle && s.status === "sent");
  const next = cycleSent.length;
  if (next >= STEP_DAYS.length) return { kind: "done" };
  const endDay = brDay(sub.trial_ends_at);
  const since = daysBetween(endDay, today);
  if (next === 0 && since > START_WINDOW_DAYS) return { kind: "stopped", reason: "too_old" };
  const last = cycleSent[cycleSent.length - 1];
  const byEnd = addDays(endDay, STEP_DAYS[next]);
  const byGap = last ? addDays(brDay(last.sent_at), MIN_GAP_DAYS[next]) : byEnd;
  const due = byEnd > byGap ? byEnd : byGap;
  return due <= today ? { kind: "send", step: next + 1 } : { kind: "wait", step: next + 1, day: due };
}

function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

/* ------------------------------- Execução ------------------------------- */

async function subscriptions(sb: SupabaseClient, ownerId?: string): Promise<Sub[]> {
  let q = sb.from("dojo_subscriptions").select("owner_id, status, plan_code, trial_ends_at").not("trial_ends_at", "is", null);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Sub[];
}

/** Uma passada do cron: envia o que estiver na vez. */
export async function runFollowups(sb: SupabaseClient, deps: FollowupDeps, opts: { ignoreHours?: boolean } = {}) {
  const result = { checked: 0, sent: 0, failed: 0, stopped: 0, skipped: "" };
  if (!(await followupSettings(sb)).enabled) return { ...result, skipped: "desligado" };
  if (!opts.ignoreHours && !isBusinessHours()) return { ...result, skipped: "fora do horário comercial" };

  const subs = (await subscriptions(sb)).filter((s) => s.status === "active" || NOT_CONVERTED.includes(s.status));
  const ids = subs.map((s) => s.owner_id);
  const [states, sentMap] = await Promise.all([loadStates(sb, ids), loadSent(sb, ids)]);
  const today = brDay(new Date());

  for (const sub of subs) {
    const prev = states.get(sub.owner_id);
    if (sub.status === "active" && !prev) continue; // assinou sem nunca ter entrado no follow-up
    result.checked++;
    const state = currentState(sub, prev);
    const plan = planFor(sub, state, sentMap.get(sub.owner_id) ?? [], today);
    if (plan.kind === "stopped" && !state.stopped_at) {
      await saveState(sb, { ...state, stopped_at: new Date().toISOString(), stop_reason: plan.reason });
      result.stopped++;
      continue;
    }
    if (plan.kind !== "send") {
      if (!prev || prev.cycle !== state.cycle) await saveState(sb, state);
      continue;
    }
    if (result.sent + result.failed >= MAX_SENDS_PER_RUN) break;

    const contact = await contactOf(sb, sub.owner_id, deps);
    if (!contact.phone) {
      await saveState(sb, { ...state, stopped_at: new Date().toISOString(), stop_reason: "no_phone" });
      result.stopped++;
      continue;
    }
    const text = followupMessage(plan.step, {
      firstName: contact.firstName,
      academy: contact.academy,
      endDay: brDay(sub.trial_ends_at!),
      offerExtension: state.cycle === 1,
    });
    const row = { system: SYSTEM, owner_id: sub.owner_id, cycle: state.cycle, step: plan.step, phone: contact.phone, message: text };
    try {
      const res = await deps.sendText(contact.phone, text);
      const chatId = await deps.recordOutgoing(contact.phone, res, text);
      await sb.from("trial_followups").upsert({ ...row, status: "sent", error: null, chat_id: chatId, sent_at: new Date().toISOString() }, { onConflict: "system,owner_id,cycle,step" });
      if (chatId) {
        // A conversa é desta academia e quem responde é a equipe (o assistente fica quieto).
        await sb.from("support_wa_chats").update({
          academy_owner_id: sub.owner_id,
          bot_paused_until: new Date(Date.now() + BOT_PAUSE_DAYS * 86_400_000).toISOString(),
        }).eq("id", chatId);
      }
      await saveState(sb, { ...state, chat_id: chatId ?? state.chat_id, phone: contact.phone });
      result.sent++;
      await new Promise((r) => setTimeout(r, 2500)); // ritmo humano entre envios
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sb.from("trial_followups").upsert({ ...row, status: "failed", error: message.slice(0, 300) }, { onConflict: "system,owner_id,cycle,step" });
      await saveState(sb, { ...state, phone: contact.phone });
      result.failed++;
    }
  }
  return result;
}

/* --------------------------- Resposta do cliente --------------------------- */

const OPT_OUT = /^\s*(sair|parar|pare|stop|cancelar|descadastrar)\b/i;
const WANTS_EXTENSION = /mais\s*(7|sete)\s*dias|\+\s*7|prorroga|estender|mais\s+(um\s+)?prazo|mais\s+tempo/i;

/**
 * Mensagem nova do cliente numa conversa que recebeu follow-up: para a sequência.
 * Devolve true quando o follow-up cuidou da resposta (o assistente virtual não entra).
 */
export async function followupOnInbound(sb: SupabaseClient, chatId: string, text: string | null, deps: FollowupDeps): Promise<boolean> {
  const { data: last } = await sb.from("trial_followups").select("owner_id, sent_at").eq("chat_id", chatId).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) return false;
  const { data: state } = await sb.from("trial_followup_state").select("*").eq("system", SYSTEM).eq("owner_id", last.owner_id).maybeSingle();
  if (!state || (state as State).stopped_at) return false;
  const body = (text ?? "").trim();
  const now = new Date().toISOString();
  const { data: chat } = await sb.from("support_wa_chats").select("remote_jid, phone_normalized").eq("id", chatId).maybeSingle();
  const to = chat?.phone_normalized ?? chat?.remote_jid ?? null;

  let reason = "replied";
  let reply: string | null = null;
  if (OPT_OUT.test(body)) {
    reason = "optout";
    reply = "Pronto! Não vamos mais mandar lembretes. Se precisar de algo, é só chamar aqui. 👊";
  } else if (WANTS_EXTENSION.test(body) && (state as State).cycle === 1) {
    reason = "extension_requested";
    reply = "Perfeito! Já pedimos a liberação de mais 7 dias de teste para você. Avisamos por aqui assim que estiver liberado. 🥋";
  }
  await saveState(sb, { ...(state as State), stopped_at: now, stop_reason: reason });
  if (reply && to) {
    try {
      const res = await deps.sendText(to, reply);
      await deps.recordOutgoing(to, res, reply);
    } catch (err) {
      console.error("support-inbox: resposta do follow-up não enviada", err instanceof Error ? err.message : err);
    }
  }
  return true;
}

/* --------------------------------- Painel --------------------------------- */

const REASON_LABEL: Record<string, string> = {
  subscribed: "Assinou",
  replied: "Respondeu — com a equipe",
  optout: "Pediu para sair",
  extension_requested: "Pediu mais 7 dias",
  extended: "Teste prorrogado",
  manual: "Parado no /admin",
  no_phone: "Sem WhatsApp",
  too_old: "Teste antigo (fora do prazo)",
};

export async function followupOverview(sb: SupabaseClient, deps: FollowupDeps) {
  const settings = await followupSettings(sb);
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const all = await subscriptions(sb);
  const ids = all.map((s) => s.owner_id);
  const [states, sentMap] = await Promise.all([loadStates(sb, ids), loadSent(sb, ids)]);
  const subs = all.filter((s) =>
    states.has(s.owner_id) || (NOT_CONVERTED.includes(s.status) && (s.trial_ends_at ?? "") >= since),
  );
  const today = brDay(new Date());
  const items = [];
  for (const sub of subs) {
    const state = currentState(sub, states.get(sub.owner_id));
    const sent = sentMap.get(sub.owner_id) ?? [];
    const plan = planFor(sub, state, sent, today);
    const contact = await contactOf(sb, sub.owner_id, deps);
    const reason = plan.kind === "stopped" ? plan.reason : null;
    items.push({
      owner_id: sub.owner_id,
      academy: contact.academy,
      first_name: contact.firstName,
      phone: contact.phone,
      plan_code: sub.plan_code,
      status: sub.status,
      trial_ends_at: sub.trial_ends_at,
      in_trial: !!sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now(),
      cycle: state.cycle,
      chat_id: state.chat_id,
      steps: sent.filter((s) => s.cycle === state.cycle).map((s) => ({ step: s.step, status: s.status, sent_at: s.sent_at })),
      stopped: reason ? { reason, label: REASON_LABEL[reason] ?? reason, at: state.stopped_at } : null,
      next: plan.kind === "send" ? { step: plan.step, day: today } : plan.kind === "wait" ? { step: plan.step, day: plan.day } : null,
      can_extend: sub.status !== "active",
    });
  }
  items.sort((a, b) => String(b.trial_ends_at ?? "").localeCompare(String(a.trial_ends_at ?? "")));
  const ctx: MessageCtx = { firstName: "Nome", academy: "Academia", endDay: today, offerExtension: true };
  return {
    settings,
    business_hours: isBusinessHours(),
    schedule: STEP_DAYS,
    preview: [1, 2, 3].map((step) => ({ step, day: STEP_DAYS[step - 1], text: followupMessage(step, ctx) })),
    items,
  };
}

export async function followupStop(sb: SupabaseClient, ownerId: string) {
  const [sub] = await subscriptions(sb, ownerId);
  if (!sub) throw new Error("Academia não encontrada.");
  const { data: prev } = await sb.from("trial_followup_state").select("*").eq("system", SYSTEM).eq("owner_id", ownerId).maybeSingle();
  await saveState(sb, { ...currentState(sub, (prev ?? undefined) as State | undefined), stopped_at: new Date().toISOString(), stop_reason: "manual" });
}

export async function followupResume(sb: SupabaseClient, ownerId: string) {
  const { error } = await sb.from("trial_followup_state").update({ stopped_at: null, stop_reason: null, updated_at: new Date().toISOString() }).eq("system", SYSTEM).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}

/** Libera mais 7 dias de teste e avisa o cliente no WhatsApp. */
export async function followupExtend(sb: SupabaseClient, ownerId: string, deps: FollowupDeps) {
  const [sub] = await subscriptions(sb, ownerId);
  if (!sub) throw new Error("Academia não encontrada.");
  if (sub.status === "active") throw new Error("Esta academia já assinou.");
  const endDay = addDays(brDay(new Date()), EXTENSION_DAYS);
  const trialEndsAt = new Date(`${endDay}T23:59:59-03:00`).toISOString();
  const { error } = await sb.from("dojo_subscriptions").update({ status: "trialing", trial_ends_at: trialEndsAt }).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  const { data: prev } = await sb.from("trial_followup_state").select("*").eq("system", SYSTEM).eq("owner_id", ownerId).maybeSingle();
  // O ciclo continua parado até o novo prazo acabar; aí currentState abre o ciclo 2.
  await saveState(sb, { ...currentState(sub, (prev ?? undefined) as State | undefined), stopped_at: new Date().toISOString(), stop_reason: "extended" });
  const contact = await contactOf(sb, ownerId, deps);
  let notified = false;
  if (contact.phone) {
    const text = `${contact.firstName ? `${contact.firstName}, ` : ""}liberamos mais ${EXTENSION_DAYS} dias de teste do *AMT Dojo Manager*, até ${brDate(endDay)}. É só entrar normalmente: https://amtdojomanager.com.br/dojo/app\n\nBons treinos! 🥋`;
    try {
      const res = await deps.sendText(contact.phone, text);
      await deps.recordOutgoing(contact.phone, res, text);
      notified = true;
    } catch (err) {
      console.error("support-inbox: aviso da prorrogação não enviado", err instanceof Error ? err.message : err);
    }
  }
  return { trial_ends_at: trialEndsAt, notified };
}

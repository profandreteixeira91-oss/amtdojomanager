import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, assertControlCenterAdmin, corsHeaders, errorResponse, HttpError, json, withCors } from "../_shared/control-center.ts";

// Implantação assistida do Dojo Manager para o Control Center da AMT (amtsistemas.com.br/admin › Implantações).
//
// O dono preenche e envia o pedido no painel (/dojo/app/implantacao → tabela dojo_implementation_requests). Aqui a
// AMT lista, revisa/corrige os dados e aplica no banco com public.dojo_apply_implementation (uma transação: ou grava
// tudo, ou nada). Quem chama precisa ser admin ativo do Control Center (ver _shared/control-center.ts).
//
// POST { action: "counters" }                               -> { waiting } (pedidos enviados esperando a AMT)
// POST { action: "list" }                                   -> { requests } (resumo, sem os dados dos alunos)
// POST { action: "get", id }                                -> { request, academy, subscription, owner_email, active_students, plan_limit }
// POST { action: "save", id, payload?, admin_notes?, status? } -> { request }  (status: enviada | em_implantacao | cancelada)
// POST { action: "apply", id, notify_whatsapp? }            -> { result, whatsapp }
//
// Aviso ao dono (opcional): WhatsApp pelo número de suporte da AMT (mesmos segredos da support-inbox:
// EVOLUTION_API_URL, EVOLUTION_API_KEY, SUPPORT_WHATSAPP_INSTANCE).
//
// Deploy: npx supabase functions deploy implementation --project-ref gudjmkiyprgwgxmzbgji --use-api --no-verify-jwt

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_STATUSES = ["enviada", "em_implantacao", "cancelada"];
const PLAN_STUDENT_LIMITS: Record<string, number | null> = { essencial: 100, profissional: 300, premium: null, legacy: null };

type Payload = {
  academy?: Record<string, unknown>;
  plans?: unknown[];
  classes?: unknown[];
  team?: unknown[];
  students?: Array<Record<string, unknown>>;
  billing?: Record<string, unknown>;
  notes?: string;
};

function requireId(body: Record<string, unknown>): string {
  const id = String(body.id ?? "");
  if (!UUID_RE.test(id)) throw new HttpError(400, "Pedido inválido.");
  return id;
}

async function ownerEmail(admin: SupabaseClient, ownerId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(ownerId);
  return data?.user?.email ?? null;
}

async function list(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("dojo_implementation_requests")
    .select("id, owner_id, status, payload, trial_after_implementation, admin_notes, result, submitted_at, started_at, completed_at, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.code);
  const rows = (data ?? []) as Array<Record<string, any>>;
  const owners = rows.map((r) => r.owner_id);
  const { data: subs } = owners.length
    ? await admin.from("dojo_subscriptions").select("owner_id, status, plan_code, trial_ends_at").in("owner_id", owners)
    : { data: [] };
  const subByOwner = new Map((subs ?? []).map((s: any) => [s.owner_id, s]));
  return {
    requests: rows.map((r) => {
      const p = (r.payload ?? {}) as Payload;
      return {
        id: r.id,
        owner_id: r.owner_id,
        status: r.status,
        trade_name: String(p.academy?.trade_name ?? "") || "(sem nome)",
        city: String(p.academy?.city ?? ""),
        state: String(p.academy?.state ?? ""),
        whatsapp: String(p.academy?.whatsapp ?? ""),
        counts: {
          plans: p.plans?.length ?? 0,
          classes: p.classes?.length ?? 0,
          team: p.team?.length ?? 0,
          students: p.students?.length ?? 0,
        },
        trial_after_implementation: r.trial_after_implementation,
        has_notes: Boolean(r.admin_notes),
        result: r.result,
        subscription: subByOwner.get(r.owner_id) ?? null,
        submitted_at: r.submitted_at,
        started_at: r.started_at,
        completed_at: r.completed_at,
        updated_at: r.updated_at,
      };
    }),
  };
}

async function get(admin: SupabaseClient, id: string) {
  const { data: request, error } = await admin.from("dojo_implementation_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.code);
  if (!request) throw new HttpError(404, "Pedido não encontrado.");
  const owner = request.owner_id as string;
  const [academy, subscription, students, email] = await Promise.all([
    admin.from("dojo_academy_profile").select("trade_name, whatsapp, email, city, state, slug, modalities").eq("owner_id", owner).maybeSingle(),
    admin.from("dojo_subscriptions").select("status, plan_code, trial_ends_at").eq("owner_id", owner).maybeSingle(),
    admin.from("dojo_students").select("id", { count: "exact", head: true }).eq("owner_id", owner).eq("status", "active"),
    ownerEmail(admin, owner),
  ]);
  const planCode = String(subscription.data?.plan_code ?? "legacy");
  return {
    request,
    academy: academy.data,
    subscription: subscription.data,
    owner_email: email,
    active_students: students.count ?? 0,
    plan_limit: planCode in PLAN_STUDENT_LIMITS ? PLAN_STUDENT_LIMITS[planCode] : null,
  };
}

async function save(admin: SupabaseClient, id: string, body: Record<string, unknown>) {
  const { data: current, error: readError } = await admin.from("dojo_implementation_requests").select("status, started_at").eq("id", id).maybeSingle();
  if (readError) throw new Error(readError.code);
  if (!current) throw new HttpError(404, "Pedido não encontrado.");
  if (current.status === "concluida") throw new HttpError(409, "Pedido já concluído: altere direto no painel da academia.");

  const patch: Record<string, unknown> = {};
  if (body.payload !== undefined) {
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) throw new HttpError(400, "Dados inválidos.");
    const size = JSON.stringify(body.payload).length;
    if (size > 5_000_000) throw new HttpError(413, "Dados grandes demais.");
    patch.payload = body.payload;
  }
  if (body.admin_notes !== undefined) patch.admin_notes = String(body.admin_notes ?? "").slice(0, 4000) || null;
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!ADMIN_STATUSES.includes(status)) throw new HttpError(400, "Status inválido.");
    patch.status = status;
    if (status === "em_implantacao" && !current.started_at) patch.started_at = new Date().toISOString();
    if (status === "cancelada") patch.cancelled_at = new Date().toISOString();
  }
  if (!Object.keys(patch).length) throw new HttpError(400, "Nada para salvar.");
  const { data, error } = await admin.from("dojo_implementation_requests").update(patch).eq("id", id).select("*").single();
  if (error) throw new HttpError(400, error.message);
  return { request: data };
}

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

async function notifyOwner(phone: string | null, name: string): Promise<{ sent: boolean; error?: string }> {
  const url = (Deno.env.get("EVOLUTION_API_URL") ?? "").trim().replace(/\/+$/, "");
  const apiKey = (Deno.env.get("EVOLUTION_API_KEY") ?? "").trim();
  const instance = (Deno.env.get("SUPPORT_WHATSAPP_INSTANCE") ?? "").trim() || "amt-suporte";
  const number = normalizePhone(phone);
  if (!url || !apiKey) return { sent: false, error: "WhatsApp do suporte não configurado." };
  if (!number) return { sent: false, error: "Academia sem WhatsApp válido." };
  const text =
    `Olá! Aqui é a equipe AMT Dojo Manager. 🥋\n\n` +
    `A implantação da ${name} foi concluída: planos, turmas, equipe e alunos já estão no sistema.\n\n` +
    `Acesse https://amtdojomanager.com.br/dojo/app para conferir. Qualquer dúvida, é só responder esta mensagem.`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text, delay: 0 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { sent: false, error: `WhatsApp respondeu HTTP ${res.status}.` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error && err.name === "AbortError" ? "WhatsApp não respondeu a tempo." : "Falha ao enviar WhatsApp." };
  } finally {
    clearTimeout(timer);
  }
}

async function apply(admin: SupabaseClient, id: string, notify: boolean) {
  const { data: result, error } = await admin.rpc("dojo_apply_implementation", { p_request_id: id });
  // Erros da função SQL (limite de alunos, data inválida, etc.) vão para a tela: são mensagens para a AMT.
  if (error) throw new HttpError(400, error.message);
  let whatsapp: { sent: boolean; error?: string } | null = null;
  if (notify) {
    const { data: request } = await admin.from("dojo_implementation_requests").select("owner_id, payload").eq("id", id).single();
    const { data: academy } = await admin.from("dojo_academy_profile").select("trade_name, whatsapp").eq("owner_id", request?.owner_id).maybeSingle();
    const p = (request?.payload ?? {}) as Payload;
    whatsapp = await notifyOwner(
      String(p.academy?.whatsapp ?? "") || academy?.whatsapp || null,
      academy?.trade_name || String(p.academy?.trade_name ?? "") || "sua academia",
    );
  }
  return { result, whatsapp };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    await assertControlCenterAdmin(req);
    const admin = adminClient();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");
    let out: unknown;
    if (action === "counters") {
      const { count, error } = await admin.from("dojo_implementation_requests").select("id", { count: "exact", head: true }).eq("status", "enviada");
      if (error) throw new Error(error.code);
      out = { waiting: count ?? 0 };
    } else if (action === "list") out = await list(admin);
    else if (action === "get") out = await get(admin, requireId(body));
    else if (action === "save") out = await save(admin, requireId(body), body);
    else if (action === "apply") out = await apply(admin, requireId(body), body.notify_whatsapp === true);
    else throw new HttpError(400, "Ação desconhecida.");
    return withCors(req, json(out));
  } catch (error) {
    return withCors(req, errorResponse("implementation", error));
  }
});

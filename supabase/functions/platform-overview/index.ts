import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, assertControlCenterAdmin, corsHeaders, errorResponse, HttpError, json, withCors } from "../_shared/control-center.ts";

// Relatório da plataforma e exclusão de contas de academia para o Control Center da AMT (amtsistemas.com.br/admin).
//
// Chamada pelo navegador do /admin com o token de sessão do Control Center (projeto amt-sistemas). Quem chama
// precisa ser admin ativo de lá: o token é conferido no Auth do amt-sistemas e a permissão pela função
// public.is_control_center_admin do mesmo projeto. Nenhum segredo deste projeto sai daqui, e os dados das
// academias se resumem ao que a AMT precisa para acompanhar a assinatura (sem alunos individualmente).
//
// Deploy: npx supabase functions deploy platform-overview --project-ref gudjmkiyprgwgxmzbgji --no-verify-jwt
//
// GET/POST -> { customers, plans, apk, support, amt_fees } com as academias, assinaturas, downloads do app e chamados.
// POST { action: "delete_preview", owner_id }          -> prévia da exclusão (registros, logins, arquivos)
// POST { action: "delete_account", owner_id, confirm } -> exclui a conta; confirm = nome ou e-mail da academia
// A exclusão é feita por public.platform_dojo_account_deletion (regras e travas descritas na migration).

const CLOSED_TICKET_STATUSES = ["resolvido", "fechado", "concluido", "closed", "resolved"];

// Planos do Dojo Manager. Manter igual a SAAS_PLANS em src/lib/dojo/saas-plans.ts e a dojo_plan_price() no banco.
const PLANS = [
  { code: "essencial", name: "Essencial", price: 99.9 },
  { code: "profissional", name: "Profissional", price: 159.9 },
  { code: "premium", name: "Premium", price: 229.9 },
  { code: "legacy", name: "Legado", price: null },
] as const;
const PLAN_BY_CODE = new Map<string, (typeof PLANS)[number]>(PLANS.map((plan) => [plan.code, plan]));
const PAYMENT_METHOD: Record<string, string> = { pix: "Pix", card: "Cartão" };

type Subscription = {
  owner_id: string; status: string; plan_code: string | null; plan_amount: number | null; trial_ends_at: string | null;
  current_period_end: string | null; next_due_date: string | null; current_payment_status: string | null;
  subscription_type: string | null; cancelled_at: string | null; created_at: string; updated_at: string;
};

/** pagante | liberado | teste | teste_vencido | pendente | cancelado | sem_assinatura */
function groupOf(subscription: Subscription | undefined, now: number): string {
  if (!subscription) return "sem_assinatura";
  const status = subscription.status;
  // Ativa sem pagamento aprovado = acesso liberado manualmente (sem cobrança no Mercado Pago).
  if (status === "active" || status === "authorized") return subscription.current_payment_status === "approved" ? "pagante" : "liberado";
  if (status === "trialing" || status === "trial") {
    return subscription.trial_ends_at && new Date(subscription.trial_ends_at).getTime() < now ? "teste_vencido" : "teste";
  }
  if (status === "cancelled" || status === "canceled") return "cancelado";
  return "pendente"; // pending, suspended, paused
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

type DeletionResult = {
  owner_id: string; name: string | null; email: string | null; rows: number; tables: Record<string, number>;
  logins?: number; files?: number; logins_deleted?: number; logins_kept?: number;
  storage?: Array<{ bucket: string; path: string }>;
};

async function runDeletion(admin: SupabaseClient, ownerId: string, execute: boolean): Promise<DeletionResult> {
  const { data, error } = await admin.rpc("platform_dojo_account_deletion", { p_owner: ownerId, p_execute: execute });
  // Exceções levantadas pela função (P0001) já vêm com mensagem pronta para exibir.
  if (error) throw new HttpError(error.code === "P0001" ? 409 : 500, error.code === "P0001" ? error.message : "Não foi possível processar a exclusão.");
  return data as DeletionResult;
}

async function deleteAccount(admin: SupabaseClient, action: string, body: Record<string, unknown>): Promise<Response> {
  const ownerId = String(body.owner_id ?? "");
  if (!UUID_RE.test(ownerId)) throw new HttpError(400, "Conta não informada.");
  const preview = await runDeletion(admin, ownerId, false);
  if (action === "delete_preview") return json(preview);

  const confirm = normalize(body.confirm);
  if (!confirm || (confirm !== normalize(preview.name) && confirm !== normalize(preview.email))) {
    throw new HttpError(400, "Para confirmar, digite exatamente o nome ou o e-mail da academia.");
  }
  const result = await runDeletion(admin, ownerId, true);

  // Arquivos do Storage (logos, fotos, certificados, vídeos): só pela API, depois que os dados já saíram.
  let filesDeleted = 0;
  let filesFailed = 0;
  const byBucket = new Map<string, string[]>();
  for (const file of result.storage ?? []) byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.path]);
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) filesFailed += chunk.length;
      else filesDeleted += chunk.length;
    }
  }
  const { storage: _storage, ...summary } = result;
  return json({ ...summary, files_deleted: filesDeleted, files_failed: filesFailed });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    await assertControlCenterAdmin(req);
    const admin = adminClient();

    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const action = String(body.action ?? "");
    if (action === "delete_preview" || action === "delete_account") {
      return withCors(req, await deleteAccount(admin, action, body));
    }

    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const [subscriptions, profiles, users, students, apkVersions, apkDownloads, tickets, fees] = await Promise.all([
      admin.from("dojo_subscriptions").select("owner_id, status, plan_code, plan_amount, trial_ends_at, current_period_end, next_due_date, current_payment_status, subscription_type, cancelled_at, created_at, updated_at"),
      admin.from("dojo_academy_profile").select("owner_id, trade_name, legal_name, email, phone, whatsapp, city, state, slug, created_at"),
      admin.from("dojo_users").select("owner_id, role, name, email").eq("role", "owner"),
      admin.from("dojo_students").select("owner_id, status"),
      admin.from("dojo_app_apk_versions").select("owner_id, version_name, is_published, created_at"),
      admin.from("dojo_app_apk_downloads").select("owner_id, created_at"),
      admin.from("dojo_support_tickets").select("id, owner_id, subject, category, status, priority, last_message_at, unread_by_admin, created_at")
        .order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
      admin.from("dojo_split_transactions").select("amt_fee_amount, status, paid_at").gte("paid_at", since30),
    ]);
    const failed = [subscriptions, profiles, users, students, apkVersions, apkDownloads, tickets, fees].find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.code);

    const now = Date.now();
    // Uma assinatura por dono; se houver mais de uma, vale a atualizada por último.
    const subscriptionByOwner = new Map<string, Subscription>();
    for (const item of (subscriptions.data ?? []) as Subscription[]) {
      const current = subscriptionByOwner.get(item.owner_id);
      if (!current || item.updated_at > current.updated_at) subscriptionByOwner.set(item.owner_id, item);
    }
    const profileByOwner = new Map((profiles.data ?? []).map((item) => [item.owner_id, item]));
    const userByOwner = new Map((users.data ?? []).map((item) => [item.owner_id, item]));
    const owners = Array.from(new Set([...subscriptionByOwner.keys(), ...profileByOwner.keys()]));

    // Donos sem perfil nem cadastro em dojo_users: nome e e-mail vêm do Auth.
    const authEmail = new Map<string, string>();
    await Promise.all(owners.filter((owner) => !profileByOwner.get(owner)?.email && !userByOwner.get(owner)?.email).map(async (owner) => {
      const { data } = await admin.auth.admin.getUserById(owner);
      if (data?.user?.email) authEmail.set(owner, data.user.email);
    }));

    const count = (rows: Array<{ owner_id: string }> | null, owner: string) => (rows ?? []).filter((row) => row.owner_id === owner).length;

    const customers = owners.map((owner) => {
      const subscription = subscriptionByOwner.get(owner);
      const profile = profileByOwner.get(owner);
      const user = userByOwner.get(owner);
      const email = profile?.email || user?.email || authEmail.get(owner) || null;
      const ownerStudents = (students.data ?? []).filter((student) => student.owner_id === owner);
      // Sem assinatura ainda vale o Premium (dojo_plan_effective no banco).
      const planCode = subscription ? subscription.plan_code ?? "legacy" : "premium";
      const plan = PLAN_BY_CODE.get(planCode);
      return {
        id: owner,
        name: profile?.trade_name || profile?.legal_name || user?.name || email || "Academia sem nome",
        code: profile?.slug ?? null,
        owner_name: user?.name ?? null,
        owner_email: email,
        phone: profile?.whatsapp || profile?.phone || null,
        city: profile?.city ? [profile.city, profile.state].filter(Boolean).join("/") : null,
        plan: planCode,
        plan_name: plan?.name ?? planCode,
        payment_method: subscription?.subscription_type ? PAYMENT_METHOD[subscription.subscription_type] ?? subscription.subscription_type : null,
        status: subscription?.status ?? null,
        group: groupOf(subscription, now),
        amount_monthly: subscription?.plan_amount === null || subscription?.plan_amount === undefined ? null : Number(subscription.plan_amount),
        trial_ends_at: subscription?.trial_ends_at ?? null,
        current_period_end: subscription?.current_period_end ?? null,
        next_due_date: subscription?.next_due_date ?? null,
        last_payment_status: subscription?.current_payment_status ?? null,
        created_at: profile?.created_at ?? subscription?.created_at ?? null,
        students: ownerStudents.length,
        active_students: ownerStudents.filter((student) => student.status === "active" || student.status === "ativo").length,
        apk_downloads: count(apkDownloads.data, owner),
        open_tickets: (tickets.data ?? []).filter((ticket) => ticket.owner_id === owner && !CLOSED_TICKET_STATUSES.includes(ticket.status)).length,
      };
    });

    const nameById = new Map(customers.map((customer) => [customer.id, customer.name]));
    const plans = PLANS.map((plan) => {
      const inPlan = customers.filter((customer) => customer.plan === plan.code);
      const paying = inPlan.filter((customer) => customer.group === "pagante");
      return {
        code: plan.code,
        name: plan.name,
        price: plan.price,
        customers: inPlan.length,
        paying: paying.length,
        trial: inPlan.filter((customer) => customer.group === "teste").length,
        mrr: paying.reduce((sum, customer) => sum + (customer.amount_monthly ?? 0), 0),
      };
    });
    const openTickets = (tickets.data ?? []).filter((ticket) => !CLOSED_TICKET_STATUSES.includes(ticket.status));
    return withCors(req, json({
      system: "amt-dojo-manager",
      generated_at: new Date(now).toISOString(),
      customers,
      plans,
      apk: {
        published_versions: (apkVersions.data ?? []).filter((version) => version.is_published).length,
        academies_with_apk: new Set((apkVersions.data ?? []).filter((version) => version.is_published).map((version) => version.owner_id)).size,
        downloads: (apkDownloads.data ?? []).length,
        downloads_last_30d: (apkDownloads.data ?? []).filter((download) => download.created_at >= since30).length,
      },
      support: openTickets.slice(0, 20).map((ticket) => ({
        id: ticket.id,
        customer_id: ticket.owner_id,
        customer_name: nameById.get(ticket.owner_id) ?? null,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        priority: ticket.priority,
        unread: Boolean(ticket.unread_by_admin),
        last_message_at: ticket.last_message_at ?? ticket.created_at,
      })),
      open_tickets: openTickets.length,
      amt_fees: {
        last_30d: (fees.data ?? []).reduce((sum, fee) => sum + Number(fee.amt_fee_amount ?? 0), 0),
        transactions_last_30d: (fees.data ?? []).length,
      },
    }));
  } catch (error) {
    return withCors(req, errorResponse("platform-overview", error));
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Relatório da plataforma para o Control Center da AMT (amtsistemas.com.br/admin). Somente leitura.
//
// Chamada pelo navegador do /admin com o token de sessão do Control Center (projeto amt-sistemas). Quem chama
// precisa ser admin ativo de lá: o token é conferido no Auth do amt-sistemas e a permissão pela função
// public.is_control_center_admin do mesmo projeto. Nenhum segredo deste projeto sai daqui, e os dados das
// academias se resumem ao que a AMT precisa para acompanhar a assinatura (sem alunos individualmente).
//
// Deploy: npx supabase functions deploy platform-overview --project-ref gudjmkiyprgwgxmzbgji --no-verify-jwt
//
// GET/POST -> { customers, apk, support, amt_fees } com as academias, assinaturas, downloads do app e chamados.

const CONTROL_CENTER_URL = Deno.env.get("CONTROL_CENTER_SUPABASE_URL") ?? "https://yqxmxevphdumyuwlvppg.supabase.co";
const CONTROL_CENTER_KEY = Deno.env.get("CONTROL_CENTER_PUBLISHABLE_KEY") ?? "sb_publishable_jK7lhco6DQLlfjYm8LGS3g_sGBkVtK2";
const ALLOWED_ORIGINS = ["https://amtsistemas.com.br", "https://www.amtsistemas.com.br"];
const CLOSED_TICKET_STATUSES = ["resolvido", "fechado", "concluido", "closed", "resolved"];

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return allowed
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        vary: "origin",
      }
    : {};
}

async function assertControlCenterAdmin(req: Request): Promise<void> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Sessão do Control Center obrigatória.");
  const headers = { apikey: CONTROL_CENTER_KEY, Authorization: `Bearer ${token}` };
  const userResponse = await fetch(`${CONTROL_CENTER_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) throw new HttpError(401, "Sessão do Control Center inválida ou expirada. Entre novamente.");
  const user = await userResponse.json() as { id?: string };
  const allowed = await fetch(`${CONTROL_CENTER_URL}/rest/v1/rpc/is_control_center_admin`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ _user_id: user.id }),
  });
  if (!allowed.ok || await allowed.json() !== true) throw new HttpError(403, "Acesso restrito aos admins do Control Center.");
}

type Subscription = {
  owner_id: string; status: string; plan_amount: number | null; trial_ends_at: string | null;
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const withCors = (response: Response) => {
    Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  };
  try {
    await assertControlCenterAdmin(req);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("config");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const [subscriptions, profiles, users, students, apkVersions, apkDownloads, tickets, fees] = await Promise.all([
      admin.from("dojo_subscriptions").select("owner_id, status, plan_amount, trial_ends_at, current_period_end, next_due_date, current_payment_status, subscription_type, cancelled_at, created_at, updated_at"),
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
      return {
        id: owner,
        name: profile?.trade_name || profile?.legal_name || user?.name || email || "Academia sem nome",
        code: profile?.slug ?? null,
        owner_name: user?.name ?? null,
        owner_email: email,
        phone: profile?.whatsapp || profile?.phone || null,
        city: profile?.city ? [profile.city, profile.state].filter(Boolean).join("/") : null,
        plan: subscription?.subscription_type ?? null,
        plan_name: subscription?.subscription_type === "pix" ? "Mensal · Pix" : subscription?.subscription_type === "card" ? "Mensal · cartão" : null,
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
    const openTickets = (tickets.data ?? []).filter((ticket) => !CLOSED_TICKET_STATUSES.includes(ticket.status));
    return withCors(json({
      system: "amt-dojo-manager",
      generated_at: new Date(now).toISOString(),
      customers,
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
    if (error instanceof HttpError) return withCors(json({ error: error.message }, error.status));
    console.error("platform-overview: erro inesperado", error instanceof Error ? error.message : "unknown");
    return withCors(json({ error: "Erro inesperado no servidor." }, 500));
  }
});

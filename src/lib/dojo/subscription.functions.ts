// Assinatura SaaS do AMT Dojo Manager — Mercado Pago Assinaturas (preapproval).
// Planos (saas-plans.ts): Essencial, Profissional e Premium para contas novas,
// com 14 dias de teste no Premium. Contas anteriores aos planos ficam em
// `legacy` e continuam cobradas exatamente como antes (PLAN_AMOUNT).
// Usa o MERCADOPAGO_ACCESS_TOKEN da própria AMT (não o do dono).
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DOJO_HOST, dojoOriginFromRequest } from "@/lib/dojo-hosts";
import { resolveDojoIdentity } from "@/lib/dojo/owner-scope";
import {
  SAAS_PLANS,
  effectivePlanCode,
  isSaasPlanCode,
  planLimits,
  type SaasPlanCode,
} from "@/lib/dojo/saas-plans";

const planCodeSchema = z.enum(["essencial", "profissional", "premium"]);

const MP_BASE = "https://api.mercadopago.com";

/**
 * Customização visual do Checkout do Mercado Pago.
 * Nota: A API de preapproval (assinaturas) tem suporte limitado a temas comparada ao Checkout Pro (preferences),
 * mas podemos definir cores e logo nas configurações da aplicação no painel MP ou via API quando disponível.
 */
const MP_DESIGN_CONFIG = {
  main_color: "#DC2626", // Vermelho Dojo (primary)
  logo: "https://amtfightwear.com.br/amt-logo-red.png", // URL absoluta do logo
};

/**
 * Webhook do MP para o domínio em que a cobrança foi criada: cada worker usa as
 * próprias credenciais (teste ou produção), então o aviso precisa voltar a ele.
 * O domínio atual mantém o webhook já em uso na AMT Fight Wear.
 */
function mpNotificationUrl(origin: string): string {
  return origin === `https://${DOJO_HOST}`
    ? "https://amtfightwear.com.br/api/public/hooks/mercadopago"
    : `${origin}/api/public/hooks/mercadopago`;
}

/** Valor das contas `legacy` (anteriores aos planos) — não mudar. */
export const PLAN_AMOUNT = 99.9;
export const TRIAL_DAYS = 14;

/** Valor mensal de uma assinatura: legacy mantém o valor antigo. */
export function subscriptionAmount(sub: { plan_code?: string | null }): number {
  return isSaasPlanCode(sub.plan_code) ? SAAS_PLANS[sub.plan_code].price : PLAN_AMOUNT;
}

function subscriptionReason(planCode: string | null | undefined): string {
  return isSaasPlanCode(planCode)
    ? `AMT Dojo Manager — Plano ${SAAS_PLANS[planCode].name}`
    : "AMT Dojo Manager — Assinatura mensal";
}

/**
 * Plano da cobrança que está sendo iniciada. Conta legacy ignora a escolha e
 * segue no valor antigo; conta nova precisa escolher um plano, gravado pelo
 * servidor (o dono não altera plano/valor — trigger no banco).
 */
async function preparePlanForCheckout(
  sub: { id: string; plan_code?: string | null },
  planCode: SaasPlanCode | undefined,
): Promise<{ amount: number; planCode: string }> {
  if (!isSaasPlanCode(sub.plan_code)) {
    return { amount: PLAN_AMOUNT, planCode: "legacy" };
  }
  const chosen = planCode ?? sub.plan_code;
  const price = SAAS_PLANS[chosen].price;
  if (chosen !== sub.plan_code) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("dojo_subscriptions")
      .update({ plan_code: chosen, plan_amount: price } as never)
      .eq("id", sub.id);
    if (error) throw new Error(error.message);
  }
  return { amount: price, planCode: chosen };
}

/** Quantos alunos ativos, unidades ativas e logins de equipe o dojo usa hoje. */
async function countPlanUsage(ownerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [students, units, users] = await Promise.all([
    supabaseAdmin
      .from("dojo_students")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "active"),
    supabaseAdmin
      .from("dojo_units")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("active", true),
    supabaseAdmin
      .from("dojo_team_members")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .not("user_id", "is", null),
  ]);
  return {
    students: students.count ?? 0,
    units: units.count ?? 0,
    systemUsers: users.count ?? 0,
  };
}

/**
 * Plano que vale para o dojo de quem está logado (dono ou equipe — a equipe
 * herda o plano do dono). Usado para liberar/bloquear módulos no painel.
 */
export const getMyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const identity = await resolveDojoIdentity(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("dojo_subscriptions")
      .select("plan_code, plan_amount, status")
      .eq("owner_id", identity.ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const effective = effectivePlanCode(sub);
    const usage = identity.isOwner ? await countPlanUsage(identity.ownerId) : null;
    return {
      planCode: (sub?.plan_code ?? "premium") as string,
      effective,
      status: (sub?.status ?? "trialing") as string,
      isLegacy: effective === "legacy",
      limits: planLimits(effective),
      usage,
    };
  });

/**
 * Troca de plano de uma assinatura já paga (conta nova). Vale na hora; o valor
 * novo entra na próxima cobrança (cartão: atualiza o preapproval no MP; PIX: a
 * próxima renovação já sai com o valor do plano).
 */
export const changeMyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ planCode: planCodeSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("id, plan_code, status, mp_preapproval_id, subscription_type")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub) throw new Error("Assinatura não encontrada.");
    if (!isSaasPlanCode(sub.plan_code)) {
      throw new Error("Sua conta tem uma condição especial e não usa os novos planos.");
    }
    if (sub.status !== "active") {
      throw new Error("Escolha o plano ao ativar a assinatura.");
    }
    if (sub.plan_code === data.planCode) return { ok: true as const, planCode: data.planCode };

    // Downgrade só se o uso atual cabe no plano novo.
    const target = SAAS_PLANS[data.planCode];
    const usage = await countPlanUsage(context.userId);
    const over: string[] = [];
    if (target.limits.students !== null && usage.students > target.limits.students)
      over.push(`${usage.students} alunos ativos (limite ${target.limits.students})`);
    if (target.limits.units !== null && usage.units > target.limits.units)
      over.push(`${usage.units} unidades ativas (limite ${target.limits.units})`);
    if (target.limits.systemUsers !== null && usage.systemUsers > target.limits.systemUsers)
      over.push(`${usage.systemUsers} usuários do sistema (limite ${target.limits.systemUsers})`);
    if (over.length) {
      throw new Error(`O plano ${target.name} não comporta o uso atual: ${over.join(", ")}.`);
    }

    if (sub.mp_preapproval_id && sub.subscription_type !== "pix") {
      await mpAmt(`/preapproval/${sub.mp_preapproval_id}`, {
        method: "PUT",
        body: JSON.stringify({
          reason: subscriptionReason(data.planCode),
          auto_recurring: { transaction_amount: target.price, currency_id: "BRL" },
        }),
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("dojo_subscriptions")
      .update({ plan_code: data.planCode, plan_amount: target.price } as never)
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    await context.supabase.from("dojo_account_audit").insert({
      owner_id: context.userId,
      action: "saas_plan_changed",
      meta: { from: sub.plan_code, to: data.planCode },
    });
    return { ok: true as const, planCode: data.planCode };
  });

async function mpAmt<T = any>(path: string, init?: RequestInit): Promise<T> {
  // Prioriza a conta comercial da AMT Fight Wear para assinaturas do sistema
  const key = process.env.STORE_MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!key) throw new Error("MERCADOPAGO_ACCESS_TOKEN (comercial ou pessoal) não configurada");

  // Headers base
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    ...(init?.headers as Record<string, string> ?? {}),
  };

  // O Mercado Pago exige X-Idempotency-Key em POST e PUT.
  // Geramos uma chave baseada no timestamp se não for fornecida.
  if ((init?.method === "POST" || init?.method === "PUT") && !headers["X-Idempotency-Key"]) {
    headers["X-Idempotency-Key"] = `amt-idemp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  const res = await fetch(`${MP_BASE}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const msg = (body && (body.message || body?.cause?.[0]?.description || body.error)) || `MP ${res.status}`;
    throw new Error(String(msg));
  }
  return body as T;
}

/** Retorna a assinatura atual do dono (ou null). */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("dojo_subscriptions")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();

    // Se ainda não existe, cria com trial de 14 dias.
    if (!data) {
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: created } = await context.supabase
        .from("dojo_subscriptions")
        .insert({
          owner_id: context.userId,
          plan_amount: PLAN_AMOUNT,
          currency: "BRL",
          status: "trialing",
          trial_ends_at: trialEnd,
          current_period_end: null, // Garante que começa nulo até o primeiro pagamento
        } as never)
        .select("*")
        .maybeSingle();
      return created;
    }
    return data;
  });

/** Cria (ou reaproveita) um preapproval no MP e retorna init_point para checkout externo (fallback). */
export const startMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ planCode: planCodeSchema.optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub) throw new Error("Assinatura não inicializada");
    const checkout = await preparePlanForCheckout(sub, data.planCode);

    const { data: user } = await context.supabase.auth.getUser();
    const email = user.user?.email;
    if (!email) throw new Error("E-mail do dono indisponível");

    // Volta para o domínio em que o dono está (produção atual ou teste.amtsistemas).
    const origin = dojoOriginFromRequest(getRequest());
    const backUrl = `${origin}/dojo/app/subscription`;
    const notification = mpNotificationUrl(origin);

    const preapproval = await mpAmt<any>("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: subscriptionReason(checkout.planCode),
        external_reference: `dojo_sub:${sub.id}`,
        payer_email: email,
        back_url: backUrl,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: checkout.amount,
          currency_id: "BRL",
        },
        // Reforço da customização visual (identidade do Dojo Manager)
        // Nota: O preapproval aceita configurações de estilo para o init_point.
        theme: {
          elements_color: MP_DESIGN_CONFIG.main_color,
          header_color: "#000000",
        },
        // Configuração explícita de meios de pagamento para incluir PIX e Cartão
        payment_methods_allowed: {
          payment_types: [
            { id: "credit_card" },
            { id: "pix" },
            { id: "bank_transfer" }, // Fallback para Pix recorrente no MP
            { id: "account_money" }
          ],
          payment_methods: []
        },
        notification_url: notification,
      }),
    });

    await context.supabase
      .from("dojo_subscriptions")
      .update({
        mp_preapproval_id: String(preapproval.id),
        status: "pending",
        last_event: preapproval,
      } as never)
      .eq("id", sub.id);

    return { init_point: preapproval.init_point ?? preapproval.sandbox_init_point };
  });

/** Retorna a public key do Mercado Pago para uso client-side (tokenização de cartão). */
export const getMpPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env.STORE_MERCADOPAGO_PUBLIC_KEY || process.env.MERCADOPAGO_PUBLIC_KEY;
    if (!key) throw new Error("MERCADOPAGO_PUBLIC_KEY não configurada");
    return { publicKey: key };
  });

/**
 * Checkout nativo: recebe um card_token_id gerado pelo SDK MP no browser
 * e cria o preapproval já AUTORIZADO (sem redirect ao site do MP).
 */
export const subscribeWithCardToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        cardTokenId: z.string().min(4),
        payerEmail: z.string().email().optional(),
        planCode: planCodeSchema.optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub) throw new Error("Assinatura não inicializada");
    const checkout = await preparePlanForCheckout(sub, data.planCode);

    const { data: userRes } = await context.supabase.auth.getUser();
    const email = data.payerEmail || userRes.user?.email;
    if (!email) throw new Error("E-mail do dono indisponível");

    const origin = dojoOriginFromRequest(getRequest());
    const notification = mpNotificationUrl(origin);
    const backUrl = `${origin}/dojo/app/subscription`;

    console.log("[subscribeWithCardToken] Criando preapproval no MP...");
    const preapproval = await mpAmt<any>("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: subscriptionReason(checkout.planCode),
        external_reference: `dojo_sub:${sub.id}`,
        payer_email: email,
        card_token_id: data.cardTokenId,
        back_url: backUrl,
        status: "authorized",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: checkout.amount,
          currency_id: "BRL",
        },
        notification_url: notification,
      }),
    });

    console.log("[subscribeWithCardToken] Resposta MP:", { id: preapproval.id, status: preapproval.status });

    if (!preapproval.id) {
      throw new Error("O Mercado Pago não retornou um ID de assinatura válido.");
    }

    const patch: Record<string, any> = {
      mp_preapproval_id: String(preapproval.id),
      last_event: preapproval,
    };
    if (preapproval.status === "authorized") patch.status = "active";
    else if (preapproval.status === "pending") patch.status = "pending";
    if (preapproval.next_payment_date) patch.current_period_end = preapproval.next_payment_date;

    await context.supabase
      .from("dojo_subscriptions")
      .update(patch as never)
      .eq("id", sub.id);

    return { status: patch.status ?? preapproval.status, id: String(preapproval.id) };
  });

/** Cancela a assinatura no MP e localmente. */
export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("id, mp_preapproval_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub) throw new Error("Sem assinatura");
    if (sub.mp_preapproval_id) {
      try {
        await mpAmt(`/preapproval/${sub.mp_preapproval_id}`, {
          method: "PUT",
          body: JSON.stringify({ status: "cancelled" }),
        });
      } catch (e) {
        // segue e marca localmente
        console.warn("Falha ao cancelar no MP", e);
      }
    }
    await context.supabase
      .from("dojo_subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as never)
      .eq("id", sub.id);
    return { ok: true };
  });

/** Sincroniza status do preapproval a partir do MP (usado no retorno do checkout). */
export const syncMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({}).parse(i ?? {}))
  .handler(async ({ context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("id, mp_preapproval_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub?.mp_preapproval_id) return { status: null };
    const p = await mpAmt<any>(`/preapproval/${sub.mp_preapproval_id}`);
    const patch: Record<string, any> = { last_event: p };
    if (p.status === "authorized") patch.status = "active";
    else if (p.status === "paused") patch.status = "paused";
    else if (p.status === "cancelled") {
      patch.status = "cancelled";
      patch.cancelled_at = new Date().toISOString();
    }
    if (p.next_payment_date) patch.current_period_end = p.next_payment_date;
    await context.supabase.from("dojo_subscriptions").update(patch as never).eq("id", sub.id);
    return { status: patch.status ?? null };
  });

/**
 * Lista pagamentos da assinatura do Dojo Manager (mensalidades do sistema)
 * direto da API do Mercado Pago. Não confundir com faturas de mensalidade
 * dos alunos (essas ficam em `dojo_invoices`).
 */
export const listMySubscriptionPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("id, mp_preapproval_id, status, plan_amount, current_period_end, trial_ends_at")
      .eq("owner_id", context.userId)
      .maybeSingle();

    const upcoming: any[] = [];
    if (sub?.current_period_end && (sub.status === "active" || sub.status === "trialing")) {
      upcoming.push({
        id: `next-${sub.id}`,
        description: "Próxima mensalidade — AMT Dojo Manager",
        amount: Number(sub.plan_amount ?? PLAN_AMOUNT),
        due_date: sub.current_period_end,
        paid_at: null,
        method: "Mercado Pago",
        status: sub.status === "trialing" ? "trial" : "scheduled",
        payment_link: null,
      });
    }

    if (!sub?.mp_preapproval_id) {
      return { paid: [] as any[], pending: upcoming };
    }

    let results: any[] = [];
    try {
      const r = await mpAmt<any>(
        `/authorized_payments/search?preapproval_id=${encodeURIComponent(sub.mp_preapproval_id)}&limit=50&sort=date_created:desc`,
      );
      results = Array.isArray(r?.results) ? r.results : [];
    } catch (e) {
      console.warn("Falha ao listar pagamentos MP", e);
    }

    const paid: any[] = [];
    const pending: any[] = [...upcoming];
    for (const p of results) {
      const status: string = String(p.status ?? p.payment_status ?? "").toLowerCase();
      const amount = Number(p.transaction_amount ?? p.summarized?.charged_amount ?? sub.plan_amount ?? PLAN_AMOUNT);
      const due = p.debit_date || p.date_created || p.last_modified;
      const paidAt = status === "approved" ? (p.payment?.date_approved || p.last_modified || due) : null;
      const row = {
        id: String(p.id ?? p.payment_id ?? `${sub.mp_preapproval_id}-${due}`),
        description: p.reason || "Mensalidade AMT Dojo Manager",
        amount,
        due_date: due,
        paid_at: paidAt,
        method: "Mercado Pago",
        status,
        payment_link: null,
      };
      if (status === "approved") paid.push(row);
      else pending.push(row);
    }
    return { paid, pending };
  });

/**
 * Cobrança PIX em aberto da assinatura (PIX recorrente): o QR Code é mostrado
 * no próprio painel. Todo mês a rotina diária gera a cobrança do ciclo, 3 dias
 * antes do vencimento; não depende de e-mail.
 */
export const getMyPixCharge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("dojo_subscriptions")
      .select("id, plan_code, subscription_type, last_payment_id, current_payment_status, last_qr_code, last_copy_paste, next_due_date, plan_amount")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub || sub.subscription_type !== "pix" || !sub.last_payment_id || sub.current_payment_status === "approved") {
      return { state: "none" as const };
    }
    const { fetchMpPayment, applyApprovedSubscriptionPix } = await import("@/lib/dojo/subscription-pix.server");
    let payment: any = null;
    try {
      payment = await fetchMpPayment(sub.last_payment_id);
    } catch {
      return { state: "none" as const };
    }
    if (payment.status === "approved") {
      await applyApprovedSubscriptionPix(supabaseAdmin, sub.id, payment);
      return { state: "paid" as const };
    }
    const expiresAt: string | null = payment.date_of_expiration ?? null;
    const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
    if (!["pending", "in_process"].includes(String(payment.status)) || expired) {
      return { state: "expired" as const, dueDate: sub.next_due_date };
    }
    const qr = payment.point_of_interaction?.transaction_data ?? {};
    return {
      state: "open" as const,
      charge: {
        paymentId: String(payment.id),
        status: String(payment.status),
        qrCodeBase64: (qr.qr_code_base64 ?? sub.last_qr_code ?? null) as string | null,
        qrCodeCopyPaste: (qr.qr_code ?? sub.last_copy_paste ?? null) as string | null,
        amount: Number(payment.transaction_amount ?? sub.plan_amount ?? PLAN_AMOUNT),
        expiresAt,
        dueDate: sub.next_due_date as string | null,
      },
    };
  });

/**
 * Gera (ou reaproveita) a cobrança PIX da assinatura e devolve o QR Code para a
 * tela. O e-mail do pagador é o da própria conta: nada é pedido ao dono.
 */
export const subscribeWithPix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        payerEmail: z.string().email().optional(),
        planCode: planCodeSchema.optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("*")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub) throw new Error("Assinatura não inicializada");
    const checkout = await preparePlanForCheckout(sub, data.planCode);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createSubscriptionPixCharge, fetchMpPayment } = await import("@/lib/dojo/subscription-pix.server");

    // Já existe um PIX em aberto, ainda válido e com o mesmo valor: mostra o mesmo.
    if (sub.subscription_type === "pix" && sub.last_payment_id && sub.current_payment_status !== "approved") {
      try {
        const p = await fetchMpPayment(sub.last_payment_id);
        const valid = p.status === "pending" && (!p.date_of_expiration || new Date(p.date_of_expiration).getTime() > Date.now());
        if (valid && Number(p.transaction_amount) === checkout.amount) {
          const qr = p.point_of_interaction?.transaction_data ?? {};
          return {
            paymentId: String(p.id),
            status: String(p.status),
            qrCodeBase64: qr.qr_code_base64 ?? sub.last_qr_code ?? null,
            qrCodeCopyPaste: qr.qr_code ?? sub.last_copy_paste ?? null,
            expiresAt: p.date_of_expiration ?? null,
          };
        }
      } catch {
        /* gera um novo abaixo */
      }
    }

    const { data: userRes } = await context.supabase.auth.getUser();
    const email = data.payerEmail || userRes.user?.email;
    if (!email) throw new Error("E-mail da conta indisponível");

    const charge = await createSubscriptionPixCharge(supabaseAdmin, sub, {
      amount: checkout.amount,
      payerEmail: email,
      description: `${subscriptionReason(checkout.planCode)} (PIX)`,
      notificationUrl: mpNotificationUrl(dojoOriginFromRequest(getRequest())),
    });

    // Quem troca o cartão pelo PIX: cancela o preapproval do cartão.
    if (sub.subscription_type === "card" && sub.mp_preapproval_id) {
      try {
        await mpAmt(`/preapproval/${sub.mp_preapproval_id}`, {
          method: "PUT",
          body: JSON.stringify({ status: "cancelled" }),
        });
      } catch (e) {
        console.warn("Falha ao cancelar assinatura anterior durante migração para PIX", e);
      }
      await supabaseAdmin.from("dojo_subscriptions").update({ mp_preapproval_id: null } as never).eq("id", sub.id);
    }

    return {
      paymentId: charge.paymentId,
      status: charge.status,
      qrCodeBase64: charge.qrCodeBase64,
      qrCodeCopyPaste: charge.qrCodeCopyPaste,
      expiresAt: charge.expiresAt,
    };
  });

/** Confere um pagamento PIX da própria assinatura (a tela consulta enquanto o QR Code está aberto). */
export const syncPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ paymentId: z.string().min(1).max(40) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("dojo_subscriptions")
      .select("id, last_payment_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (!sub || sub.last_payment_id !== data.paymentId) return { status: "unknown" };
    const { fetchMpPayment, applyApprovedSubscriptionPix } = await import("@/lib/dojo/subscription-pix.server");
    const payment = await fetchMpPayment(data.paymentId);
    if (payment.status === "approved") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await applyApprovedSubscriptionPix(supabaseAdmin, sub.id, payment);
    }
    return { status: payment.status };
  });



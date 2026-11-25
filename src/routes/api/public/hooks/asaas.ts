import { createFileRoute } from "@tanstack/react-router";
import { paidAtFromProvider } from "@/lib/dojo/finance-dates";

/**
 * Webhook Asaas — sincroniza as cobranças das subcontas com `dojo_invoices`
 * e os saques (TRANSFER_*) com `dojo_withdrawals`.
 *
 * Segurança:
 *  - Token Asaas no header `asaas-access-token` (`ASAAS_WEBHOOK_TOKEN`). O mesmo
 *    token vai para o webhook de todas as subcontas, então ele sozinho não
 *    prova de qual academia veio o evento.
 *  - Por isso a cobrança é CONFIRMADA na API do Asaas com a chave da subconta
 *    da academia dona da fatura: o status gravado é o que o Asaas devolve, e
 *    cobrança que não existe naquela subconta é ignorada.
 *
 * Status (em `dojo_invoices.status`: pending | paid | overdue | cancelled):
 *  - Vem do status atual da cobrança, não da ordem dos eventos.
 *  - Nunca regride: fatura paga ou cancelada não volta a pendente/vencida por
 *    um evento atrasado, repetido ou desconhecido.
 */

type LocalStatus = "pending" | "paid" | "overdue" | "cancelled";

const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);
const OVERDUE = new Set(["OVERDUE", "DUNNING_REQUESTED"]);
const REFUNDED = new Set([
  "REFUNDED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);
const PENDING = new Set(["PENDING", "AWAITING_RISK_ANALYSIS"]);

const EVENT_STATUS: Record<string, LocalStatus> = {
  PAYMENT_CONFIRMED: "paid",
  PAYMENT_RECEIVED: "paid",
  PAYMENT_RECEIVED_IN_CASH: "paid",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_DELETED: "cancelled",
  PAYMENT_REFUNDED: "cancelled",
  PAYMENT_REFUND_IN_PROGRESS: "cancelled",
  PAYMENT_CHARGEBACK_REQUESTED: "cancelled",
  PAYMENT_CREATED: "pending",
  PAYMENT_UPDATED: "pending",
  PAYMENT_AWAITING_RISK_ANALYSIS: "pending",
};

/** Status local a partir do status da cobrança (preferido) ou do evento. `null` = não mexe. */
function mapStatus(event: string, payment: any): LocalStatus | null {
  if (payment?.deleted === true || event === "PAYMENT_DELETED") return "cancelled";
  const s = String(payment?.status ?? "").toUpperCase();
  if (PAID.has(s)) return "paid";
  if (OVERDUE.has(s)) return "overdue";
  if (REFUNDED.has(s)) return "cancelled";
  if (PENDING.has(s)) return "pending";
  if (s) return null; // status conhecido do Asaas sem efeito aqui (ex.: REFUND_REQUESTED)
  return EVENT_STATUS[event] ?? null;
}

/** Fatura paga/cancelada não volta para pendente/vencida. */
function nextStatus(current: string | null | undefined, incoming: LocalStatus): LocalStatus | null {
  const cur = String(current ?? "");
  const closed = cur === "paid" || cur === "cancelled" || cur === "canceled";
  if (closed && (incoming === "pending" || incoming === "overdue")) return null;
  return incoming;
}

function cleanToken(v: string | null | undefined) {
  return (v ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

/** Comparação em tempo constante (não vaza o token por tempo de resposta). */
function sameToken(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/hooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = cleanToken(request.headers.get("asaas-access-token"));
        const expected = cleanToken(process.env.ASAAS_WEBHOOK_TOKEN);
        if (!expected || !sameToken(token, expected)) {
          return new Response("Invalid token", { status: 401 });
        }

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event: string = String(body?.event ?? "");

        // ------------------------------------------------------------
        // TRANSFER_* — saques via Asaas
        // ------------------------------------------------------------
        if (event.startsWith("TRANSFER_")) {
          const transfer = body?.transfer;
          if (!transfer?.id) {
            return Response.json({ ignored: true, reason: "no-transfer" });
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { applyTransferEvent } = await import("@/lib/dojo/payments/withdrawals.server");
          const r = await applyTransferEvent(supabaseAdmin, event, transfer);
          return Response.json({ ok: true, event, ...r });
        }

        const payment = body?.payment ?? null;
        if (!event || !payment?.id) {
          return Response.json({ ignored: true, reason: "no-payment" });
        }
        const chargeId = String(payment.id);
        const subscriptionId: string | null = payment.subscription ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ------------------------------------------------------------
        // 1. Fatura local / matrícula dona da cobrança
        // ------------------------------------------------------------
        const INVOICE_COLS = "id, owner_id, student_id, enrollment_id, unit_id, status, asaas_charge_id";
        const ref = typeof payment.externalReference === "string" ? payment.externalReference : "";

        // a) Cobrança avulsa criada pelo sistema: externalReference = dojo_invoice:<uuid>
        let local: any = null;
        const invoiceMatch = /^dojo_invoice:([0-9a-fA-F-]{36})$/.exec(ref);
        if (invoiceMatch) {
          const { data } = await supabaseAdmin
            .from("dojo_invoices")
            .select(INVOICE_COLS)
            .eq("id", invoiceMatch[1])
            .maybeSingle();
          local = data;
        }
        // b) Fatura que já conhece este charge (mensalidades de assinatura já vistas).
        if (!local) {
          const { data } = await supabaseAdmin
            .from("dojo_invoices")
            .select(INVOICE_COLS)
            .eq("asaas_charge_id", chargeId)
            .maybeSingle();
          local = data;
        }

        let invoiceId: string | null = local?.id ?? null;
        const currentStatus: string | null = local?.status ?? null;
        const localChargeId: string | null = local?.asaas_charge_id ?? null;
        let enrollmentId: string | null = local?.enrollment_id ?? null;
        let ownerId: string | null = local?.owner_id ?? null;
        let studentId: string | null = local?.student_id ?? null;
        let unitId: string | null = local?.unit_id ?? null;

        // c) Cobrança nova de assinatura: acha a matrícula (assinatura, depois referência).
        if (!ownerId) {
          const enrCols = "id, owner_id, student_id, student:dojo_students(unit_id)";
          let enr: any = null;
          if (subscriptionId) {
            const { data } = await supabaseAdmin
              .from("dojo_enrollments")
              .select(enrCols)
              .eq("asaas_subscription_id", subscriptionId)
              .maybeSingle();
            enr = data;
          }
          const enrMatch = /^dojo_enrollment:([0-9a-fA-F-]{36})$/.exec(ref);
          if (!enr && enrMatch) {
            const { data } = await supabaseAdmin
              .from("dojo_enrollments")
              .select(enrCols)
              .eq("id", enrMatch[1])
              .maybeSingle();
            enr = data;
          }
          if (enr) {
            enrollmentId = enr.id;
            ownerId = enr.owner_id;
            studentId = enr.student_id;
            unitId = enr.student?.unit_id ?? null;
          }
        }

        if (!ownerId || !studentId) {
          return Response.json({ ignored: true, reason: "no-local-charge", event });
        }

        // ------------------------------------------------------------
        // 2. Confirma a cobrança na subconta da academia
        // ------------------------------------------------------------
        let source: any = payment;
        let verified = false;
        const { getDojoAsaasApiKey } = await import("@/lib/asaas/dojo-credentials.server");
        const ownerKey = await getDojoAsaasApiKey(ownerId);
        if (ownerKey) {
          try {
            const { asaasGetCharge } = await import("@/lib/asaas/client.server");
            const remote = await asaasGetCharge(chargeId, ownerKey);
            source = { ...payment, ...remote };
            verified = true;
          } catch (err: any) {
            const msg = String(err?.message ?? err);
            if (/API 404/.test(msg)) {
              // Não existe nesta subconta. Só aceita a exclusão de uma cobrança
              // que esta fatura já conhecia (o id não é adivinhável).
              const knownDelete = event === "PAYMENT_DELETED" && localChargeId === chargeId;
              if (!knownDelete) {
                console.warn("[asaas-webhook] cobrança não pertence à subconta da academia", {
                  event,
                  chargeId,
                  ownerId,
                });
                return Response.json({ ignored: true, reason: "charge-not-in-subaccount", event });
              }
              source = { ...payment, deleted: true };
              verified = true;
            } else {
              // Asaas fora do ar: segue com o payload (já autenticado pelo token)
              // para não perder o evento; a regra de não-regressão vale do mesmo jeito.
              console.warn("[asaas-webhook] falha ao confirmar cobrança no Asaas:", msg);
            }
          }
        }

        const incoming = mapStatus(event, source);
        if (!incoming) {
          return Response.json({ ok: true, ignored: true, reason: "no-status-change", event });
        }
        const status = invoiceId ? nextStatus(currentStatus, incoming) : incoming;
        if (!status) {
          return Response.json({ ok: true, ignored: true, reason: "kept-final-status", event });
        }

        // ------------------------------------------------------------
        // 3. Grava a fatura
        // ------------------------------------------------------------
        const billingType = String(source.billingType ?? "");
        const method: string | null =
          billingType === "PIX"
            ? "pix"
            : billingType === "BOLETO"
              ? "boleto"
              : billingType === "CREDIT_CARD"
                ? "credit_card"
                : null;
        const paidAt =
          status === "paid"
            ? paidAtFromProvider(source.paymentDate || source.clientPaymentDate || source.confirmedDate)
            : undefined;

        const patch: Record<string, any> = {
          status,
          amount: Number(source.value ?? payment.value ?? 0),
          due_date: source.dueDate ?? undefined,
          description: source.description ?? `Mensalidade — ${source.dueDate ?? ""}`.trim(),
          payment_provider: "asaas",
          provider: "asaas",
          method: method ?? undefined,
          asaas_charge_id: chargeId,
          payment_link: invoiceId ? undefined : (source.invoiceUrl ?? undefined),
          asaas_invoice_url: source.invoiceUrl ?? undefined,
          paid_at: paidAt,
        };

        let action: "updated" | "created" = "updated";
        if (invoiceId) {
          await supabaseAdmin.from("dojo_invoices").update(patch as never).eq("id", invoiceId);
        } else {
          const { data: inserted } = await supabaseAdmin
            .from("dojo_invoices")
            .insert({
              student_id: studentId,
              enrollment_id: enrollmentId,
              unit_id: unitId,
              owner_id: ownerId,
              asaas_subscription_id: subscriptionId,
              ...patch,
            } as never)
            .select("id")
            .single();
          invoiceId = (inserted as any)?.id ?? null;
          action = "created";
        }

        // ------------------------------------------------------------
        // 4. Conciliação — ledger + líquido
        // ------------------------------------------------------------
        const remoteStatus = String(source.status ?? "").toUpperCase();
        const isRefund =
          REFUNDED.has(remoteStatus) ||
          event === "PAYMENT_REFUNDED" ||
          event === "PAYMENT_CHARGEBACK_REQUESTED" ||
          event === "PAYMENT_REFUND_IN_PROGRESS";
        if (invoiceId && (status === "paid" || (status === "cancelled" && isRefund))) {
          try {
            const installments = Number(source.installmentNumber ?? source.installmentCount ?? 1);
            const ledgerMethod: "pix" | "boleto" | "card" | "link" =
              method === "credit_card" ? "card" : method === "pix" || method === "boleto" ? method : "link";
            const ledger = await import("@/lib/dojo/payments/ledger.server");
            if (status === "paid") {
              await ledger.recordInvoicePaymentToLedger(supabaseAdmin, {
                ownerId,
                invoiceId,
                studentId,
                gross: Number(source.value ?? 0),
                method: ledgerMethod,
                installments,
                provider: "asaas",
                providerTxId: chargeId,
                description: source.description ?? null,
                paidAt: paidAt ? new Date(paidAt) : new Date(),
              });
            } else {
              await ledger.recordInvoiceRefundToLedger(supabaseAdmin, {
                ownerId,
                invoiceId,
                studentId,
                gross: Number(source.value ?? 0),
                method: ledgerMethod,
                provider: "asaas",
                providerTxId: chargeId,
                description: `Estorno — ${source.description ?? ""}`.trim(),
                paidAt: new Date(),
              });
            }
          } catch (err) {
            // Não bloqueia o webhook; loga para auditoria
            console.error("[asaas-webhook] ledger error", err);
          }
        }

        return Response.json({ ok: true, action, event, status, verified });
      },
    },
  },
});

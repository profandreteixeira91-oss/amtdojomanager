// PIX recorrente da assinatura do Dojo Manager (mensalidade que o dono paga à AMT).
//
// Todo mês o sistema gera a cobrança PIX (rotina diária, 3 dias antes do
// vencimento) e o QR Code aparece no próprio painel — não depende de e-mail.
// A cobrança vale até o fim da tolerância de atraso, para o QR Code exibido
// nunca vencer antes de a conta ser suspensa.
//
// Usado por subscription.functions (tela), pela rotina diária e pelo webhook do
// Mercado Pago. Só roda no servidor.

/** Dias depois do vencimento até a suspensão (a rotina diária suspende após isso). */
export const PIX_GRACE_DAYS = 5;

type Admin = any;

function mpToken(): string {
  const key = process.env.STORE_MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!key) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurada");
  return key;
}

function addDays(dateISO: string, days: number): Date {
  const d = new Date(`${dateISO}T12:00:00-03:00`);
  d.setDate(d.getDate() + days);
  return d;
}

/** Data de expiração no formato que o Mercado Pago aceita (com fuso). */
function mpDate(d: Date): string {
  return d.toISOString().replace("Z", "-00:00");
}

export type PixCharge = {
  paymentId: string;
  status: string;
  qrCodeBase64: string | null;
  qrCodeCopyPaste: string | null;
  amount: number;
  expiresAt: string | null;
  dueDate: string | null;
};

/**
 * Cria a cobrança PIX de um ciclo e grava no registro da assinatura (QR Code e
 * código copia e cola ficam salvos para a tela mostrar).
 */
export async function createSubscriptionPixCharge(
  admin: Admin,
  sub: { id: string; last_payment_id?: string | null; next_due_date?: string | null },
  input: { amount: number; payerEmail: string; description: string; notificationUrl?: string | null },
): Promise<PixCharge> {
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = sub.next_due_date && sub.next_due_date > today ? sub.next_due_date : today;
  const expiresAt = addDays(dueDate, PIX_GRACE_DAYS);

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpToken()}`,
      "Content-Type": "application/json",
      // Uma cobrança por ciclo; um novo pedido depois que a anterior venceu
      // (last_payment_id mudou) gera outra, em vez de devolver a vencida.
      "X-Idempotency-Key": `dojo-sub-pix-${sub.id}-${dueDate}-${sub.last_payment_id ?? "primeira"}`,
    },
    body: JSON.stringify({
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: "pix",
      date_of_expiration: mpDate(expiresAt),
      external_reference: `dojo_sub_pix_payment:${sub.id}`,
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
      payer: { email: input.payerEmail },
    }),
  });
  const payment: any = await res.json().catch(() => null);
  if (!res.ok || !payment?.id) {
    const msg = payment?.message || payment?.cause?.[0]?.description || `Mercado Pago ${res.status}`;
    throw new Error(`Não foi possível gerar o PIX: ${msg}`);
  }

  const qr = payment.point_of_interaction?.transaction_data ?? {};
  const { error } = await admin
    .from("dojo_subscriptions")
    .update({
      subscription_type: "pix",
      payment_method: "pix",
      last_payment_id: String(payment.id),
      current_payment_status: payment.status ?? "pending",
      last_qr_code: qr.qr_code_base64 ?? null,
      last_copy_paste: qr.qr_code ?? null,
      next_due_date: dueDate,
    })
    .eq("id", sub.id);
  if (error) throw new Error(error.message);

  return {
    paymentId: String(payment.id),
    status: String(payment.status ?? "pending"),
    qrCodeBase64: qr.qr_code_base64 ?? null,
    qrCodeCopyPaste: qr.qr_code ?? null,
    amount: Number(payment.transaction_amount ?? input.amount),
    expiresAt: payment.date_of_expiration ?? expiresAt.toISOString(),
    dueDate,
  };
}

export async function fetchMpPayment(paymentId: string): Promise<any> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${mpToken()}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}`);
  return res.json();
}

/**
 * Pagamento PIX aprovado: ativa a assinatura e avança o vencimento um mês a
 * partir do vencimento do ciclo (pagar adiantado não encurta o mês seguinte).
 * Idempotente: só avança uma vez por pagamento.
 */
export async function applyApprovedSubscriptionPix(admin: Admin, subId: string, payment: any): Promise<boolean> {
  const { data: sub } = await admin
    .from("dojo_subscriptions")
    .select("id, last_payment_id, current_payment_status, next_due_date")
    .eq("id", subId)
    .maybeSingle();
  if (!sub) return false;
  const paymentId = String(payment?.id ?? "");
  if (sub.last_payment_id && sub.last_payment_id !== paymentId) {
    // Pagamento de uma cobrança antiga: registra, sem mexer no ciclo atual.
    await admin.from("dojo_subscriptions").update({ last_event: payment }).eq("id", subId);
    return false;
  }
  if (sub.current_payment_status === "approved" && sub.last_payment_id === paymentId) return false;

  const today = new Date().toISOString().slice(0, 10);
  const base = sub.next_due_date && sub.next_due_date > today ? sub.next_due_date : today;
  const next = addDays(base, 0);
  next.setMonth(next.getMonth() + 1);
  const nextISO = next.toISOString().slice(0, 10);

  const { data: changed } = await admin
    .from("dojo_subscriptions")
    .update({
      status: "active",
      current_payment_status: "approved",
      current_period_end: next.toISOString(),
      next_due_date: nextISO,
      last_qr_code: null,
      last_copy_paste: null,
      last_event: payment,
    })
    .eq("id", subId)
    .or("current_payment_status.is.null,current_payment_status.neq.approved")
    .select("id");
  return !!changed?.length;
}

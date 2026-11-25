/**
 * Datas do financeiro — uma regra só para telas, relatórios e servidor.
 *
 *  - Pago (contas a receber e a pagar) conta no DIA DO PAGAMENTO, no fuso do
 *    Brasil (regime de caixa).
 *  - Em aberto ou cancelado conta no mês do VENCIMENTO.
 *
 * `paid_at` é timestamp. Integrações que só informam a data (Asaas manda
 * "2026-12-01") eram gravadas como meia-noite UTC = 21h do dia anterior aqui;
 * esse caso é lido como a própria data.
 */
import { dayISO } from "@/lib/dates";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT = /T00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?)$/;

/** Dia (YYYY-MM-DD, Brasil) em que o dinheiro entrou ou saiu. */
export function paidDayISO(paidAt: string | null | undefined): string | null {
  if (!paidAt) return null;
  const s = String(paidAt);
  if (DATE_ONLY.test(s) || UTC_MIDNIGHT.test(s)) return s.slice(0, 10);
  return dayISO(s);
}

type Entry = { status?: string | null; paid_at?: string | null; due_date?: string | null };

/** Dia de caixa: o do pagamento; sem pagamento, o vencimento. */
export function cashDayISO(r: Entry): string {
  return paidDayISO(r.paid_at) ?? String(r.due_date ?? "").slice(0, 10);
}

/** Mês ("YYYY-MM") em que o lançamento aparece: pago → pagamento; aberto → vencimento. */
export function entryMonth(r: Entry): string {
  return (r.status === "paid" ? cashDayISO(r) : String(r.due_date ?? "")).slice(0, 7);
}

/**
 * Para gravar `paid_at` vindo de integração: data pura vira meio-dia no
 * Brasil (fica no dia certo em qualquer fuso); timestamp completo é mantido.
 */
export function paidAtFromProvider(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const s = String(value).trim();
  if (DATE_ONLY.test(s)) return new Date(`${s}T12:00:00-03:00`).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** "2026-11" → "novembro de 2026". */
export function monthLongLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Soma `delta` meses a "YYYY-MM". */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

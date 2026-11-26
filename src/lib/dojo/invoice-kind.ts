/**
 * Tipo de uma cobrança (dojo_invoices) — regra ÚNICA para telas e servidor.
 *
 * Mensalidade é a cobrança recorrente do plano do aluno. Todo o resto (taxa de
 * matrícula, taxa de graduação, venda, cobrança de filial, lançamento avulso)
 * é "outra receita" e fica em Contas a receber.
 *
 * Não existe coluna de tipo na tabela, então a regra usa o que cada fluxo grava:
 *  - venda (`source = sale`), filial (`affiliate`) e graduação (`other`) nunca são mensalidade;
 *  - taxa de matrícula/graduação são lançadas com a matrícula, mas têm descrição própria;
 *  - mensalidade vem da matrícula (`enrollment_id`), da assinatura do Asaas
 *    (`asaas_subscription_id`) ou é antecipada/importada com "Mensalidade" na descrição.
 */
export type InvoiceKindFields = {
  source?: string | null;
  description?: string | null;
  enrollment_id?: string | null;
  asaas_subscription_id?: string | null;
};

const NON_TUITION_SOURCES = new Set(["sale", "affiliate", "other"]);
const FEE_DESCRIPTION = /^\s*taxa\s+de\s+(matr[ií]cula|gradua[cç][aã]o)/i;
const TUITION_DESCRIPTION = /mensalidade/i;

export function isTuitionInvoice(inv: InvoiceKindFields): boolean {
  if (inv.source && NON_TUITION_SOURCES.has(inv.source)) return false;
  const description = inv.description ?? "";
  if (FEE_DESCRIPTION.test(description)) return false;
  if (inv.enrollment_id || inv.asaas_subscription_id) return true;
  return TUITION_DESCRIPTION.test(description);
}

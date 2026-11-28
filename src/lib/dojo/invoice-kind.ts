/**
 * Tipo de cada cobrança (`dojo_invoices`), pelo campo `source`.
 *
 * Mensalidades, taxas de graduação, vendas e cobranças de filiais ficam na
 * mesma tabela. O que vem do plano do aluno (mensalidade, 1ª mensalidade,
 * matrícula, antecipação, cobrança avulsa do perfil do aluno, assinaturas do
 * gateway) usa o padrão do banco, `source = 'student'`. Os demais gravam o
 * próprio tipo: `other` (taxa de graduação), `sale` (venda), `affiliate` (filial).
 *
 * A aba Mensalidades mostra só mensalidades; Contas a receber, o resto.
 */
type WithSource = { source?: string | null };

export function isTuitionInvoice(row: WithSource): boolean {
  return (row.source ?? "student") === "student";
}

const KIND_LABEL: Record<string, string> = {
  student: "Mensalidade",
  other: "Graduação",
  sale: "Venda",
  affiliate: "Filial",
};

/** Rótulo curto do tipo da cobrança ("Mensalidade", "Graduação", "Venda"...). */
export function invoiceKindLabel(row: WithSource): string {
  return KIND_LABEL[row.source ?? "student"] ?? "Outros";
}

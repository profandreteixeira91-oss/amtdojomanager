/**
 * O banco recusa cobrança em aberto para aluno inativo ou trancado
 * (trigger dojo_invoices_block_inactive). Fluxos que gravam vários registros
 * e depois lançam taxas conferem isso ANTES de gravar qualquer coisa — senão
 * o erro aparece no meio e o que já foi gravado fica pela metade (e duplica
 * quando o usuário tenta de novo).
 */
export async function assertStudentsCanBeBilled(
  sb: unknown,
  items: Array<{ student_id: string; fee: number; paid?: boolean | null }>,
): Promise<void> {
  const charged = Array.from(new Set(items.filter((i) => i.fee > 0 && i.paid !== true).map((i) => i.student_id)));
  if (!charged.length) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb as any).from("dojo_students").select("id, full_name, status").in("id", charged);
  if (error) throw new Error(error.message);
  const blocked = ((data ?? []) as Array<{ full_name: string | null; status: string | null }>)
    .filter((s) => s.status === "inactive" || s.status === "frozen")
    .map((s) => `${s.full_name ?? "Aluno"} (${s.status === "frozen" ? "trancado" : "inativo"})`);
  if (blocked.length) {
    throw new Error(
      `Nada foi registrado. Aluno inativo ou trancado não pode receber cobrança: ${blocked.join(", ")}. ` +
        "Reative o cadastro, marque a taxa como paga, zere a taxa ou tire o aluno da lista.",
    );
  }
}

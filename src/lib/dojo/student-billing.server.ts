/**
 * Situação do aluno × cobranças.
 *
 * Regra: aluno trancado (ou inativo) não recebe cobrança e não entra no MRR.
 * O trancamento precisa valer por qualquer caminho (botão "Congelar matrícula",
 * edição da ficha, status da matrícula, importação), então tudo passa por aqui:
 *
 *  - pauseStudentBilling: matrículas ativas viram `paused` (com `paused_from`,
 *    que marca o que foi pausado pelo trancamento), a assinatura no Asaas é
 *    cancelada e as faturas ainda não vencidas são canceladas (também no
 *    Asaas). Débitos já vencidos continuam em aberto.
 *  - resumeStudentBilling: volta a cobrar só o que o trancamento pausou, com o
 *    próximo vencimento a partir de hoje (nada retroativo ao período trancado).
 */
import { todayISO } from "@/lib/dates";
import { isBillableStudentStatus } from "@/lib/dojo/student-status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Primeiro vencimento (dia `dueDay`) em `from` ou depois. */
export function nextDueOnOrAfter(from: string, dueDay: number | null | undefined): string {
  const [y, m] = from.split("-").map(Number);
  const day = Math.max(1, Math.min(31, Number(dueDay ?? 5) || 5));
  const build = (yy: number, mm: number) => {
    const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`;
  };
  const here = build(y, m);
  if (here >= from) return here;
  return m === 12 ? build(y + 1, 1) : build(y, m + 1);
}

async function asaasKey(ownerId: string, cache: Map<string, string | undefined>) {
  if (cache.has(ownerId)) return cache.get(ownerId);
  const { getDojoAsaasCredentials } = await import("@/lib/asaas/dojo-credentials.server");
  const creds = await getDojoAsaasCredentials(ownerId).catch(() => null);
  const key = creds?.apiKey;
  cache.set(ownerId, key);
  return key;
}

/** Cancela faturas que ainda não venceram (no sistema e no Asaas). */
export async function cancelUpcomingInvoices(
  db: Db,
  opts: { studentId: string; enrollmentIds?: string[] },
): Promise<{ cancelled: number; warnings: string[] }> {
  const warnings: string[] = [];
  let q = db
    .from("dojo_invoices")
    .select("id, owner_id, asaas_charge_id")
    .eq("student_id", opts.studentId)
    .in("status", ["pending", "overdue"])
    .gte("due_date", todayISO());
  if (opts.enrollmentIds) {
    if (opts.enrollmentIds.length === 0) return { cancelled: 0, warnings };
    q = q.in("enrollment_id", opts.enrollmentIds);
  }
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const keys = new Map<string, string | undefined>();
  let cancelled = 0;
  for (const inv of (rows ?? []) as Array<{
    id: string;
    owner_id: string;
    asaas_charge_id: string | null;
  }>) {
    if (inv.asaas_charge_id) {
      try {
        const apiKey = await asaasKey(inv.owner_id, keys);
        const { asaasCancelCharge } = await import("@/lib/asaas/client.server");
        await asaasCancelCharge(inv.asaas_charge_id, apiKey);
      } catch (e) {
        warnings.push(
          `Cobrança ${inv.id} não foi cancelada no Asaas: ${(e as Error)?.message ?? e}`,
        );
      }
    }
    const { error: upErr } = await db
      .from("dojo_invoices")
      .update({ status: "cancelled" })
      .eq("id", inv.id);
    if (upErr) warnings.push(upErr.message);
    else cancelled++;
  }
  return { cancelled, warnings };
}

/** Trancamento: pausa as matrículas ativas e cancela as cobranças futuras. */
export async function pauseStudentBilling(
  db: Db,
  studentId: string,
  opts: { until?: string | null } = {},
): Promise<{ paused: number; cancelledInvoices: number; warnings: string[] }> {
  const today = todayISO();
  const warnings: string[] = [];
  const { data: actives, error } = await db
    .from("dojo_enrollments")
    .select("id, owner_id, asaas_subscription_id")
    .eq("student_id", studentId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const keys = new Map<string, string | undefined>();
  let paused = 0;
  for (const e of (actives ?? []) as Array<{
    id: string;
    owner_id: string;
    asaas_subscription_id: string | null;
  }>) {
    const patch: Record<string, unknown> = {
      status: "paused",
      paused_from: today,
      paused_until: opts.until ?? null,
    };
    // Assinatura no Asaas cobraria sozinha durante o trancamento: cancela.
    // Na reativação, a mensalidade volta a ser gerada pelo sistema.
    if (e.asaas_subscription_id) {
      try {
        const apiKey = await asaasKey(e.owner_id, keys);
        const { asaasCancelSubscription } = await import("@/lib/asaas/client.server");
        await asaasCancelSubscription(e.asaas_subscription_id, apiKey);
        patch.asaas_subscription_id = null;
      } catch (err) {
        warnings.push(
          `Assinatura ${e.asaas_subscription_id} não foi cancelada no Asaas: ${(err as Error)?.message ?? err}`,
        );
      }
    }
    const { error: upErr } = await db.from("dojo_enrollments").update(patch).eq("id", e.id);
    if (upErr) warnings.push(upErr.message);
    else paused++;
  }
  const inv = await cancelUpcomingInvoices(db, { studentId });
  warnings.push(...inv.warnings);
  if (warnings.length) console.warn("[student-billing] pause", studentId, warnings);
  return { paused, cancelledInvoices: inv.cancelled, warnings };
}

type PausedRow = {
  id: string;
  due_day: number | null;
  next_run_at: string | null;
  paused_from: string | null;
};

/** Volta a cobrar matrículas, com o próximo vencimento a partir de hoje. */
export async function reactivateEnrollments(db: Db, rows: PausedRow[]): Promise<number> {
  const today = todayISO();
  let n = 0;
  for (const e of rows) {
    const current = e.next_run_at ? String(e.next_run_at).slice(0, 10) : null;
    const next = current && current >= today ? current : nextDueOnOrAfter(today, e.due_day);
    const { error } = await db
      .from("dojo_enrollments")
      .update({
        status: "active",
        paused_from: null,
        paused_until: null,
        cancelled_at: null,
        next_run_at: next,
      })
      .eq("id", e.id);
    if (error) throw new Error(error.message);
    // Faturas canceladas pelo trancamento bloqueariam a geração do mês
    // (a geração é idempotente por mês): libera para a cobrança nova.
    if (e.paused_from) {
      await db
        .from("dojo_invoices")
        .delete()
        .eq("enrollment_id", e.id)
        .eq("status", "cancelled")
        .gte("due_date", today)
        .gte("updated_at", e.paused_from);
    }
    n++;
  }
  return n;
}

/** Reativação: retoma o que o trancamento pausou. */
export async function resumeStudentBilling(
  db: Db,
  studentId: string,
): Promise<{ resumed: number }> {
  const { data: rows, error } = await db
    .from("dojo_enrollments")
    .select("id, status, due_day, next_run_at, paused_from, created_at")
    .eq("student_id", studentId)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const all = (rows ?? []) as Array<PausedRow & { status: string }>;
  const paused = all.filter((e) => e.status === "paused");
  let toResume = paused.filter((e) => e.paused_from);
  // Trancamentos antigos não marcavam `paused_from`: retoma a matrícula mais
  // recente quando o aluno ficaria sem nenhuma matrícula ativa.
  if (toResume.length === 0 && paused.length > 0 && !all.some((e) => e.status === "active")) {
    toResume = [paused[0]];
  }
  return { resumed: await reactivateEnrollments(db, toResume) };
}

/**
 * Aplica a mudança de situação do aluno nas cobranças. Chamar depois de
 * gravar o novo status.
 */
export async function applyStudentStatusChange(
  db: Db,
  studentId: string,
  prev: string | null | undefined,
  next: string | null | undefined,
  opts: { until?: string | null } = {},
) {
  const wasBillable = isBillableStudentStatus(prev);
  const isBillable = isBillableStudentStatus(next);
  if (wasBillable && !isBillable) return pauseStudentBilling(db, studentId, opts);
  if (
    !wasBillable &&
    isBillable &&
    (prev === "frozen" || prev === "inactive" || prev === "cancelled")
  ) {
    await resumeStudentBilling(db, studentId);
  }
  return null;
}

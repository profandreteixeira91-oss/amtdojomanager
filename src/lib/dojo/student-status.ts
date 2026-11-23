/**
 * Situação do aluno e da matrícula: um só lugar para etiquetas e regras.
 * O que aparece na tela tem de corresponder ao que o sistema cobra.
 */

export type StudentStatusTone = "ok" | "warn" | "muted" | "danger" | "info";

export const STUDENT_STATUS: Record<string, { label: string; tone: StudentStatusTone }> = {
  active: { label: "Ativo", tone: "ok" },
  frozen: { label: "Trancado", tone: "warn" },
  inactive: { label: "Inativo", tone: "muted" },
  cancelled: { label: "Cancelado", tone: "danger" },
  pending: { label: "Pré-cadastro", tone: "info" },
  trial: { label: "Experimental", tone: "info" },
};

export function studentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return STUDENT_STATUS[status]?.label ?? status;
}

export function studentStatusTone(status: string | null | undefined): StudentStatusTone {
  return STUDENT_STATUS[status ?? ""]?.tone ?? "muted";
}

export const ENROLLMENT_STATUS: Record<string, { label: string; tone: StudentStatusTone }> = {
  active: { label: "Ativa", tone: "ok" },
  paused: { label: "Trancada", tone: "warn" },
  cancelled: { label: "Cancelada", tone: "danger" },
  canceled: { label: "Cancelada", tone: "danger" },
  overdue: { label: "Em atraso", tone: "danger" },
};

export function enrollmentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return ENROLLMENT_STATUS[status]?.label ?? status;
}

/** Situações em que o aluno não recebe cobrança nem conta no MRR. */
export const NON_BILLABLE_STUDENT_STATUSES = [
  "frozen",
  "inactive",
  "cancelled",
  "pending",
] as const;

export function isBillableStudentStatus(status: string | null | undefined): boolean {
  return !(NON_BILLABLE_STUDENT_STATUSES as readonly string[]).includes(String(status ?? "active"));
}

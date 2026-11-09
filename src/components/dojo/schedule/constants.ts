import { MODALITY_IDS } from "@/lib/dojo/modalities";

export const WEEKDAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

/** Modalidades das turmas: o catálogo único do sistema (src/lib/dojo/modalities.ts). */
export const MODALITIES: string[] = MODALITY_IDS;

export const LEVELS = ["iniciante", "intermediário", "avançado", "todos"];

export const CLASS_COLORS = [
  "#dc2626",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#0f172a",
  "#6b7280",
];

export const CANCEL_REASONS = ["Feriado", "Competição", "Professor ausente", "Manutenção", "Outro"];

export function fmtTime(t: string) {
  return t?.slice(0, 5) ?? "";
}

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

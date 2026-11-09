// Capturas REAIS do sistema (public/dojo-shots). Nenhuma imagem ilustrativa.
export const SHOT = {
  dashboard: "/dojo-shots/dashboard.webp",
  students: "/dojo-shots/students.webp",
  finance: "/dojo-shots/finance.webp",
  schedule: "/dojo-shots/schedule.webp",
  graduations: "/dojo-shots/graduations.webp",
  checkin: "/dojo-shots/checkin.webp",
  competitions: "/dojo-shots/competitions.webp",
  evaluations: "/dojo-shots/evaluations.webp",
  announcements: "/dojo-shots/announcements.webp",
  store: "/dojo-shots/store.webp",
  studentApp: "/dojo-shots/app-login.webp",
} as const;

export type ShotKey = keyof typeof SHOT;

/** Rotação de fundo do hero — telas reais do sistema. */
export const HERO_ROTATION: { key: ShotKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "finance", label: "Financeiro" },
  { key: "schedule", label: "Agenda" },
  { key: "checkin", label: "Check-in" },
  { key: "graduations", label: "Graduações" },
  { key: "announcements", label: "Comunicação" },
  { key: "students", label: "Alunos" },
  { key: "store", label: "Loja integrada" },
];


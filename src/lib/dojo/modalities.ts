// Catálogo único de modalidades do AMT Dojo Manager — cadastro inicial, turmas,
// faixas (Belt Studio), graduações, avaliações e análise técnica usam esta lista.
//
// O banco guarda o `id` (ex.: "judo", "muay-thai"). Valores antigos gravados de
// outro jeito ("judô", "Jiu-Jitsu", "Muay Thai") são reconhecidos por
// `normalizeModality`, então nada precisa ser regravado. Cada modalidade do
// catálogo tem faixas pré-definidas pelo sistema (dojo_belts com owner_id nulo).
// "Outra" deixa o dono digitar uma modalidade própria, sem faixas pré-definidas.

export type ModalityId =
  | "judo"
  | "jiu-jitsu"
  | "karate"
  | "taekwondo"
  | "boxe"
  | "muay-thai"
  | "mma"
  | "kickboxing";

export const MODALITY_CATALOG: { id: ModalityId; label: string }[] = [
  { id: "judo", label: "Judô" },
  { id: "jiu-jitsu", label: "Jiu-Jitsu" },
  { id: "karate", label: "Karatê" },
  { id: "taekwondo", label: "Taekwondo" },
  { id: "boxe", label: "Boxe" },
  { id: "muay-thai", label: "Muay-Thai" },
  { id: "mma", label: "MMA" },
  { id: "kickboxing", label: "Kickboxing" },
];

export const MODALITY_IDS: ModalityId[] = MODALITY_CATALOG.map((m) => m.id);

/** Opção "Outra" do cadastro: a pessoa digita o nome da modalidade. */
export const OTHER_MODALITY_LABEL = "Outra";

const ALIASES: Record<string, ModalityId> = {
  judo: "judo",
  "jiu-jitsu": "jiu-jitsu",
  jiujitsu: "jiu-jitsu",
  bjj: "jiu-jitsu",
  "brazilian-jiu-jitsu": "jiu-jitsu",
  karate: "karate",
  "karate-do": "karate",
  taekwondo: "taekwondo",
  tkd: "taekwondo",
  boxe: "boxe",
  boxing: "boxe",
  box: "boxe",
  "muay-thai": "muay-thai",
  muaythai: "muay-thai",
  mma: "mma",
  kickboxing: "kickboxing",
  "kick-boxing": "kickboxing",
};

function slug(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Id do catálogo para qualquer grafia conhecida ("Judô", "judô", "Muay Thai",
 * "jiu jitsu"…). Modalidade fora do catálogo volta como slug ("kung-fu").
 */
export function normalizeModality(v: string | null | undefined): string {
  const s = slug(String(v ?? ""));
  if (!s) return "";
  return ALIASES[s] ?? ALIASES[s.replace(/-/g, "")] ?? s;
}

export function isCatalogModality(v: string | null | undefined): v is ModalityId {
  return (MODALITY_IDS as string[]).includes(normalizeModality(v));
}

/** Nome para exibir: do catálogo, ou o próprio texto com iniciais maiúsculas. */
export function modalityLabel(v: string | null | undefined): string {
  const id = normalizeModality(v);
  const known = MODALITY_CATALOG.find((m) => m.id === id);
  if (known) return known.label;
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  return raw.replace(/-/g, " ").replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

/** Mesma modalidade, independentemente da grafia gravada. */
export function sameModality(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeModality(a) === normalizeModality(b);
}

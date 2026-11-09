// Catálogo único de modalidades do AMT Dojo Manager — cadastro inicial, turmas,
// faixas (Belt Studio), graduações, avaliações e análise técnica usam esta lista.
//
// O banco guarda o `id` (ex.: "judo", "muay-thai"). Valores antigos gravados de
// outro jeito ("judô", "Jiu-Jitsu", "Muay Thai") são reconhecidos por
// `normalizeModality`, então nada precisa ser regravado. As modalidades com
// graduação têm faixas pré-definidas pelo sistema (dojo_belts com owner_id nulo);
// Boxe e MMA não têm graduação. "Outra" deixa o dono digitar uma modalidade
// própria, sem faixas pré-definidas.

export type ModalityId =
  | "judo"
  | "jiu-jitsu"
  | "karate"
  | "taekwondo"
  | "boxe"
  | "muay-thai"
  | "mma"
  | "kickboxing";

export const MODALITY_CATALOG: { id: ModalityId; label: string; hasBelts: boolean }[] = [
  { id: "judo", label: "Judô", hasBelts: true },
  { id: "jiu-jitsu", label: "Jiu-Jitsu", hasBelts: true },
  { id: "karate", label: "Karatê", hasBelts: true },
  { id: "taekwondo", label: "Taekwondo", hasBelts: true },
  { id: "boxe", label: "Boxe", hasBelts: false },
  { id: "muay-thai", label: "Muay-Thai", hasBelts: true },
  { id: "mma", label: "MMA", hasBelts: false },
  { id: "kickboxing", label: "Kickboxing", hasBelts: true },
];

export const MODALITY_IDS: ModalityId[] = MODALITY_CATALOG.map((m) => m.id);

/** Modalidades com graduação (faixas pré-definidas): Modalidades e Faixas, Belt Studio. */
export const GRADED_MODALITIES = MODALITY_CATALOG.filter((m) => m.hasBelts);

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

import type { CSSProperties } from "react";

/**
 * Acabamento "realista" das ilustrações de faixa: costuras longitudinais,
 * trama do tecido, volume (luz em cima, sombra embaixo) e fitas de grau.
 *
 * É só uma camada visual por cima da geometria já calculada pelo
 * BeltVisual / BeltSpecVisual — não altera cores, graus nem layout.
 *
 * Cada modalidade tem o seu material:
 *  - Jiu-Jitsu: algodão trançado (pearl weave), costuras finas e densas.
 *  - Judô: algodão grosso, costura bem fechada e mais volume.
 *  - Karatê: acabamento acetinado (brilho diagonal), costuras espaçadas.
 *  - Taekwondo: faixa mais lisa, costuras espaçadas.
 *  - Muay Thai / Capoeira: cordão trançado (kruang / corda), não faixa.
 */
export type BeltMaterial = "bjj" | "judo" | "karate" | "taekwondo" | "cord" | "generic";

export function beltMaterial(modality?: string | null): BeltMaterial {
  const m = (modality ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (m === "" || m === "jiu-jitsu" || m === "jiujitsu" || m === "bjj" || m.includes("jiu"))
    return "bjj";
  if (m.includes("judo")) return "judo";
  if (m.includes("karate")) return "karate";
  if (m.includes("taekwondo") || m === "tkd") return "taekwondo";
  if (m.includes("muay") || m.includes("capoeira")) return "cord";
  return "generic";
}

/** Distância (px) entre as linhas de costura e intensidade do volume por material. */
const MATERIAL: Record<
  BeltMaterial,
  { pitch: number; weave: string; shade: number; sheen?: string }
> = {
  bjj: {
    pitch: 4,
    // trama "pearl weave": quadriculado miúdo
    weave:
      "repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 3px)",
    shade: 1,
  },
  judo: {
    pitch: 3,
    // algodão grosso: trama mais marcada
    weave:
      "repeating-linear-gradient(60deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 2.5px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 2.5px)",
    shade: 1.35,
  },
  karate: {
    pitch: 5,
    weave: "repeating-linear-gradient(90deg, rgba(0,0,0,0.03) 0 1px, transparent 1px 2px)",
    shade: 0.9,
    sheen:
      "linear-gradient(100deg, transparent 15%, rgba(255,255,255,0.22) 32%, transparent 48%, transparent 62%, rgba(255,255,255,0.12) 76%, transparent 90%)",
  },
  taekwondo: {
    pitch: 5,
    weave: "repeating-linear-gradient(90deg, rgba(0,0,0,0.025) 0 1px, transparent 1px 3px)",
    shade: 0.9,
    sheen: "linear-gradient(100deg, transparent 25%, rgba(255,255,255,0.14) 40%, transparent 55%)",
  },
  cord: { pitch: 0, weave: "", shade: 1.4 },
  generic: {
    pitch: 4,
    weave:
      "repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 3px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 3px)",
    shade: 1,
  },
};

/** Pontos de costura: linha tracejada (máscara corta a linha em "pontos"). */
const STITCH_MASK = "repeating-linear-gradient(90deg, #000 0 3px, transparent 3px 4.5px)";

/**
 * Camada de tecido: trama + costuras longitudinais + costura da ponta (U).
 * Deve ficar ABAIXO da ponteira/fitas de grau (a ponteira é costurada por cima).
 */
export function BeltWeave({ material }: { material: BeltMaterial }) {
  if (material === "cord") return <CordTwist />;
  const cfg = MATERIAL[material];
  const p = cfg.pitch;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: cfg.weave }}
      />
      {/* Costuras: sulco escuro + reflexo claro, para aparecer em faixas claras e escuras */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[3px] top-[3px] bottom-[3px]"
        style={{
          backgroundImage: `repeating-linear-gradient(180deg, rgba(0,0,0,0.15) 0 1px, rgba(255,255,255,0.14) 1px 2px, transparent 2px ${p}px)`,
          WebkitMaskImage: STITCH_MASK,
          maskImage: STITCH_MASK,
        }}
      />
      {/* Costura que contorna a ponta da faixa (lado esquerdo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[3px] top-[3px] bottom-[3px] w-px"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 3.5px)",
        }}
      />
    </>
  );
}

/** Trança do cordão (Muay Thai / Capoeira): fios em diagonal. */
function CordTwist() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "repeating-linear-gradient(115deg, rgba(255,255,255,0.30) 0 1.5px, transparent 1.5px 4px, rgba(0,0,0,0.26) 4px 6px, transparent 6px 8px), repeating-linear-gradient(65deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 8px)",
      }}
    />
  );
}

/**
 * Camada de luz: volume cilíndrico, brilho do material e borda costurada.
 * Fica POR CIMA de tudo (luz incide também sobre ponteira e fitas).
 */
export function BeltShade({ material }: { material: BeltMaterial }) {
  const cfg = MATERIAL[material];
  const k = cfg.shade;
  const top = (0.3 * k).toFixed(3);
  const bottom = (0.26 * k).toFixed(3);
  const volume =
    material === "cord"
      ? `linear-gradient(180deg, rgba(255,255,255,${top}) 0%, rgba(255,255,255,0.05) 30%, transparent 50%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,${bottom}) 100%)`
      : `linear-gradient(180deg, rgba(255,255,255,${top}) 0%, rgba(255,255,255,0.06) 18%, transparent 40%, transparent 70%, rgba(0,0,0,0.10) 85%, rgba(0,0,0,${bottom}) 100%)`;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30"
      style={{
        backgroundImage: cfg.sheen ? `${cfg.sheen}, ${volume}` : volume,
        boxShadow:
          material === "cord"
            ? "inset 0 1px 1px rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.35)"
            : "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.30), inset 1px 0 0 rgba(255,255,255,0.15), inset -1px 0 0 rgba(0,0,0,0.20)",
      }}
    />
  );
}

/** Classes do contorno externo da faixa (forma + sombra projetada). */
export function beltShellClass(material: BeltMaterial): string {
  return material === "cord"
    ? "rounded-full shadow-[0_2px_3px_rgba(0,0,0,0.25)]"
    : "rounded-[3px] shadow-[0_2px_3px_-1px_rgba(0,0,0,0.30),0_1px_1px_rgba(0,0,0,0.12)]";
}

/**
 * Fita de grau (esparadrapo / bordado): cor com leve brilho, borda e sombra,
 * como uma fita colada sobre a ponteira.
 */
export function tapeStyle(color: string, widthPx = 4): CSSProperties {
  return {
    width: widthPx,
    backgroundColor: color,
    backgroundImage:
      "linear-gradient(90deg, rgba(0,0,0,0.18) 0, rgba(255,255,255,0.25) 35%, rgba(255,255,255,0.05) 65%, rgba(0,0,0,0.22) 100%), repeating-linear-gradient(180deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 3px)",
    boxShadow: "0 0 0 0.5px rgba(0,0,0,0.45), 1px 0 1px rgba(0,0,0,0.25)",
  };
}

/**
 * Ponteira costurada sobre a faixa: sombra nas bordas para parecer uma peça
 * aplicada, e não um retângulo pintado.
 */
export const RANK_BAR_SHADOW =
  "inset 1px 0 0 rgba(255,255,255,0.10), inset -1px 0 0 rgba(255,255,255,0.10), -1px 0 2px rgba(0,0,0,0.35), 1px 0 2px rgba(0,0,0,0.35)";

/** Bordado dourado (graus de faixa preta no Karatê / Taekwondo). */
export const GOLD = "#D4AF37";

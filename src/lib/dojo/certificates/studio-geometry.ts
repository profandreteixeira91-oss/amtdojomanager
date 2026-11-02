import type { AnyElement, EditorSchema } from "@/components/dojo/certificate-editor/types";

/** Id do nó do canvas onde o renderer desenha cada elemento (`[data-el-id]`). */
export const CANVAS_ID = "cert-studio-canvas";

/** Caixa de um elemento em % da página: centro e tamanho. */
export type Box = { cx: number; cy: number; w: number; h: number };

/** Tamanho padrão (px da página) quando o elemento ainda não foi desenhado. */
function fallbackSize(el: AnyElement): { w: number; h: number } {
  const fs = (el as any).fontSize as number | undefined;
  if (el.kind === "text" || el.kind === "date") return { w: Math.max(200, (fs ?? 24) * 8), h: Math.max(40, (fs ?? 24) * 1.4) };
  return { w: 200, h: 100 };
}

/** Mede a caixa real que o renderer desenhou (px da página, sem zoom). */
export function measureElementPx(el: AnyElement, doc: EditorSchema): { w: number; h: number } {
  // No SSR não há DOM: usa o tamanho do modelo até o canvas ser desenhado no navegador.
  const inBrowser = typeof document !== "undefined" && typeof HTMLElement !== "undefined";
  const node = inBrowser
    ? document.getElementById(CANVAS_ID)?.querySelector(`[data-el-id="${CSS.escape(el.id)}"]`)?.firstElementChild
    : null;
  if (inBrowser && node instanceof HTMLElement && node.offsetWidth > 0) return { w: node.offsetWidth, h: node.offsetHeight };
  const fb = fallbackSize(el);
  return {
    w: el.w != null ? (el.w / 100) * doc.page.width : fb.w,
    h: el.h != null ? (el.h / 100) * doc.page.height : fb.h,
  };
}

export function measureBox(el: AnyElement, doc: EditorSchema): Box {
  const px = measureElementPx(el, doc);
  return { cx: el.x, cy: el.y, w: (px.w / doc.page.width) * 100, h: (px.h / doc.page.height) * 100 };
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/**
 * Novas posições para alinhar os elementos. Um elemento só: alinha à página.
 * Vários: alinha à caixa que envolve a seleção (como no Canva).
 */
export function alignPositions(els: AnyElement[], doc: EditorSchema, mode: AlignMode): Record<string, { x: number; y: number }> {
  const boxes = els.map((e) => ({ e, b: measureBox(e, doc) }));
  const frame = boxes.length === 1
    ? { l: 0, r: 100, t: 0, b: 100 }
    : {
        l: Math.min(...boxes.map(({ b }) => b.cx - b.w / 2)),
        r: Math.max(...boxes.map(({ b }) => b.cx + b.w / 2)),
        t: Math.min(...boxes.map(({ b }) => b.cy - b.h / 2)),
        b: Math.max(...boxes.map(({ b }) => b.cy + b.h / 2)),
      };
  const out: Record<string, { x: number; y: number }> = {};
  for (const { e, b } of boxes) {
    if (e.locked) continue;
    let x = e.x;
    let y = e.y;
    if (mode === "left") x = frame.l + b.w / 2;
    if (mode === "hcenter") x = (frame.l + frame.r) / 2;
    if (mode === "right") x = frame.r - b.w / 2;
    if (mode === "top") y = frame.t + b.h / 2;
    if (mode === "vcenter") y = (frame.t + frame.b) / 2;
    if (mode === "bottom") y = frame.b - b.h / 2;
    out[e.id] = { x: round2(x), y: round2(y) };
  }
  return out;
}

/** Espaça igualmente os centros entre o primeiro e o último (3+ elementos). */
export function distributePositions(els: AnyElement[], axis: "h" | "v"): Record<string, { x: number; y: number }> {
  const key = axis === "h" ? "x" : "y";
  const sorted = [...els].sort((a, b) => a[key] - b[key]);
  if (sorted.length < 3) return {};
  const first = sorted[0][key];
  const last = sorted[sorted.length - 1][key];
  const step = (last - first) / (sorted.length - 1);
  const out: Record<string, { x: number; y: number }> = {};
  sorted.forEach((e, i) => {
    if (e.locked) return;
    out[e.id] = axis === "h" ? { x: round2(first + step * i), y: e.y } : { x: e.x, y: round2(first + step * i) };
  });
  return out;
}

/** Linhas de encaixe: bordas e centro da página, margens e bordas/centros dos outros elementos. */
export function snapTargets(doc: EditorSchema, others: Box[]): { v: number[]; h: number[] } {
  const mx = ((doc.page.margin ?? 0) / doc.page.width) * 100;
  const my = ((doc.page.margin ?? 0) / doc.page.height) * 100;
  const v = [0, 50, 100];
  const h = [0, 50, 100];
  if (mx > 0) v.push(mx, 100 - mx);
  if (my > 0) h.push(my, 100 - my);
  for (const b of others) {
    v.push(b.cx - b.w / 2, b.cx, b.cx + b.w / 2);
    h.push(b.cy - b.h / 2, b.cy, b.cy + b.h / 2);
  }
  return { v, h };
}

/**
 * Ajusta o centro proposto para encaixar uma das bordas/centro da caixa numa
 * linha alvo, se estiver dentro do limite. Devolve o centro ajustado e a linha.
 */
export function snapAxis(center: number, size: number, targets: number[], threshold: number): { value: number; guide: number | null } {
  const edges = [center - size / 2, center, center + size / 2];
  let best: { diff: number; guide: number } | null = null;
  for (const t of targets) {
    for (const edge of edges) {
      const diff = t - edge;
      if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, guide: t };
    }
  }
  return best ? { value: center + best.diff, guide: best.guide } : { value: center, guide: null };
}

/** Cores únicas usadas no documento (para a paleta "Cores do documento"). */
export function documentColors(doc: EditorSchema): string[] {
  const seen = new Set<string>();
  const add = (c?: string) => {
    if (!c) return;
    const v = c.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v) || /^#[0-9a-f]{3}$/.test(v)) seen.add(v);
  };
  add(doc.page.background);
  for (const e of doc.elements as any[]) {
    add(e.color);
    add(e.fill);
    add(e.stroke);
    add(e.background);
    add(e.borderColor);
  }
  return Array.from(seen).slice(0, 14);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

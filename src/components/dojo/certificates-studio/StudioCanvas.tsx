import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "@/lib/dojo/certificates/studio-store";
import { CertificateRenderer } from "./CertificateRenderer";
import { sampleValues } from "@/lib/dojo/certificates/export";
import { makeId, type AnyElement, type EditorSchema, type TextElement } from "@/components/dojo/certificate-editor/types";
import {
  CANVAS_ID,
  measureBox,
  measureElementPx,
  snapAxis,
  snapTargets,
  type Box,
} from "@/lib/dojo/certificates/studio-geometry";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Lock,
  MousePointerSquareDashed,
  PencilLine,
  Trash2,
  Unlock,
} from "lucide-react";

/** Cor da seleção (marca) e das guias inteligentes (contraste, como no Canva). */
const SELECT_COLOR = "#b91c1c";
const GUIDE_COLOR = "#d946ef";
/** Distância de encaixe das guias, em px de tela. */
const SNAP_SCREEN_PX = 6;

/** Valores de exemplo do canvas (com nome e logo reais da academia). */
export function useStudioPreviewValues() {
  const academy = useQuery({
    queryKey: ["dojo-academy-profile-logo"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("dojo_academy_profile")
        .select("logo_url,trade_name,legal_name")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });
  return useMemo(() => {
    // Exemplos só do editor (não entram na emissão, onde dado ausente não pode virar nome inventado).
    const today = new Date().toLocaleDateString("pt-BR");
    const base: Record<string, string> = {
      professor_nome: "Prof. Responsável",
      instrutor_nome: "Instrutor Responsável",
      mestre_nome: "Mestre Responsável",
      aluno_modalidade: "Jiu-Jitsu",
      aluno_turma: "Turma Adulto",
      aluno_categoria: "Adulto",
      certificado_numero: "0001",
      certificado_codigo: "AMT-2026-0001",
      data_emissao: today,
      data_graduacao: today,
      data_evento: today,
      ...sampleValues(),
    };
    const ap: any = academy.data;
    if (ap?.logo_url) base.academia_logo = ap.logo_url;
    if (ap?.trade_name || ap?.legal_name) base.academia_nome = ap.trade_name || ap.legal_name;
    return base;
  }, [academy.data]);
}

type Marquee = { x0: number; y0: number; x1: number; y1: number };
type CtxMenu = { x: number; y: number; onElement: boolean };

/** Réguas só fazem sentido em tela larga; no celular viram espaço perdido. */
function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function StudioCanvas() {
  const {
    doc, zoom, showGrid, showRulers: rulersOn, selection, select, clearSelection, setZoom, guides, editingTextId, fitSignal,
  } = useStudioStore();
  const isWide = useIsWide();
  const showRulers = rulersOn && isWide;
  const wrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const values = useStudioPreviewValues();
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<{ additive: boolean; base: string[] } | null>(null);
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  // Posição da página dentro da área rolável, para as réguas começarem no canto da página.
  const [pageOff, setPageOff] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const w = wrapRef.current, p = pageRef.current;
      if (!w || !p) return;
      const wr = w.getBoundingClientRect(), pr = p.getBoundingClientRect();
      setPageOff({ x: pr.left - wr.left + w.scrollLeft, y: pr.top - wr.top + w.scrollTop });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [zoom, doc.page.width, doc.page.height, showRulers]);

  // Ajusta o zoom para caber na tela: ao montar, ao redimensionar, ao trocar o tamanho da página ou a pedido.
  useEffect(() => {
    const fit = () => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const rulerOffset = showRulers ? 24 : 0;
      const padding = 96;
      const targetW = rect.width - rulerOffset - padding;
      const targetH = rect.height - rulerOffset - padding;
      if (targetW <= 0 || targetH <= 0) return;
      setZoom(Math.max(0.1, Math.min(1, Math.min(targetW / doc.page.width, targetH / doc.page.height))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.page.width, doc.page.height, showRulers, fitSignal]);

  // Ctrl/⌘ + roda do mouse = zoom
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(useStudioStore.getState().zoom - Math.sign(e.deltaY) * 0.1);
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [setZoom]);

  // Atalhos de teclado do editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      const s = useStudioStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault(); e.shiftKey ? s.redo() : s.undo();
      } else if (mod && key === "y") {
        e.preventDefault(); s.redo();
      } else if (mod && key === "d") {
        e.preventDefault(); s.duplicateSelected();
      } else if (mod && key === "c") {
        s.copy();
      } else if (mod && key === "x") {
        if (s.selection.length) { e.preventDefault(); s.copy(); s.deleteSelected(); }
      } else if (mod && key === "v") {
        e.preventDefault(); s.paste();
      } else if (mod && key === "a") {
        e.preventDefault(); s.select(s.doc.elements.filter((el) => !el.locked && !el.hidden).map((el) => el.id));
      } else if (mod && key === "s") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("cert-studio:save"));
      } else if (mod && (key === "=" || key === "+")) {
        e.preventDefault(); s.setZoom(s.zoom + 0.1);
      } else if (mod && key === "-") {
        e.preventDefault(); s.setZoom(s.zoom - 0.1);
      } else if (mod && key === "0") {
        e.preventDefault(); s.requestFit();
      } else if (mod && e.key === "]") {
        e.preventDefault(); s.selection.forEach((id) => (e.shiftKey ? s.bringToFront(id) : s.bringForward(id)));
      } else if (mod && e.key === "[") {
        e.preventDefault(); s.selection.forEach((id) => (e.shiftKey ? s.sendToBack(id) : s.sendBackward(id)));
      } else if (e.key === "F11") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("cert-studio:toggle-presentation"));
      } else if (e.key === "?" ) {
        document.dispatchEvent(new CustomEvent("cert-studio:shortcuts"));
      } else if (e.key === "Escape") {
        document.dispatchEvent(new CustomEvent("cert-studio:exit-presentation"));
        setCtx(null);
        s.clearSelection();
      } else if (e.key === "Enter") {
        const el = s.selection.length === 1 ? s.doc.elements.find((x) => x.id === s.selection[0]) : null;
        if (el?.kind === "text" && !el.locked) { e.preventDefault(); s.setEditingText(el.id); }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selection.length) { e.preventDefault(); s.deleteSelected(); }
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        if (!s.selection.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.25;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        s.moveSelectedBy(dx, dy);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Ponto do ponteiro em % da página. */
  const toPagePct = (clientX: number, clientY: number) => {
    const rect = pageRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  // Seleção por área (arrastar no fundo da página)
  const onPageDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-overlay],[data-text-editor]")) return;
    setCtx(null);
    const p = toPagePct(e.clientX, e.clientY);
    const st = useStudioStore.getState();
    marqueeRef.current = { additive: e.shiftKey, base: e.shiftKey ? st.selection : [] };
    if (!e.shiftKey) clearSelection();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onPageMove = (e: React.PointerEvent) => {
    if (!marquee) return;
    const p = toPagePct(e.clientX, e.clientY);
    setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
  };
  const onPageUp = (e: React.PointerEvent) => {
    if (!marquee) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const l = Math.min(marquee.x0, marquee.x1), r = Math.max(marquee.x0, marquee.x1);
    const t = Math.min(marquee.y0, marquee.y1), b = Math.max(marquee.y0, marquee.y1);
    if (r - l > 0.4 || b - t > 0.4) {
      const st = useStudioStore.getState();
      const hit = st.doc.elements
        .filter((el) => !el.hidden && !el.locked)
        .filter((el) => {
          const bx = measureBox(el, st.doc);
          return bx.cx + bx.w / 2 >= l && bx.cx - bx.w / 2 <= r && bx.cy + bx.h / 2 >= t && bx.cy - bx.h / 2 <= b;
        })
        .map((el) => el.id);
      select(Array.from(new Set([...(marqueeRef.current?.base ?? []), ...hit])));
    }
    marqueeRef.current = null;
    setMarquee(null);
  };

  // Clique na área cinza fora da página limpa a seleção
  const onBackdropDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.canvasBackdrop != null) {
      setCtx(null);
      clearSelection();
    }
  };

  // Texto em edição fica invisível no render (o editor fica por cima, no mesmo lugar)
  const renderDoc: EditorSchema = useMemo(
    () =>
      editingTextId
        ? { ...doc, elements: doc.elements.map((e) => (e.id === editingTextId ? ({ ...e, opacity: 0 } as AnyElement) : e)) }
        : doc,
    [doc, editingTextId],
  );
  const editingEl = editingTextId ? (doc.elements.find((e) => e.id === editingTextId) as TextElement | undefined) : undefined;
  const single = selection.length === 1;

  return (
    <div
      ref={wrapRef}
      onPointerDown={onBackdropDown}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-overlay]")) return;
        e.preventDefault();
        clearSelection();
        setCtx({ x: e.clientX, y: e.clientY, onElement: false });
      }}
      className="relative flex-1 overflow-auto bg-[#e9ebef] pb-20 md:pb-0 touch-none [background-image:radial-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:18px_18px]"
    >
      {showRulers && <RulerH offset={pageOff.x} />}
      {showRulers && <RulerV offset={pageOff.y} />}
      <div
        data-canvas-backdrop
        className="flex items-center justify-center"
        style={{
          minWidth: `calc(100% - ${showRulers ? 24 : 0}px)`,
          minHeight: `calc(100% - ${showRulers ? 24 : 0}px)`,
          padding: 48,
          paddingLeft: (showRulers ? 24 : 0) + 48,
          paddingTop: (showRulers ? 24 : 0) + 48,
          width: doc.page.width * zoom + (showRulers ? 24 : 0) + 96,
          height: doc.page.height * zoom + (showRulers ? 24 : 0) + 96,
          boxSizing: "border-box",
        }}
      >
        <div
          ref={pageRef}
          className="relative rounded-[2px] shadow-[0_18px_50px_-18px_rgba(15,23,42,0.45),0_2px_6px_rgba(15,23,42,0.08)] ring-1 ring-black/5"
          style={{ width: doc.page.width * zoom, height: doc.page.height * zoom, background: doc.page.background || "#ffffff", flexShrink: 0 }}
          onPointerDown={onPageDown}
          onPointerMove={onPageMove}
          onPointerUp={onPageUp}
          onPointerCancel={onPageUp}
        >
          <div
            id={CANVAS_ID}
            style={{ width: doc.page.width, height: doc.page.height, transform: `scale(${zoom})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}
          >
            <CertificateRenderer doc={renderDoc} values={values} />
            {showGrid && <GridOverlay />}
            <MarginsOverlay zoom={zoom} />
            {doc.elements
              .filter((e) => !e.hidden && e.id !== editingTextId)
              .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
              .map((el) => (
                <EditableOverlay
                  key={el.id}
                  el={el}
                  selected={selection.includes(el.id)}
                  showHandles={single && selection[0] === el.id}
                  zoom={zoom}
                  onContextMenu={(x, y) => setCtx({ x, y, onElement: true })}
                />
              ))}
            {editingEl && <TextEditOverlay key={editingEl.id} el={editingEl} zoom={zoom} />}
            <GuidesOverlay v={guides.v} h={guides.h} zoom={zoom} />
            {marquee && (
              <div
                style={{
                  position: "absolute",
                  left: `${Math.min(marquee.x0, marquee.x1)}%`,
                  top: `${Math.min(marquee.y0, marquee.y1)}%`,
                  width: `${Math.abs(marquee.x1 - marquee.x0)}%`,
                  height: `${Math.abs(marquee.y1 - marquee.y0)}%`,
                  border: `${1 / zoom}px solid ${SELECT_COLOR}`,
                  background: "rgba(185,28,28,0.06)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        </div>
      </div>
      {ctx && <CanvasContextMenu menu={ctx} onClose={() => setCtx(null)} />}
    </div>
  );
}

function GridOverlay() {
  return (
    <div
      style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(to right, rgba(0,0,0,.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.05) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    />
  );
}
function MarginsOverlay({ zoom }: { zoom: number }) {
  const { doc } = useStudioStore();
  const m = doc.page.margin ?? 0;
  if (!m) return null;
  return <div style={{ position: "absolute", inset: m, pointerEvents: "none", border: `${1 / zoom}px dashed rgba(15,23,42,.18)` }} />;
}
function GuidesOverlay({ v, h, zoom }: { v: number[]; h: number[]; zoom: number }) {
  if (!v.length && !h.length) return null;
  const t = Math.max(1, 1 / zoom);
  return (
    <>
      {v.map((x, i) => (
        <div key={`v${i}`} style={{ position: "absolute", left: `${x}%`, top: 0, bottom: 0, width: t, marginLeft: -t / 2, background: GUIDE_COLOR, pointerEvents: "none" }} />
      ))}
      {h.map((y, i) => (
        <div key={`h${i}`} style={{ position: "absolute", top: `${y}%`, left: 0, right: 0, height: t, marginTop: -t / 2, background: GUIDE_COLOR, pointerEvents: "none" }} />
      ))}
    </>
  );
}

/** Escolhe o intervalo da régua para manter ~60px entre marcações, evitando números sobrepostos. */
function rulerUnit(zoom: number): number {
  const candidates = [25, 50, 100, 200, 250, 500];
  return candidates.find((u) => u * zoom >= 60) ?? 1000;
}
function RulerH({ offset }: { offset: number }) {
  const { doc, zoom } = useStudioStore();
  const total = doc.page.width * zoom;
  const unit = rulerUnit(zoom);
  const step = unit * zoom;
  const marks: number[] = [];
  for (let i = 0; i * step <= total; i++) marks.push(i);
  return (
    <div className="sticky top-0 z-10 h-6 select-none border-b border-border bg-card/95 text-[10px] text-muted-foreground backdrop-blur" style={{ paddingLeft: offset }}>
      <div className="relative h-full">
        {marks.map((i) => (
          <div key={i} style={{ position: "absolute", left: i * step, top: 0, bottom: 0, borderLeft: "1px solid rgba(0,0,0,.1)", paddingLeft: 2 }}>
            <span>{i * unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function RulerV({ offset }: { offset: number }) {
  const { doc, zoom } = useStudioStore();
  const total = doc.page.height * zoom;
  const unit = rulerUnit(zoom);
  const step = unit * zoom;
  const marks: number[] = [];
  for (let i = 0; i * step <= total; i++) marks.push(i);
  return (
    <div className="absolute bottom-0 left-0 top-6 z-10 w-6 select-none border-r border-border bg-card/95 text-[10px] text-muted-foreground backdrop-blur" style={{ paddingTop: Math.max(0, offset - 24) }}>
      <div className="relative h-full">
        {marks.map((i) => (
          <div key={i} style={{ position: "absolute", top: i * step, left: 0, right: 0, borderTop: "1px solid rgba(0,0,0,.1)", paddingLeft: 2 }}>
            <span>{i * unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DragState = {
  startX: number;
  startY: number;
  ids: string[];
  orig: Record<string, { x: number; y: number }>;
  box: Box;
  targets: { v: number[]; h: number[] };
  moved: boolean;
};
type ResizeState = {
  startX: number; startY: number;
  origW: number; origH: number;
  origX: number; origY: number;
  origFont: number;
  dir: string;
};

/** Camada interativa sobre um elemento: selecionar, arrastar (com guias), redimensionar e girar. */
function EditableOverlay({
  el, selected, showHandles, zoom, onContextMenu,
}: {
  el: AnyElement;
  selected: boolean;
  showHandles: boolean;
  zoom: number;
  onContextMenu: (x: number, y: number) => void;
}) {
  const { doc, updateElement, snapEnabled } = useStudioStore();
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const cx = (el.x / 100) * pageW;
  const cy = (el.y / 100) * pageH;
  const measured = useRenderedSize(el.id, el);
  const fallback = measureElementPx(el, doc);
  const w = measured?.w ?? fallback.w;
  const h = measured?.h ?? fallback.h;
  const [hover, setHover] = useState(false);
  const [rotating, setRotating] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const rotateRef = useRef<{ startAngle: number; center: { x: number; y: number }; startRot: number } | null>(null);
  const isText = el.kind === "text" || el.kind === "date";

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useStudioStore.getState();
    if (e.shiftKey) {
      st.select(st.selection.includes(el.id) ? st.selection.filter((id) => id !== el.id) : [...st.selection, el.id]);
      return;
    }
    let sel = st.selection;
    if (!sel.includes(el.id)) {
      st.select([el.id]);
      sel = [el.id];
    }
    if (el.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ids = st.doc.elements.filter((x) => sel.includes(x.id) && !x.locked).map((x) => x.id);
    const orig: DragState["orig"] = {};
    for (const x of st.doc.elements) if (ids.includes(x.id)) orig[x.id] = { x: x.x, y: x.y };
    const others = st.doc.elements.filter((x) => !sel.includes(x.id) && !x.hidden).map((x) => measureBox(x, st.doc));
    dragRef.current = {
      startX: e.clientX, startY: e.clientY, ids, orig,
      box: measureBox(el, st.doc),
      targets: snapTargets(st.doc, others),
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useStudioStore.getState();
    if (dragRef.current) {
      const d = dragRef.current;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return;
      d.moved = true;
      let nx = d.orig[el.id].x + ((e.clientX - d.startX) / zoom / pageW) * 100;
      let ny = d.orig[el.id].y + ((e.clientY - d.startY) / zoom / pageH) * 100;
      if (snapEnabled && !e.altKey) {
        const sx = snapAxis(nx, d.box.w, d.targets.v, (SNAP_SCREEN_PX / zoom / pageW) * 100);
        const sy = snapAxis(ny, d.box.h, d.targets.h, (SNAP_SCREEN_PX / zoom / pageH) * 100);
        nx = sx.value;
        ny = sy.value;
        st.setGuides({ v: sx.guide != null ? [sx.guide] : [], h: sy.guide != null ? [sy.guide] : [] });
      }
      const ddx = nx - d.orig[el.id].x;
      const ddy = ny - d.orig[el.id].y;
      const positions: Record<string, { x: number; y: number }> = {};
      for (const id of d.ids) positions[id] = { x: d.orig[id].x + ddx, y: d.orig[id].y + ddy };
      st.setPositions(positions, false);
    } else if (resizeRef.current) {
      const r = resizeRef.current;
      const dxPx = (e.clientX - r.startX) / zoom;
      const dyPx = (e.clientY - r.startY) / zoom;
      const signX = r.dir.includes("l") ? -1 : r.dir.includes("r") ? 1 : 0;
      const signY = r.dir.includes("t") ? -1 : r.dir.includes("b") ? 1 : 0;
      const corner = signX !== 0 && signY !== 0;
      let newW = signX ? Math.max(20, r.origW + signX * dxPx) : r.origW;
      let newH = signY ? Math.max(8, r.origH + signY * dyPx) : r.origH;
      const keepRatio = corner && !e.shiftKey && (isText || ["image", "logo", "signature", "qr", "circle"].includes(el.kind));
      if (keepRatio) {
        const k = Math.abs(dxPx) >= Math.abs(dyPx) ? newW / r.origW : newH / r.origH;
        newW = Math.max(20, r.origW * k);
        newH = Math.max(8, r.origH * k);
      }
      const patch: Record<string, number> = {};
      if (isText) {
        if (corner) {
          const k = newW / r.origW;
          patch.fontSize = Math.max(6, Math.round(r.origFont * k));
          if (el.w != null) patch.w = (newW / pageW) * 100;
        } else if (signX) {
          patch.w = (newW / pageW) * 100; // laterais do texto ajustam a largura (quebra de linha)
        }
      } else {
        if (signX || keepRatio) patch.w = (newW / pageW) * 100;
        if (signY || keepRatio) patch.h = (newH / pageH) * 100;
      }
      // A borda oposta fica parada: o centro anda metade do quanto o tamanho mudou.
      if (signX) patch.x = r.origX + ((signX * (newW - r.origW)) / 2 / pageW) * 100;
      if (signY && !(isText && !corner)) patch.y = r.origY + ((signY * (newH - r.origH)) / 2 / pageH) * 100;
      updateElement(el.id, patch as any);
    } else if (rotateRef.current) {
      const r = rotateRef.current;
      const angle = (Math.atan2(e.clientY - r.center.y, e.clientX - r.center.x) * 180) / Math.PI;
      let rot = r.startRot + (angle - r.startAngle);
      rot = ((((rot + 180) % 360) + 360) % 360) - 180;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      else {
        const nearest = Math.round(rot / 45) * 45;
        if (Math.abs(rot - nearest) < 3) rot = nearest;
      }
      setRotating(Math.round(rot));
      updateElement(el.id, { rotation: rot } as any);
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    const st = useStudioStore.getState();
    const changed = (dragRef.current && dragRef.current.moved) || resizeRef.current || rotateRef.current;
    if (changed) st.pushHistory();
    if (dragRef.current) st.setGuides({ v: [], h: [] });
    dragRef.current = null;
    resizeRef.current = null;
    rotateRef.current = null;
    setRotating(null);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const handles: string[] =
    el.kind === "line" ? ["l", "r"] : isText ? ["tl", "tr", "bl", "br", "l", "r"] : ["tl", "tr", "bl", "br", "t", "b", "l", "r"];
  const unit = 1 / zoom; // 1px de tela em px da página
  const outline = selected
    ? `${2 * unit}px ${el.locked ? "dashed" : "solid"} ${SELECT_COLOR}`
    : hover
      ? `${1.5 * unit}px solid rgba(185,28,28,.55)`
      : "none";

  return (
    <div
      data-overlay
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={(e) => {
        if (el.kind !== "text" || el.locked) return;
        e.stopPropagation();
        useStudioStore.getState().setEditingText(el.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const st = useStudioStore.getState();
        if (!st.selection.includes(el.id)) st.select([el.id]);
        onContextMenu(e.clientX, e.clientY);
      }}
      style={{
        position: "absolute", left: cx, top: cy, width: w, height: h,
        transform: `translate(-50%, -50%) rotate(${el.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        cursor: el.locked ? "default" : "move",
        outline,
        outlineOffset: unit,
      }}
    >
      {selected && el.locked && (
        <div
          style={{
            position: "absolute", top: -26 * unit, right: 0, height: 20 * unit, padding: `0 ${6 * unit}px`,
            display: "flex", alignItems: "center", gap: 3 * unit, borderRadius: 6 * unit,
            background: SELECT_COLOR, color: "#fff", fontSize: 11 * unit, fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
          }}
        >
          <Lock style={{ width: 11 * unit, height: 11 * unit }} /> Bloqueado
        </div>
      )}
      {showHandles && !el.locked && (
        <>
          {handles.map((dir) => {
            const isCorner = dir.length === 2;
            const isVertical = dir === "t" || dir === "b";
            const isHorizontal = dir === "l" || dir === "r";
            const cursor = isCorner
              ? (dir === "tl" || dir === "br" ? "nwse-resize" : "nesw-resize")
              : isVertical ? "ns-resize" : "ew-resize";
            const cw = (isCorner ? 12 : isVertical ? 22 : 7) * unit;
            const ch = (isCorner ? 12 : isHorizontal ? 22 : 7) * unit;
            return (
              <div
                key={dir}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  resizeRef.current = {
                    startX: e.clientX, startY: e.clientY,
                    origW: w, origH: h,
                    origX: el.x, origY: el.y,
                    origFont: Number((el as any).fontSize ?? 24),
                    dir,
                  };
                }}
                onPointerMove={onPointerMove}
                onPointerUp={endGesture}
                style={{
                  position: "absolute",
                  left: dir.includes("l") ? -cw / 2 : isVertical ? "50%" : undefined,
                  right: dir.includes("r") ? -cw / 2 : undefined,
                  top: dir.includes("t") ? -ch / 2 : isHorizontal ? "50%" : undefined,
                  bottom: dir.includes("b") ? -ch / 2 : undefined,
                  width: cw,
                  height: ch,
                  transform: isVertical ? "translateX(-50%)" : isHorizontal ? "translateY(-50%)" : undefined,
                  background: "#fff",
                  border: `${1.5 * unit}px solid ${SELECT_COLOR}`,
                  borderRadius: 999,
                  boxShadow: `0 ${1 * unit}px ${3 * unit}px rgba(0,0,0,.25)`,
                  cursor,
                }}
              />
            );
          })}
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              const cxp = rect.left + rect.width / 2;
              const cyp = rect.top + rect.height / 2;
              const startAngle = (Math.atan2(e.clientY - cyp, e.clientX - cxp) * 180) / Math.PI;
              rotateRef.current = { startAngle, center: { x: cxp, y: cyp }, startRot: el.rotation ?? 0 };
            }}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            title="Girar (Shift = de 15 em 15°)"
            style={{
              position: "absolute", top: -34 * unit, left: "50%", transform: "translateX(-50%)",
              width: 22 * unit, height: 22 * unit, borderRadius: 999, background: "#fff",
              border: `${1.5 * unit}px solid ${SELECT_COLOR}`, boxShadow: `0 ${1 * unit}px ${3 * unit}px rgba(0,0,0,.25)`,
              cursor: "grab", display: "grid", placeItems: "center",
            }}
          >
            <svg viewBox="0 0 24 24" style={{ width: 12 * unit, height: 12 * unit }} fill="none" stroke={SELECT_COLOR} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </div>
          {rotating != null && (
            <div
              style={{
                position: "absolute", top: -64 * unit, left: "50%", transform: `translateX(-50%) rotate(${-(el.rotation ?? 0)}deg)`,
                padding: `${2 * unit}px ${7 * unit}px`, borderRadius: 6 * unit, background: "#111827", color: "#fff",
                fontSize: 12 * unit, fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
              }}
            >
              {rotating}°
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Edição do texto direto no canvas (duplo clique ou Enter), com o mesmo estilo do elemento. */
function TextEditOverlay({ el, zoom }: { el: TextElement; zoom: number }) {
  const { doc, updateElement } = useStudioStore();
  const ref = useRef<HTMLTextAreaElement>(null);
  const start = useMemo(() => measureElementPx(el, doc), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const width = el.w != null ? (el.w / 100) * pageW : Math.max(start.w + el.fontSize, 180);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
  }, []);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [el.text, el.fontSize]);

  const finish = () => {
    const st = useStudioStore.getState();
    if (st.editingTextId !== el.id) return;
    st.pushHistory();
    st.setEditingText(null);
  };

  return (
    <textarea
      ref={ref}
      data-text-editor
      rows={1}
      value={el.text}
      spellCheck={false}
      onChange={(e) => updateElement(el.id, { text: e.target.value } as any)}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          finish();
        }
      }}
      style={{
        position: "absolute",
        left: (el.x / 100) * pageW,
        top: (el.y / 100) * pageH,
        width,
        transform: `translate(-50%, -50%) rotate(${el.rotation ?? 0}deg)`,
        transformOrigin: "center center",
        fontFamily: el.fontFamily || "Inter, sans-serif",
        fontSize: el.fontSize,
        fontWeight: el.bold ? 800 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textDecoration: el.underline ? "underline" : "none",
        textTransform: el.uppercase ? "uppercase" : "none",
        letterSpacing: el.letterSpacing ?? undefined,
        lineHeight: el.lineHeight ?? 1.25,
        textAlign: el.align,
        color: el.color,
        padding: el.padding ?? 0,
        background: el.background || "rgba(255,255,255,0.55)",
        border: "none",
        outline: `${2 / zoom}px solid ${SELECT_COLOR}`,
        outlineOffset: 1 / zoom,
        resize: "none",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        zIndex: 5,
        caretColor: SELECT_COLOR,
      }}
    />
  );
}

/** Menu do botão direito (elemento ou página). */
function CanvasContextMenu({ menu, onClose }: { menu: CtxMenu; onClose: () => void }) {
  const s = useStudioStore();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
  }, [menu.x, menu.y]);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const sel = s.doc.elements.filter((e) => s.selection.includes(e.id));
  const first = sel[0];
  const run = (fn: () => void) => () => { fn(); onClose(); };
  type Item = { label: string; icon: any; hint?: string; action: () => void; danger?: boolean; disabled?: boolean } | "sep";
  const items: Item[] = menu.onElement && first
    ? [
        ...(sel.length === 1 && first.kind === "text" && !first.locked
          ? [{ label: "Editar texto", icon: PencilLine, hint: "Enter", action: () => s.setEditingText(first.id) } as Item, "sep" as const]
          : []),
        { label: "Copiar", icon: Copy, hint: "Ctrl+C", action: s.copy },
        { label: "Colar", icon: ClipboardPaste, hint: "Ctrl+V", action: s.paste, disabled: !s.clipboard.length },
        { label: "Duplicar", icon: CopyPlus, hint: "Ctrl+D", action: s.duplicateSelected },
        "sep",
        { label: "Trazer para frente", icon: ArrowUp, hint: "Ctrl+]", action: () => sel.forEach((e) => s.bringForward(e.id)) },
        { label: "Enviar para trás", icon: ArrowDown, hint: "Ctrl+[", action: () => sel.forEach((e) => s.sendBackward(e.id)) },
        { label: "Trazer ao topo", icon: ChevronsUp, action: () => sel.forEach((e) => s.bringToFront(e.id)) },
        { label: "Enviar ao fundo", icon: ChevronsDown, action: () => sel.forEach((e) => s.sendToBack(e.id)) },
        "sep",
        { label: first.locked ? "Desbloquear" : "Bloquear", icon: first.locked ? Unlock : Lock, action: () => sel.forEach((e) => s.toggleLock(e.id)) },
        { label: "Ocultar", icon: EyeOff, action: () => { sel.forEach((e) => s.toggleHidden(e.id)); s.clearSelection(); } },
        "sep",
        { label: "Excluir", icon: Trash2, hint: "Del", action: s.deleteSelected, danger: true },
      ]
    : [
        { label: "Colar", icon: ClipboardPaste, hint: "Ctrl+V", action: s.paste, disabled: !s.clipboard.length },
        { label: "Selecionar tudo", icon: MousePointerSquareDashed, hint: "Ctrl+A", action: () => s.select(s.doc.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id)) },
        { label: "Mostrar ocultos", icon: Eye, action: () => s.doc.elements.filter((e) => e.hidden).forEach((e) => s.toggleHidden(e.id)), disabled: !s.doc.elements.some((e) => e.hidden) },
      ];

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] min-w-[220px] rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl shadow-black/15"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={`s${i}`} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={run(it.action)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-40 ${it.danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent"}`}
          >
            <it.icon className="h-4 w-4 shrink-0 opacity-70" />
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[11px] text-muted-foreground">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

type Size = { w: number; h: number };

/** Mede (em px da página, sem zoom) a caixa real que o renderer desenhou para o elemento. */
function useRenderedSize(id: string, el: AnyElement): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const wrapper = document.getElementById(CANVAS_ID)?.querySelector(`[data-el-id="${CSS.escape(id)}"]`);
    const node = wrapper?.firstElementChild;
    if (!(node instanceof HTMLElement)) return;
    const read = () => {
      const next = visibleBox(node);
      setSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    node.addEventListener("load", read);
    return () => { ro.disconnect(); node.removeEventListener("load", read); };
  }, [id, el]);
  return size;
}

/** Caixa visível: para <img> com object-fit contain/scale-down, desconta as faixas vazias do letterbox. */
function visibleBox(node: HTMLElement): Size {
  const box = { w: node.offsetWidth, h: node.offsetHeight };
  if (!(node instanceof HTMLImageElement)) return box;
  const fit = getComputedStyle(node).objectFit;
  if (fit !== "contain" && fit !== "scale-down") return box;
  const nw = node.naturalWidth;
  const nh = node.naturalHeight;
  if (!nw || !nh || !box.w || !box.h) return box;
  const k = fit === "scale-down" ? Math.min(1, box.w / nw, box.h / nh) : Math.min(box.w / nw, box.h / nh);
  return { w: Math.round(nw * k), h: Math.round(nh * k) };
}

/** Add-element helpers used by the left sidebar. */
export function makeTextElement(text = "Texto", opts?: Partial<AnyElement>): AnyElement {
  return { id: makeId(), kind: "text", text, x: 50, y: 50, fontSize: 32, color: "#000000", align: "center", fontFamily: "Inter", ...(opts as any) } as any;
}
export function makeVariableElement(key: string): AnyElement {
  return { id: makeId(), kind: "text", text: `{{${key}}}`, x: 50, y: 50, fontSize: 32, color: "#000000", align: "center", fontFamily: "Inter", name: `Variável: ${key}` } as any;
}
export function makeShapeElement(kind: "rect" | "circle" | "line"): AnyElement {
  if (kind === "line") return { id: makeId(), kind: "line", x: 50, y: 50, w: 30, h: 0.3, fill: "#000000" } as any;
  if (kind === "circle") return { id: makeId(), kind: "circle", x: 50, y: 50, w: 15, h: 15, fill: "#b91c1c", stroke: "", strokeWidth: 0 } as any;
  return { id: makeId(), kind: "rect", x: 50, y: 50, w: 20, h: 12, fill: "#b91c1c", radius: 8 } as any;
}
export function makeImageElement(url: string, kind: "image" | "logo" | "signature" = "image"): AnyElement {
  return { id: makeId(), kind, imageUrl: url, x: 50, y: 50, w: 25, h: 15, fit: "contain", name: kind === "logo" ? "Logo" : kind === "signature" ? "Assinatura" : "Imagem" } as any;
}
export function makeQrElement(): AnyElement {
  return { id: makeId(), kind: "qr", qrValue: "{{certificado_codigo}}", x: 85, y: 85, w: 12, h: 12, color: "#000", bg: "#fff", name: "QR Code" } as any;
}

import type { ReactNode } from "react";
import { useStudioStore, PAGE_PRESETS, type PagePreset } from "@/lib/dojo/certificates/studio-store";
import type { AnyElement, ImageElement, QrElement, ShapeElement, TextElement } from "@/components/dojo/certificate-editor/types";
import { alignPositions, distributePositions, type AlignMode } from "@/lib/dojo/certificates/studio-geometry";
import { ColorButton, FontPicker } from "./StudioControls";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlignCenter, AlignLeft, AlignRight, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
  ArrowDown, ArrowUp, Bold, ChevronsDown, ChevronsUp, Copy, Italic, Layers, Lock, Minus, Plus, PencilLine, Trash2, Underline, Unlock,
  CaseUpper, Rows3, Droplets, Maximize, LayoutTemplate, Scan,
} from "lucide-react";
import { cn } from "@/lib/utils";

function Btn({ on, onClick, title, children, disabled, className }: { on?: boolean; onClick: () => void; title: string; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
        on && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}
const Sep = () => <div className="mx-1 h-5 w-px shrink-0 bg-border" />;

/**
 * Barra contextual (estilo Canva): mostra os controles do que está
 * selecionado — texto, imagem, forma, QR, vários elementos ou a página.
 */
export function StudioContextBar() {
  const { doc, selection } = useStudioStore();
  const sel = doc.elements.filter((e) => selection.includes(e.id));
  const el = sel.length === 1 ? sel[0] : null;

  return (
    <div className="flex h-12 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-card px-2 [scrollbar-width:none] sm:px-3">
      {sel.length === 0 && <PageControls />}
      {el && (el.kind === "text" || el.kind === "date") && <TextControls el={el as TextElement} />}
      {el && (el.kind === "image" || el.kind === "logo" || el.kind === "signature") && <ImageControls el={el as ImageElement} />}
      {el && (el.kind === "rect" || el.kind === "circle" || el.kind === "line") && <ShapeControls el={el as ShapeElement} />}
      {el && el.kind === "qr" && <QrControls el={el as QrElement} />}
      {sel.length > 1 && (
        <span className="mr-1 shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {sel.length} elementos selecionados
        </span>
      )}
      {sel.length > 0 && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
          <PositionMenu sel={sel} />
          <OpacityMenu sel={sel} />
          <LayerMenu sel={sel} />
          <Sep />
          <LockButton sel={sel} />
          <DuplicateDelete />
        </div>
      )}
    </div>
  );
}

function PageControls() {
  const { doc, setPage, requestFit } = useStudioStore();
  const preset = (Object.keys(PAGE_PRESETS) as PagePreset[]).find(
    (k) => PAGE_PRESETS[k].width === doc.page.width && PAGE_PRESETS[k].height === doc.page.height,
  ) ?? "custom";
  return (
    <>
      <span className="mr-1 flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <LayoutTemplate className="h-4 w-4" /> Página
      </span>
      <ColorButton label="Cor de fundo da página" value={doc.page.background || "#ffffff"} onChange={(c) => setPage({ background: c || "#ffffff" })} />
      <Sep />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted">
            <Maximize className="h-4 w-4" /> Redimensionar
            <span className="text-xs text-muted-foreground">({PAGE_PRESETS[preset].name})</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <DropdownMenuLabel className="text-xs">Tamanho da página</DropdownMenuLabel>
          {(Object.keys(PAGE_PRESETS) as PagePreset[]).filter((k) => k !== "custom").map((k) => (
            <DropdownMenuItem key={k} onSelect={() => { setPage({ width: PAGE_PRESETS[k].width, height: PAGE_PRESETS[k].height }); requestFit(); }}>
              <span className="flex-1">{PAGE_PRESETS[k].name}</span>
              <span className="text-[11px] text-muted-foreground">{PAGE_PRESETS[k].width}×{PAGE_PRESETS[k].height}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-2 hidden shrink-0 text-xs text-muted-foreground lg:inline">
        Clique num elemento para editar · arraste no fundo para selecionar vários
      </span>
    </>
  );
}

function TextControls({ el }: { el: TextElement }) {
  const { updateElement, pushHistory, setEditingText } = useStudioStore();
  const set = (patch: Partial<TextElement>, commit = true) => {
    updateElement(el.id, patch as any);
    if (commit) pushHistory();
  };
  const isText = el.kind === "text";
  const nextAlign = el.align === "left" ? "center" : el.align === "center" ? "right" : "left";
  const AlignIcon = el.align === "left" ? AlignLeft : el.align === "right" ? AlignRight : AlignCenter;
  return (
    <>
      <FontPicker value={el.fontFamily} onChange={(f) => set({ fontFamily: f })} />
      <div className="ml-1 flex h-8 shrink-0 items-center rounded-md border border-input">
        <Btn title="Diminuir fonte" onClick={() => set({ fontSize: Math.max(6, el.fontSize - 2) })} className="h-7 min-w-7"><Minus className="h-3.5 w-3.5" /></Btn>
        <input
          aria-label="Tamanho da fonte"
          type="number"
          value={el.fontSize}
          onChange={(e) => set({ fontSize: Math.max(6, Number(e.target.value) || 6) }, false)}
          onBlur={() => pushHistory()}
          className="h-7 w-11 bg-transparent text-center text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <Btn title="Aumentar fonte" onClick={() => set({ fontSize: el.fontSize + 2 })} className="h-7 min-w-7"><Plus className="h-3.5 w-3.5" /></Btn>
      </div>
      <Sep />
      <ColorButton variant="text" label="Cor do texto" value={el.color} onChange={(c) => set({ color: c || "#000000" }, false)} onCommit={() => pushHistory()} />
      <Btn title="Negrito" on={!!el.bold} onClick={() => set({ bold: !el.bold })}><Bold className="h-4 w-4" /></Btn>
      {isText && (
        <>
          <Btn title="Itálico" on={!!el.italic} onClick={() => set({ italic: !el.italic })}><Italic className="h-4 w-4" /></Btn>
          <Btn title="Sublinhado" on={!!el.underline} onClick={() => set({ underline: !el.underline })}><Underline className="h-4 w-4" /></Btn>
          <Btn title="Maiúsculas" on={!!el.uppercase} onClick={() => set({ uppercase: !el.uppercase })}><CaseUpper className="h-4 w-4" /></Btn>
        </>
      )}
      <Btn title={`Alinhamento (${el.align === "left" ? "esquerda" : el.align === "right" ? "direita" : "centro"})`} onClick={() => set({ align: nextAlign })}>
        <AlignIcon className="h-4 w-4" />
      </Btn>
      {isText && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title="Espaçamento" className="grid h-8 min-w-8 place-items-center rounded-md hover:bg-muted"><Rows3 className="h-4 w-4" /></button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-4 rounded-xl p-4">
            <SliderRow label="Espaçamento entre letras" value={el.letterSpacing ?? 0} min={-5} max={30} step={0.5}
              onChange={(v) => set({ letterSpacing: v }, false)} onCommit={() => pushHistory()} />
            <SliderRow label="Altura da linha" value={el.lineHeight ?? 1.25} min={0.8} max={3} step={0.05}
              onChange={(v) => set({ lineHeight: v }, false)} onCommit={() => pushHistory()} />
          </PopoverContent>
        </Popover>
      )}
      {isText && !el.locked && (
        <>
          <Sep />
          <button type="button" onClick={() => setEditingText(el.id)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted">
            <PencilLine className="h-4 w-4" /> Editar texto
          </button>
        </>
      )}
    </>
  );
}

function ImageControls({ el }: { el: ImageElement }) {
  const { updateElement, pushHistory } = useStudioStore();
  const set = (patch: Partial<ImageElement>) => { updateElement(el.id, patch as any); pushHistory(); };
  const masks: { id: NonNullable<ImageElement["mask"]>; label: string }[] = [
    { id: "none", label: "Sem recorte" },
    { id: "rounded", label: "Cantos arredondados" },
    { id: "squircle", label: "Squircle" },
    { id: "circle", label: "Círculo" },
  ];
  return (
    <>
      <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">
        {el.kind === "logo" ? "Logo" : el.kind === "signature" ? "Assinatura" : "Imagem"}
      </span>
      <div className="flex h-8 shrink-0 items-center rounded-md border border-input p-0.5">
        {(["contain", "cover"] as const).map((f) => (
          <button key={f} type="button" onClick={() => set({ fit: f })}
            className={cn("h-full rounded px-2 text-xs", (el.fit || "contain") === f ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {f === "contain" ? "Conter" : "Preencher"}
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted">
            <Scan className="h-4 w-4" /> Recorte
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {masks.map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => set({ mask: m.id })}>
              <span className="flex-1">{m.label}</span>
              {(el.mask || "none") === m.id && <span className="text-primary">•</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="ml-2 hidden shrink-0 text-xs text-muted-foreground xl:inline">Filtros e sombra no painel Propriedades →</span>
    </>
  );
}

function ShapeControls({ el }: { el: ShapeElement }) {
  const { updateElement, pushHistory } = useStudioStore();
  const live = (patch: Partial<ShapeElement>) => updateElement(el.id, patch as any);
  return (
    <>
      <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">
        {el.kind === "line" ? "Linha" : el.kind === "circle" ? "Círculo" : "Retângulo"}
      </span>
      <ColorButton label={el.kind === "line" ? "Cor da linha" : "Preenchimento"} allowNone={el.kind !== "line"} value={el.fill}
        onChange={(c) => live({ fill: c || "transparent" })} onCommit={() => pushHistory()} />
      {el.kind !== "line" && (
        <>
          <Sep />
          <span className="shrink-0 text-xs text-muted-foreground">Borda</span>
          <ColorButton label="Cor da borda" allowNone value={el.stroke} onChange={(c) => live({ stroke: c, strokeWidth: c && !el.strokeWidth ? 2 : el.strokeWidth })} onCommit={() => pushHistory()} />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex h-8 shrink-0 items-center rounded-md px-2 text-xs hover:bg-muted">{el.strokeWidth ?? 0}px</button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 space-y-4 rounded-xl p-4">
              <SliderRow label="Espessura da borda" value={el.strokeWidth ?? 0} min={0} max={30} step={1} onChange={(v) => live({ strokeWidth: v })} onCommit={() => pushHistory()} />
              {el.kind === "rect" && (
                <SliderRow label="Cantos arredondados" value={el.radius ?? 0} min={0} max={200} step={1} onChange={(v) => live({ radius: v })} onCommit={() => pushHistory()} />
              )}
            </PopoverContent>
          </Popover>
        </>
      )}
    </>
  );
}

function QrControls({ el }: { el: QrElement }) {
  const { updateElement, pushHistory } = useStudioStore();
  return (
    <>
      <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">QR Code</span>
      <ColorButton label="Cor do QR" value={el.color} onChange={(c) => updateElement(el.id, { color: c || "#000000" } as any)} onCommit={() => pushHistory()} />
      <ColorButton label="Fundo do QR" value={el.bg} onChange={(c) => updateElement(el.id, { bg: c || "#ffffff" } as any)} onCommit={() => pushHistory()} />
      <span className="ml-2 hidden shrink-0 truncate text-xs text-muted-foreground lg:inline">Conteúdo: <code className="font-mono">{el.qrValue}</code></span>
    </>
  );
}

function PositionMenu({ sel }: { sel: AnyElement[] }) {
  const { doc, setPositions } = useStudioStore();
  const align = (m: AlignMode) => setPositions(alignPositions(sel, doc, m));
  const many = sel.length > 1;
  const items: { mode: AlignMode; label: string; icon: any }[] = [
    { mode: "left", label: "Esquerda", icon: AlignHorizontalJustifyStart },
    { mode: "hcenter", label: "Centro", icon: AlignHorizontalJustifyCenter },
    { mode: "right", label: "Direita", icon: AlignHorizontalJustifyEnd },
    { mode: "top", label: "Topo", icon: AlignVerticalJustifyStart },
    { mode: "vcenter", label: "Meio", icon: AlignVerticalJustifyCenter },
    { mode: "bottom", label: "Base", icon: AlignVerticalJustifyEnd },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-muted">
          <AlignHorizontalJustifyCenter className="h-4 w-4" /> <span className="hidden md:inline">Posição</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-xl p-3">
        <div className="mb-2 text-xs font-semibold">{many ? "Alinhar elementos" : "Alinhar à página"}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((it) => (
            <button key={it.mode} type="button" onClick={() => align(it.mode)}
              className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-[11px] hover:border-primary/40 hover:bg-primary/[0.04]">
              <it.icon className="h-4 w-4" /> {it.label}
            </button>
          ))}
        </div>
        {sel.length >= 3 && (
          <>
            <div className="mb-2 mt-3 text-xs font-semibold">Distribuir</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setPositions(distributePositions(sel, "h"))}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[11px] hover:border-primary/40 hover:bg-primary/[0.04]">
                <AlignHorizontalSpaceAround className="h-4 w-4" /> Horizontal
              </button>
              <button type="button" onClick={() => setPositions(distributePositions(sel, "v"))}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[11px] hover:border-primary/40 hover:bg-primary/[0.04]">
                <AlignVerticalSpaceAround className="h-4 w-4" /> Vertical
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function OpacityMenu({ sel }: { sel: AnyElement[] }) {
  const { updateSelected, pushHistory } = useStudioStore();
  const value = Math.round((sel[0]?.opacity ?? 1) * 100);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Transparência" className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md hover:bg-muted">
          <Droplets className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 rounded-xl p-4">
        <SliderRow label="Transparência" suffix="%" value={value} min={0} max={100} step={1}
          onChange={(v) => updateSelected({ opacity: v / 100 } as any)} onCommit={() => pushHistory()} />
      </PopoverContent>
    </Popover>
  );
}

function LayerMenu({ sel }: { sel: AnyElement[] }) {
  const s = useStudioStore();
  const each = (fn: (id: string) => void) => () => sel.forEach((e) => fn(e.id));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" title="Organizar camadas" className="grid h-8 min-w-8 shrink-0 place-items-center rounded-md hover:bg-muted">
          <Layers className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onSelect={each(s.bringForward)}><ArrowUp className="h-4 w-4" /> Trazer para frente</DropdownMenuItem>
        <DropdownMenuItem onSelect={each(s.sendBackward)}><ArrowDown className="h-4 w-4" /> Enviar para trás</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={each(s.bringToFront)}><ChevronsUp className="h-4 w-4" /> Trazer ao topo</DropdownMenuItem>
        <DropdownMenuItem onSelect={each(s.sendToBack)}><ChevronsDown className="h-4 w-4" /> Enviar ao fundo</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LockButton({ sel }: { sel: AnyElement[] }) {
  const { toggleLock } = useStudioStore();
  const locked = sel.every((e) => e.locked);
  return (
    <Btn title={locked ? "Desbloquear" : "Bloquear"} on={locked} onClick={() => sel.forEach((e) => { if (!!e.locked === locked) toggleLock(e.id); })}>
      {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
    </Btn>
  );
}

function DuplicateDelete() {
  const { duplicateSelected, deleteSelected } = useStudioStore();
  return (
    <>
      <Btn title="Duplicar (Ctrl+D)" onClick={duplicateSelected}><Copy className="h-4 w-4" /></Btn>
      <Btn title="Excluir (Del)" onClick={deleteSelected} className="text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></Btn>
    </>
  );
}

function SliderRow({
  label, value, min, max, step, onChange, onCommit, suffix = "",
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; onCommit: () => void; suffix?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{Number.isInteger(step) ? value : value.toFixed(2)}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} onValueCommit={onCommit} />
    </div>
  );
}

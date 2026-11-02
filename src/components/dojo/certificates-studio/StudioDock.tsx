import { useStudioStore, PAGE_PRESETS, type PagePreset } from "@/lib/dojo/certificates/studio-store";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Grid3x3, Ruler, Magnet, Maximize2, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Controles flutuantes do canvas (canto inferior direito): visualização e zoom. */
export function StudioDock() {
  const { doc, zoom, setZoom, requestFit, showGrid, toggleGrid, showRulers, toggleRulers, snapEnabled, toggleSnap } = useStudioStore();
  const preset = (Object.keys(PAGE_PRESETS) as PagePreset[]).find(
    (k) => PAGE_PRESETS[k].width === doc.page.width && PAGE_PRESETS[k].height === doc.page.height,
  );
  const toggle = (on: boolean) =>
    cn("grid h-8 w-8 place-items-center rounded-lg transition-colors", on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground");
  return (
    <div className="pointer-events-none absolute bottom-20 left-3 z-20 flex md:bottom-3 md:left-auto md:right-3">
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-lg shadow-black/10 backdrop-blur">
        <span className="hidden px-2 text-[11px] text-muted-foreground lg:inline">
          {preset ? PAGE_PRESETS[preset].name : `${doc.page.width}×${doc.page.height}`}
        </span>
        <div className="hidden h-5 w-px bg-border lg:block" />
        <button type="button" className={cn(toggle(snapEnabled), "hidden sm:grid")} onClick={toggleSnap} title="Guias inteligentes e encaixe (Alt desliga ao arrastar)" aria-pressed={snapEnabled}><Magnet className="h-4 w-4" /></button>
        <button type="button" className={cn(toggle(showGrid), "hidden sm:grid")} onClick={toggleGrid} title="Grade" aria-pressed={showGrid}><Grid3x3 className="h-4 w-4" /></button>
        <button type="button" className={cn(toggle(showRulers), "hidden sm:grid")} onClick={toggleRulers} title="Réguas" aria-pressed={showRulers}><Ruler className="h-4 w-4" /></button>
        <div className="hidden h-5 w-px bg-border sm:block" />
        <button type="button" className={toggle(false)} onClick={() => setZoom(zoom - 0.1)} title="Diminuir zoom (Ctrl −)"><Minus className="h-4 w-4" /></button>
        <div className="hidden w-24 px-1 sm:block">
          <Slider value={[Math.round(zoom * 100)]} min={10} max={300} step={5} onValueChange={(v) => setZoom(v[0] / 100)} aria-label="Zoom" />
        </div>
        <button type="button" className={toggle(false)} onClick={() => setZoom(zoom + 0.1)} title="Aumentar zoom (Ctrl +)"><Plus className="h-4 w-4" /></button>
        <span className="w-11 text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" className={toggle(false)} onClick={requestFit} title="Ajustar à tela (Ctrl 0)"><Maximize2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "Edição",
    items: [
      ["Desfazer / Refazer", "Ctrl+Z / Ctrl+Shift+Z"],
      ["Copiar / Recortar / Colar", "Ctrl+C / Ctrl+X / Ctrl+V"],
      ["Duplicar", "Ctrl+D"],
      ["Excluir", "Del"],
      ["Selecionar tudo", "Ctrl+A"],
      ["Editar texto selecionado", "Enter ou duplo clique"],
      ["Salvar", "Ctrl+S"],
    ],
  },
  {
    group: "Posição",
    items: [
      ["Mover", "Setas (Shift = passo maior)"],
      ["Adicionar à seleção", "Shift+clique ou arrastar no fundo"],
      ["Arrastar sem encaixar", "Alt + arrastar"],
      ["Girar de 15 em 15°", "Shift + girar"],
      ["Redimensionar sem proporção", "Shift + canto"],
      ["Trazer para frente / Enviar para trás", "Ctrl+] / Ctrl+["],
    ],
  },
  {
    group: "Visualização",
    items: [
      ["Zoom", "Ctrl + roda do mouse, Ctrl+ / Ctrl−"],
      ["Ajustar à tela", "Ctrl+0"],
      ["Modo apresentação", "F11"],
      ["Esta lista", "?"],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Atalhos do editor</DialogTitle></DialogHeader>
        <div className="grid gap-5 sm:grid-cols-2">
          {SHORTCUTS.map((g) => (
            <div key={g.group} className={g.group === "Visualização" ? "sm:col-span-2" : undefined}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</div>
              <div className="space-y-1.5">
                {g.items.map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <kbd className="shrink-0 rounded-md border bg-muted/60 px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">{keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

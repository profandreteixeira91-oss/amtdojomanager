import { useStudioStore } from "@/lib/dojo/certificates/studio-store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Undo2, Redo2, Save, FileDown, Image as ImageIcon, Printer, Eye, ChevronLeft, Play, Cloud, CloudUpload, Loader2, Keyboard, Download,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportCanvasAsPdf, exportCanvasAsPng, exportCanvasAsJpeg, printCanvas } from "@/lib/dojo/certificates/export";

/** Seletor do certificado limpo (sem marcações do editor) usado na exportação. */
export const EXPORT_NODE_SELECTOR = "[data-cert-export]";

export function StudioTopbar({
  onSave, saving, onPreview, onPresentation, onShortcuts,
}: {
  onSave: () => Promise<void>;
  saving: boolean;
  onPreview: () => void;
  onPresentation?: () => void;
  onShortcuts?: () => void;
}) {
  const { doc, undo, redo, history, historyIndex, name, setName, dirty, lastSavedAt, clearSelection } = useStudioStore();

  const doExport = async (fmt: "pdf" | "png" | "jpeg" | "print") => {
    clearSelection();
    const node = document.querySelector<HTMLElement>(EXPORT_NODE_SELECTOR);
    if (!node) return;
    const t = toast.loading(fmt === "print" ? "Preparando impressão…" : "Gerando arquivo…");
    try {
      const filename = (name || "certificado").replace(/[^a-zA-Z0-9._-]/g, "_");
      if (fmt === "pdf") await exportCanvasAsPdf(node, filename, doc);
      else if (fmt === "png") await exportCanvasAsPng(node, filename, doc);
      else if (fmt === "jpeg") await exportCanvasAsJpeg(node, filename, doc);
      else await printCanvas(node, doc, filename);
      toast.success(fmt === "print" ? "Pronto para imprimir" : "Download iniciado", { id: t });
    } catch (e: any) {
      toast.error("Falha ao exportar: " + (e.message || e), { id: t });
    }
  };

  const status = saving
    ? { icon: Loader2, text: "Salvando…", spin: true }
    : dirty
      ? { icon: CloudUpload, text: "Alterações não salvas", spin: false }
      : lastSavedAt
        ? { icon: Cloud, text: `Salvo às ${new Date(lastSavedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, spin: false }
        : { icon: Cloud, text: "Tudo salvo", spin: false };
  const ghost = "h-9 w-9 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-35";

  return (
    <header className="relative shrink-0 overflow-hidden bg-[linear-gradient(100deg,#160506_0%,#3d0b0e_45%,#7f1417_100%)] text-white">
      <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" />
      <div className="relative flex h-14 min-w-0 items-center gap-1.5 px-2 sm:px-3">
        <Link
          to="/dojo/app/certificates"
          aria-label="Voltar para certificados"
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ChevronLeft className="h-4 w-4" /> <span className="hidden lg:inline">Certificados</span>
        </Link>
        <div className="mx-1 hidden h-6 w-px bg-white/15 sm:block" />
        <Button size="icon" variant="ghost" className={ghost} onClick={undo} disabled={historyIndex <= 0} title="Desfazer (Ctrl+Z)" aria-label="Desfazer"><Undo2 className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className={ghost} onClick={redo} disabled={historyIndex >= history.length - 1} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer"><Redo2 className="h-4 w-4" /></Button>
        <span className="ml-1 hidden shrink-0 items-center gap-1.5 text-xs text-white/70 md:flex" aria-live="polite" title={status.text}>
          <status.icon className={`h-4 w-4 ${status.spin ? "animate-spin" : ""}`} />
          <span className="hidden xl:inline">{status.text}</span>
        </span>

        <div className="mx-auto flex min-w-0 max-w-[420px] flex-1 justify-center px-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nome do modelo"
            placeholder="Nome do modelo"
            className="h-9 w-full min-w-0 truncate rounded-lg border border-transparent bg-transparent px-3 text-center text-sm font-semibold text-white placeholder:text-white/40 transition-colors hover:border-white/20 focus:border-white/40 focus:bg-white/10 focus:outline-none"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onShortcuts && (
            <Button size="icon" variant="ghost" className={`${ghost} hidden lg:inline-flex`} onClick={onShortcuts} title="Atalhos do teclado (?)" aria-label="Atalhos do teclado"><Keyboard className="h-4 w-4" /></Button>
          )}
          <Button size="sm" variant="ghost" onClick={onPreview} aria-label="Visualizar" className="h-9 px-2 text-white/90 hover:bg-white/10 hover:text-white lg:px-3">
            <Eye className="h-4 w-4" /><span className="hidden lg:inline">Visualizar</span>
          </Button>
          {onPresentation && (
            <Button size="sm" variant="ghost" onClick={onPresentation} title="Modo apresentação (F11)" aria-label="Apresentar" className="hidden h-9 px-2 text-white/90 hover:bg-white/10 hover:text-white sm:inline-flex lg:px-3">
              <Play className="h-4 w-4" /><span className="hidden lg:inline">Apresentar</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="Baixar" className="h-9 border border-white/20 px-2 text-white hover:bg-white/10 hover:text-white lg:px-3">
                <Download className="h-4 w-4" /><span className="hidden lg:inline">Baixar</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuLabel className="text-xs">Baixar certificado</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => doExport("pdf")}>
                <FileDown className="h-4 w-4" /> <span className="flex-1">PDF</span><span className="text-[11px] text-muted-foreground">A4, para imprimir</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => doExport("png")}>
                <ImageIcon className="h-4 w-4" /> <span className="flex-1">PNG</span><span className="text-[11px] text-muted-foreground">Alta qualidade</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => doExport("jpeg")}>
                <ImageIcon className="h-4 w-4" /> <span className="flex-1">JPG</span><span className="text-[11px] text-muted-foreground">Arquivo leve</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => doExport("print")}><Printer className="h-4 w-4" /> Imprimir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={onSave} disabled={saving} aria-label="Salvar"
            className="h-9 bg-white px-3 font-semibold text-red-800 shadow-lg shadow-black/20 hover:bg-white/90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">Salvar</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

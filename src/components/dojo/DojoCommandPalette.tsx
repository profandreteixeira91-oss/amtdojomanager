import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type PaletteGroup = {
  label: string;
  items: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
};

/**
 * Busca rápida do painel (Ctrl/⌘ + K): navega entre os módulos que o usuário
 * pode acessar. Recebe os grupos já filtrados por permissão pelo layout.
 */
export function DojoCommandPalette({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: PaletteGroup[];
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar no sistema</DialogTitle>
        <DialogDescription className="sr-only">
          Digite o nome de um módulo para ir direto até ele.
        </DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground/80 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12">
          <CommandInput placeholder="Buscar módulo… (ex.: alunos, financeiro, check-in)" />
          <CommandList className="max-h-[min(420px,55vh)] p-1.5">
            <CommandEmpty>Nenhum módulo encontrado.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.to}
                      value={`${item.label} ${group.label}`}
                      onSelect={() => go(item.to)}
                      className="group gap-3 rounded-lg px-2.5 py-2"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-background text-muted-foreground group-data-[selected=true]:border-primary/30 group-data-[selected=true]:text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-background px-1 font-sans">↑</kbd>{" "}
              <kbd className="rounded border border-border bg-background px-1 font-sans">↓</kbd> navegar
            </span>
            <span>
              <kbd className="rounded border border-border bg-background px-1 font-sans">Enter</kbd> abrir ·{" "}
              <kbd className="rounded border border-border bg-background px-1 font-sans">Esc</kbd> fechar
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

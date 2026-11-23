import { Check, Monitor, Moon, Sun, SunMoon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDojoThemePref } from "@/hooks/useDojoPanelTheme";
import { DARK_FROM_HOUR, DARK_UNTIL_HOUR, type DojoThemePref } from "@/lib/dojo/panel-theme";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: DojoThemePref; label: string; hint: string; icon: typeof Sun }> = [
  {
    value: "auto",
    label: "Automático",
    hint: `Escuro das ${DARK_FROM_HOUR}h às ${DARK_UNTIL_HOUR}h`,
    icon: SunMoon,
  },
  { value: "light", label: "Claro", hint: "Sempre claro", icon: Sun },
  { value: "dark", label: "Escuro", hint: "Sempre escuro", icon: Moon },
];

/** Botão da barra superior do painel: escolhe entre automático (18h–6h), claro e escuro. */
export function DojoThemeSwitcher({ className }: { className?: string }) {
  const { pref, resolved, setPref } = useDojoThemePref();
  const Current = pref === "auto" ? SunMoon : resolved === "dark" ? Moon : Sun;
  const title = `Tema: ${OPTIONS.find((o) => o.value === pref)?.label ?? "Automático"}${
    pref === "auto" ? ` (agora ${resolved === "dark" ? "escuro" : "claro"})` : ""
  }`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900",
            className,
          )}
        >
          <Current className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-semibold">
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" /> Aparência do sistema
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = pref === o.value;
          return (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => setPref(o.value)}
              className="flex items-center gap-3 py-2"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
              </span>
              {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <p className="px-2 pb-1.5 pt-1 text-[11px] leading-snug text-muted-foreground">
          A escolha vale para este aparelho.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

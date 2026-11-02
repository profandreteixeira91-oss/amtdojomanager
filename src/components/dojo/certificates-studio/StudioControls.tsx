import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CERT_FONTS, useStudioStore } from "@/lib/dojo/certificates/studio-store";
import { documentColors } from "@/lib/dojo/certificates/studio-geometry";
import { Check, ChevronDown, Pipette, Search, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

/** Paleta base do seletor de cores (tons clássicos de certificado). */
const DEFAULT_PALETTE = [
  "#000000", "#1f2937", "#475569", "#94a3b8", "#e2e8f0", "#ffffff",
  "#7f1d1d", "#b91c1c", "#dc2626", "#f97316", "#d4af37", "#c9a24a",
  "#8a6a2a", "#3b2a12", "#14532d", "#059669", "#1e3a8a", "#2563eb",
  "#0e7490", "#6d28d9", "#be185d", "#fdfaf3", "#f5f0e1", "#111827",
];

function useAcademyBrandColors(): string[] {
  const q = useQuery({
    queryKey: ["dojo-academy-brand-colors"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("dojo_academy_profile")
        .select("brand_primary,brand_secondary")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60_000,
  });
  const d: any = q.data;
  return [d?.brand_primary, d?.brand_secondary].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c));
}

function isLight(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
}

function Swatch({ color, active, onPick, title }: { color: string; active: boolean; onPick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title ?? color}
      onClick={onPick}
      className={cn(
        "relative h-7 w-7 rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active && "ring-2 ring-primary ring-offset-2",
      )}
      style={{ background: color }}
    >
      {active && <Check className={cn("absolute inset-0 m-auto h-3.5 w-3.5", isLight(color) ? "text-black" : "text-white")} />}
    </button>
  );
}

/**
 * Botão de cor com paleta estilo Canva: cores do documento, da academia,
 * paleta padrão, seletor nativo e campo HEX. `onChange` é ao vivo e
 * `onCommit` grava no histórico (desfazer).
 */
export function ColorButton({
  value,
  onChange,
  onCommit,
  label,
  allowNone,
  variant = "chip",
}: {
  value: string | undefined;
  onChange: (c: string) => void;
  onCommit?: () => void;
  label: string;
  allowNone?: boolean;
  variant?: "chip" | "text";
}) {
  const doc = useStudioStore((s) => s.doc);
  const brand = useAcademyBrandColors();
  const docColors = useMemo(() => documentColors(doc), [doc]);
  const [hex, setHex] = useState(value ?? "");
  const current = (value ?? "").toLowerCase();
  const pick = (c: string) => {
    onChange(c);
    setHex(c);
    onCommit?.();
  };
  const isNone = !value || value === "transparent";

  return (
    <Popover onOpenChange={(o) => o && setHex(value ?? "")}>
      <PopoverTrigger asChild>
        {variant === "text" ? (
          <button
            type="button"
            title={label}
            aria-label={label}
            className="flex h-8 w-8 flex-col items-center justify-center rounded-md hover:bg-muted"
          >
            <span className="text-[15px] font-bold leading-none">A</span>
            <span className="mt-0.5 h-1 w-5 rounded-full ring-1 ring-inset ring-black/10" style={{ background: isNone ? "transparent" : value }} />
          </button>
        ) : (
          <button
            type="button"
            title={label}
            aria-label={label}
            className="flex h-8 items-center gap-1.5 rounded-md px-1.5 hover:bg-muted"
          >
            <span
              className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/15"
              style={{
                background: isNone
                  ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 8px 8px"
                  : value,
              }}
            />
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[272px] space-y-3 rounded-xl p-3">
        <div className="text-xs font-semibold">{label}</div>
        {docColors.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Cores do documento</div>
            <div className="flex flex-wrap gap-1.5">
              {docColors.map((c) => <Swatch key={c} color={c} active={current === c} onPick={() => pick(c)} />)}
            </div>
          </div>
        )}
        {brand.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Cores da academia</div>
            <div className="flex flex-wrap gap-1.5">
              {brand.map((c) => <Swatch key={c} color={c} active={current === c.toLowerCase()} onPick={() => pick(c)} />)}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Paleta</div>
          <div className="grid grid-cols-8 gap-1.5">
            {allowNone && (
              <button
                type="button"
                title="Sem cor"
                onClick={() => pick("")}
                className={cn("grid h-7 w-7 place-items-center rounded-full ring-1 ring-inset ring-black/10 hover:scale-110", isNone && "ring-2 ring-primary ring-offset-2")}
              >
                <Ban className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {DEFAULT_PALETTE.map((c) => <Swatch key={c} color={c} active={current === c} onPick={() => pick(c)} />)}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t pt-3">
          <label className="relative grid h-8 w-8 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border bg-muted/40" title="Cor personalizada">
            <Pipette className="h-4 w-4 text-muted-foreground" />
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "#000000"}
              onChange={(e) => { onChange(e.target.value); setHex(e.target.value); }}
              onBlur={() => onCommit?.()}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <Input
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && /^#[0-9a-f]{3,8}$/i.test(hex.trim())) pick(hex.trim());
            }}
            onBlur={() => { if (/^#[0-9a-f]{3,8}$/i.test(hex.trim()) && hex.trim() !== value) pick(hex.trim()); }}
            placeholder="#000000"
            className="h-8 font-mono text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

const FONT_GROUPS: { id: string; label: string }[] = [
  { id: "serif", label: "Serifadas" },
  { id: "script", label: "Manuscritas" },
  { id: "sans", label: "Sem serifa" },
  { id: "display", label: "Destaque" },
];

/** Seletor de fonte com cada nome desenhado na própria fonte. */
export function FontPicker({ value, onChange }: { value: string | undefined; onChange: (family: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = value || "Inter";
  const filtered = CERT_FONTS.filter((f) => !q || f.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Fonte"
          className="flex h-8 w-[150px] items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-sm hover:border-foreground/25"
        >
          <span className="truncate" style={{ fontFamily: current }}>{current}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] rounded-xl p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar fonte…" className="h-8 pl-7 text-sm" />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {FONT_GROUPS.map((g) => {
            const items = filtered.filter((f) => f.category === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="mb-1">
                <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                {items.map((f) => (
                  <button
                    key={f.family}
                    type="button"
                    onClick={() => { onChange(f.family); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[17px] hover:bg-accent",
                      current === f.family && "bg-primary/[0.07] text-primary",
                    )}
                    style={{ fontFamily: f.family }}
                  >
                    <span className="truncate">{f.label}</span>
                    {current === f.family && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
              </div>
            );
          })}
          {!filtered.length && <div className="p-3 text-center text-xs text-muted-foreground">Nenhuma fonte encontrada.</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

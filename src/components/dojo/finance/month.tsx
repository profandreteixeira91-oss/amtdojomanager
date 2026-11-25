import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/dates";
import { monthLongLabel, shiftMonth } from "@/lib/dojo/finance-dates";

/** "YYYY-MM" ou "all" (todos os meses). */
export type FinanceMonth = string;

const KEY = "amt-financeiro-mes";
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

type Ctx = { month: FinanceMonth; setMonth: (m: FinanceMonth) => void; current: string };
const MonthCtx = createContext<Ctx | null>(null);

export function FinanceMonthProvider({ children }: { children: ReactNode }) {
  const current = todayISO().slice(0, 7);
  const [month, setMonthState] = useState<FinanceMonth>(current);
  // A escolha vale enquanto a aba estiver aberta (volta ao mês atual no dia seguinte).
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(KEY);
      if (v && (v === "all" || /^\d{4}-\d{2}$/.test(v))) setMonthState(v);
    } catch {
      /* sem armazenamento: mês atual */
    }
  }, []);
  const setMonth = (m: FinanceMonth) => {
    setMonthState(m);
    try {
      sessionStorage.setItem(KEY, m);
    } catch {
      /* só nesta tela */
    }
  };
  const value = useMemo(() => ({ month, setMonth, current }), [month, current]);
  return <MonthCtx.Provider value={value}>{children}</MonthCtx.Provider>;
}

/** Mês escolhido no topo do financeiro. Fora do provider: mês atual. */
export function useFinanceMonth(): Ctx {
  const ctx = useContext(MonthCtx);
  if (ctx) return ctx;
  const current = todayISO().slice(0, 7);
  return { month: current, setMonth: () => {}, current };
}

/** Lançamento pertence ao mês escolhido? ("all" aceita tudo.) */
export function inFinanceMonth(entryMonthKey: string, month: FinanceMonth): boolean {
  return month === "all" || entryMonthKey === month;
}

export function FinanceMonthPicker() {
  const { month, setMonth, current } = useFinanceMonth();
  const all = month === "all";
  const base = all ? current : month;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar por mês">
      <div className="inline-flex items-center rounded-full border border-[color:var(--dojo-border)] bg-[color:var(--dojo-surface,white)] p-0.5 shadow-xs">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          onClick={() => setMonth(shiftMonth(base, -1))}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <label className="relative inline-flex items-center gap-1.5 px-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-red-600" />
          <span className="min-w-[8.5rem] text-center">
            {all ? "Todos os meses" : capitalize(monthLongLabel(month))}
          </span>
          <input
            type="month"
            value={base}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Escolher mês"
          />
        </label>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full"
          onClick={() => setMonth(shiftMonth(base, 1))}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {month !== current && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-full text-xs"
          onClick={() => setMonth(current)}
        >
          Mês atual
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant={all ? "default" : "outline"}
        className="h-8 rounded-full text-xs"
        onClick={() => setMonth(all ? current : "all")}
      >
        Todos os meses
      </Button>
    </div>
  );
}

/** Tudo que mostra números do financeiro e precisa ser relido quando algo muda. */
const FINANCE_KEYS = [
  ["dojo-invoices"],
  ["dojo-expenses"],
  ["dojo-finance"],
  ["dojo-finance-dashboard"],
  ["dojo-finance-dash"],
  ["dojo-wallet"],
  ["dojo-student"],
];

/**
 * Tempo real: qualquer cobrança, despesa ou movimento de carteira criado ou
 * alterado (por outra pessoa, por um pagamento confirmado no Asaas/Mercado
 * Pago, pelo cron de mensalidades…) atualiza a tela na hora. As consultas
 * também se releem a cada 30 s, caso o canal caia.
 */
export function useFinanceRealtime(enabled = true) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // Vários eventos juntos (ex.: cron gerando mensalidades) viram uma releitura só.
      timer.current = setTimeout(() => {
        for (const key of FINANCE_KEYS) qc.invalidateQueries({ queryKey: key });
      }, 600);
    };
    const channel = supabase
      .channel(`dojo-finance-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dojo_invoices" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "dojo_expenses" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dojo_wallet_transactions" },
        refresh,
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

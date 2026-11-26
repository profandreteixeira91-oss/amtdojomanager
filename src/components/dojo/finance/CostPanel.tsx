import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Building2 } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { entryMonth, monthLongLabel, shiftMonth } from "@/lib/dojo/finance-dates";
import { brl, type ExpenseRow } from "./shared";
import { useFinanceMonth } from "./month";

/**
 * Custo da academia no mês, no mesmo espírito do card de MRR do painel: um
 * número grande para ler de relance, e o detalhe logo abaixo.
 *
 * Mesma regra de mês das listas do financeiro: despesa paga conta no mês do
 * pagamento; em aberto, no mês do vencimento.
 */
export function FinanceCostPanel({ expenses }: { expenses: ExpenseRow[] }) {
  const { month: selMonth, current } = useFinanceMonth();
  const month = selMonth === "all" ? current : selMonth;

  const data = useMemo(() => {
    const today = todayISO();
    const inMonth = (key: string) => expenses.filter((e) => entryMonth(e) === key);
    const total = (rows: ExpenseRow[]) => rows.reduce((s, e) => s + Number(e.amount || 0), 0);

    const rows = inMonth(month);
    const cost = total(rows);
    const paid = total(rows.filter((e) => e.status === "paid"));
    const overdue = total(rows.filter((e) => e.status !== "paid" && e.due_date < today));
    const open = cost - paid - overdue;

    const prevCost = total(inMonth(shiftMonth(month, -1)));
    const delta = prevCost > 0 ? ((cost - prevCost) / prevCost) * 100 : null;

    // Média dos 3 meses anteriores: o "custo fixo" típico da academia.
    const last3 = [1, 2, 3].map((i) => total(inMonth(shiftMonth(month, -i))));
    const withData = last3.filter((v) => v > 0);
    const average = withData.length ? withData.reduce((s, v) => s + v, 0) / withData.length : 0;

    const byCategory = new Map<string, number>();
    for (const e of rows) {
      const k = e.category?.trim() || "Sem categoria";
      byCategory.set(k, (byCategory.get(k) ?? 0) + Number(e.amount || 0));
    }
    const categories = Array.from(byCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { cost, paid, open, overdue, delta, average, categories, count: rows.length };
  }, [expenses, month]);

  const top = data.categories.slice(0, 5);
  const rest = data.categories.slice(5).reduce((s, c) => s + c.value, 0);
  if (rest > 0) top.push({ name: "Outras categorias", value: rest });

  return (
    <div className="grid gap-3 md:grid-cols-5">
      <div
        className="flex min-w-0 flex-col gap-3 rounded-2xl p-5 text-white md:col-span-2"
        style={{ background: "linear-gradient(135deg, #171717 0%, #3f3f46 100%)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/75">
            <Building2 className="h-3 w-3" /> Custo da academia
          </div>
          {data.delta != null && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                data.delta > 0 ? "bg-red-500/20 text-red-200" : "bg-emerald-500/20 text-emerald-200"
              }`}
              title="Comparado ao mês anterior"
            >
              {data.delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(data.delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
        <div>
          <div className="truncate font-display text-4xl font-black leading-none tracking-tight">{brl(data.cost)}</div>
          <div className="mt-1 text-xs capitalize text-white/70">
            {monthLongLabel(month)} · {data.count} despesa(s)
          </div>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-white/15 pt-3">
          <Mini label="Pago" value={brl(data.paid)} />
          <Mini label="A pagar" value={brl(data.open)} />
          <Mini label="Atrasado" value={brl(data.overdue)} tone={data.overdue > 0 ? "alert" : undefined} />
        </div>
        <div className="text-[11px] text-white/60">
          Média dos 3 meses anteriores: <b className="text-white/85">{brl(data.average)}</b>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-[color:var(--dojo-border)] bg-card p-5 md:col-span-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Para onde vai o dinheiro
        </div>
        {top.length === 0 ? (
          <div className="mt-6 text-sm text-muted-foreground">Nenhuma despesa neste mês.</div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {top.map((c) => {
              const share = data.cost > 0 ? (c.value / data.cost) * 100 : 0;
              return (
                <li key={c.name} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {brl(c.value)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {share.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-red-600" style={{ width: `${Math.max(share, 2)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-white/60">{label}</div>
      <div className={`truncate font-display text-sm font-bold ${tone === "alert" ? "text-red-300" : ""}`}>{value}</div>
    </div>
  );
}

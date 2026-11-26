import { addDaysISO, addMonthsISO, calendarISO, monthStartISO, todayISO } from "@/lib/dates";
import { cashDayISO, entryMonth } from "@/lib/dojo/finance-dates";
import { isBillableStudentStatus } from "@/lib/dojo/student-status";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listDojoInvoices,
  listDojoExpenses,
  dojoFinanceOverview,
} from "@/lib/dojo/dojo.functions";

// ============ Money helpers ============
export const brl = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const pct = (n: number) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const isoDate = (d?: Date) => (d ? calendarISO(d) : todayISO());

/** Formata datas (ISO "YYYY-MM-DD" ou timestamp) no padrão brasileiro DD/MM/AAAA */
export { brDate } from "@/lib/dates";

export const monthLabel = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
};

export const daysBetween = (a: string, b: string) => {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86_400_000);
};

// ============ Local settings (prepared architecture) ============
export type FinanceSettings = {
  currency: string;
  decimals: number;
  defaultDueDay: number;
  latePenaltyPct: number;
  monthlyInterestPct: number;
  earlyDiscountPct: number;
  reminderBeforeDays: number;
  reminderAfterDays: number;
  blockCertsWhenOverdue: boolean;
  chargeMessage: string;
  categories: string[];
  costCenters: string[];
  bankAccounts: { id: string; name: string; type: string; pix?: string }[];
};

const SETTINGS_KEY = "amt.finance.settings.v1";
const DEFAULT_SETTINGS: FinanceSettings = {
  currency: "BRL",
  decimals: 2,
  defaultDueDay: 5,
  latePenaltyPct: 2,
  monthlyInterestPct: 1,
  earlyDiscountPct: 0,
  reminderBeforeDays: 3,
  reminderAfterDays: 3,
  blockCertsWhenOverdue: true,
  chargeMessage:
    "Olá {{aluno}}! Sua mensalidade de {{valor}} vence em {{vencimento}}. Boa treino!",
  categories: [
    "Mensalidades",
    "Matrículas",
    "Graduações",
    "Eventos",
    "Competições",
    "Uniformes",
    "Equipamentos",
    "Marketing",
    "Salários",
    "Aluguel",
    "Energia",
    "Internet",
    "Limpeza",
    "Outros",
  ],
  costCenters: [
    "Academia Matriz",
    "Filial Centro",
    "Loja",
    "Eventos",
    "Competições",
    "Administrativo",
    "Marketing",
  ],
  bankAccounts: [
    { id: "caixa", name: "Caixa geral", type: "cash" },
  ],
};

export function useFinanceSettings() {
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      // ignore
    }
  }, []);
  const save = (next: FinanceSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };
  return { settings, save };
}

// ============ Shared data hooks ============
export function useInvoices(status = "all") {
  const fn = useServerFn(listDojoInvoices);
  return useQuery({
    queryKey: ["dojo-invoices", status],
    queryFn: () => fn({ data: { status } }),
    // Rede de segurança do tempo real (useFinanceRealtime): relê a cada 30 s
    // com a aba aberta e ao voltar para ela.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useExpenses() {
  const fn = useServerFn(listDojoExpenses);
  return useQuery({
    queryKey: ["dojo-expenses"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useOverview() {
  const fn = useServerFn(dojoFinanceOverview);
  return useQuery({
    queryKey: ["dojo-finance"],
    queryFn: () => fn({ data: {} }),
  });
}

// ============ Derived KPIs ============
export type InvoiceRow = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  due_date: string;
  paid_at?: string | null;
  method?: string | null;
  description?: string | null;
  student_id?: string | null;
  source?: string | null;
  enrollment_id?: string | null;
  asaas_subscription_id?: string | null;
  payment_link?: string | null;
  asaas_invoice_url?: string | null;
  student?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    guardian_phone?: string | null;
  } | null;
};
export type ExpenseRow = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  due_date: string;
  paid_at?: string | null;
  description: string;
  category?: string | null;
};

export function useFinanceKpis() {
  const inv = useInvoices("all");
  const exp = useExpenses();
  const invoices = (inv.data ?? []) as InvoiceRow[];
  const expenses = (exp.data ?? []) as ExpenseRow[];

  return useMemo(() => {
    // Tudo em dias de calendário do Brasil ("YYYY-MM-DD"): `new Date("2026-11-01")`
    // é meia-noite UTC = 31/10 às 21h aqui, o que jogava o dia 1º no mês anterior.
    const today = todayISO();
    const curMonth = today.slice(0, 7);
    // Regime de caixa: o que foi pago conta no mês do pagamento (paid_at no fuso
    // do Brasil). Antes, um pagamento contava no mês do pagamento E no do
    // vencimento, aparecendo duas vezes no gráfico de 12 meses.
    const cashDay = cashDayISO;
    const isOpen = (s: string) => s !== "paid" && s !== "cancelled";

    const paidInvoices = invoices.filter((i) => i.status === "paid");

    const paidThisMonth = paidInvoices
      .filter((i) => cashDay(i).startsWith(curMonth))
      .reduce((s, i) => s + Number(i.amount || 0), 0);

    // Despesas: mesma regra da aba Despesas e do Dashboard (paga no mês do
    // pagamento; em aberto no mês do vencimento).
    const expensesThisMonth = expenses
      .filter((e) => entryMonth(e) === curMonth)
      .reduce((s, e) => s + Number(e.amount || 0), 0);

    const netProfit = paidThisMonth - expensesThisMonth;

    const pendingReceivables = invoices
      .filter((i) => isOpen(i.status))
      .reduce((s, i) => s + Number(i.amount || 0), 0);

    const overdue = invoices.filter((i) => isOpen(i.status) && i.due_date < today);
    const overdueAmount = overdue.reduce((s, i) => s + Number(i.amount || 0), 0);

    const totalMonthDue = invoices
      .filter((i) => i.due_date.startsWith(curMonth) && i.status !== "cancelled")
      .reduce((s, i) => s + Number(i.amount || 0), 0);
    const overdueMonth = invoices
      .filter((i) => isOpen(i.status) && i.due_date.startsWith(curMonth) && i.due_date < today)
      .reduce((s, i) => s + Number(i.amount || 0), 0);
    // Inadimplência do mês: vencido e não pago ÷ tudo que vence no mês.
    const overdueRate = totalMonthDue > 0 ? (overdueMonth / totalMonthDue) * 100 : 0;

    const uniqueStudentsPaid = new Set(
      paidInvoices.filter((i) => cashDay(i).startsWith(curMonth)).map((i) => i.student_id),
    ).size;
    const avgTicket = uniqueStudentsPaid > 0 ? paidThisMonth / uniqueStudentsPaid : 0;

    // MRR (30d) = recebido nos últimos 30 dias, só de alunos que seguem
    // pagando: trancado/inativo não é receita recorrente.
    const since = addDaysISO(today, -30);
    const mrr = paidInvoices
      .filter((i) => cashDay(i) >= since)
      .filter((i) => isBillableStudentStatus((i as any).student?.status))
      .reduce((s, i) => s + Number(i.amount || 0), 0);

    const pendingPayables = expenses
      .filter((e) => e.status !== "paid")
      .reduce((s, e) => s + Number(e.amount || 0), 0);

    // 12 meses (regime de caixa)
    const months: { key: string; label: string; receitas: number; despesas: number; saldo: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const key = monthStartISO(addMonthsISO(today, -i)).slice(0, 7);
      const label = monthLabel(key);
      const receitas = paidInvoices
        .filter((iv) => cashDay(iv).startsWith(key))
        .reduce((s, iv) => s + Number(iv.amount || 0), 0);
      const despesas = expenses
        .filter((ex) => entryMonth(ex) === key)
        .reduce((s, ex) => s + Number(ex.amount || 0), 0);
      months.push({ key, label, receitas, despesas, saldo: receitas - despesas });
    }

    // Formas de pagamento (recebido)
    const methodMap = new Map<string, number>();
    paidInvoices.forEach((i) => {
      const k = i.method || "outros";
      methodMap.set(k, (methodMap.get(k) || 0) + Number(i.amount || 0));
    });
    const paymentMethods = Array.from(methodMap.entries()).map(([name, value]) => ({ name, value }));

    return {
      loading: inv.isLoading || exp.isLoading,
      invoices,
      expenses,
      paidThisMonth,
      expensesThisMonth,
      netProfit,
      pendingReceivables,
      overdueAmount,
      overdueCount: overdue.length,
      overdueRate,
      avgTicket,
      mrr,
      pendingPayables,
      months,
      paymentMethods,
      projectedCashflow: paidThisMonth + pendingReceivables - pendingPayables,
    };
  }, [inv.data, exp.data, inv.isLoading, exp.isLoading]);
}

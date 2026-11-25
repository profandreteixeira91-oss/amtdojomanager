import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Tags,
  FileBarChart,
  RefreshCw,
  Settings2,
  Landmark,
} from "lucide-react";
import { FinanceDashboard } from "@/components/dojo/finance/Dashboard";
import { FinanceReceivables } from "@/components/dojo/finance/Receivables";
import { FinancePayables } from "@/components/dojo/finance/Payables";
import { FinanceTuition } from "@/components/dojo/finance/Tuition";
import { FinanceCashflow } from "@/components/dojo/finance/Cashflow";
import {
  FinanceCategories,
  FinanceReconciliation,
  FinanceReports,
  FinanceSettings,
} from "@/components/dojo/finance/Config";
import { PinGate } from "@/components/dojo/PinGate";
import {
  FinanceMonthPicker,
  FinanceMonthProvider,
  useFinanceRealtime,
} from "@/components/dojo/finance/month";
import { DojoPageHero, SUBNAV_CLS, SUBNAV_ROW_CLS, subnavItemClass } from "@/components/dojo/DojoPageHero";

export const Route = createFileRoute("/dojo/app/finance")({
  head: () => ({ meta: [{ title: "Financeiro — AMT Dojo Manager" }] }),
  component: () => (
    <PinGate moduleName="Financeiro">
      <FinanceMonthProvider>
        <FinancePage />
      </FinanceMonthProvider>
    </PinGate>
  ),
});

type SectionId =
  | "dashboard"
  | "tuition"
  | "charges"
  | "cashflow"
  | "receivables"
  | "payables"
  | "categories"
  | "reports"
  | "reconciliation"
  | "settings";

type Section = {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
};

const sections: Section[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Visão geral" },

  { id: "receivables", label: "Contas a receber", icon: ArrowDownRight, group: "Movimentações" },
  { id: "payables", label: "Contas a pagar", icon: ArrowUpRight, group: "Movimentações" },
  { id: "tuition", label: "Mensalidades", icon: Users, group: "Movimentações" },
  { id: "charges", label: "Cobranças", icon: Receipt, group: "Movimentações" },

  { id: "cashflow", label: "Fluxo de caixa", icon: Wallet, group: "Consolidados" },

  { id: "categories", label: "Categorias e centros", icon: Tags, group: "Cadastros" },
  { id: "reports", label: "Relatórios", icon: FileBarChart, group: "Cadastros" },
  { id: "reconciliation", label: "Conciliação", icon: RefreshCw, group: "Cadastros" },
  { id: "settings", label: "Configurações", icon: Settings2, group: "Cadastros" },
];

const groupOrder = ["Visão geral", "Movimentações", "Consolidados", "Cadastros"];

function FinancePage() {
  const [active, setActive] = useState<SectionId>("dashboard");

  const renderSection = () => {
    switch (active) {
      case "dashboard":
        return <FinanceDashboard />;
      case "charges":
      case "receivables":
        return <FinanceReceivables />;
      case "payables":
        return <FinancePayables />;
      case "tuition":
        return <FinanceTuition />;
      case "cashflow":
        return <FinanceCashflow />;
      case "categories":
        return <FinanceCategories />;
      case "reports":
        return <FinanceReports />;
      case "reconciliation":
        return <FinanceReconciliation />;
      case "settings":
        return <FinanceSettings />;
    }
  };

  const current = sections.find((s) => s.id === active)!;
  // Números do financeiro se atualizam sozinhos quando algo muda.
  useFinanceRealtime();
  // Telas que respeitam o filtro de mês.
  const monthAware = ["dashboard", "receivables", "charges", "payables", "tuition", "cashflow"].includes(active);

  return (
    <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 overflow-x-hidden md:gap-7">
      <DojoPageHero
        icon={Landmark}
        eyebrow="Financeiro"
        title="Financeiro"
        description="Motor financeiro completo do dojo: fluxo de caixa, cobranças, mensalidades, relatórios e conciliação."
        footer={
          <div className={SUBNAV_CLS}>
            <div className={SUBNAV_ROW_CLS}>
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <button key={s.id} type="button" onClick={() => setActive(s.id)} className={subnavItemClass(s.id === active)}>
                    <Icon />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />

      {/* Conteúdo */}
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">{current.group}</div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-neutral-950 md:text-2xl">{current.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {current.group === "Visão geral"
                ? "Indicadores executivos em tempo real"
                : current.group === "Movimentações"
                ? "Lançamentos, cobranças e recebimentos"
                : current.group === "Consolidados"
                ? "Análises consolidadas e projeções"
                : "Cadastros, relatórios e configurações"}
            </p>
          </div>
          {monthAware && <FinanceMonthPicker />}
        </div>
        {renderSection()}
      </div>
    </div>
  );
}

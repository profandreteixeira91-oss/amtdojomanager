import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PLAN_FEATURE_LABELS,
  formatBRL,
  minPlanForFeature,
  type PlanFeature,
} from "@/lib/dojo/saas-plans";

/**
 * Tela no lugar do módulo quando o plano do dojo não o inclui.
 * Dono: leva à assinatura para trocar de plano. Equipe: pede ao responsável.
 */
export function PlanUpgradeGate({ feature, isOwner }: { feature: PlanFeature; isOwner: boolean }) {
  const plan = minPlanForFeature(feature);
  const label = PLAN_FEATURE_LABELS[feature];

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-2xl border border-[color:var(--dojo-border)] bg-white p-8 text-center shadow-sm">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
        <Lock className="h-6 w-6" />
      </div>
      <div className="mb-1.5 text-lg font-semibold tracking-tight">
        {label} faz parte do plano {plan.name}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {isOwner ? (
          <>
            Seu plano atual não inclui este módulo. Mude para o{" "}
            <b className="text-foreground">{plan.name}</b> (R$ {formatBRL(plan.price)}/mês) para
            liberar.
          </>
        ) : (
          <>
            O plano da academia não inclui este módulo. Fale com o responsável pelo dojo para mudar
            para o <b className="text-foreground">{plan.name}</b>.
          </>
        )}
      </p>
      {isOwner && (
        <Button asChild className="mt-6 rounded-full bg-[#C1121F] text-white hover:bg-[#a30f1a]">
          <Link to="/dojo/app/subscription">
            <Sparkles className="mr-2 h-4 w-4" /> Ver planos
          </Link>
        </Button>
      )}
    </div>
  );
}

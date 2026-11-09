import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, FadeIn } from "./Section";
import { SAAS_PLANS, SAAS_PLAN_ORDER, formatBRL, type SaasPlanCode } from "@/lib/dojo/saas-plans";

// Preços, limites e itens vêm de saas-plans.ts (mesma fonte da assinatura e
// do bloqueio de módulos no painel).
const FEATURED: SaasPlanCode = "profissional";

export function Plans() {
  return (
    <Section
      id="planos"
      eyebrow="Planos"
      title="Um plano para cada fase da sua academia."
      description="Comece com 14 dias grátis no Premium, sem cartão. Depois escolha o plano que cabe na sua academia — e mude quando quiser."
      className="bg-white"
    >
      <FadeIn>
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {SAAS_PLAN_ORDER.map((code) => {
            const p = SAAS_PLANS[code];
            const featured = code === FEATURED;
            const [reais, centavos] = formatBRL(p.price).split(",");
            return (
              <div
                key={code}
                className={
                  featured
                    ? "relative flex flex-col rounded-3xl border-2 border-[#C1121F] bg-[#111111] p-8 text-white shadow-[0_30px_60px_-25px_rgba(193,18,31,0.55)]"
                    : "relative flex flex-col rounded-3xl border border-[#111111]/10 bg-white p-8 text-[#111111] shadow-sm"
                }
              >
                {featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#C1121F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                    <Sparkles className="mr-1 inline h-3 w-3" /> Mais escolhido
                  </span>
                )}

                <h3 className="text-lg font-semibold">{p.name}</h3>
                <p
                  className={
                    featured ? "mt-1 text-sm text-white/60" : "mt-1 text-sm text-[#111111]/60"
                  }
                >
                  {p.tagline}
                </p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span
                    className={
                      featured
                        ? "text-sm font-medium text-white/60"
                        : "text-sm font-medium text-[#111111]/60"
                    }
                  >
                    R$
                  </span>
                  <span className="text-5xl font-bold tracking-tight">
                    {reais}
                    <span className="text-2xl">,{centavos}</span>
                  </span>
                  <span
                    className={
                      featured
                        ? "text-sm font-medium text-white/60"
                        : "text-sm font-medium text-[#111111]/60"
                    }
                  >
                    /mês
                  </span>
                </div>
                <p
                  className={
                    featured ? "mt-1 text-xs text-white/50" : "mt-1 text-xs text-[#111111]/50"
                  }
                >
                  Cobrança recorrente · cancele quando quiser
                </p>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#C1121F]" />
                      <span className={featured ? "text-white/85" : "text-[#111111]/80"}>{h}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={
                    featured
                      ? "mt-8 min-h-12 w-full rounded-full bg-[#C1121F] text-white hover:bg-[#a30f1a]"
                      : "mt-8 min-h-12 w-full rounded-full bg-[#111111] text-white hover:bg-black"
                  }
                >
                  <a href="#cta">Testar 14 dias grátis</a>
                </Button>
              </div>
            );
          })}
        </div>
      </FadeIn>

      <FadeIn>
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 rounded-3xl border border-[#111111]/10 bg-[#FAFAFA] p-6 sm:grid-cols-2 md:grid-cols-4 md:p-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#111111]/50">
              Teste grátis
            </p>
            <p className="mt-1 text-lg font-semibold">14 dias no Premium</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#111111]/50">
              Setup
            </p>
            <p className="mt-1 text-lg font-semibold">Sem taxa</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#111111]/50">
              App do Aluno
            </p>
            <p className="mt-1 text-lg font-semibold">Em todos os planos</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#C1121F]">AMT Pay</p>
            <p className="mt-1 text-lg font-semibold">2% por transação</p>
          </div>
        </div>
      </FadeIn>
    </Section>
  );
}

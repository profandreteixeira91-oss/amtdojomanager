import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DojoLogo } from "@/components/dojo/DojoLogo";
import { Footer } from "@/components/dojo/landing/Footer";
import {
  PLAN_COMPARISON,
  SAAS_PLANS,
  SAAS_PLAN_ORDER,
  formatBRL,
  planHasFeature,
  type ComparisonRow,
  type SaasPlanCode,
} from "@/lib/dojo/saas-plans";

// Teste grátis: a pessoa compara os planos, escolhe um e segue para o cadastro
// (/dojo/auth?mode=signup&plan=…). O teste de 14 dias já começa nesse plano.

const searchSchema = z.object({
  plan: z.enum(["essencial", "profissional", "premium"]).optional().catch(undefined),
});

export const Route = createFileRoute("/dojo/planos")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Planos e preços — AMT Dojo Manager" },
      {
        name: "description",
        content:
          "Compare os planos Essencial, Profissional e Premium do AMT Dojo Manager e comece 14 dias grátis no plano escolhido, sem cartão.",
      },
    ],
    links: [{ rel: "canonical", href: "https://amtdojomanager.com.br/dojo/planos" }],
  }),
  component: PlansPage,
});

const FEATURED: SaasPlanCode = "profissional";

function PlansPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const selected: SaasPlanCode = search.plan ?? FEATURED;

  const select = (plan: SaasPlanCode) =>
    navigate({ to: "/dojo/planos", search: { plan }, replace: true, resetScroll: false });
  const start = (plan: SaasPlanCode) =>
    navigate({ to: "/dojo/auth", search: { mode: "signup", plan } });

  return (
    <div className="dojo-theme min-h-screen bg-[#f6f6f7] text-[#111111]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link to="/dojo" aria-label="AMT Dojo Manager" className="flex items-center gap-2">
            <DojoLogo className="h-10 w-auto md:h-11" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden text-[#111111] hover:bg-black/5 sm:inline-flex">
              <Link to="/dojo">
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao site
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-[#111111] hover:bg-black/5">
              <Link to="/dojo/auth">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-10 md:px-6 md:pt-14">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-[#C1121F]/20 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#C1121F]">
            14 dias grátis · sem cartão
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">Escolha o plano da sua academia</h1>
          <p className="mt-3 text-base text-[#111111]/65">
            Compare o que cada plano inclui, escolha o seu e crie a conta. O teste grátis já começa no plano escolhido — e
            você pode trocar quando quiser.
          </p>
        </div>

        {/* Cartões */}
        <div role="radiogroup" aria-label="Planos" className="mx-auto mt-10 grid max-w-6xl gap-5 md:grid-cols-3">
          {SAAS_PLAN_ORDER.map((code) => {
            const p = SAAS_PLANS[code];
            const isSel = selected === code;
            const [reais, centavos] = formatBRL(p.price).split(",");
            return (
              <div
                key={code}
                role="radio"
                aria-checked={isSel}
                tabIndex={0}
                onClick={() => select(code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(code);
                  }
                }}
                className={
                  "relative flex cursor-pointer flex-col rounded-3xl border bg-white p-6 text-left shadow-sm outline-none transition md:p-7 " +
                  (isSel
                    ? "border-[#C1121F] ring-4 ring-[#C1121F]/10"
                    : "border-black/10 hover:border-black/25 focus-visible:border-black/40")
                }
              >
                {code === FEATURED && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[#C1121F] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                    <Sparkles className="mr-1 inline h-3 w-3" /> Mais escolhido
                  </span>
                )}
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <span
                    aria-hidden
                    className={
                      "grid h-5 w-5 place-items-center rounded-full border-2 " +
                      (isSel ? "border-[#C1121F] bg-[#C1121F] text-white" : "border-black/20")
                    }
                  >
                    {isSel && <Check className="h-3 w-3" />}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#111111]/60">{p.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-sm font-medium text-[#111111]/60">R$</span>
                  <span className="text-4xl font-bold tracking-tight">
                    {reais}
                    <span className="text-xl">,{centavos}</span>
                  </span>
                  <span className="text-sm font-medium text-[#111111]/60">/mês</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#C1121F]" />
                      <span className="text-[#111111]/80">{h}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    start(code);
                  }}
                  className={
                    "mt-6 min-h-12 w-full rounded-full font-bold " +
                    (isSel ? "bg-[#C1121F] text-white hover:bg-[#a30f1a]" : "bg-[#111111] text-white hover:bg-black")
                  }
                >
                  Testar o {p.name} grátis
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Comparação detalhada */}
        <section aria-labelledby="comparar" className="mx-auto mt-16 max-w-6xl">
          <h2 id="comparar" className="text-center text-2xl font-bold tracking-tight md:text-3xl">
            Compare tudo o que cada plano inclui
          </h2>
          <div className="mt-8 overflow-x-auto rounded-3xl border border-black/10 bg-white shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10">
                  <th scope="col" className="w-[40%] px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-[#111111]/50">
                    Recurso
                  </th>
                  {SAAS_PLAN_ORDER.map((code) => (
                    <th
                      key={code}
                      scope="col"
                      className={
                        "px-3 py-4 text-center " + (selected === code ? "bg-red-50/70 text-[#C1121F]" : "")
                      }
                    >
                      <span className="block text-sm font-bold">{SAAS_PLANS[code].name}</span>
                      <span className="block text-xs font-medium text-[#111111]/55">
                        R$ {formatBRL(SAAS_PLANS[code].price)}/mês
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              {PLAN_COMPARISON.map((g) => (
                <tbody key={g.group}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="bg-[#fafafa] px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#111111]/55"
                    >
                      {g.group}
                    </th>
                  </tr>
                  {g.rows.map((row) => (
                    <tr key={row.label} className="border-t border-black/5">
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        {row.label}
                        {row.hint && <span className="mt-0.5 block text-xs font-normal text-[#111111]/50">{row.hint}</span>}
                      </th>
                      {SAAS_PLAN_ORDER.map((code) => (
                        <td
                          key={code}
                          className={"px-3 py-3 text-center " + (selected === code ? "bg-red-50/70" : "")}
                        >
                          <Cell row={row} plan={code} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <Button
              onClick={() => start(selected)}
              className="min-h-12 rounded-full bg-[#C1121F] px-8 text-base font-bold text-white hover:bg-[#a30f1a]"
            >
              Começar 14 dias grátis no {SAAS_PLANS[selected].name}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <p className="text-xs text-[#111111]/55">
              Sem cartão e sem taxa de setup. AMT Pay com 2% por transação em todos os planos.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Cell({ row, plan }: { row: ComparisonRow; plan: SaasPlanCode }) {
  if (row.values) return <span className="font-semibold">{row.values[plan]}</span>;
  const included = row.feature ? planHasFeature(plan, row.feature) : true;
  return included ? (
    <Check className="mx-auto h-5 w-5 text-[#C1121F]" aria-label="Incluído" />
  ) : (
    <Minus className="mx-auto h-5 w-5 text-[#111111]/25" aria-label="Não incluído" />
  );
}

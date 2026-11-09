import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, XCircle, Clock, Zap, QrCode, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { DojoPageHero } from "@/components/dojo/DojoPageHero";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  startMySubscription,
  getMySubscription,
  cancelMySubscription,
  syncMySubscription,
  changeMyPlan,
  getMyPlan,
  getMyPixCharge,
  PLAN_AMOUNT,
} from "@/lib/dojo/subscription.functions";
import {
  SAAS_PLANS,
  SAAS_PLAN_ORDER,
  formatBRL,
  isSaasPlanCode,
  type SaasPlanCode,
} from "@/lib/dojo/saas-plans";
import { NativePixCheckout, PixChargeView } from "@/components/dojo/NativePixCheckout";

export const Route = createFileRoute("/dojo/app/subscription")({
  head: () => ({ meta: [{ title: "Assinatura — AMT Dojo Manager" }] }),
  component: SubscriptionPage,
});

const statusLabel: Record<string, { label: string; className: string; Icon: any }> = {
  trialing: { label: "Período de teste", className: "bg-blue-100 text-blue-800", Icon: Clock },
  pending: { label: "Aguardando pagamento", className: "bg-amber-100 text-amber-800", Icon: Clock },
  active: { label: "Ativa", className: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  paused: { label: "Pausada", className: "bg-neutral-100 text-neutral-700", Icon: Clock },
  suspended: { label: "Suspensa", className: "bg-red-100 text-red-800", Icon: AlertCircle },
  cancelled: { label: "Cancelada", className: "bg-red-100 text-red-800", Icon: XCircle },
};

function SubscriptionPage() {
  const qc = useQueryClient();
  const get = useServerFn(getMySubscription);
  const cancel = useServerFn(cancelMySubscription);
  const sync = useServerFn(syncMySubscription);

  const { data: sub, isLoading } = useQuery({
    queryKey: ["dojo", "subscription"],
    queryFn: () => get({}),
  });
  const [busy, setBusy] = useState(false);
  const startSubscription = useServerFn(startMySubscription);
  const [ownerEmail, setOwnerEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setOwnerEmail(data.user?.email ?? undefined));
  }, []);

  // Sincronização automática para refletir status de pagamento
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("mp") === "return") {
      const interval = setInterval(() => {
        void sync({ data: {} })
          .then((res) => {
            if (res.status === "active") {
              qc.invalidateQueries({ queryKey: ["dojo", "subscription"] });
              clearInterval(interval);
            }
          })
          .catch(() => {});
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [sync, qc]);

  // PIX recorrente: cobrança do mês gerada pelo sistema, mostrada aqui na tela.
  const getPixCharge = useServerFn(getMyPixCharge);
  const { data: pixCharge } = useQuery({
    queryKey: ["dojo", "pix-charge"],
    queryFn: () => getPixCharge(),
    enabled: sub?.subscription_type === "pix",
  });
  const refreshAfterPayment = () => {
    qc.invalidateQueries({ queryKey: ["dojo", "subscription"] });
    qc.invalidateQueries({ queryKey: ["dojo", "pix-charge"] });
    qc.invalidateQueries({ queryKey: ["dojo", "my-subscription"] });
  };

  const status = sub?.status ?? "pending";
  const s = statusLabel[status] ?? statusLabel.pending;

  // Contas novas escolhem entre os planos; legacy segue com o plano de antes.
  const currentPlan = isSaasPlanCode(sub?.plan_code) ? sub.plan_code : null;
  const isLegacy = !currentPlan;
  const [selected, setSelected] = useState<SaasPlanCode>("profissional");
  useEffect(() => {
    if (currentPlan) setSelected(currentPlan);
  }, [currentPlan]);
  const selectedPlan = SAAS_PLANS[selected];
  const amount = isLegacy ? PLAN_AMOUNT : selectedPlan.price;

  const getPlan = useServerFn(getMyPlan);
  const { data: planInfo } = useQuery({
    queryKey: ["dojo-my-plan"],
    queryFn: () => getPlan(),
    enabled: !isLegacy,
  });
  const change = useServerFn(changeMyPlan);

  async function doChangePlan(planCode: SaasPlanCode) {
    const target = SAAS_PLANS[planCode];
    if (!confirm(`Mudar para o plano ${target.name} (R$ ${formatBRL(target.price)}/mês)? A mudança vale agora e o novo valor entra na próxima cobrança.`)) return;
    setBusy(true);
    try {
      await change({ data: { planCode } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dojo", "subscription"] }),
        qc.invalidateQueries({ queryKey: ["dojo-my-plan"] }),
      ]);
      toast.success(`Plano alterado para ${target.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível mudar o plano");
    } finally {
      setBusy(false);
    }
  }

  const trialActive =
    sub?.trial_ends_at && new Date(sub.trial_ends_at) > new Date() && status === "trialing";
  const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;

  async function doCancel() {
    if (!confirm("Cancelar a assinatura? Você perderá o acesso ao final do período atual.")) return;
    setBusy(true);
    try {
      await cancel({});
      await qc.invalidateQueries({ queryKey: ["dojo", "subscription"] });
      toast.success("Assinatura cancelada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cancelar");
    } finally {
      setBusy(false);
    }
  }

  const canActivate =
    status === "trialing" || status === "pending" || status === "cancelled" || status === "paused" || status === "suspended";

  if (isLoading) return <div className="p-8 text-center text-neutral-500">Carregando assinatura...</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in duration-500">
      <DojoPageHero
        icon={CreditCard}
        eyebrow="Minha conta"
        title="Assinatura"
        description="Gerencie seu plano e formas de pagamento do AMT Dojo Manager."
      />

      {!isLegacy && (
        <div className="grid gap-4 md:grid-cols-3">
          {SAAS_PLAN_ORDER.map((code) => {
            const p = SAAS_PLANS[code];
            const isCurrent = status === "active" && currentPlan === code;
            const isSelected = selected === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelected(code)}
                className={cn(
                  "rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:shadow-md",
                  isSelected ? "border-red-600 ring-2 ring-red-600/20" : "border-neutral-200",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold uppercase tracking-wider text-neutral-900">{p.name}</span>
                  {isCurrent && <Badge className="bg-emerald-100 text-emerald-800">Seu plano</Badge>}
                </div>
                <div className="mt-2 text-2xl font-black">
                  R$ {formatBRL(p.price)}
                  <span className="ml-1 text-sm font-normal text-neutral-400">/mês</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{p.tagline}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Lado Esquerdo: Detalhes do Plano */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="overflow-hidden border-none shadow-xl ring-1 ring-neutral-200">
            <CardHeader className="bg-neutral-50/50 pb-8">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="bg-white text-neutral-600 font-medium">
                  {isLegacy ? "Plano atual" : `Plano ${selectedPlan.name}`}
                </Badge>
                <Badge className={cn("h-7 px-3 text-xs font-bold uppercase tracking-wider", s.className)}>
                  <s.Icon className="mr-1.5 h-3.5 w-3.5" /> {s.label}
                </Badge>
              </div>
              <CardTitle className="text-4xl font-black">
                R$ {formatBRL(amount)}
                <span className="text-lg font-normal text-neutral-400 ml-1">/mês</span>
              </CardTitle>
              <CardDescription className="text-neutral-500 mt-2">
                {isLegacy ? "Acesso total a todas as ferramentas de gestão do seu Dojo." : selectedPlan.tagline}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(isLegacy
                  ? [
                      "Alunos e Graduações ilimitados",
                      "App do Aluno White-label",
                      "Gestão Financeira e Mensalidades",
                      "Agenda e Check-ins Inteligentes",
                      "Emissão de Certificados",
                      "Notificações Push ilimitadas",
                    ]
                  : selectedPlan.highlights
                ).map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-neutral-600 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              {trialActive && trialEnds && (
                <div className="rounded-xl bg-blue-50/50 p-4 border border-blue-100 flex gap-3 items-start">
                  <Zap className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900 leading-relaxed">
                    Você está aproveitando o <strong>período de teste gratuito</strong>
                    {currentPlan && <> no plano <strong>{SAAS_PLANS[currentPlan].name}</strong></>}.
                    Sua conta expira em <strong>{trialEnds.toLocaleDateString("pt-BR")}</strong>
                    {!isLegacy && <> — ative a assinatura para continuar (você pode trocar de plano acima)</>}.
                  </div>
                </div>
              )}

              {!isLegacy && planInfo?.usage && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Alunos ativos", used: planInfo.usage.students, max: selectedPlan.limits.students },
                    { label: "Unidades", used: planInfo.usage.units, max: selectedPlan.limits.units },
                    { label: "Usuários", used: planInfo.usage.systemUsers, max: selectedPlan.limits.systemUsers },
                  ].map((u) => (
                    <div
                      key={u.label}
                      className={cn(
                        "rounded-lg border p-3",
                        u.max !== null && u.used > u.max ? "border-red-200 bg-red-50" : "border-neutral-100 bg-neutral-50",
                      )}
                    >
                      <div className="text-lg font-bold text-neutral-900">
                        {u.used}
                        <span className="text-sm font-normal text-neutral-400"> / {u.max ?? "∞"}</span>
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{u.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {!isLegacy && status === "active" && currentPlan && selected !== currentPlan && (
                <Button
                  onClick={() => doChangePlan(selected)}
                  disabled={busy}
                  className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : `Mudar para o plano ${selectedPlan.name}`}
                </Button>
              )}

              {status === "active" && sub?.current_period_end && (
                <div className="flex items-center gap-2 text-sm text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                  <RefreshCw className="h-4 w-4" />
                  Próxima renovação em: <strong>{new Date(sub.current_period_end).toLocaleDateString("pt-BR")}</strong>
                </div>
              )}
            </CardContent>
          </Card>

          {status === "active" && (
            <div className="flex justify-end">
              <Button onClick={doCancel} disabled={busy} variant="ghost" className="text-neutral-400 hover:text-red-600 text-xs">
                Desejo cancelar minha assinatura
              </Button>
            </div>
          )}
        </div>

        {/* Lado Direito: Checkout/Pagamento */}
        <div className="lg:col-span-5">
          {canActivate ? (
            <Card className="shadow-2xl border-none ring-1 ring-neutral-200 overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Ativar Assinatura</CardTitle>
                <CardDescription>Escolha como deseja pagar</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="card" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6 h-12 p-1 bg-neutral-100/50">
                    <TabsTrigger value="card" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <CreditCard className="mr-2 h-4 w-4" /> Cartão
                    </TabsTrigger>
                    <TabsTrigger value="pix" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                      <QrCode className="mr-2 h-4 w-4" /> PIX
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="card" className="space-y-6">
                    <div className="space-y-4 text-center py-4">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
                        <CreditCard className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-neutral-900">Assinatura Recorrente</p>
                        <p className="text-xs text-neutral-500 leading-relaxed">
                          O valor será debitado automaticamente todos os meses do seu cartão de crédito.
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const res = await startSubscription({
                            data: isLegacy ? {} : { planCode: selected },
                          });
                          if (res.init_point) {
                            window.location.href = res.init_point;
                          } else {
                            toast.error("URL de checkout não disponível");
                          }
                        } catch (e: any) {
                          toast.error(e?.message ?? "Falha ao iniciar assinatura");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="w-full h-12 bg-neutral-900 hover:bg-black text-white text-base font-bold transition-all hover:scale-[1.02] active:scale-95"
                    >
                      {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : isLegacy ? "Assinar com Cartão" : `Assinar ${selectedPlan.name} com Cartão`}
                    </Button>
                    <p className="text-[10px] text-center text-neutral-400">
                      Pagamento processado com segurança via Mercado Pago.
                    </p>
                  </TabsContent>

                  <TabsContent value="pix">
                    <NativePixCheckout 
                      defaultEmail={ownerEmail}
                      planCode={isLegacy ? undefined : selected}
                      amount={amount}
                      onSuccess={refreshAfterPayment}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : pixCharge?.state === "open" ? (
            <Card className="shadow-2xl border-none ring-1 ring-emerald-200 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Mensalidade em aberto</CardTitle>
                <CardDescription>PIX recorrente: o código deste mês já está pronto.</CardDescription>
              </CardHeader>
              <CardContent>
                <PixChargeView charge={pixCharge.charge} onPaid={refreshAfterPayment} />
              </CardContent>
            </Card>
          ) : pixCharge?.state === "expired" ? (
            <Card className="shadow-2xl border-none ring-1 ring-amber-200 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">O PIX deste mês venceu</CardTitle>
                <CardDescription>Gere um novo código para pagar a mensalidade.</CardDescription>
              </CardHeader>
              <CardContent>
                <NativePixCheckout
                  planCode={currentPlan ?? undefined}
                  amount={amount}
                  onSuccess={refreshAfterPayment}
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-emerald-50 border-emerald-100 shadow-sm">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-emerald-900">Tudo pronto!</p>
                  <p className="text-xs text-emerald-700">
                    Sua assinatura está ativa e seu acesso está liberado.
                  </p>
                  {sub?.subscription_type === "pix" && (
                    <p className="text-xs text-emerald-700">
                      PIX recorrente: o código da próxima mensalidade aparece aqui
                      {sub?.next_due_date ? ` 3 dias antes de ${new Date(`${sub.next_due_date}T12:00:00`).toLocaleDateString("pt-BR")}` : " 3 dias antes do vencimento"}.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}



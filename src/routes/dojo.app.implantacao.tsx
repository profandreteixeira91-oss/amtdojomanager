import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Hammer,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { DojoPageHero } from "@/components/dojo/DojoPageHero";
import { StepGuide } from "@/components/dojo/implementation/ImplementationGuide";
import { ImplementationStudentsStep } from "@/components/dojo/implementation/ImplementationStudents";
import { useDojoPermissions } from "@/components/dojo/DojoPermissionsProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone, maskCEP, parseAmountBR } from "@/lib/br-masks";
import {
  IMPLEMENTATION_PAYMENT_METHODS,
  IMPLEMENTATION_PLAN_FREQUENCIES,
  IMPLEMENTATION_STATUS_LABELS,
  IMPLEMENTATION_TEAM_ROLES,
  WEEKDAY_LABELS,
  beltIssues,
  buildBeltCatalog,
  countStudentLinks,
  dropStudentLink,
  emptyImplementationPayload,
  implementationIssues,
  renameStudentLink,
  type ImplementationClass,
  type ImplementationPayload,
  type ImplementationPlan,
} from "@/lib/dojo/implementation";
import {
  discardImplementationDraft,
  getMyImplementation,
  reopenImplementation,
  saveImplementationDraft,
  submitImplementation,
  type MyImplementation,
} from "@/lib/dojo/implementation.functions";
import { getSetupState } from "@/lib/dojo/setup.functions";
import { listDojoBelts } from "@/lib/dojo/dojo.functions";
import { getMySubscription } from "@/lib/dojo/subscription.functions";
import { effectivePlanCode, planLimits } from "@/lib/dojo/saas-plans";
import { MODALITY_CATALOG, modalityLabel, normalizeModality } from "@/lib/dojo/modalities";

export const Route = createFileRoute("/dojo/app/implantacao")({
  head: () => ({
    meta: [
      { title: "Implantação assistida — AMT Dojo Manager" },
      {
        name: "description",
        content:
          "Envie os dados da academia e a equipe AMT implanta o sistema para você, sem custo.",
      },
    ],
  }),
  component: ImplementationPage,
});

const STEPS = ["Academia", "Planos", "Turmas", "Equipe", "Alunos", "Revisar e enviar"];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function ImplementationPage() {
  const { isOwner, loading } = useDojoPermissions();
  const getFn = useServerFn(getMyImplementation);
  const query = useQuery({
    queryKey: ["dojo-implementation"],
    queryFn: () => getFn(),
    enabled: isOwner && !loading,
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <DojoPageHero
        icon={Hammer}
        eyebrow="Primeiros passos"
        title="Implantação assistida"
        description="Preencha os dados da sua academia e a equipe AMT deixa o sistema pronto para você — sem custo. Você pode salvar e continuar depois."
      />
      {loading || query.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !isOwner ? (
        <p className="rounded-md border p-4 text-sm">
          Só o dono da academia pode pedir a implantação assistida.
        </p>
      ) : query.isError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-4 text-sm text-destructive"
        >
          Não foi possível carregar o pedido. Recarregue a página.
        </p>
      ) : query.data && query.data.status !== "rascunho" ? (
        <StatusView request={query.data} />
      ) : (
        <ImplementationForm initial={query.data ?? null} />
      )}
    </div>
  );
}

/* ------------------------------ Situação do pedido ------------------------------ */

function StatusView({ request }: { request: NonNullable<MyImplementation> }) {
  const reopen = useServerFn(reopenImplementation);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const p = request.payload;
  const result = (request.result ?? {}) as Record<string, number | string | boolean>;
  const done = request.status === "concluida";
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        {done ? (
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        ) : (
          <Clock className="h-6 w-6 text-amber-600" />
        )}
        <div>
          <h2 className="text-lg font-semibold">
            {IMPLEMENTATION_STATUS_LABELS[request.status] ?? request.status}
          </h2>
          {request.submitted_at && (
            <p className="text-sm text-muted-foreground">
              Enviado em {new Date(request.submitted_at).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      </div>
      {done ? (
        <div className="space-y-3 text-sm">
          <p>Sua academia está pronta. Confira os cadastros e comece a usar:</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>{String(result.students_created ?? 0)} alunos cadastrados</li>
            <li>{String(result.plans_created ?? 0)} planos criados</li>
            <li>{String(result.classes_created ?? 0)} turmas criadas</li>
            <li>{String(result.enrollments_created ?? 0)} matrículas</li>
          </ul>
          {result.billing_start && (
            <p className="text-muted-foreground">
              As mensalidades começam a ser geradas em{" "}
              {formatMonth(String(result.billing_start).slice(0, 7))}.
            </p>
          )}
          {request.trial_after_implementation && (
            <p className="text-muted-foreground">
              Seus 14 dias de teste grátis começaram na conclusão da implantação.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link to="/dojo/app/students">Ver alunos</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dojo/app/student-app-qr">Divulgar o App do Aluno</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            {request.status === "enviada"
              ? "Recebemos seus dados. A equipe AMT vai revisar e implantar — avisamos assim que estiver pronto."
              : "A equipe AMT está implantando sua academia."}
          </p>
          <StepGuide title="O que acontece agora">
            <ol>
              <li>
                A equipe AMT confere os dados. Se faltar algo, falamos com você pelo WhatsApp.
              </li>
              <li>
                Cadastramos academia, planos, turmas, equipe e alunos, com matrículas e faixas, de
                uma vez só.
              </li>
              <li>
                Você recebe o aviso de conclusão e esta página mostra o resumo do que foi
                cadastrado.
              </li>
            </ol>
            {request.status === "enviada" && (
              <p>
                Precisa mudar algo? Clique em <strong>Editar pedido</strong>: o pedido volta para
                rascunho e sai da fila até você enviar de novo.
              </p>
            )}
          </StepGuide>
          <p className="text-muted-foreground">
            {p.plans.length} planos · {p.classes.length} turmas · {p.team.length} pessoas na equipe
            · {p.students.length} alunos
          </p>
          {request.trial_after_implementation && (
            <p className="text-muted-foreground">
              Seu teste grátis fica guardado: os 14 dias começam quando a implantação terminar.
            </p>
          )}
          {request.status === "enviada" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await reopen();
                  await qc.invalidateQueries({ queryKey: ["dojo-implementation"] });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível reabrir.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Editar pedido
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ Formulário ------------------------------ */

function ImplementationForm({ initial }: { initial: MyImplementation }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveImplementationDraft);
  const submitFn = useServerFn(submitImplementation);
  const discardFn = useServerFn(discardImplementationDraft);
  const setupFn = useServerFn(getSetupState);
  const setup = useQuery({ queryKey: ["dojo-setup"], queryFn: () => setupFn(), enabled: !initial });
  // Faixas da academia + catálogo da AMT: alimentam as listas da etapa Alunos.
  const beltsFn = useServerFn(listDojoBelts);
  const belts = useQuery({ queryKey: ["dojo-belts"], queryFn: () => beltsFn() });
  const catalog = useMemo(() => (belts.data ? buildBeltCatalog(belts.data) : null), [belts.data]);

  const [payload, setPayload] = useState<ImplementationPayload>(
    () => initial?.payload ?? emptyImplementationPayload(),
  );
  const [trialAfter, setTrialAfter] = useState(initial?.trial_after_implementation ?? true);
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updated_at ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const prefilled = useRef(Boolean(initial));

  // Rascunho novo: aproveita o que o assistente já tem da academia.
  useEffect(() => {
    if (prefilled.current || !setup.data) return;
    prefilled.current = true;
    const a = setup.data.academy;
    if (!a) return;
    setPayload((prev) => ({
      ...prev,
      academy: {
        ...prev.academy,
        trade_name: a.trade_name ?? "",
        whatsapp: a.whatsapp ?? "",
        city: a.city ?? "",
        state: a.state ?? "",
        modalities: (a.modalities ?? []).map(normalizeModality),
        logo_url: a.logo_url ?? "",
      },
    }));
  }, [setup.data]);

  // Salva sozinho 1,5 s depois da última alteração.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(async () => {
      try {
        const r = await saveFn({ data: { payload, trial_after_implementation: trialAfter } });
        setSavedAt(r.savedAt);
        setSaveError(null);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Não foi possível salvar.");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [payload, trialAfter, saveFn]);

  function update(patch: Partial<ImplementationPayload>) {
    dirty.current = true;
    setPayload((prev) => ({ ...prev, ...patch }));
  }

  const issues = useMemo(
    () => [...implementationIssues(payload), ...(catalog ? beltIssues(payload, catalog) : [])],
    [payload, catalog],
  );

  return (
    <div className="space-y-5">
      <details
        open={!initial}
        className="rounded-lg border bg-card p-4 text-sm [&_summary]:cursor-pointer"
      >
        <summary className="font-medium">Como funciona a implantação assistida</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Você preenche</strong> as 6 etapas abaixo, no seu
            ritmo. Tudo é salvo sozinho: pode sair e continuar depois.
          </li>
          <li>
            <strong className="text-foreground">Você envia para a AMT</strong> na última etapa. Nada
            é cadastrado no sistema antes disso.
          </li>
          <li>
            <strong className="text-foreground">A equipe AMT confere e cadastra tudo</strong>:
            academia, planos, turmas, equipe e alunos, já com plano, turma, faixa e vencimento de
            cada um.
          </li>
          <li>
            <strong className="text-foreground">Você recebe o aviso</strong> e começa a usar. O
            serviço é gratuito.
          </li>
        </ol>
        <p className="mt-3 text-muted-foreground">
          Siga a ordem das etapas: os planos e turmas que você cadastrar aparecem como opções na
          etapa Alunos.
        </p>
      </details>

      <nav aria-label="Etapas da implantação" className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <Button
            key={label}
            size="sm"
            variant={index === step ? "default" : "outline"}
            aria-current={index === step ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            {index + 1}. {label}
          </Button>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {saveError ? (
          <span className="text-destructive">{saveError}</span>
        ) : savedAt ? (
          `Rascunho salvo às ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        ) : (
          "O rascunho é salvo automaticamente."
        )}
      </p>

      <section className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold">{STEPS[step]}</h2>
        {step === 0 && <AcademyStep payload={payload} update={update} />}
        {step === 1 && <PlansStep payload={payload} update={update} />}
        {step === 2 && <ClassesStep payload={payload} update={update} />}
        {step === 3 && <TeamStep payload={payload} update={update} />}
        {step === 4 && (
          <ImplementationStudentsStep
            payload={payload}
            update={update}
            catalog={catalog}
            beltsLoading={belts.isLoading}
          />
        )}
        {step === 5 && (
          <ReviewStep
            payload={payload}
            update={update}
            issues={issues}
            trialAfter={trialAfter}
            setTrialAfter={(v) => {
              dirty.current = true;
              setTrialAfter(v);
            }}
          />
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                "Desistir da implantação assistida? O rascunho será apagado e você volta para o assistente de primeiros passos.",
              )
            )
              return;
            setBusy(true);
            try {
              dirty.current = false;
              await discardFn();
              await qc.invalidateQueries({ queryKey: ["dojo-implementation"] });
              window.location.assign("/dojo/app");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível descartar.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Prefiro fazer sozinho
        </Button>
        <div className="flex flex-wrap gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Voltar
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              Continuar <ArrowRight />
            </Button>
          ) : (
            <Button
              disabled={busy || issues.length > 0}
              onClick={async () => {
                setBusy(true);
                try {
                  dirty.current = false;
                  await submitFn({ data: { payload, trial_after_implementation: trialAfter } });
                  toast.success("Pedido enviado! A equipe AMT vai implantar sua academia.");
                  await qc.invalidateQueries({ queryKey: ["dojo-implementation"] });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Não foi possível enviar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send /> {busy ? "Enviando…" : "Enviar para a AMT"}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

type StepProps = {
  payload: ImplementationPayload;
  update: (patch: Partial<ImplementationPayload>) => void;
};

/* ------------------------------ 1. Academia ------------------------------ */

function AcademyStep({ payload, update }: StepProps) {
  const a = payload.academy;
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<typeof a>) => update({ academy: { ...a, ...patch } });
  const field = (
    key: keyof typeof a,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`impl-${key}`}>{label}</Label>
      <Input
        id={`impl-${key}`}
        value={String(a[key] ?? "")}
        onChange={(e) => set({ [key]: e.target.value } as Partial<typeof a>)}
        {...props}
      />
    </div>
  );
  const catalogIds = MODALITY_CATALOG.map((m) => m.id as string);
  const others = a.modalities.filter((m) => !catalogIds.includes(normalizeModality(m)));
  return (
    <div className="space-y-5">
      <StepGuide title="Dados da academia">
        <p>
          Aparecem no App do Aluno, nos recibos e nos contratos. Só{" "}
          <strong>nome, WhatsApp e modalidades</strong> são obrigatórios; o resto você completa
          depois, se preferir.
        </p>
        <p>
          As modalidades marcadas aqui definem as faixas que você vai poder escolher para cada aluno
          na etapa Alunos.
        </p>
      </StepGuide>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("trade_name", "Nome da academia *", { maxLength: 200 })}
        {field("responsible_name", "Responsável", { maxLength: 200 })}
        {field("legal_name", "Razão social", { maxLength: 200 })}
        {field("cnpj", "CNPJ ou CPF", { maxLength: 20 })}
        <div className="space-y-1.5">
          <Label htmlFor="impl-whatsapp">WhatsApp *</Label>
          <Input
            id="impl-whatsapp"
            type="tel"
            value={a.whatsapp}
            onChange={(e) => set({ whatsapp: maskPhone(e.target.value) })}
          />
        </div>
        {field("email", "E-mail da academia", { type: "email", maxLength: 200 })}
        {field("instagram", "Instagram", { maxLength: 120, placeholder: "@suaacademia" })}
        <div className="space-y-1.5">
          <Label htmlFor="impl-zip">CEP</Label>
          <Input
            id="impl-zip"
            inputMode="numeric"
            value={a.zip}
            onChange={(e) => set({ zip: maskCEP(e.target.value) })}
          />
        </div>
        {field("address", "Rua", { maxLength: 200 })}
        <div className="grid grid-cols-2 gap-3">
          {field("address_number", "Número", { maxLength: 20 })}
          {field("address_complement", "Complemento", { maxLength: 120 })}
        </div>
        {field("neighborhood", "Bairro", { maxLength: 120 })}
        <div className="grid grid-cols-[1fr_80px] gap-3">
          {field("city", "Cidade", { maxLength: 120 })}
          <div className="space-y-1.5">
            <Label htmlFor="impl-state">UF</Label>
            <Input
              id="impl-state"
              maxLength={2}
              value={a.state}
              onChange={(e) => set({ state: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            />
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Modalidades *</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODALITY_CATALOG.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.modalities.map(normalizeModality).includes(m.id)}
                onChange={(e) =>
                  set({
                    modalities: e.target.checked
                      ? [...a.modalities, m.id]
                      : a.modalities.filter((x) => normalizeModality(x) !== m.id),
                  })
                }
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="impl-other-mod">Outras modalidades (separe com vírgula)</Label>
          <Input
            id="impl-other-mod"
            value={others.join(", ")}
            onChange={(e) => {
              const list = e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
              set({
                modalities: [
                  ...a.modalities.filter((m) => catalogIds.includes(normalizeModality(m))),
                  ...list,
                ],
              });
            }}
          />
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="impl-logo">Logo (PNG, JPEG ou WebP até 5 MB)</Label>
        <div className="flex flex-wrap items-center gap-3">
          {a.logo_url && (
            <img
              src={a.logo_url}
              alt="Logo da academia"
              className="h-12 w-auto rounded border bg-white p-1"
            />
          )}
          <Input
            id="impl-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            className="max-w-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
                  file.size > 5 * 1024 * 1024
                ) {
                  throw new Error("Use PNG, JPEG ou WebP de até 5 MB.");
                }
                const { data, error } = await supabase.auth.getUser();
                if (error || !data.user) throw new Error("Sessão expirada.");
                const path = `logo/${data.user.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                const uploaded = await supabase.storage
                  .from("dojo-brand")
                  .upload(path, file, { contentType: file.type });
                if (uploaded.error) throw new Error(uploaded.error.message);
                set({
                  logo_url: supabase.storage.from("dojo-brand").getPublicUrl(path).data.publicUrl,
                });
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Não foi possível enviar o logo.",
                );
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 2. Planos ------------------------------ */

function PlansStep({ payload, update }: StepProps) {
  const plans = payload.plans;
  const nameAtFocus = useRef("");
  const setPlan = (index: number, patch: Partial<ImplementationPlan>) =>
    update({ plans: plans.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-4">
      <StepGuide title="Planos de mensalidade">
        <ul>
          <li>
            Cadastre cada plano que você cobra hoje, com o valor atual (ex.: Mensal Adulto, Kids 2x
            na semana, Trimestral).
          </li>
          <li>
            Na etapa Alunos você escolhe o plano de cada aluno numa lista com estes nomes. Se mudar
            o nome de um plano, os alunos ligados a ele acompanham.
          </li>
          <li>Nenhuma mensalidade é gerada antes do mês que você escolher na revisão.</li>
        </ul>
      </StepGuide>
      {plans.map((plan, index) => (
        <div key={index} className="space-y-3 rounded-md border p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor={`plan-name-${index}`}>Nome do plano</Label>
              <Input
                id={`plan-name-${index}`}
                maxLength={120}
                value={plan.name}
                onFocus={() => (nameAtFocus.current = plan.name)}
                onChange={(e) => setPlan(index, { name: e.target.value })}
                onBlur={() =>
                  update({
                    students: renameStudentLink(
                      payload.students,
                      "plan",
                      nameAtFocus.current,
                      plan.name,
                    ),
                  })
                }
              />
            </div>
            <MoneyInput
              id={`plan-amount-${index}`}
              label="Valor (R$)"
              value={plan.amount}
              onChange={(amount) => setPlan(index, { amount })}
            />
            <div className="space-y-1.5">
              <Label htmlFor={`plan-freq-${index}`}>Cobrança</Label>
              <select
                id={`plan-freq-${index}`}
                className={selectClass}
                value={plan.frequency}
                onChange={(e) =>
                  setPlan(index, { frequency: e.target.value as ImplementationPlan["frequency"] })
                }
              >
                {IMPLEMENTATION_PLAN_FREQUENCIES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <MoneyInput
              id={`plan-fee-${index}`}
              label="Taxa de matrícula"
              value={plan.enrollment_fee}
              onChange={(enrollment_fee) => setPlan(index, { enrollment_fee })}
            />
          </div>
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="mb-1 text-sm font-medium">Formas de pagamento</legend>
            {IMPLEMENTATION_PAYMENT_METHODS.map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={plan.payment_methods.includes(code)}
                  onChange={(e) =>
                    setPlan(index, {
                      payment_methods: e.target.checked
                        ? [...plan.payment_methods, code]
                        : plan.payment_methods.filter((m) => m !== code),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const linked = countStudentLinks(payload.students, "plan", plan.name);
              if (
                linked > 0 &&
                !window.confirm(
                  `${linked} aluno(s) estão neste plano e ficarão sem plano. Remover mesmo assim?`,
                )
              )
                return;
              const rest = plans.filter((_, i) => i !== index);
              const stillExists = rest.some(
                (p) => p.name.trim().toLowerCase() === plan.name.trim().toLowerCase(),
              );
              update({
                plans: rest,
                students: stillExists
                  ? payload.students
                  : dropStudentLink(payload.students, "plan", plan.name),
              });
            }}
          >
            <Trash2 /> Remover plano
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          update({
            plans: [
              ...plans,
              {
                name: "",
                amount: 0,
                frequency: "monthly",
                enrollment_fee: 0,
                payment_methods: ["pix", "cash"],
                description: "",
              },
            ],
          })
        }
      >
        <Plus /> Adicionar plano
      </Button>
      <p className="text-xs text-muted-foreground">
        Cobrança pelo AMT Pay (boleto, Pix automático e cartão) é ativada por você em Financeiro
        depois da implantação.
      </p>
    </div>
  );
}

function MoneyInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value ? value.toFixed(2).replace(".", ",") : "");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parseAmountBR(text) ?? 0;
          onChange(v);
          setText(v ? v.toFixed(2).replace(".", ",") : "");
        }}
      />
    </div>
  );
}

/* ------------------------------ 3. Turmas ------------------------------ */

type ScheduleGroup = { days: number[]; start: string; end: string };

function groupSchedules(list: ImplementationClass["schedules"]): ScheduleGroup[] {
  const map = new Map<string, ScheduleGroup>();
  for (const s of list) {
    const k = `${s.start_time}-${s.end_time}`;
    const g = map.get(k) ?? { days: [], start: s.start_time, end: s.end_time };
    g.days.push(s.weekday);
    map.set(k, g);
  }
  return [...map.values()];
}

function flattenSchedules(groups: ScheduleGroup[]): ImplementationClass["schedules"] {
  return groups.flatMap((g) =>
    g.days.map((weekday) => ({ weekday, start_time: g.start, end_time: g.end })),
  );
}

function ClassesStep({ payload, update }: StepProps) {
  const classes = payload.classes;
  const mods = payload.academy.modalities;
  const nameAtFocus = useRef("");
  const setClass = (index: number, patch: Partial<ImplementationClass>) =>
    update({ classes: classes.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  return (
    <div className="space-y-4">
      <StepGuide title="Turmas e horários">
        <ul>
          <li>
            Uma turma para cada grupo que treina junto, com a modalidade e os dias e horários (ex.:
            Jiu-Jitsu Adulto Noite, seg e qua, 19h às 20h30).
          </li>
          <li>
            A grade aparece no App do Aluno para o check-in. Na etapa Alunos você marca em quais
            turmas cada aluno treina — pode ser mais de uma.
          </li>
          <li>Use nomes sem vírgula nem ponto e vírgula.</li>
        </ul>
      </StepGuide>
      {classes.map((c, index) => {
        const groups = groupSchedules(c.schedules);
        const setGroups = (next: ScheduleGroup[]) =>
          setClass(index, { schedules: flattenSchedules(next) });
        return (
          <div key={index} className="space-y-3 rounded-md border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`class-name-${index}`}>Nome da turma</Label>
                <Input
                  id={`class-name-${index}`}
                  maxLength={120}
                  value={c.name}
                  onFocus={() => (nameAtFocus.current = c.name)}
                  onChange={(e) => setClass(index, { name: e.target.value.replace(/[;,]/g, "") })}
                  onBlur={() =>
                    update({
                      students: renameStudentLink(
                        payload.students,
                        "classes",
                        nameAtFocus.current,
                        c.name,
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`class-mod-${index}`}>Modalidade</Label>
                <select
                  id={`class-mod-${index}`}
                  className={selectClass}
                  value={c.modality}
                  onChange={(e) => setClass(index, { modality: e.target.value })}
                >
                  <option value="">Escolha</option>
                  {mods.map((m) => (
                    <option key={m} value={normalizeModality(m)}>
                      {modalityLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`class-teacher-${index}`}>Professor(a)</Label>
                <Input
                  id={`class-teacher-${index}`}
                  maxLength={200}
                  value={c.teacher_name}
                  onChange={(e) => setClass(index, { teacher_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`class-level-${index}`}>Nível</Label>
                  <select
                    id={`class-level-${index}`}
                    className={selectClass}
                    value={c.level}
                    onChange={(e) =>
                      setClass(index, { level: e.target.value as ImplementationClass["level"] })
                    }
                  >
                    {["todos", "iniciante", "intermediário", "avançado"].map((l) => (
                      <option key={l} value={l}>
                        {l[0].toUpperCase() + l.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`class-cap-${index}`}>Vagas</Label>
                  <Input
                    id={`class-cap-${index}`}
                    type="number"
                    min={1}
                    max={500}
                    value={c.max_students}
                    onChange={(e) =>
                      setClass(index, {
                        max_students: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Dias e horários</p>
              {groups.map((g, gi) => (
                <div key={gi} className="flex flex-wrap items-end gap-3 rounded-md bg-muted/40 p-3">
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Dias da semana">
                    {WEEKDAY_LABELS.map((label, day) => (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={g.days.includes(day) ? "default" : "outline"}
                        aria-pressed={g.days.includes(day)}
                        onClick={() =>
                          setGroups(
                            groups.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    days: x.days.includes(day)
                                      ? x.days.filter((d) => d !== day)
                                      : [...x.days, day].sort(),
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`class-${index}-start-${gi}`} className="text-xs">
                      Início
                    </Label>
                    <Input
                      id={`class-${index}-start-${gi}`}
                      type="time"
                      value={g.start}
                      onChange={(e) =>
                        setGroups(
                          groups.map((x, i) => (i === gi ? { ...x, start: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`class-${index}-end-${gi}`} className="text-xs">
                      Fim
                    </Label>
                    <Input
                      id={`class-${index}-end-${gi}`}
                      type="time"
                      value={g.end}
                      onChange={(e) =>
                        setGroups(
                          groups.map((x, i) => (i === gi ? { ...x, end: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover horário"
                    onClick={() => setGroups(groups.filter((_, i) => i !== gi))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {groups.some((g) => g.days.length === 0) && (
                <p className="text-xs text-destructive">Escolha ao menos um dia em cada horário.</p>
              )}
              {groups.some((g) => g.end <= g.start) && (
                <p className="text-xs text-destructive">
                  O horário final deve ser depois do inicial.
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setGroups([...groups, { days: [1, 3], start: "19:00", end: "20:00" }])
                }
              >
                <Plus /> Adicionar horário
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const linked = countStudentLinks(payload.students, "classes", c.name);
                if (
                  linked > 0 &&
                  !window.confirm(
                    `${linked} aluno(s) estão nesta turma e sairão dela. Remover mesmo assim?`,
                  )
                )
                  return;
                const rest = classes.filter((_, i) => i !== index);
                const stillExists = rest.some(
                  (x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
                );
                update({
                  classes: rest,
                  students: stillExists
                    ? payload.students
                    : dropStudentLink(payload.students, "classes", c.name),
                });
              }}
            >
              <Trash2 /> Remover turma
            </Button>
          </div>
        );
      })}
      <Button
        variant="outline"
        onClick={() =>
          update({
            classes: [
              ...classes,
              {
                name: "",
                modality: mods[0] ? normalizeModality(mods[0]) : "",
                level: "todos",
                teacher_name: "",
                max_students: 30,
                schedules: [
                  { weekday: 1, start_time: "19:00", end_time: "20:00" },
                  { weekday: 3, start_time: "19:00", end_time: "20:00" },
                ],
              },
            ],
          })
        }
      >
        <Plus /> Adicionar turma
      </Button>
    </div>
  );
}

/* ------------------------------ 4. Equipe ------------------------------ */

function TeamStep({ payload, update }: StepProps) {
  const team = payload.team;
  const setMember = (index: number, patch: Partial<(typeof team)[number]>) =>
    update({ team: team.map((m, i) => (i === index ? { ...m, ...patch } : m)) });
  return (
    <div className="space-y-4">
      <StepGuide title="Equipe">
        <ul>
          <li>
            Professores e funcionários entram no cadastro da equipe. O acesso ao sistema (login) de
            cada um você libera depois, em Usuários do Sistema.
          </li>
          <li>Só você na academia? Pode seguir para a próxima etapa.</li>
        </ul>
      </StepGuide>
      {team.map((m, index) => (
        <div
          key={index}
          className="grid items-end gap-3 rounded-md border p-4 sm:grid-cols-[2fr_2fr_1.3fr_1.3fr_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`team-name-${index}`}>Nome</Label>
            <Input
              id={`team-name-${index}`}
              maxLength={200}
              value={m.full_name}
              onChange={(e) => setMember(index, { full_name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`team-email-${index}`}>E-mail</Label>
            <Input
              id={`team-email-${index}`}
              type="email"
              maxLength={200}
              value={m.email}
              onChange={(e) => setMember(index, { email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`team-phone-${index}`}>WhatsApp</Label>
            <Input
              id={`team-phone-${index}`}
              type="tel"
              value={m.phone}
              onChange={(e) => setMember(index, { phone: maskPhone(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`team-role-${index}`}>Função</Label>
            <select
              id={`team-role-${index}`}
              className={selectClass}
              value={m.role}
              onChange={(e) =>
                setMember(index, { role: e.target.value as (typeof team)[number]["role"] })
              }
            >
              {IMPLEMENTATION_TEAM_ROLES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Remover pessoa"
            onClick={() => update({ team: team.filter((_, i) => i !== index) })}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          update({ team: [...team, { full_name: "", email: "", phone: "", role: "teacher" }] })
        }
      >
        <Plus /> Adicionar pessoa
      </Button>
    </div>
  );
}

/* ------------------------------ 6. Revisão ------------------------------ */

function ReviewStep({
  payload,
  update,
  issues,
  trialAfter,
  setTrialAfter,
}: StepProps & { issues: string[]; trialAfter: boolean; setTrialAfter: (v: boolean) => void }) {
  const subFn = useServerFn(getMySubscription);
  const sub = useQuery({ queryKey: ["dojo-subscription-implementation"], queryFn: () => subFn() });
  const planCode = effectivePlanCode(sub.data as { plan_code?: string | null } | null);
  const limit = planLimits(planCode).students;
  const active = payload.students.filter((s) => !s.status || s.status === "active").length;
  const withoutPlan = payload.students.filter(
    (s) => (!s.status || s.status === "active") && !s.plan?.trim(),
  ).length;
  const billing = payload.billing;
  return (
    <div className="space-y-5">
      <StepGuide title="Antes de enviar">
        <ul>
          <li>
            Confira os números abaixo e escolha <strong>a partir de quando</strong> o sistema gera
            as mensalidades. Os meses anteriores continuam com você, fora do sistema.
          </li>
          <li>
            Ao enviar, o pedido vai para a fila da AMT. Enquanto não começarmos, você ainda pode
            editar.
          </li>
        </ul>
      </StepGuide>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        {[
          ["Academia", payload.academy.trade_name || "—"],
          ["Planos", payload.plans.length],
          ["Turmas", payload.classes.length],
          ["Equipe", payload.team.length],
          ["Alunos", payload.students.length],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {withoutPlan > 0 && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          {withoutPlan === 1 ? "1 aluno ativo está" : `${withoutPlan} alunos ativos estão`} sem
          plano: {withoutPlan === 1 ? "entra" : "entram"} sem matrícula e sem mensalidade. Para
          escolher, volte à etapa Alunos e use o filtro <strong>Sem plano</strong>.
        </p>
      )}

      {limit !== null && active > limit && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          Seu plano permite até {limit} alunos ativos e a planilha tem {active}. Troque de plano em
          Minha conta › Assinatura antes da implantação, ou marque parte dos alunos como inativos.
        </p>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Mensalidades</legend>
        <div className="space-y-1.5">
          <Label htmlFor="impl-due">Dia de vencimento padrão</Label>
          <Input
            id="impl-due"
            type="number"
            min={1}
            max={28}
            value={billing.due_day_default}
            onChange={(e) =>
              update({
                billing: {
                  ...billing,
                  due_day_default: Math.max(1, Math.min(28, Number(e.target.value) || 1)),
                },
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Vale para quem ficou com vencimento "Padrão" na etapa Alunos.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="impl-start">Começar a cobrar pelo sistema em</Label>
          <Input
            id="impl-start"
            type="month"
            value={billing.start_month}
            onChange={(e) =>
              e.target.value && update({ billing: { ...billing, start_month: e.target.value } })
            }
          />
          <p className="text-xs text-muted-foreground">
            Mensalidades anteriores a esse mês continuam com você, fora do sistema.
          </p>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="impl-notes">Algo mais que a equipe AMT precisa saber?</Label>
        <Textarea
          id="impl-notes"
          maxLength={2000}
          rows={4}
          value={payload.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Ex.: alunos com desconto, horários especiais, como você cobra hoje…"
        />
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={trialAfter}
          onChange={(e) => setTrialAfter(e.target.checked)}
        />
        <span>
          <strong>Começar meus 14 dias de teste grátis só depois da implantação.</strong>
          <span className="block text-muted-foreground">
            Enquanto a AMT implanta, sua conta continua liberada e o teste não é consumido.
          </span>
        </span>
      </label>

      {issues.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <ClipboardList className="h-4 w-4" /> Falta pouco para enviar:
          </p>
          <ul className="list-disc pl-5 text-destructive">
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Tudo certo para enviar.
        </p>
      )}
    </div>
  );
}

function formatMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bell, Save, Plus, X, Clock, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  getStudentNotificationPrefs,
  saveStudentNotificationPrefs,
  NOTIFICATION_CATEGORY_META,
  DEFAULT_NOTIFICATION_CATEGORIES,
  DEFAULT_NOTIFICATION_EXTRAS,
  type NotificationCategoryKey,
  type NotificationExtras,
} from "@/lib/student-app/notification-prefs.functions";
import { DojoPageHero } from "@/components/dojo/DojoPageHero";

export const Route = createFileRoute("/dojo/app/student-notifications-config")({
  head: () => ({
    meta: [
      { title: "Notificações do App do Aluno — AMT Dojo Manager" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StudentNotificationsConfigPage,
});

const GROUPS = ["Aulas & Presença", "Financeiro", "Comunicação", "Desempenho"] as const;

function StudentNotificationsConfigPage() {
  const getFn = useServerFn(getStudentNotificationPrefs);
  const saveFn = useServerFn(saveStudentNotificationPrefs);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dojo", "student-notif-prefs"],
    queryFn: () => getFn({}),
  });

  const [state, setState] = useState<Record<NotificationCategoryKey, boolean>>(DEFAULT_NOTIFICATION_CATEGORIES);
  const [extras, setExtras] = useState<NotificationExtras>(DEFAULT_NOTIFICATION_EXTRAS);
  const [saving, setSaving] = useState(false);
  const [newClassOffset, setNewClassOffset] = useState<string>("");
  const [newDueOffset, setNewDueOffset] = useState<string>("");
  const [newOverdueOffset, setNewOverdueOffset] = useState<string>("");

  useEffect(() => {
    if (data?.categories) setState(data.categories);
    if (data?.extras) setExtras(data.extras);
  }, [data?.categories, data?.extras]);

  function toggle(k: NotificationCategoryKey, v: boolean) {
    setState((s) => ({ ...s, [k]: v }));
  }
  function setAll(v: boolean) {
    const next = { ...state };
    for (const k of Object.keys(next) as NotificationCategoryKey[]) next[k] = v;
    setState(next);
  }

  function addClassOffset() {
    const n = Math.round(Number(newClassOffset));
    if (!Number.isFinite(n) || n < 0 || n > 720) {
      toast.error("Informe um valor entre 0 e 720 minutos");
      return;
    }
    if (extras.class_reminder_offsets_min.includes(n)) {
      toast.info("Esse tempo já está configurado");
      return;
    }
    if (extras.class_reminder_offsets_min.length >= 8) {
      toast.error("Máximo de 8 disparos por aula");
      return;
    }
    setExtras((e) => ({
      ...e,
      class_reminder_offsets_min: [...e.class_reminder_offsets_min, n].sort((a, b) => b - a),
    }));
    setNewClassOffset("");
  }
  function removeClassOffset(n: number) {
    setExtras((e) => ({
      ...e,
      class_reminder_offsets_min: e.class_reminder_offsets_min.filter((v) => v !== n),
    }));
  }

  function addDueOffset() {
    const n = Math.round(Number(newDueOffset));
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      toast.error("Informe um valor entre 0 e 60 dias");
      return;
    }
    if (extras.invoice_due_soon_offsets_days.includes(n)) {
      toast.info("Esse dia já está configurado");
      return;
    }
    if (extras.invoice_due_soon_offsets_days.length >= 6) {
      toast.error("Máximo de 6 disparos");
      return;
    }
    setExtras((e) => ({
      ...e,
      invoice_due_soon_offsets_days: [...e.invoice_due_soon_offsets_days, n].sort((a, b) => b - a),
    }));
    setNewDueOffset("");
  }
  function removeDueOffset(n: number) {
    setExtras((e) => ({
      ...e,
      invoice_due_soon_offsets_days: e.invoice_due_soon_offsets_days.filter((v) => v !== n),
    }));
  }

  function addOverdueOffset() {
    const n = Math.round(Number(newOverdueOffset));
    if (!Number.isFinite(n) || n < 1 || n > 60) {
      toast.error("Informe um valor entre 1 e 60 dias");
      return;
    }
    if (extras.invoice_overdue_offsets_days.includes(n)) {
      toast.info("Esse dia já está configurado");
      return;
    }
    if (extras.invoice_overdue_offsets_days.length >= 8) {
      toast.error("Máximo de 8 disparos");
      return;
    }
    setExtras((e) => ({
      ...e,
      invoice_overdue_offsets_days: [...e.invoice_overdue_offsets_days, n].sort((a, b) => a - b),
    }));
    setNewOverdueOffset("");
  }
  function removeOverdueOffset(n: number) {
    setExtras((e) => ({
      ...e,
      invoice_overdue_offsets_days: e.invoice_overdue_offsets_days.filter((v) => v !== n),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: { categories: state, extras } });
      toast.success("Preferências salvas");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mx-auto max-w-4xl pb-24">
        <DojoPageHero
          icon={Bell}
          eyebrow={
            <Link to="/dojo/app/student-app-qr" className="inline-flex items-center gap-1 hover:text-red-700">
              <ArrowLeft className="h-3 w-3" /> App do Aluno
            </Link>
          }
          title="Notificações do App do Aluno"
          description="Escolha quais avisos push serão enviados para o celular dos seus alunos e o momento exato de cada disparo."
          actions={
            <>
              <Button variant="outline" onClick={() => setAll(true)} className="h-9 text-xs">
                Ativar tudo
              </Button>
              <Button variant="outline" onClick={() => setAll(false)} className="h-9 text-xs">
                Desativar tudo
              </Button>
            </>
          }
        />

        {/* Fine-grained timing */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Class reminders */}
          <section className="rounded-2xl border border-[color:var(--dojo-border)] bg-white p-4 md:p-5 text-neutral-950 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-semibold text-neutral-900">Lembretes de aula</h2>
              </div>
              <Switch checked={!!state.class_reminder} onCheckedChange={(v) => toggle("class_reminder", !!v)} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">Minutos antes do início da aula. Pode configurar vários disparos.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {extras.class_reminder_offsets_min.length === 0 && (
                <span className="text-xs text-neutral-500">Nenhum disparo configurado.</span>
              )}
              {extras.class_reminder_offsets_min.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text--700">
                  {m === 0 ? "no horário" : `${m} min antes`}
                  <button type="button" onClick={() => removeClassOffset(m)} className="ml-1 rounded hover:bg-red-500/20 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                type="number"
                min={0}
                max={720}
                inputMode="numeric"
                placeholder="Ex: 30"
                value={newClassOffset}
                onChange={(e) => setNewClassOffset(e.target.value)}
                className="h-9 bg-white border-[color:var(--dojo-border)] text-neutral-950 placeholder:text-neutral-500"
              />
              <Button type="button" onClick={addClassOffset} className="h-9 shrink-0 bg-red-600 hover:bg-red-500 text-white">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </section>

          {/* Invoice due soon */}
          <section className="rounded-2xl border border-[color:var(--dojo-border)] bg-white p-4 md:p-5 text-neutral-950 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-semibold text-neutral-900">Cobrança a vencer</h2>
              </div>
              <Switch checked={!!state.invoice_due_soon} onCheckedChange={(v) => toggle("invoice_due_soon", !!v)} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">Dias antes do vencimento. Pode configurar vários disparos (0 = no dia do vencimento).</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {extras.invoice_due_soon_offsets_days.length === 0 && (
                <span className="text-xs text-neutral-500">Nenhum disparo configurado.</span>
              )}
              {extras.invoice_due_soon_offsets_days.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text--700">
                  {d === 0 ? "no vencimento" : `${d} dia${d > 1 ? "s" : ""} antes`}
                  <button type="button" onClick={() => removeDueOffset(d)} className="ml-1 rounded hover:bg-red-500/20 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                type="number"
                min={0}
                max={60}
                inputMode="numeric"
                placeholder="Ex: 3"
                value={newDueOffset}
                onChange={(e) => setNewDueOffset(e.target.value)}
                className="h-9 bg-white border-[color:var(--dojo-border)] text-neutral-950 placeholder:text-neutral-500"
              />
              <Button type="button" onClick={addDueOffset} className="h-9 shrink-0 bg-red-600 hover:bg-red-500 text-white">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </section>

          {/* Invoice overdue (multi-offset) */}
          <section className="rounded-2xl border border-[color:var(--dojo-border)] bg-white p-4 md:p-5 text-neutral-950 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-semibold text-neutral-900">Cobrança vencida</h2>
              </div>
              <Switch checked={!!state.invoice_overdue} onCheckedChange={(v) => toggle("invoice_overdue", !!v)} />
            </div>
            <p className="mt-1 text-xs text-neutral-500">Dias após o vencimento. Pode configurar vários disparos.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {extras.invoice_overdue_offsets_days.length === 0 && (
                <span className="text-xs text-neutral-500">Nenhum disparo configurado.</span>
              )}
              {extras.invoice_overdue_offsets_days.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text--700">
                  {d} dia{d > 1 ? "s" : ""} após
                  <button type="button" onClick={() => removeOverdueOffset(d)} className="ml-1 rounded hover:bg-red-500/20 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                type="number"
                min={1}
                max={60}
                inputMode="numeric"
                placeholder="Ex: 5"
                value={newOverdueOffset}
                onChange={(e) => setNewOverdueOffset(e.target.value)}
                className="h-9 bg-white border-[color:var(--dojo-border)] text-neutral-950 placeholder:text-neutral-500"
              />
              <Button type="button" onClick={addOverdueOffset} className="h-9 shrink-0 bg-red-600 hover:bg-red-500 text-white">
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </section>
        </div>

        {/* Groups (on/off toggles) */}
        <div className="mt-6 space-y-4">
          {GROUPS.map((group) => {
            const items = NOTIFICATION_CATEGORY_META.filter((c) => c.group === group);
            if (items.length === 0) return null;
            return (
              <section
                key={group}
                className="rounded-2xl border border-[color:var(--dojo-border)] bg-white p-4 md:p-5 text-neutral-950 shadow-xs"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-red-600">{group}</h2>
                <ul className="mt-3 divide-y divide-neutral-100">
                  {items.map((item) => (
                    <li key={item.key} className="flex items-start justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-neutral-900">{item.label}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">{item.description}</div>
                      </div>
                      <Switch
                        checked={!!state[item.key]}
                        onCheckedChange={(v) => toggle(item.key, !!v)}
                        disabled={isLoading}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="sticky bottom-4 mt-6 flex justify-end">
          <Button
            onClick={save}
            disabled={saving || isLoading}
            className="h-11 bg-gradient-to-br from-red-600 to-red-800 text-white shadow-xs hover:from-red-500 hover:to-red-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvando…" : "Salvar preferências"}
          </Button>
        </div>

        <p className="mt-4 text-[11px] text-neutral-500">
          As alterações valem para todos os alunos da sua academia. Os alunos ainda precisam ter as notificações ativadas
          no dispositivo deles para receber os avisos. Lembretes de aula são disparados a cada 5 minutos; cobranças, uma vez ao dia.
        </p>
      </div>
    </div>
  );
}

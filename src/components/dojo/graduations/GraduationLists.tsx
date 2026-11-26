import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Award, CalendarCheck, CheckCircle2, Clock, Loader2, ScrollText, Search, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BeltAuto } from "@/components/dojo/BeltSpecVisual";
import { formatBeltFull } from "@/lib/dojo/degree-label";
import { modalityLabel } from "@/lib/dojo/modalities";
import { todayISO } from "@/lib/dates";
import {
  cancelGraduationPlan,
  confirmGraduationPlans,
  listGraduationHistory,
  listGraduationPlans,
  type GraduationPlan,
} from "@/lib/dojo/graduation-plans.functions";

/** Graduação já confirmada, pronta para a etapa de certificados do assistente. */
export type GraduationForCertificate = {
  id: string;
  student_id: string;
  belt_id: string;
  degree: number;
  graduation_date: string;
  evaluator: string | null;
  notes: string | null;
};

const brl = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDay = (day: string | null | undefined) => (day ? String(day).slice(0, 10).split("-").reverse().join("/") : "—");
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("") || "?";

function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-100 text-xs font-bold text-neutral-600 ring-1 ring-neutral-200">
      {photo ? <img src={photo} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </div>
  );
}

function FeeBadge({ amount, status }: { amount: number | null; status: string | null }) {
  if (!amount) return <span className="text-[11px] text-neutral-500">Sem taxa</span>;
  const paid = status === "paid";
  const cancelled = status === "cancelled";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        paid
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : cancelled
            ? "border-neutral-200 bg-neutral-50 text-neutral-500"
            : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {brl(amount)} · {paid ? "paga" : cancelled ? "cancelada" : "a receber"}
    </span>
  );
}

/* ============================ Aguardando confirmação ============================ */

export function PlannedGraduations({ onIssue }: { onIssue: (grads: GraduationForCertificate[]) => void }) {
  const listFn = useServerFn(listGraduationPlans);
  const confirmFn = useServerFn(confirmGraduationPlans);
  const cancelFn = useServerFn(cancelGraduationPlan);
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["dojo-graduation-plans"], queryFn: () => listFn() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDate, setConfirmDate] = useState(todayISO());
  const [confirmEvaluator, setConfirmEvaluator] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ((plans.data ?? []) as GraduationPlan[]).filter(
      (p) => !t || (p.student?.full_name ?? "").toLowerCase().includes(t) || (p.belt?.name ?? "").toLowerCase().includes(t),
    );
  }, [plans.data, q]);

  // Agrupa pela data prevista (cada data = uma cerimônia).
  const groups = useMemo(() => {
    const map = new Map<string, GraduationPlan[]>();
    for (const p of rows) map.set(p.planned_date, [...(map.get(p.planned_date) ?? []), p]);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dojo-graduation-plans"] });
    qc.invalidateQueries({ queryKey: ["dojo-graduation-history"] });
    qc.invalidateQueries({ queryKey: ["dojo-students"] });
    qc.invalidateQueries({ queryKey: ["dojo-invoices"] });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (items: GraduationPlan[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = items.every((p) => next.has(p.id));
      for (const p of items) all ? next.delete(p.id) : next.add(p.id);
      return next;
    });

  const openConfirm = () => {
    const chosen = rows.filter((p) => selected.has(p.id));
    if (!chosen.length) return toast.error("Selecione quem foi aprovado na avaliação");
    const dates = Array.from(new Set(chosen.map((p) => p.planned_date))).sort();
    setConfirmDate(dates[0] && dates[0] <= todayISO() ? dates[0] : todayISO());
    setConfirmEvaluator(chosen.find((p) => p.evaluator)?.evaluator ?? "");
    setConfirmOpen(true);
  };

  const doConfirm = async (issueAfter: boolean) => {
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const res = await confirmFn({ data: { ids, graduation_date: confirmDate, evaluator: confirmEvaluator || null } });
      toast.success(`${res.count} graduação(ões) confirmada(s)`, {
        description: confirmDate > todayISO() ? "A faixa muda na data da cerimônia." : "Faixas atualizadas e alunos avisados.",
      });
      setConfirmOpen(false);
      setSelected(new Set());
      refresh();
      if (issueAfter) {
        onIssue(res.graduations.map((g) => ({
          id: g.id, student_id: g.student_id, belt_id: g.belt_id, degree: g.degree,
          graduation_date: g.graduation_date, evaluator: confirmEvaluator || null, notes: null,
        })));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível confirmar");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: GraduationPlan) => {
    const name = p.student?.full_name ?? "este aluno";
    const fee = p.fee_amount && p.invoice_status !== "paid" ? "\n\nA taxa em aberto será cancelada no financeiro." : p.invoice_status === "paid" ? "\n\nA taxa já foi paga e continua no financeiro." : "";
    if (!window.confirm(`Remover a graduação prevista de ${name}?${fee}`)) return;
    try {
      await cancelFn({ data: { id: p.id } });
      toast.success("Graduação prevista removida");
      setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível remover");
    }
  };

  if (plans.isLoading) {
    return <div className="flex items-center gap-2 rounded-2xl border bg-white p-6 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }
  if (plans.error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar: {(plans.error as Error).message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aluno ou faixa" className="h-10 pl-9" />
        </div>
        <Button onClick={openConfirm} disabled={selected.size === 0} className="h-10">
          <UserCheck className="mr-1.5 h-4 w-4" /> Confirmar graduação{selected.size ? ` (${selected.size})` : ""}
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-neutral-400" />
          <p className="mt-2 text-sm font-medium text-neutral-800">Nenhuma graduação aguardando confirmação</p>
          <p className="mt-1 text-xs text-neutral-500">
            Em <strong>Nova graduação</strong>, use <strong>Registrar sem certificados</strong> para lançar quem vai graduar e as taxas.
          </p>
        </div>
      ) : (
        groups.map(([day, items]) => {
          const allOn = items.every((p) => selected.has(p.id));
          const due = day <= todayISO();
          return (
            <section key={day} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-neutral-900">
                  <input type="checkbox" checked={allOn} onChange={() => toggleGroup(items)} className="h-4 w-4 accent-red-600" />
                  <CalendarCheck className="h-4 w-4 text-red-600" />
                  Cerimônia prevista para {brDay(day)}
                  <span className="font-normal text-neutral-500">· {items.length} aluno(s)</span>
                </label>
                {due ? <span className="text-xs font-medium text-amber-700">Data chegou — confirme quem passou</span> : null}
              </header>
              <ul className="divide-y divide-neutral-100">
                {items.map((p) => {
                  const name = p.student?.full_name ?? "Aluno";
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-red-600" aria-label={`Selecionar ${name}`} />
                      <Avatar name={name} photo={p.student?.photo_url} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">{name}</div>
                        <div className="truncate text-xs text-neutral-500">
                          {p.belt ? formatBeltFull(p.belt.name, p.belt.modality, p.degree) : "Faixa"}
                          {p.belt?.modality ? ` · ${modalityLabel(p.belt.modality)}` : ""}
                          {p.evaluator ? ` · ${p.evaluator}` : ""}
                        </div>
                      </div>
                      {p.belt ? (
                        <div className="hidden h-[20px] w-[120px] shrink-0 overflow-hidden sm:block">
                          <div className="w-[220px] origin-top-left scale-[0.55]">
                            <BeltAuto belt={p.belt as any} degree={p.degree} className="w-full" />
                          </div>
                        </div>
                      ) : null}
                      <FeeBadge amount={p.fee_amount} status={p.invoice_status} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => void remove(p)} aria-label={`Remover ${name}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}

      <Dialog open={confirmOpen} onOpenChange={(v) => !busy && setConfirmOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar {selected.size} graduação(ões)</DialogTitle>
            <DialogDescription>
              Os alunos passam para a nova faixa, recebem os parabéns no app e a graduação entra no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-neutral-700">Data da graduação</label>
              <Input type="date" value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)} className="mt-1 h-10" />
              {confirmDate > todayISO() ? (
                <p className="mt-1 text-[11px] text-amber-700">Data futura: a faixa muda e os parabéns saem nesse dia.</p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-700">Avaliador / professor (opcional)</label>
              <Input value={confirmEvaluator} onChange={(e) => setConfirmEvaluator(e.target.value)} className="mt-1 h-10" placeholder="Nome de quem graduou" />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="outline" onClick={() => void doConfirm(false)} disabled={busy || !confirmDate}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Só confirmar
            </Button>
            <Button onClick={() => void doConfirm(true)} disabled={busy || !confirmDate}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScrollText className="mr-1.5 h-4 w-4" />}
              Confirmar e emitir certificados
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================== Histórico ================================== */

type HistoryRow = {
  id: string;
  student_id: string;
  belt_id: string;
  degree: number;
  graduation_date: string;
  evaluator: string | null;
  notes: string | null;
  fee_amount: number | null;
  invoice_status: string | null;
  scheduled: boolean;
  has_certificate: boolean;
  student: { id: string; full_name: string; photo_url: string | null } | null;
  belt: { id: string; name: string; modality: string | null; color_hex: string | null } | null;
};

export function GraduationHistory({ onIssue }: { onIssue: (grads: GraduationForCertificate[]) => void }) {
  const fn = useServerFn(listGraduationHistory);
  const hist = useQuery({ queryKey: ["dojo-graduation-history"], queryFn: () => fn({ data: {} }) });
  const [q, setQ] = useState("");
  const [modality, setModality] = useState("all");
  const [onlyNoCert, setOnlyNoCert] = useState(false);
  const [year, setYear] = useState("all");

  const all = (hist.data ?? []) as HistoryRow[];
  const modalities = useMemo(() => Array.from(new Set(all.map((r) => r.belt?.modality).filter(Boolean))) as string[], [all]);
  const years = useMemo(() => Array.from(new Set(all.map((r) => r.graduation_date.slice(0, 4)))).sort().reverse(), [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((r) =>
      (!t || (r.student?.full_name ?? "").toLowerCase().includes(t)) &&
      (modality === "all" || r.belt?.modality === modality) &&
      (year === "all" || r.graduation_date.startsWith(year)) &&
      (!onlyNoCert || !r.has_certificate),
    );
  }, [all, q, modality, year, onlyNoCert]);

  // Por data (cada data = uma cerimônia).
  const groups = useMemo(() => {
    const map = new Map<string, HistoryRow[]>();
    for (const r of rows) map.set(r.graduation_date, [...(map.get(r.graduation_date) ?? []), r]);
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const toCert = (items: HistoryRow[]): GraduationForCertificate[] =>
    items.map((r) => ({ id: r.id, student_id: r.student_id, belt_id: r.belt_id, degree: r.degree, graduation_date: r.graduation_date, evaluator: r.evaluator, notes: r.notes }));

  if (hist.isLoading) {
    return <div className="flex items-center gap-2 rounded-2xl border bg-white p-6 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  }
  if (hist.error) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar: {(hist.error as Error).message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar aluno" className="h-10 pl-9" />
        </div>
        <select value={modality} onChange={(e) => setModality(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="Modalidade">
          <option value="all">Todas as modalidades</option>
          {modalities.map((m) => <option key={m} value={m}>{modalityLabel(m)}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm" aria-label="Ano">
          <option value="all">Todos os anos</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <label className="flex items-center gap-2 px-1 text-sm text-neutral-700">
          <input type="checkbox" checked={onlyNoCert} onChange={(e) => setOnlyNoCert(e.target.checked)} className="h-4 w-4 accent-red-600" />
          Sem certificado
        </label>
      </div>

      <p className="text-xs text-neutral-500">{rows.length} graduação(ões) · {groups.length} data(s)</p>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">Nenhuma graduação encontrada.</div>
      ) : (
        groups.map(([day, items]) => {
          const missing = items.filter((r) => !r.has_certificate);
          return (
            <section key={day} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                  <Award className="h-4 w-4 text-red-600" /> {brDay(day)}
                  <span className="font-normal text-neutral-500">· {items.length} aluno(s)</span>
                </div>
                {missing.length > 0 ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onIssue(toCert(missing))}>
                    <ScrollText className="mr-1.5 h-3.5 w-3.5" /> Emitir {missing.length} certificado(s)
                  </Button>
                ) : null}
              </header>
              <ul className="divide-y divide-neutral-100">
                {items.map((r) => {
                  const name = r.student?.full_name ?? "Aluno";
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Avatar name={name} photo={r.student?.photo_url} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">{name}</div>
                        <div className="truncate text-xs text-neutral-500">
                          {r.belt ? formatBeltFull(r.belt.name, r.belt.modality, r.degree) : "Faixa"}
                          {r.belt?.modality ? ` · ${modalityLabel(r.belt.modality)}` : ""}
                          {r.evaluator ? ` · ${r.evaluator}` : ""}
                        </div>
                      </div>
                      {r.scheduled ? <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">Agendada</span> : null}
                      {r.fee_amount ? <FeeBadge amount={r.fee_amount} status={r.invoice_status} /> : null}
                      {r.has_certificate ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Certificado emitido</span>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onIssue(toCert([r]))}>
                          <ScrollText className="mr-1 h-3.5 w-3.5" /> Emitir certificado
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

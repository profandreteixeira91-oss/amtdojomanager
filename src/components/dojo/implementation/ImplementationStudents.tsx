// Etapa "Alunos" da implantação assistida (/dojo/app/implantacao).
//
// A planilha traz só os dados pessoais. Plano, turmas, faixa, grau e vencimento
// são escolhidos aqui, em listas montadas com o que o dono cadastrou nas etapas
// anteriores e com as faixas de cada modalidade — assim o nome escrito no aluno é
// sempre o mesmo do plano/turma/faixa, e a AMT não precisa adivinhar nada.
// Os vínculos ficam gravados por nome (ver src/lib/dojo/implementation.ts).

import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, Download, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StepGuide } from "@/components/dojo/implementation/ImplementationGuide";
import { cn } from "@/lib/utils";
import {
  findStudentBelt,
  keepStudentLinks,
  linkImportedStudent,
  normalizeImplementationStudent,
  pruneClassTimes,
  scheduleGroupLabels,
  splitClasses,
  studentClassTime,
  studentLinkProblems,
  validateImplementationStudents,
  withClassTime,
  type BeltCatalog,
  type ImplementationPayload,
  type ImplementationStudent,
  type StudentLinkProblems,
} from "@/lib/dojo/implementation";
import { modalityLabel, normalizeModality } from "@/lib/dojo/modalities";
import {
  downloadImplementationStudentsTemplate,
  parseStudentsFile,
} from "@/lib/dojo/students-xlsx";

type Props = {
  payload: ImplementationPayload;
  update: (patch: Partial<ImplementationPayload>) => void;
  /** null enquanto carrega ou se não deu para carregar as faixas. */
  catalog: BeltCatalog | null;
  beltsLoading: boolean;
};

type Filter = "all" | "pending" | "no_plan" | "no_class" | "no_belt";

const PAGE_SIZE = 25;
const KEEP = "__keep";
const NONE = "__none";
const UNKNOWN = "__unknown";
const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const key = (v: string | undefined) => (v ?? "").trim().toLowerCase();

/** Horários de cada turma (nome em minúsculas → "Seg/Qua 19:00–20:00"). */
type ClassTimes = Map<string, string[]>;

/** Aplica o patch e apaga os campos que ficaram vazios (o nome sempre fica). */
function withPatch(s: ImplementationStudent, patch: Record<string, string>): ImplementationStudent {
  const out: Record<string, string> = { ...s, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === "" && k !== "full_name") delete out[k];
  return out as ImplementationStudent;
}

function hasProblem(p: StudentLinkProblems) {
  return p.plan || p.belt || p.classes.length > 0;
}

export function ImplementationStudentsStep({ payload, update, catalog, beltsLoading }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState("");

  const students = payload.students;
  const modalities = useMemo(
    () => [...new Set(payload.academy.modalities.map((m) => normalizeModality(m)).filter(Boolean))],
    [payload.academy.modalities],
  );
  const planNames = useMemo(
    () => [...new Set(payload.plans.map((p) => p.name.trim()).filter(Boolean))],
    [payload.plans],
  );
  const classNames = useMemo(
    () => [...new Set(payload.classes.map((c) => c.name.trim()).filter(Boolean))],
    [payload.classes],
  );
  const classTimes = useMemo<ClassTimes>(
    () =>
      new Map(
        payload.classes
          .filter((c) => c.name.trim())
          .map((c) => [key(c.name), scheduleGroupLabels(c.schedules)]),
      ),
    [payload.classes],
  );

  const problems = useMemo(
    () => students.map((s) => studentLinkProblems(s, payload, catalog)),
    // payload inteiro mudaria a cada tecla; só plano, turma, modalidade e alunos importam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, payload.plans, payload.classes, payload.academy.modalities, catalog],
  );

  const counts = useMemo(() => {
    let pending = 0;
    let noPlan = 0;
    let noClass = 0;
    let noBelt = 0;
    students.forEach((s, i) => {
      if (hasProblem(problems[i])) pending += 1;
      if (!s.plan?.trim()) noPlan += 1;
      if (splitClasses(s.classes).length === 0) noClass += 1;
      if (!s.belt?.trim()) noBelt += 1;
    });
    return { pending, noPlan, noClass, noBelt };
  }, [students, problems]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: number[] = [];
    students.forEach((s, i) => {
      if (q && !s.full_name.toLowerCase().includes(q)) return;
      if (filter === "pending" && !hasProblem(problems[i])) return;
      if (filter === "no_plan" && s.plan?.trim()) return;
      if (filter === "no_class" && splitClasses(s.classes).length > 0) return;
      if (filter === "no_belt" && s.belt?.trim()) return;
      out.push(i);
    });
    return out;
  }, [students, problems, filter, search]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageRows = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  function setStudents(next: ImplementationStudent[]) {
    update({ students: next });
  }
  function patchStudent(index: number, patch: Record<string, string>) {
    setStudents(students.map((s, i) => (i === index ? withPatch(s, patch) : s)));
  }
  function removeStudents(indexes: Set<number>) {
    setStudents(students.filter((_, i) => !indexes.has(i)));
    setSelected(new Set());
  }

  async function onFile(file: File) {
    setBusy(true);
    setErrors([]);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Arquivo máximo: 10 MB.");
      const parsed = await parseStudentsFile(file, true, true);
      if (!parsed.length)
        throw new Error(
          "Nenhum aluno encontrado. Confira se a primeira linha tem os títulos do modelo.",
        );
      if (parsed.length > 2000) throw new Error("Máximo de 2.000 alunos por implantação.");
      const rows = parsed.map((row) =>
        linkImportedStudent(normalizeImplementationStudent(row), payload, catalog ?? new Map()),
      );
      const problemsInFile = validateImplementationStudents(rows);
      if (problemsInFile.length) {
        setErrors(problemsInFile);
        return;
      }
      if (
        students.length > 0 &&
        !window.confirm(
          "A planilha nova substitui a lista atual. O plano, as turmas e a faixa que você já escolheu ficam guardados para os alunos com o mesmo nome. Continuar?",
        )
      )
        return;
      const merged = keepStudentLinks(rows, students);
      setStudents(merged.rows as ImplementationStudent[]);
      setSelected(new Set());
      setPage(0);
      setFilter("all");
      toast.success(
        `${merged.rows.length} alunos carregados.` +
          (merged.kept ? ` Escolhas mantidas para ${merged.kept}.` : "") +
          " Agora escolha plano, turmas e faixa de cada um.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Arquivo inválido.");
    } finally {
      setBusy(false);
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i));

  return (
    <div className="space-y-4">
      <StepGuide title="Como cadastrar os alunos">
        <ol>
          <li>
            <strong>Baixe o modelo</strong> e preencha só os dados pessoais, uma linha por aluno
            (apenas o nome é obrigatório). Pode usar Excel ou Google Planilhas e salvar como .xlsx
            ou .csv.
          </li>
          <li>
            <strong>Envie a planilha</strong> aqui. Não tem planilha? Adicione os alunos pelo nome,
            logo abaixo.
          </li>
          <li>
            Na lista, <strong>escolha o plano, as turmas, a faixa e o vencimento</strong> de cada
            aluno. As opções são os planos e turmas que você cadastrou e as faixas das modalidades
            da academia — não precisa digitar nada.
          </li>
        </ol>
        <p>
          Dica: marque vários alunos e use <strong>Aplicar aos selecionados</strong> para escolher
          de uma vez (ex.: todos da turma Adulto no plano Mensal). Aluno sem plano entra sem
          matrícula e sem mensalidade; sem faixa, entra sem graduação.
        </p>
        <p>
          Turma com mais de um horário? Escolha também <strong>o horário do aluno</strong>: ele fica
          registrado nas observações do cadastro do aluno.
        </p>
      </StepGuide>

      {(planNames.length === 0 || classNames.length === 0) && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {planNames.length === 0 && classNames.length === 0
            ? "Cadastre os planos e as turmas nas etapas anteriores para poder escolhê-los aqui."
            : planNames.length === 0
              ? "Cadastre os planos na etapa Planos para poder escolhê-los aqui."
              : "Cadastre as turmas na etapa Turmas para poder escolhê-las aqui."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => downloadImplementationStudentsTemplate()}>
          <Download /> Baixar modelo
        </Button>
        <Button
          variant="outline"
          disabled={busy || beltsLoading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload /> {busy ? "Lendo…" : students.length ? "Trocar planilha" : "Enviar planilha"}
        </Button>
        {students.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm(`Remover os ${students.length} alunos da lista?`))
                removeStudents(new Set(students.map((_, i) => i)));
            }}
          >
            <Trash2 /> Remover todos
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        aria-label="Planilha de alunos"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await onFile(file);
        }}
      />

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim().replace(/\s+/g, " ");
          if (name.length < 2) {
            toast.error("Digite o nome do aluno (ao menos 2 letras).");
            return;
          }
          if (students.length >= 2000) {
            toast.error("Máximo de 2.000 alunos por implantação.");
            return;
          }
          setStudents([...students, { full_name: name } as ImplementationStudent]);
          setNewName("");
          setFilter("all");
          setSearch("");
          setPage(Math.floor(students.length / PAGE_SIZE));
        }}
      >
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label htmlFor="impl-new-student">Adicionar aluno pelo nome</Label>
          <Input
            id="impl-new-student"
            maxLength={200}
            value={newName}
            placeholder="Nome completo"
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          <Plus /> Adicionar
        </Button>
      </form>

      {errors.length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          <p className="font-medium">Corrija a planilha e envie de novo:</p>
          <ul className="max-h-40 list-disc overflow-auto pl-5">
            {errors.slice(0, 50).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {students.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar alunos">
            {(
              [
                ["all", `Todos (${students.length})`],
                ["pending", `Para corrigir (${counts.pending})`],
                ["no_plan", `Sem plano (${counts.noPlan})`],
                ["no_class", `Sem turma (${counts.noClass})`],
                ["no_belt", `Sem faixa (${counts.noBelt})`],
              ] as Array<[Filter, string]>
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                aria-pressed={filter === value}
                className={cn(
                  value === "pending" &&
                    counts.pending > 0 &&
                    filter !== value &&
                    "text-destructive",
                )}
                onClick={() => {
                  setFilter(value);
                  setPage(0);
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          {counts.pending > 0 && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {counts.pending === 1 ? "1 aluno tem" : `${counts.pending} alunos têm`} plano, turma
              ou faixa que não está nas suas listas (em vermelho). Escolha a opção certa ou deixe em
              branco.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(visible) : new Set())}
              />
              Selecionar {filter === "all" && !search ? "todos" : "os filtrados"} ({visible.length})
            </label>
            <Input
              aria-label="Buscar aluno pelo nome"
              placeholder="Buscar pelo nome"
              className="h-9 max-w-xs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>

          {selected.size > 0 && (
            <BulkBar
              count={selected.size}
              planNames={planNames}
              classNames={classNames}
              classTimes={classTimes}
              modalities={modalities}
              catalog={catalog}
              defaultDue={payload.billing.due_day_default}
              onClear={() => setSelected(new Set())}
              onRemove={() => {
                if (window.confirm(`Remover ${selected.size} aluno(s) da lista?`))
                  removeStudents(selected);
              }}
              onApply={(patch, addClass, addClassTime) => {
                setStudents(
                  students.map((s, i) => {
                    if (!selected.has(i)) return s;
                    const extra: Record<string, string> = {};
                    if (addClass) {
                      const list = splitClasses(s.classes);
                      if (!list.some((c) => key(c) === key(addClass))) list.push(addClass);
                      extra.classes = list.join("; ");
                      if (addClassTime)
                        extra.class_times = withClassTime(s.class_times, addClass, addClassTime);
                    }
                    return withPatch(s, { ...patch, ...extra });
                  }),
                );
                toast.success(`Aplicado a ${selected.size} aluno(s).`);
              }}
            />
          )}

          <ul className="space-y-2" aria-label="Alunos">
            {pageRows.map((index) => (
              <StudentRow
                key={index}
                student={students[index]}
                problems={problems[index]}
                selected={selected.has(index)}
                onSelect={(on) => {
                  const next = new Set(selected);
                  if (on) next.add(index);
                  else next.delete(index);
                  setSelected(next);
                }}
                onPatch={(patch) => patchStudent(index, patch)}
                onRemove={() => removeStudents(new Set([index]))}
                planNames={planNames}
                classNames={classNames}
                classTimes={classTimes}
                modalities={modalities}
                catalog={catalog}
                beltsLoading={beltsLoading}
                defaultDue={payload.billing.due_day_default}
              />
            ))}
          </ul>
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum aluno neste filtro.</p>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label="Páginas de alunos">
              <Button
                variant="outline"
                size="sm"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {current + 1} de {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
              >
                Próxima
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ Linha do aluno ------------------------------ */

type RowProps = {
  student: ImplementationStudent;
  problems: StudentLinkProblems;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onPatch: (patch: Record<string, string>) => void;
  onRemove: () => void;
  planNames: string[];
  classNames: string[];
  classTimes: ClassTimes;
  modalities: string[];
  catalog: BeltCatalog | null;
  beltsLoading: boolean;
  defaultDue: number;
};

function StudentRow({
  student: s,
  problems,
  selected,
  onSelect,
  onPatch,
  onRemove,
  planNames,
  classNames,
  classTimes,
  modalities,
  catalog,
  beltsLoading,
  defaultDue,
}: RowProps) {
  const name = s.full_name || "aluno";
  const belt = catalog ? findStudentBelt(catalog, s.belt, s.modality, modalities) : null;
  const modality = s.modality
    ? normalizeModality(s.modality)
    : belt
      ? normalizeModality(belt.modality)
      : modalities.length === 1
        ? modalities[0]
        : "";
  const belts = catalog?.get(modality) ?? [];
  const planValue = !s.plan?.trim()
    ? ""
    : problems.plan
      ? UNKNOWN
      : (planNames.find((p) => key(p) === key(s.plan)) ?? UNKNOWN);
  const beltValue = !s.belt?.trim() ? "" : belt ? belt.name : UNKNOWN;
  const flagged = hasProblem(problems);
  const nameShort = s.full_name.trim().length < 2;
  // Turmas do aluno com mais de um horário: o dono pode dizer qual ele faz.
  const timeChoices = splitClasses(s.classes)
    .map((className) => ({ className, options: classTimes.get(key(className)) ?? [] }))
    .filter((c) => c.options.length > 1);

  return (
    <li
      className={cn(
        "space-y-2 rounded-md border p-3",
        flagged && "border-destructive/50 bg-destructive/5",
        selected && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Selecionar ${name}`}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <Input
          aria-label="Nome do aluno"
          aria-invalid={nameShort || undefined}
          className={cn("h-9 min-w-[12rem] flex-1", nameShort && "border-destructive")}
          maxLength={200}
          value={s.full_name}
          onChange={(e) => onPatch({ full_name: e.target.value })}
        />
        <select
          aria-label={`Situação de ${name}`}
          className={cn(selectClass, "w-32")}
          value={s.status ?? "active"}
          onChange={(e) => onPatch({ status: e.target.value })}
        >
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
          <option value="frozen">Trancado</option>
        </select>
        <Button variant="ghost" size="icon" aria-label={`Remover ${name}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.7fr_0.8fr]">
        <Cell label="Plano">
          <select
            aria-label={`Plano de ${name}`}
            aria-invalid={problems.plan || undefined}
            className={cn(selectClass, problems.plan && "border-destructive text-destructive")}
            value={planValue}
            onChange={(e) => e.target.value !== UNKNOWN && onPatch({ plan: e.target.value })}
          >
            <option value="">Sem plano</option>
            {planValue === UNKNOWN && <option value={UNKNOWN}>⚠ {s.plan} (não cadastrado)</option>}
            {planNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Cell>

        <Cell label="Turmas">
          <ClassPicker
            name={name}
            value={s.classes}
            classNames={classNames}
            unknown={problems.classes}
            onChange={(classes) =>
              onPatch({ classes, class_times: pruneClassTimes(s.class_times, classes) })
            }
          />
        </Cell>

        <Cell label="Modalidade, faixa e grau">
          <div className="grid grid-cols-[1fr_1.2fr_0.9fr] gap-1">
            <select
              aria-label={`Modalidade da faixa de ${name}`}
              className={selectClass}
              value={modality}
              onChange={(e) => onPatch({ modality: e.target.value, belt: "", degree: "" })}
            >
              <option value="">Modalidade</option>
              {modality && !modalities.includes(modality) && (
                <option value={modality}>{modalityLabel(modality)}</option>
              )}
              {modalities.map((m) => (
                <option key={m} value={m}>
                  {modalityLabel(m)}
                </option>
              ))}
            </select>
            <select
              aria-label={`Faixa de ${name}`}
              aria-invalid={problems.belt || undefined}
              className={cn(selectClass, problems.belt && "border-destructive text-destructive")}
              value={beltValue}
              disabled={!catalog || (!modality && beltValue === "")}
              onChange={(e) => {
                const value = e.target.value;
                if (value === UNKNOWN) return;
                if (!value) return onPatch({ belt: "", degree: "" });
                const next = belts.find((b) => b.name === value);
                if (!next) return;
                const degree = Number(s.degree ?? 0);
                onPatch({
                  belt: next.name,
                  modality: next.modality,
                  degree: degree > 0 && degree <= next.max_degrees ? String(degree) : "",
                });
              }}
            >
              <option value="">
                {beltsLoading
                  ? "Carregando…"
                  : !catalog
                    ? "Indisponível"
                    : modality && belts.length === 0
                      ? "Sem faixas"
                      : "Sem faixa"}
              </option>
              {beltValue === UNKNOWN && (
                <option value={UNKNOWN}>⚠ {s.belt} (não encontrada)</option>
              )}
              {belts.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.kids ? " (infantil)" : ""}
                </option>
              ))}
            </select>
            <select
              aria-label={`Grau de ${name}`}
              className={selectClass}
              value={s.degree ?? ""}
              disabled={!belt || belt.max_degrees === 0}
              onChange={(e) => onPatch({ degree: e.target.value })}
            >
              <option value="">{belt && belt.max_degrees > 0 ? "Sem grau" : "—"}</option>
              {belt &&
                Array.from({ length: belt.max_degrees }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}º grau
                  </option>
                ))}
            </select>
          </div>
        </Cell>

        <Cell label="Vencimento">
          <select
            aria-label={`Dia de vencimento de ${name}`}
            className={selectClass}
            value={s.due_day ?? ""}
            onChange={(e) => onPatch({ due_day: e.target.value })}
          >
            <option value="">Padrão (dia {defaultDue})</option>
            {DAYS.map((d) => (
              <option key={d} value={String(d)}>
                Dia {d}
              </option>
            ))}
          </select>
        </Cell>
      </div>

      {timeChoices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {timeChoices.map(({ className, options }) => {
            const current = studentClassTime(s.class_times, className);
            return (
              <label
                key={className}
                className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-muted-foreground sm:max-w-xs"
              >
                Horário em {className}
                <select
                  className={selectClass}
                  value={current}
                  onChange={(e) =>
                    onPatch({
                      class_times: withClassTime(s.class_times, className, e.target.value),
                    })
                  }
                >
                  <option value="">Não informado</option>
                  {current && !options.includes(current) && (
                    <option value={current}>⚠ {current} (horário mudou na turma)</option>
                  )}
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </li>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="text-xs text-muted-foreground" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function ClassPicker({
  name,
  value,
  classNames,
  unknown,
  onChange,
}: {
  name: string;
  value: string | undefined;
  classNames: string[];
  unknown: string[];
  onChange: (classes: string) => void;
}) {
  const list = splitClasses(value);
  const has = (c: string) => list.some((x) => key(x) === key(c));
  const toggle = (c: string, on: boolean) =>
    onChange((on ? [...list, c] : list.filter((x) => key(x) !== key(c))).join("; "));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Turmas de ${name}`}
          className={cn(
            "h-9 w-full justify-between px-2 font-normal",
            unknown.length > 0 && "border-destructive text-destructive",
          )}
        >
          <span className="truncate">{list.length ? list.join(", ") : "Sem turma"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        <p className="text-xs text-muted-foreground">Marque uma ou mais turmas</p>
        {classNames.length === 0 && (
          <p className="text-sm">Nenhuma turma cadastrada na etapa Turmas.</p>
        )}
        {classNames.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={has(c)} onChange={(e) => toggle(c, e.target.checked)} />
            {c}
          </label>
        ))}
        {unknown.map((c) => (
          <label key={c} className="flex items-center gap-2 text-sm text-destructive">
            <input type="checkbox" checked onChange={() => toggle(c, false)} />⚠ {c} (não cadastrada
            — desmarque)
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------ Em massa ------------------------------ */

function BulkBar({
  count,
  planNames,
  classNames,
  classTimes,
  modalities,
  catalog,
  defaultDue,
  onApply,
  onClear,
  onRemove,
}: {
  count: number;
  planNames: string[];
  classNames: string[];
  classTimes: ClassTimes;
  modalities: string[];
  catalog: BeltCatalog | null;
  defaultDue: number;
  onApply: (
    patch: Record<string, string>,
    addClass: string | null,
    addClassTime: string | null,
  ) => void;
  onClear: () => void;
  onRemove: () => void;
}) {
  const [plan, setPlan] = useState(KEEP);
  const [addClass, setAddClass] = useState(KEEP);
  const [addClassTime, setAddClassTime] = useState("");
  const addClassOptions = addClass === KEEP ? [] : (classTimes.get(key(addClass)) ?? []);
  const [modality, setModality] = useState(modalities.length === 1 ? modalities[0] : "");
  const [belt, setBelt] = useState(KEEP);
  const [degree, setDegree] = useState("");
  const [due, setDue] = useState(KEEP);
  const belts = catalog?.get(modality) ?? [];
  const chosenBelt = belts.find((b) => b.name === belt) ?? null;
  const nothing = plan === KEEP && addClass === KEEP && belt === KEEP && due === KEEP;

  return (
    <section
      aria-label="Aplicar aos selecionados"
      className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
    >
      <p className="text-sm font-medium">
        {count} aluno(s) selecionado(s) — escolha o que aplicar a todos:
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="Plano">
          <select
            aria-label="Plano para os selecionados"
            className={selectClass}
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value={KEEP}>Não alterar</option>
            <option value={NONE}>Sem plano</option>
            {planNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Incluir na turma">
          <select
            aria-label="Incluir os selecionados na turma"
            className={selectClass}
            value={addClass}
            onChange={(e) => {
              setAddClass(e.target.value);
              setAddClassTime("");
            }}
          >
            <option value={KEEP}>Não alterar</option>
            {classNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {addClassOptions.length > 1 && (
            <select
              aria-label={`Horário em ${addClass} para os selecionados`}
              className={cn(selectClass, "mt-1")}
              value={addClassTime}
              onChange={(e) => setAddClassTime(e.target.value)}
            >
              <option value="">Horário: não informado</option>
              {addClassOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </Cell>
        <Cell label="Faixa e grau">
          <div className="grid grid-cols-[1fr_1.2fr_0.9fr] gap-1">
            <select
              aria-label="Modalidade da faixa para os selecionados"
              className={selectClass}
              value={modality}
              onChange={(e) => {
                setModality(e.target.value);
                setBelt(KEEP);
                setDegree("");
              }}
            >
              <option value="">Modalidade</option>
              {modalities.map((m) => (
                <option key={m} value={m}>
                  {modalityLabel(m)}
                </option>
              ))}
            </select>
            <select
              aria-label="Faixa para os selecionados"
              className={selectClass}
              value={belt}
              disabled={!catalog}
              onChange={(e) => {
                setBelt(e.target.value);
                setDegree("");
              }}
            >
              <option value={KEEP}>Não alterar</option>
              <option value={NONE}>Sem faixa</option>
              {belts.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.kids ? " (infantil)" : ""}
                </option>
              ))}
            </select>
            <select
              aria-label="Grau para os selecionados"
              className={selectClass}
              value={degree}
              disabled={!chosenBelt || chosenBelt.max_degrees === 0}
              onChange={(e) => setDegree(e.target.value)}
            >
              <option value="">
                {chosenBelt && chosenBelt.max_degrees > 0 ? "Sem grau" : "—"}
              </option>
              {chosenBelt &&
                Array.from({ length: chosenBelt.max_degrees }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}º grau
                  </option>
                ))}
            </select>
          </div>
        </Cell>
        <Cell label="Vencimento">
          <select
            aria-label="Dia de vencimento para os selecionados"
            className={selectClass}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          >
            <option value={KEEP}>Não alterar</option>
            <option value="">Padrão (dia {defaultDue})</option>
            {DAYS.map((d) => (
              <option key={d} value={String(d)}>
                Dia {d}
              </option>
            ))}
          </select>
        </Cell>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={nothing}
          onClick={() => {
            const patch: Record<string, string> = {};
            if (plan !== KEEP) patch.plan = plan === NONE ? "" : plan;
            if (belt === NONE) Object.assign(patch, { belt: "", degree: "" });
            else if (chosenBelt)
              Object.assign(patch, {
                belt: chosenBelt.name,
                modality: chosenBelt.modality,
                degree,
              });
            if (due !== KEEP) patch.due_day = due;
            onApply(
              patch,
              addClass === KEEP ? null : addClass,
              addClass === KEEP ? null : addClassTime || null,
            );
          }}
        >
          Aplicar aos selecionados
        </Button>
        <Button size="sm" variant="outline" onClick={onClear}>
          Limpar seleção
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 /> Remover selecionados
        </Button>
      </div>
    </section>
  );
}

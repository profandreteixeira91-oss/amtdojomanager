import { formatDegree, degreeSuffix, degreeUnit, formatBeltFull } from "@/lib/dojo/degree-label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  listDojoStudents,
  saveDojoStudent,
  deleteDojoStudent,
  listDojoBelts,
  listDojoUnits,
  listDojoPlans,
  enrollStudentWithPlan,
  bulkImportDojoStudents,
  addDojoGraduation,
} from "@/lib/dojo/dojo.functions";
import { addClassStudent, listClasses, syncStudentClasses } from "@/lib/dojo/schedule.functions";
import { paymentMethodLabel, normalizePlanPaymentMethods } from "@/lib/dojo/payment-methods";
import { getMyAsaasConfig } from "@/lib/asaas/asaas.functions";
import { isAsaasReady } from "@/lib/dojo/amt-pay-status";
import { getMyAcademySlug } from "@/lib/dojo/academy-public.functions";
import { listContractTemplates, generateStudentContract, getMyAcademyForContract } from "@/lib/dojo/contracts.functions";
import { buildContractValues, resolveContractHtml } from "@/lib/dojo/contracts-variables";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sanitizeHtml } from "@/lib/security/sanitize-html";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentPhotoCapture } from "@/components/dojo/StudentPhotoCapture";
import { BeltAuto } from "@/components/dojo/BeltSpecVisual";

import { useDojoBranding } from "@/hooks/useDojoBranding";
import { downloadStudentsTemplate, parseStudentsFile, type ParsedStudentRow } from "@/lib/dojo/students-xlsx";
import autismIcon from "@/assets/autism-tea.png.asset.json";
import { printAllStudentSummaries } from "@/lib/dojo/students-bulk-print";
import { maskCPF, maskCEP, maskPhone, clampDueDay, isValidCPF, isValidCEP, isValidPhone, parseAmountBR } from "@/lib/br-masks";
import { toast } from "sonner";
import { Trash2, Pencil, UserPlus, FileDown, Upload, Printer, User, MapPin, Phone, Award, Wallet, HeartPulse, Camera, ShieldCheck, FileText, Users, UserCheck, Snowflake, UserX, Search, Sparkles, Link as LinkIcon, Copy, ExternalLink, Check, AlertCircle, Loader2, X, ChevronLeft, ChevronRight, IdCard, Droplet, Baby, Mail, LifeBuoy, Building2, StickyNote, Stethoscope, BadgeCheck, Fingerprint, ClipboardCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayISO, brl } from "@/lib/format";
import { currentBeltEntries, rankedBelts, beltLabel, beltEntryKey } from "@/lib/dojo/current-belts";
import { studentStatusLabel, studentStatusTone, type StudentStatusTone } from "@/lib/dojo/student-status";
import { modalityLabel } from "@/lib/dojo/modalities";
import { RouteErrorCard } from "@/components/dojo/SectionErrorBoundary";
import { CurrencyInput, currencyText } from "@/components/ui/currency-input";


export const Route = createFileRoute("/dojo/app/students/")({
  head: () => ({ meta: [{ title: "Alunos — AMT Dojo Manager" }] }),
  component: StudentsPage,
  // Erro na listagem/edição fica restrito a esta tela, com a mensagem real.
  errorComponent: ({ error, reset }) => (
    <RouteErrorCard
      title="Não foi possível abrir a lista de alunos."
      message={error instanceof Error ? error.message : String(error)}
      onRetry={reset}
      backTo="/dojo/app"
      backLabel="Voltar ao painel"
    />
  ),
});

/** Metadados visuais das etapas do cadastro de aluno. */
const STEP_META: Record<
  string,
  { label: string; title: string; hint: string; description: string; icon: ComponentType<{ className?: string }> }
> = {
  dados: { label: "Dados", title: "Dados pessoais", hint: "Identificação e responsável", description: "Quem é o aluno — e o responsável legal, se for menor de idade.", icon: User },
  endereco: { label: "Endereço", title: "Endereço", hint: "O CEP preenche o resto", description: "Onde o aluno mora. Basta o CEP para completar o endereço.", icon: MapPin },
  contato: { label: "Contatos", title: "Contatos", hint: "Aluno e emergência", description: "Como falar com o aluno e quem avisar numa emergência.", icon: Phone },
  dojo: { label: "Dojo", title: "Dojo e graduação", hint: "Unidade, faixas e turmas", description: "Unidade, modalidades, faixa atual e turmas do aluno.", icon: Award },
  plano: { label: "Plano", title: "Plano e cobrança", hint: "Matrícula e 1ª mensalidade", description: "Plano contratado, vencimento e forma de pagamento.", icon: Wallet },
  anamnese: { label: "Anamnese", title: "Anamnese", hint: "Saúde e liberação médica", description: "Informações de saúde para uma prática segura.", icon: HeartPulse },
  foto: { label: "Foto", title: "Foto", hint: "Ficha e reconhecimento facial", description: "Foto para a ficha, o app do aluno e o check-in facial.", icon: Camera },
  consent: { label: "Consentimentos", title: "Consentimentos", hint: "LGPD e termos", description: "Autorizações exigidas para concluir o cadastro.", icon: ShieldCheck },
  contrato: { label: "Contrato", title: "Contrato", hint: "Gerado ao concluir", description: "Contrato de prestação de serviços gerado automaticamente.", icon: FileText },
};

/** Select nativo com o mesmo visual do <Input>. */
const SELECT_CLS =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-base shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/** Idade completa a partir de AAAA-MM-DD (null se vazia ou inválida). */
const STATUS_PILL: Record<StudentStatusTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
  muted: "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-500/20",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
  info: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20",
};

function ageFrom(birth: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

type StudentForm = {
  id?: string;
  full_name: string;
  cpf: string;
  rg: string;
  birth_date: string;
  gender: string;
  nationality: string;
  marital_status: string;
  profession: string;
  blood_type: string;
  health_insurance: string;
  email: string;
  phone: string;
  zip: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  guardian_name: string;
  guardian_rg: string;
  guardian_cpf: string;
  guardian_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  unit_id: string | null;
  current_belt_id: string | null;
  current_degree: number | string;
  modalities: Array<{ modality: string; belt_id: string; degree: number; class_ids?: string[] }>;
  status: "active" | "inactive" | "frozen";
  notes: string;
  photo_url: string | null;
  has_medical_clearance: boolean;
  medical_clearance_date: string;
  lgpd_consent: boolean;
  facial_recognition_consent: boolean;
  image_rights_consent: boolean;
  terms_accepted: boolean;
  anamnesis: {
    medical_conditions?: string;
    medications?: string;
    allergies?: string;
    surgeries?: string;
    injuries?: string;
    physical_activity_level?: string;
    objectives?: string;
    smoking?: boolean;
    alcohol?: boolean;
    heart_issues?: boolean;
    diabetes?: boolean;
    hypertension?: boolean;
    asthma?: boolean;
    pregnant?: boolean;
    other?: string;
  };
};

const emptyForm: StudentForm = {
  full_name: "",
  cpf: "",
  rg: "",
  birth_date: "",
  gender: "",
  nationality: "Brasileira",
  marital_status: "",
  profession: "",
  blood_type: "",
  health_insurance: "",
  email: "",
  phone: "",
  zip: "",
  street: "",
  address_number: "",
  address_complement: "",
  neighborhood: "",
  city: "",
  state: "",
  guardian_name: "",
  guardian_rg: "",
  guardian_cpf: "",
  guardian_phone: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  unit_id: null,
  current_belt_id: null,
  current_degree: 0,
  status: "active",
  notes: "",
  photo_url: null,
  has_medical_clearance: false,
  medical_clearance_date: "",
  lgpd_consent: false,
  facial_recognition_consent: false,
  image_rights_consent: false,
  terms_accepted: false,
  anamnesis: {},
  modalities: [],
};

function StudentsPage() {
  const listFn = useServerFn(listDojoStudents);
  const saveFn = useServerFn(saveDojoStudent);
  const delFn = useServerFn(deleteDojoStudent);
  const beltsFn = useServerFn(listDojoBelts);
  const unitsFn = useServerFn(listDojoUnits);
  const plansFn = useServerFn(listDojoPlans);
  const enrollFn = useServerFn(enrollStudentWithPlan);
  const bulkImportFn = useServerFn(bulkImportDojoStudents);
  const addGradFn = useServerFn(addDojoGraduation);
  const listClassesFn = useServerFn(listClasses);
  const syncClassesFn = useServerFn(syncStudentClasses);
  const { data: branding } = useDojoBranding();
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ParsedStudentRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [beltFilter, setBeltFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("");
  const classes = useQuery({ queryKey: ["dojo-classes"], queryFn: () => listClassesFn() });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  // Pré-cadastro da matrícula online sendo analisado: salvar = aprovar (aluno ativo + plano).
  const [approving, setApproving] = useState(false);
  useEffect(() => {
    if (!open) setApproving(false);
  }, [open]);
  // Snapshot das modalidades/graduações carregadas ao abrir o modal — usado para
  // detectar o que foi adicionado/alterado e registrar as graduações no salvar.
  const initialModsRef = useRef<string[]>([]);
  const [tab, setTab] = useState<string>("dados");
  const tabOrder = ["dados", "endereco", "contato", "dojo", "plano", "anamnese", "foto", "consent", "contrato"];

  const tabIndex = Math.max(0, tabOrder.indexOf(tab));
  const isLastTab = tabIndex >= tabOrder.length - 1;
  // Etapas visitadas (para marcar concluídas/pendentes), etapa barrada no
  // "Continuar", trava contra duplo clique no salvar e rolagem ao trocar etapa.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(["dados"]));
  const [flaggedStep, setFlaggedStep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const stepScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) {
      setTab("dados");
      setVisited(new Set(["dados"]));
      setFlaggedStep(null);
    }
  }, [open]);
  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
    stepScrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  const [enrollment, setEnrollment] = useState({
    plan_id: "",
    due_day: 5,
    start_date: todayISO(),
    first_due_date: todayISO(),
    include_enrollment_fee: true,
    payment_method: "manual" as string,
    custom_amount: "" as string,
  });

  // ===== Contrato no ato da matrícula =====
  const [contractSel, setContractSel] = useState<{ template_id: string; title: string }>({ template_id: "", title: "" });
  const contractTplFn = useServerFn(listContractTemplates);
  const contractAcademyFn = useServerFn(getMyAcademyForContract);
  const generateContractFn = useServerFn(generateStudentContract);
  const contractTemplates = useQuery({
    queryKey: ["contract-templates"],
    queryFn: () => contractTplFn(),
    staleTime: 60_000,
  });
  const contractAcademy = useQuery({
    queryKey: ["contract-academy-profile"],
    queryFn: () => contractAcademyFn(),
    staleTime: 300_000,
  });

  const q = useQuery({ queryKey: ["dojo-students"], queryFn: () => listFn() });
  const belts = useQuery({ queryKey: ["dojo-belts"], queryFn: () => beltsFn() });
  const units = useQuery({ queryKey: ["dojo-units"], queryFn: () => unitsFn() });
  const plans = useQuery({ queryKey: ["dojo-plans"], queryFn: () => plansFn() });
  const amtPayFn = useServerFn(getMyAsaasConfig);
  const amtPayCfg = useQuery({ queryKey: ["dojo-amtpay-status"], queryFn: () => amtPayFn(), staleTime: 60_000 });
  const amtPayActive = isAsaasReady((amtPayCfg.data as any)?.onboardingStatus);

  const slugFn = useServerFn(getMyAcademySlug);
  const slugQ = useQuery({ queryKey: ["dojo-my-slug"], queryFn: () => slugFn(), staleTime: 300_000 });
  const [enrollLinkOpen, setEnrollLinkOpen] = useState(false);
  const enrollUrl = (() => {
    const slug = (slugQ.data as any)?.slug;
    if (!slug) return "";
    if (typeof window === "undefined") return `/matricula/${slug}`;
    return `${window.location.origin}/matricula/${slug}`;
  })();


  useEffect(() => {
    if (!q.data) return;
    let editId: string | null = null;
    try { editId = sessionStorage.getItem("dojo-edit-student"); } catch {}
    if (!editId) return;
    const target = (q.data as any[]).find((s) => s.id === editId);
    if (target) {
      openEdit(target);
      try { sessionStorage.removeItem("dojo-edit-student"); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const filtered = (q.data ?? []).filter((s: any) => {
    if (s.status === "pending") return false;
    if (status !== "all" && s.status !== status) return false;
    if (beltFilter !== "all" && s.current_belt_id !== beltFilter) return false;
    if (unitFilter !== "all" && s.unit_id !== unitFilter) return false;
    if (cityFilter && !(s.city ?? "").toLowerCase().includes(cityFilter.toLowerCase())) return false;
    if (search) {
      const term = search.toLowerCase();
      const hay = [s.full_name, s.email, s.phone, s.cpf, s.rg, s.guardian_name, s.belt?.name, s.unit?.name]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, status, beltFilter, unitFilter, cityFilter]);


  function set<K extends keyof StudentForm>(key: K, val: StudentForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }
  function setAnamn<K extends keyof StudentForm["anamnesis"]>(key: K, val: StudentForm["anamnesis"][K]) {
    setForm((f) => ({ ...f, anamnesis: { ...f.anamnesis, [key]: val } }));
  }

  function openNew() {
    setForm(emptyForm);
    initialModsRef.current = [];
    setEnrollment({
      plan_id: "",
      due_day: 5,
      start_date: todayISO(),
      first_due_date: todayISO(),
      include_enrollment_fee: true,
      payment_method: "manual",
      custom_amount: "",
    });
    setOpen(true);
  }
  function resetEnrollment() {
    setEnrollment({
      plan_id: "",
      due_day: 5,
      start_date: todayISO(),
      first_due_date: todayISO(),
      include_enrollment_fee: true,
      payment_method: "manual",
      custom_amount: "",
    });
    setContractSel({ template_id: "", title: "" });
  }
  function openEdit(s: any) {
    // Todas as modalidades do aluno (graduação mais recente de cada uma),
    // calculadas no servidor em `current_belts`. Fallback: faixa principal.
    const modalities: StudentForm["modalities"] = [];
    const cbs = currentBeltEntries(s);
    for (const cb of cbs) {
      if (!cb?.belt?.id && (!cb?.class_ids || cb.class_ids.length === 0)) continue;
      modalities.push({
        modality: cb.modality ?? cb.belt?.modality ?? "jiu-jitsu",
        belt_id: cb.belt?.id ?? "",
        degree: Number(cb.degree ?? 0),
        class_ids: cb.class_ids ?? [],
      });
    }
    if (modalities.length === 0 && s.current_belt_id) {
      modalities.push({
        modality: s.belt?.modality ?? "jiu-jitsu",
        belt_id: s.current_belt_id,
        degree: Number(s.current_degree ?? 0),
        class_ids: [],
      });
    }

    // Colunas de texto nulas no banco (comum em alunos da matrícula online, da
    // importação por planilha ou do app) sobrescreviam os "" do formulário e o
    // assistente quebrava em `form.city.trim()` / `form.email.trim()` ao abrir
    // a edição. O save já converte "" de volta em null, então nada muda no banco.
    const textDefaults: Record<string, string> = {};
    for (const [k, v] of Object.entries(emptyForm)) {
      if (typeof v === "string") textDefaults[k] = s[k] == null ? v : String(s[k]);
    }

    setForm({
      ...emptyForm,
      ...s,
      ...textDefaults,
      current_degree: s.current_degree ?? 0,
      anamnesis: s.anamnesis ?? {},
      medical_clearance_date: s.medical_clearance_date ?? "",
      birth_date: s.birth_date ?? "",
      // Exibição já formatada nos padrões brasileiros
      cpf: maskCPF(s.cpf ?? ""),
      zip: maskCEP(s.zip ?? ""),
      phone: maskPhone(s.phone ?? ""),
      guardian_rg: s.guardian_rg ?? "",
      guardian_cpf: maskCPF(s.guardian_cpf ?? ""),
      guardian_phone: maskPhone(s.guardian_phone ?? ""),
      emergency_contact_phone: maskPhone(s.emergency_contact_phone ?? ""),
      modalities,
    });
    initialModsRef.current = modalities.map((m) => `${m.belt_id}:${m.degree}`);
    resetEnrollment();
    setOpen(true);
  }


  /** O que falta na etapa (null = ok). Mesmas regras de antes, sem disparar toast. */
  const stepIssue = (step: string): string | null => {
    if (step === "dados") {
      if (!form.full_name.trim()) return "Informe o nome completo do aluno";
      if (form.cpf && !isValidCPF(form.cpf)) return "CPF inválido";
      if (!form.birth_date) return "Informe a data de nascimento";
      if (form.guardian_cpf && !isValidCPF(form.guardian_cpf)) return "CPF do responsável inválido";
      return null;
    }
    if (step === "endereco") {
      if (form.zip && !isValidCEP(form.zip)) return "CEP inválido";
      if (!form.city.trim() || !form.state.trim()) return "Informe ao menos cidade e estado";
      return null;
    }
    if (step === "contato") {
      if (!form.phone.trim() && !form.email.trim()) return "Informe telefone ou e-mail do aluno";
      if (form.phone && !isValidPhone(form.phone)) return "Telefone inválido";
      return null;
    }
    if (step === "dojo") {
      const valid = (form.modalities ?? []).filter((m) => m.modality && m.belt_id);
      if (valid.length === 0) return "Adicione ao menos uma modalidade com faixa";
      return null;
    }
    if (step === "plano") {
      if (!form.id && !enrollment.plan_id) return "Selecione um plano para o aluno";
      return null;
    }
    if (step === "consent") {
      if (!form.lgpd_consent || !form.terms_accepted || !form.facial_recognition_consent) {
        return "Registre os consentimentos obrigatórios: LGPD, biometria facial e termos";
      }
      return null;
    }
    return null;
  };

  // Valida a etapa atual antes de permitir avançar (apenas no cadastro de novo aluno).
  // Os consentimentos continuam sendo exigidos só ao concluir, como antes.
  const validateStep = (step: string): boolean => {
    if (step === "consent") return true;
    const issue = stepIssue(step);
    if (issue) {
      toast.error(issue);
      setFlaggedStep(step);
      return false;
    }
    return true;
  };

  const stepStatus = (step: string): "current" | "done" | "issue" | "todo" => {
    if (step === tab) return "current";
    if (!form.id && !visited.has(step)) return "todo";
    return stepIssue(step) ? "issue" : "done";
  };
  const goNext = () => {
    if (validateStep(tab)) {
      setFlaggedStep(null);
      setTab(tabOrder[Math.min(tabIndex + 1, tabOrder.length - 1)]);
    }
  };
  const goBack = () => setTab(tabOrder[Math.max(tabIndex - 1, 0)]);
  const primaryAction = () => {
    if (form.id || isLastTab) void onSave();
    else goNext();
  };

  // ----- Resumo ao vivo da ficha -----
  const age = ageFrom(form.birth_date);
  const isMinor = age != null && age < 18;
  const consentsOk = form.lgpd_consent && form.terms_accepted && form.facial_recognition_consent;
  const completion = Math.round(
    (tabOrder.filter((st) => (form.id || visited.has(st)) && !stepIssue(st)).length / tabOrder.length) * 100,
  );
  const chosenPlan = (plans.data as any[] | undefined)?.find((p) => p.id === enrollment.plan_id);
  const chosenPlanAmount = (() => {
    const custom = parseAmountBR(enrollment.custom_amount);
    if (custom != null) return custom;
    return chosenPlan?.amount != null ? Number(chosenPlan.amount) : null;
  })();
  const summaryUnit = ((units.data ?? []) as any[]).find((u) => u.id === form.unit_id)?.name ?? null;
  const summaryBelt = (() => {
    const primary = (form.modalities ?? []).find((m) => m.modality && m.belt_id);
    if (!primary) return null;
    const belt = ((belts.data ?? []) as any[]).find((b) => b.id === primary.belt_id);
    if (!belt) return null;
    const deg = Number(primary.degree ?? 0);
    return deg > 0 ? `${belt.name} · ${formatDegree(deg, belt.modality)}` : belt.name;
  })();
  const summaryPlan = chosenPlan
    ? `${chosenPlan.name}${chosenPlanAmount != null ? ` · ${brl(chosenPlanAmount)}` : ""}`
    : form.id
      ? "Sem nova matrícula"
      : null;

  const onSave = async () => {
    if (!form.full_name.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }
    if (!form.lgpd_consent || !form.terms_accepted || !form.facial_recognition_consent) {
      toast.error("É necessário registrar o consentimento LGPD, Biometria Facial e o aceite dos termos");
      return;
    }
    // Aprovação do pré-cadastro: o plano é obrigatório (é ele que gera a matrícula e a cobrança).
    if (approving && !enrollment.plan_id) {
      toast.error("Escolha o plano do aluno para aprovar a matrícula");
      setTab("plano");
      return;
    }
    // Ao criar novo aluno, exigir plano
    const isNew = !form.id;
    if (isNew && !enrollment.plan_id) {
      toast.error("Selecione um plano para o aluno na aba Plano & Cobrança");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      // Multi-modalidade: a primeira linha vira a faixa "principal" do aluno;
      // as demais são registradas como graduações adicionais.
      const validMods = (form.modalities ?? []).filter((m) => m.modality && m.belt_id);
      const primary = validMods[0] ?? null;
      const payload: any = {
        ...form,
        status: approving ? "active" : form.status,
        unit_id: form.unit_id,
        current_belt_id: primary?.belt_id ?? form.current_belt_id ?? null,
        current_degree: Number(primary?.degree ?? form.current_degree ?? 0),
      };
      delete payload.modalities;
      const skip = new Set([
        "anamnesis", "status", "lgpd_consent", "image_rights_consent",
        "terms_accepted", "has_medical_clearance", "current_degree",
        "modalities", "current_belt_id"
      ]);
      Object.keys(payload).forEach((k) => {
        if (!skip.has(k) && payload[k] === "") payload[k] = null;
      });
      const saved: any = await saveFn({ data: payload });
      const studentId = saved?.id ?? form.id;

      // Registrar no histórico de graduações tudo que foi adicionado/alterado
      // nesta janela (funciona tanto no cadastro quanto na edição).
      if (studentId) {
        // --- Registrar na Turma ---
        for (const m of validMods) {
          if (m.class_ids && m.class_ids.length > 0) {
            try {
              await syncClassesFn({ data: { student_id: studentId, class_ids: m.class_ids, modality: m.modality } });
            } catch (e: any) {
              console.error("Erro ao sincronizar turmas:", e);
              // Não bloqueia o resto do salvamento
            }
          }
        }
        
        const before = new Set(initialModsRef.current);
        const toRegister = validMods.filter((m) => !before.has(`${m.belt_id}:${Number(m.degree ?? 0)}`));
        const today = todayISO();
        let okCount = 0;
        for (const m of toRegister) {
          try {
            await addGradFn({
              data: {
                student_id: studentId,
                belt_id: m.belt_id,
                degree: Number(m.degree ?? 0),
                graduation_date: today,
                evaluator: null,
                notes: isNew ? "Cadastro inicial" : "Registrado no cadastro do aluno",
              },
            });
            okCount++;
          } catch (e: any) {
            toast.error("Falha ao registrar graduação", { description: e?.message });
          }
        }
        if (okCount > 0 && !isNew) {
          toast.success(`${okCount} graduação(ões) registrada(s)`);
        }
        initialModsRef.current = validMods.map((m) => `${m.belt_id}:${Number(m.degree ?? 0)}`);
      }


      if (studentId && enrollment.plan_id) {
        // Aceita "150,50" / "R$ 1.200,00" — antes um valor com vírgula virava NaN e era descartado.
        const customAmt = parseAmountBR(enrollment.custom_amount);
        if (enrollment.custom_amount.trim() !== "" && customAmt === null) {
          toast.error("Valor customizado inválido", { description: "Use apenas números, ex.: 150,00" });
          
          return;
        }
        const res: any = await enrollFn({
          data: {
            student_id: studentId,
            plan_id: enrollment.plan_id,
            due_day: enrollment.due_day,
            start_date: enrollment.start_date,
            first_due_date: enrollment.first_due_date,
            include_enrollment_fee: enrollment.include_enrollment_fee,
            payment_method: enrollment.payment_method,
            custom_amount: customAmt,
          },
        });
        if (res?.asaas_subscription_id) {
          toast.success("Aluno matriculado — assinatura AMT Pay criada");
          toast.info("As cobranças serão emitidas automaticamente pelo AMT Pay no ciclo do plano.");
        } else {
          toast.success("Aluno matriculado e 1ª mensalidade gerada");
          if (res?.payment_url) {
            window.open(res.payment_url, "_blank", "noopener,noreferrer");
            toast.info("Link de pagamento aberto em nova aba");
          }
        }
      } else {
        toast.success("Aluno salvo");
      }
      if (approving) toast.success(`Matrícula de ${form.full_name.split(" ")[0]} aprovada`);

      // ===== Contrato gerado no ato da matrícula =====
      if (studentId && contractSel.template_id) {
        try {
          const tpl: any = (contractTemplates.data ?? []).find((t: any) => t.id === contractSel.template_id);
          if (!tpl) throw new Error("Modelo de contrato não encontrado");
          const plan: any = (plans.data ?? []).find((p: any) => p.id === enrollment.plan_id);
          const customAmt = parseAmountBR(enrollment.custom_amount);
          const monthly = customAmt != null ? customAmt : (plan?.amount != null ? Number(plan.amount) : null);
          const contractMeta = {
            plan_name: plan?.name ?? null,
            monthly_value: monthly,
            payment_method: enrollment.payment_method,
            due_day: enrollment.due_day,
            start_date: enrollment.start_date,
          };
          const merged = [
            tpl.header_html ? `<div data-tpl-header>${tpl.header_html}</div>` : "",
            tpl.content ?? "",
            tpl.footer_html ? `<div data-tpl-footer style="margin-top:24px;">${tpl.footer_html}</div>` : "",
          ].join("");
          const values = buildContractValues({
            student: { ...payload, id: studentId },
            academy: contractAcademy.data,
            contract: contractMeta,
          } as any);
          const resolved = resolveContractHtml(merged, values);
          await generateContractFn({
            data: {
              student_id: studentId,
              template_id: tpl.id,
              resolved_content: resolved,
              title: (contractSel.title.trim() || tpl.name || "Contrato de prestação de serviços"),
              plan_name: contractMeta.plan_name,
              monthly_value: contractMeta.monthly_value,
              payment_method: contractMeta.payment_method,
              due_day: contractMeta.due_day,
              start_date: contractMeta.start_date,
            },
          });
          toast.success("Contrato gerado e disponível no perfil do aluno");
          qc.invalidateQueries({ queryKey: ["student-contracts", studentId] });
          qc.invalidateQueries({ queryKey: ["dojo-contracts"] });
        } catch (e: any) {
          toast.error("Falha ao gerar o contrato", { description: e?.message });
        }
      }

      setOpen(false);
      setForm(emptyForm);
      setContractSel({ template_id: "", title: "" });

      qc.invalidateQueries({ queryKey: ["dojo-students"] });
      qc.invalidateQueries({ queryKey: ["dojo-invoices"] });
      qc.invalidateQueries({ queryKey: ["dojo-student"] });
      qc.invalidateQueries({ queryKey: ["dojo-graduations"] });
      qc.invalidateQueries({ queryKey: ["dojo-classes"] });
      qc.invalidateQueries({ queryKey: ["dojo-occurrences"] });
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };



  const onDelete = async (id: string) => {
    if (!confirm("Cancelar a matrícula e excluir o aluno? Todos os registros (presenças, mensalidades, contratos, graduações, fotos) e o acesso ao app do aluno serão apagados. Esta ação não pode ser desfeita.")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["dojo-students"] });
    } catch (e) {
      // Antes a falha virava rejeição não tratada, sem nenhum aviso na tela.
      toast.error("Erro ao excluir aluno", { description: (e as Error)?.message });
    }
  };

  const onPickFile = async (file: File) => {
    try {
      const rows = await parseStudentsFile(file);
      if (rows.length === 0) {
        toast.error("Nenhum aluno encontrado na planilha", {
          description: "Confira se a coluna 'Nome completo' está preenchida.",
        });
        return;
      }
      setImportRows(rows);
      setImportOpen(true);
    } catch (e: any) {
      toast.error("Falha ao ler planilha", { description: e?.message ?? String(e) });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onConfirmImport = async () => {
    if (!importRows.length) return;
    setImporting(true);
    try {
      const result = await bulkImportFn({ data: { rows: importRows as any } });
      if (result.inserted > 0) toast.success(`${result.inserted} aluno(s) importado(s)`);
      if (result.errors.length) {
        toast.error(`${result.errors.length} linha(s) com erro`, {
          description: result.errors.slice(0, 3).map((e) => `${e.full_name}: ${e.message}`).join(" · "),
        });
      }
      setImportOpen(false);
      setImportRows([]);
      qc.invalidateQueries({ queryKey: ["dojo-students"] });
    } catch (e: any) {
      toast.error("Erro na importação", { description: e?.message ?? String(e) });
    } finally {
      setImporting(false);
    }
  };

  const onPrintAll = () => {
    const list = filtered;
    if (!list.length) {
      toast.error("Nenhum aluno para imprimir");
      return;
    }
    printAllStudentSummaries(list, branding);
  };


  const pendingStudents = ((q.data ?? []) as any[])
    .filter((s) => s.status === "pending")
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const allStudents = ((q.data ?? []) as any[]).filter((s) => s.status !== "pending");
  const openApproval = (s: any) => {
    openEdit(s);
    setApproving(true);
  };
  const rejectPending = async (s: any) => {
    if (!confirm(`Recusar o pré-cadastro de ${s.full_name}? A ficha enviada será excluída.`)) return;
    try {
      await delFn({ data: { id: s.id } });
      toast.success("Pré-cadastro recusado");
      qc.invalidateQueries({ queryKey: ["dojo-students"] });
    } catch (e: any) {
      toast.error("Não foi possível recusar", { description: e?.message });
    }
  };
  const kpiTotal = allStudents.length;
  const kpiActive = allStudents.filter((s) => s.status === "active").length;
  const kpiFrozen = allStudents.filter((s) => s.status === "frozen").length;
  const kpiInactive = allStudents.filter((s) => s.status === "inactive").length;

  return (
    <div className="space-y-6">
      {/* Card de título */}
      <div className="dojo-hero relative overflow-hidden">
        <div aria-hidden className="dojo-hero-pattern pointer-events-none absolute inset-0" />
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-800" />

        <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
              <div className="dojo-hero-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white sm:h-12 sm:w-12 sm:rounded-2xl md:h-14 md:w-14">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">
                  <Sparkles className="h-3 w-3" /> Gestão de Alunos
                </div>
                <h1 className="text-[22px] font-bold leading-tight tracking-tight text-neutral-950 sm:text-2xl md:text-[28px]">
                  Alunos do Dojo
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-600">
                  <span className="font-semibold text-neutral-900">
                    {filtered.length} {filtered.length === 1 ? "aluno encontrado" : "alunos encontrados"}
                  </span>
                  {allStudents.length !== filtered.length ? ` de ${allStudents.length} no total` : ""}
                  {" · "}Cadastro completo, anamnese, graduações e contratos em um único lugar.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
            />
            <Button size="sm" variant="outline" className="h-9 rounded-lg border-neutral-200 bg-white text-neutral-800 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950" onClick={() => downloadStudentsTemplate()}>
              <FileDown className="h-4 w-4 mr-1" /> Modelo XLSX
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-lg border-neutral-200 bg-white text-neutral-800 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" /> Importar
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-lg border-neutral-200 bg-white text-neutral-800 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950" onClick={onPrintAll}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir fichas
            </Button>
            <Button size="sm" variant="outline" className="h-9 rounded-lg border-neutral-200 bg-white text-neutral-800 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950" asChild>
              <Link to="/dojo/app/contracts">
                <FileText className="h-4 w-4 mr-1" /> Contratos
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-lg border-neutral-200 bg-white text-neutral-800 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
              onClick={() => setEnrollLinkOpen(true)}
            >
              <LinkIcon className="h-4 w-4 mr-1" /> Página de matrícula
            </Button>

            <Dialog open={enrollLinkOpen} onOpenChange={setEnrollLinkOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Página de matrícula do dojo</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    Compartilhe este link com potenciais alunos. A página é de acesso aberto —
                    o aluno preenche os dados, escolhe o plano e é direcionado à página de
                    pagamento configurada no dojo.
                  </p>
                  {slugQ.isLoading ? (
                    <p className="text-muted-foreground">Carregando...</p>
                  ) : !(slugQ.data as any)?.slug ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      Configure o <b>slug</b> do dojo em <b>Configurações → Academia</b> para
                      habilitar a página pública.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Input readOnly value={enrollUrl} onFocus={(e) => e.currentTarget.select()} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(enrollUrl);
                              toast.success("Link copiado!");
                            } catch {
                              toast.error("Não foi possível copiar.");
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button size="sm" asChild>
                          <a href={enrollUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" /> Abrir
                          </a>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Dica: divulgue o link nas redes sociais, no rodapé do site ou por QR Code
                        na recepção da academia.
                      </p>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>


            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button data-tour="novo-aluno" size="sm" onClick={openNew} className="h-9 rounded-lg px-4 font-semibold">
                  <UserPlus className="h-4 w-4 mr-1" /> Novo aluno
                </Button>
              </DialogTrigger>

            <DialogContent
              data-tour="student-dialog"
              hideClose
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  primaryAction();
                }
              }}
              className="flex h-[min(92vh,900px)] w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-neutral-200/80 p-0 shadow-2xl"
            >
              <DialogHeader className="relative shrink-0 space-y-0 overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,#dc2626_0%,#b91c1c_55%,#8f1414_100%)] px-5 py-4 text-left sm:px-6">
                <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" />
                <div className="pointer-events-none absolute -left-10 bottom-[-5rem] h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-center gap-3.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/25 backdrop-blur">
                    {form.id ? <Pencil className="h-[18px] w-[18px]" /> : <UserPlus className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                      AMT Dojo Manager · {approving ? "Pré-cadastro para aprovar" : form.id ? "Ficha do aluno" : "Matrícula"}
                    </p>
                    <DialogTitle className="mt-0.5 truncate text-lg font-semibold leading-tight text-white">
                      {form.id ? form.full_name.trim() || "Editar aluno" : "Cadastrar novo aluno"}
                    </DialogTitle>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-[10px] uppercase tracking-wider text-white/55">
                      {form.id ? "Ficha completa" : "Progresso"}
                    </div>
                    <div className="text-lg font-bold tabular-nums text-white">{completion}%</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative mt-3.5 h-1 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-400 to-white transition-all duration-500 ease-out"
                    style={{ width: `${completion}%` }}
                  />
                </div>
              </DialogHeader>
              {approving && (
                <div className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-900 sm:px-6 sm:text-sm">
                  <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Pré-cadastro da matrícula online. Confira os dados, escolha o plano em <b>Plano &amp; Cobrança</b> e
                    clique em <b>Aprovar matrícula</b>.
                  </span>
                </div>
              )}

              <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <aside className="shrink-0 border-b bg-neutral-50/80 lg:flex lg:w-72 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
                  <div className="hidden p-4 pb-3 lg:block">
                    <StudentSummaryCard
                      isEdit={!!form.id}
                      name={form.full_name.trim()}
                      photoUrl={form.photo_url}
                      age={age}
                      cpf={form.cpf}
                      unitName={summaryUnit}
                      beltText={summaryBelt}
                      planText={summaryPlan}
                      consentsOk={consentsOk}
                    />
                  </div>
                  <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent px-3 py-2 [scrollbar-width:none] lg:flex-col lg:items-stretch lg:overflow-visible lg:pb-4 lg:pt-1">
                    {tabOrder.map((value, i) => {
                      const meta = STEP_META[value];
                      const st = stepStatus(value);
                      return (
                        <TabsTrigger
                          key={value}
                          value={value}
                          data-tour={`student-step-${value}`}
                          className="group shrink-0 justify-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-all hover:bg-white hover:text-foreground data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/[0.06] lg:w-full lg:py-2.5 lg:text-[13px]"
                        >
                          <span
                            className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold transition-colors",
                              st === "current"
                                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                                : st === "done"
                                  ? "bg-emerald-500 text-white"
                                  : st === "issue"
                                    ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
                                    : "bg-white text-muted-foreground ring-1 ring-border",
                            )}
                          >
                            {st === "done" ? <Check className="h-3.5 w-3.5" /> : st === "issue" ? <AlertCircle className="h-3.5 w-3.5" /> : i + 1}
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <span className="whitespace-nowrap leading-tight">{meta.label}</span>
                            <span className={cn("hidden truncate text-[11px] font-normal lg:block", st === "issue" ? "text-amber-700" : "text-muted-foreground")}>
                              {st === "issue" ? "Pendente" : meta.hint}
                            </span>
                          </span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                  <p className="mt-auto hidden px-4 pb-4 text-[11px] leading-relaxed text-muted-foreground lg:block">
                    <kbd className="rounded border bg-white px-1 font-sans text-[10px]">Ctrl</kbd> +{" "}
                    <kbd className="rounded border bg-white px-1 font-sans text-[10px]">Enter</kbd>{" "}
                    {form.id ? "salva a ficha" : isLastTab ? "conclui o cadastro" : "avança para a próxima etapa"}
                  </p>
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div
                    ref={stepScrollRef}
                    className="flex-1 overflow-y-auto bg-[radial-gradient(900px_400px_at_100%_-10%,rgba(220,38,38,0.035),transparent_60%)] px-4 py-5 sm:px-6"
                  >

                    {(() => {
                      const meta = STEP_META[tab];
                      const issue = flaggedStep === tab ? stepIssue(tab) : null;
                      return (
                        <div className="mb-5">
                          <div className="flex items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                              <meta.icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Etapa {tabIndex + 1} de {tabOrder.length}
                              </p>
                              <h3 className="text-base font-semibold leading-tight">{meta.title}</h3>
                              <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                            </div>
                          </div>
                          {issue && (
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              {issue}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                {/* ============ DADOS PESSOAIS ============ */}
                <TabsContent value="dados" className="mt-0 space-y-4">
                  <Section icon={IdCard} title="Identificação" description="Nome, documentos e dados pessoais do aluno.">
                  <Field label="Nome completo *" className="md:col-span-2">
                    <Input data-tour="student-name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
                  </Field>
                  <Field label="CPF *">
                    <Input
                      data-tour="student-cpf"
                      value={form.cpf}
                      onChange={(e) => set("cpf", maskCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      maxLength={14}
                    />
                    {form.cpf && !isValidCPF(form.cpf) && (
                      <p className="mt-1 text-[11px] text-destructive">CPF incompleto — use o formato 000.000.000-00.</p>
                    )}
                  </Field>
                  <Field label="RG">
                    <Input value={form.rg} onChange={(e) => set("rg", e.target.value)} />
                  </Field>
                  <Field label="Data de nascimento *">
                    <Input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
                    {age != null && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {age} {age === 1 ? "ano" : "anos"}{age < 18 ? " · menor de idade" : ""}
                      </p>
                    )}
                  </Field>
                  <Field label="Gênero">
                    <select
                      className={SELECT_CLS}
                      value={form.gender}
                      onChange={(e) => set("gender", e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                      <option value="outro">Outro</option>
                      <option value="prefiro_nao_informar">Prefiro não informar</option>
                    </select>
                  </Field>
                  <Field label="Nacionalidade">
                    <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
                  </Field>
                  <Field label="Estado civil">
                    <select
                      className={SELECT_CLS}
                      value={form.marital_status}
                      onChange={(e) => set("marital_status", e.target.value)}
                    >
                      <option value="">—</option>
                      <option value="solteiro">Solteiro(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="uniao_estavel">União estável</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="viuvo">Viúvo(a)</option>
                    </select>
                  </Field>
                  <Field label="Profissão">
                    <Input value={form.profession} onChange={(e) => set("profession", e.target.value)} />
                  </Field>
                  </Section>
                  <Section icon={Droplet} title="Saúde básica" description="Ajuda a equipe em caso de emergência.">
                  <Field label="Tipo sanguíneo">
                    <select
                      className={SELECT_CLS}
                      value={form.blood_type}
                      onChange={(e) => set("blood_type", e.target.value)}
                    >
                      <option value="">—</option>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Plano de saúde" className="md:col-span-2">
                    <Input value={form.health_insurance} onChange={(e) => set("health_insurance", e.target.value)} />
                  </Field>
                  </Section>
                  <Section
                    icon={Baby}
                    title="Responsável legal"
                    description="Obrigatório para menores de 18 anos."
                    tone={isMinor ? "warn" : "default"}
                    badge={isMinor ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        Aluno menor de idade
                      </span>
                    ) : null}
                  >
                  <Field label="Nome do responsável">
                    <Input value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} />
                  </Field>
                  <Field label="RG do responsável">
                    <Input value={form.guardian_rg} onChange={(e) => set("guardian_rg", e.target.value)} maxLength={20} />
                  </Field>
                  <Field label="CPF do responsável">
                    <Input value={form.guardian_cpf} onChange={(e) => set("guardian_cpf", maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                    {form.guardian_cpf && !isValidCPF(form.guardian_cpf) && (
                      <p className="mt-1 text-[11px] text-destructive">CPF do responsável inválido.</p>
                    )}
                  </Field>
                  <Field label="Telefone do responsável">
                    <Input value={form.guardian_phone} onChange={(e) => set("guardian_phone", maskPhone(e.target.value))} placeholder="(11)99999-9999" inputMode="tel" maxLength={14} />
                  </Field>
                  </Section>
                </TabsContent>

                {/* ============ ENDEREÇO ============ */}
                <TabsContent value="endereco" className="mt-0 space-y-4">
                  <Section
                    icon={MapPin}
                    title="Endereço residencial"
                    description="Digite o CEP: rua, bairro, cidade e UF são preenchidos automaticamente."
                    gridClassName="grid gap-3 md:grid-cols-6"
                  >
                  <Field label="CEP" className="md:col-span-2">
                    <Input
                      name="cep"
                      data-tour="student-cep"
                      placeholder="00000-000"
                      value={form.zip}
                      onChange={(e) => set("zip", maskCEP(e.target.value))}
                      inputMode="numeric"
                      maxLength={9}
                    />
                    {form.zip && !isValidCEP(form.zip) && (
                      <p className="mt-1 text-[11px] text-destructive">CEP incompleto — use o formato 00000-000.</p>
                    )}
                  </Field>
                  <Field label="Rua" className="md:col-span-4">
                    <Input name="logradouro" value={form.street} onChange={(e) => set("street", e.target.value)} />
                  </Field>
                  <Field label="Número" className="md:col-span-1">
                    <Input value={form.address_number} onChange={(e) => set("address_number", e.target.value)} />
                  </Field>
                  <Field label="Complemento" className="md:col-span-3">
                    <Input name="complemento" value={form.address_complement} onChange={(e) => set("address_complement", e.target.value)} />
                  </Field>
                  <Field label="Bairro" className="md:col-span-2">
                    <Input name="bairro" value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
                  </Field>
                  <Field label="Cidade" className="md:col-span-4">
                    <Input name="cidade" value={form.city} onChange={(e) => set("city", e.target.value)} />
                  </Field>
                  <Field label="UF" className="md:col-span-2">
                    <Input name="uf" value={form.state} onChange={(e) => set("state", e.target.value)} maxLength={2} />
                  </Field>
                  </Section>
                </TabsContent>

                {/* ============ CONTATOS ============ */}
                <TabsContent value="contato" className="mt-0 space-y-4">
                  <Section icon={Mail} title="Contato do aluno" description="Informe ao menos telefone ou e-mail.">
                  <Field label="E-mail">
                    <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </Field>
                  <Field label="Telefone / WhatsApp">
                    <Input
                      value={form.phone}
                      onChange={(e) => set("phone", maskPhone(e.target.value))}
                      placeholder="(11)99999-9999"
                      inputMode="tel"
                      maxLength={14}
                    />
                    {form.phone && !isValidPhone(form.phone) && (
                      <p className="mt-1 text-[11px] text-destructive">Telefone incompleto — use (XX)XXXXX-XXXX.</p>
                    )}
                  </Field>
                  </Section>
                  <Section icon={LifeBuoy} title="Contato de emergência" description="Quem a academia deve avisar se algo acontecer no treino.">
                  <Field label="Nome">
                    <Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
                  </Field>
                  <Field label="Telefone">
                    <Input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", maskPhone(e.target.value))} placeholder="(11)99999-9999" inputMode="tel" maxLength={14} />
                  </Field>
                  <Field label="Parentesco" className="md:col-span-2">
                    <Input value={form.emergency_contact_relationship} onChange={(e) => set("emergency_contact_relationship", e.target.value)} placeholder="Ex.: cônjuge, mãe, irmão" />
                  </Field>
                  </Section>
                </TabsContent>

                {/* ============ DOJO ============ */}
                <TabsContent value="dojo" className="mt-0 space-y-4">
                  <Section icon={Building2} title="Unidade e situação" description="Onde o aluno treina e a situação da matrícula.">
                  <Field label="Unidade" className="">
                    <select
                      className={SELECT_CLS}
                      value={form.unit_id ?? ""}
                      onChange={(e) => set("unit_id", e.target.value || null)}
                    >
                      <option value="">— Selecionar —</option>
                      {(units.data ?? []).map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select
                      className={SELECT_CLS}
                      value={form.status}
                      onChange={(e) => set("status", e.target.value as StudentForm["status"])}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="frozen">Trancado</option>
                    </select>
                  </Field>
                  </Section>
                  <Section
                    icon={Award}
                    title="Modalidades, faixas e turmas"
                    description="A primeira modalidade é a faixa principal do aluno. Adicione linhas para treinar em mais de uma."
                    gridClassName="space-y-3"
                    badge={
                      <div className="ml-auto">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const modalitiesAvail = Array.from(
                            new Set(((belts.data ?? []) as any[]).map((b) => b.modality).filter(Boolean)),
                          );
                          const firstMod = form.modalities[0]?.modality ?? modalitiesAvail[0] ?? "jiu-jitsu";
                          set("modalities", [
                            ...form.modalities,
                            { modality: firstMod, belt_id: "", degree: 0, class_ids: [] },
                          ]);
                        }}
                      >
                        + Adicionar modalidade
                      </Button>
                      </div>
                    }
                  >
                    {form.modalities.length === 0 && (
                      <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
                        Nenhuma modalidade selecionada. Clique em <strong>Adicionar modalidade</strong> para vincular a faixa atual do aluno.
                      </div>
                    )}

                    {form.modalities.map((m, idx) => {
                      const modalitiesAvail = Array.from(
                        new Set(((belts.data ?? []) as any[]).map((b) => b.modality).filter(Boolean)),
                      );
                      const beltsForMod = ((belts.data ?? []) as any[])
                        .filter((b) => b.modality === m.modality)
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                      const selectedBelt = beltsForMod.find((b) => b.id === m.belt_id);
                      const maxDeg = Number(selectedBelt?.max_degrees ?? 10);
                      const update = (patch: Partial<typeof m>) => {
                        const next = form.modalities.slice();
                        next[idx] = { ...next[idx], ...patch };
                        set("modalities", next);
                      };
                      return (
                        <div key={idx} className="grid items-end gap-3 rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 md:grid-cols-12">
                          <div className="md:col-span-4">
                            <label className="text-[11px] text-muted-foreground">Modalidade</label>
                            <select
                              className={SELECT_CLS}
                              value={m.modality}
                              onChange={(e) => update({ modality: e.target.value, belt_id: "" })}
                            >
                              {modalitiesAvail.map((mod) => (
                                <option key={mod} value={mod}>{mod}</option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-3">
                            <label className="text-[11px] text-muted-foreground">Turmas</label>
                            <div className="flex max-h-[120px] flex-col gap-1 overflow-y-auto rounded-lg border border-input bg-background p-2">
                              {((classes.data ?? []) as any[])
                                .filter((c) => c.modality === m.modality)
                                .map((c) => {
                                  const isSelected = (m.class_ids ?? []).includes(c.id);
                                  return (
                                    <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 p-1 rounded">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          const current = m.class_ids ?? [];
                                          if (checked) {
                                            update({ class_ids: [...current, c.id] });
                                          } else {
                                            update({ class_ids: current.filter(id => id !== c.id) });
                                          }
                                        }}
                                      />
                                      <span className="truncate" title={c.name}>{c.name}</span>
                                    </label>
                                  );
                                })}
                              {((classes.data ?? []) as any[]).filter((c) => c.modality === m.modality).length === 0 && (
                                <span className="text-[10px] text-muted-foreground italic">Nenhuma turma para {m.modality}</span>
                              )}
                            </div>
                          </div>
                          <div className="md:col-span-3">
                            <label className="text-[11px] text-muted-foreground">Graduação atual</label>
                            <select
                              className={SELECT_CLS}
                              value={m.belt_id}
                              onChange={(e) => update({ belt_id: e.target.value, degree: 0 })}
                            >
                              <option value="">— Selecionar faixa —</option>
                              {beltsForMod.map((b: any) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[11px] text-muted-foreground">
                              {selectedBelt ? degreeUnit(selectedBelt.modality) : "Grau"}
                            </label>
                            <select
                              className={SELECT_CLS}
                              disabled={!selectedBelt || maxDeg <= 0}
                              value={String(Math.min(Number(m.degree ?? 0), maxDeg))}
                              onChange={(e) => update({ degree: Number(e.target.value) || 0 })}
                            >
                              {!selectedBelt && <option value="0">—</option>}
                              {selectedBelt &&
                                Array.from({ length: maxDeg + 1 }, (_, d) => (
                                  <option key={d} value={d}>
                                    {formatDegree(d, selectedBelt.modality)}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div className="md:col-span-1 flex justify-end">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const next = form.modalities.slice();
                                next.splice(idx, 1);
                                set("modalities", next);
                              }}
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                          {idx === 0 && form.modalities.length > 1 && (
                            <p className="md:col-span-12 text-[11px] text-muted-foreground">
                              A primeira modalidade é considerada a <strong>faixa principal</strong> do aluno e aparecerá no cabeçalho da ficha.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </Section>
                  <Section icon={StickyNote} title="Observações" description="Anotações internas da equipe sobre o aluno." gridClassName="grid">
                    <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                  </Section>
                </TabsContent>

                {/* ============ PLANO & COBRANÇA ============ */}
                <TabsContent value="plano" className="mt-0 space-y-4">
                  <Section
                    icon={Wallet}
                    title="Plano e cobrança"
                    description={form.id
                      ? "Selecione um plano para criar uma nova matrícula para este aluno (opcional). As mensalidades seguintes são criadas no Financeiro."
                      : "Uma matrícula é criada automaticamente e a 1ª mensalidade é gerada com base no plano. As seguintes são criadas no Financeiro."}
                  >
                      <Field label={form.id ? "Plano" : "Plano *"} className="md:col-span-2">
                        <select
                          className={SELECT_CLS}
                          data-tour="student-plan"
                          value={enrollment.plan_id}
                          onChange={(e) => setEnrollment((s) => ({ ...s, plan_id: e.target.value }))}
                        >
                          <option value="">— Selecionar plano —</option>
                          {(plans.data ?? [])
                            .filter((p: any) => p.active !== false)
                            .map((p: any) => (
                              <option key={p.id} value={p.id}>
                                {p.name} — R$ {Number(p.amount ?? 0).toFixed(2)}
                                {Number(p.enrollment_fee ?? 0) > 0
                                  ? ` (+ matrícula R$ ${Number(p.enrollment_fee).toFixed(2)})`
                                  : ""}
                              </option>
                            ))}
                        </select>
                        {(plans.data ?? []).length === 0 && (
                          <p className="text-xs text-destructive mt-1">
                            Nenhum plano cadastrado.{" "}
                            <Link to="/dojo/app/plans" className="underline">
                              Cadastre um plano
                            </Link>{" "}
                            antes de matricular o aluno.
                          </p>
                        )}
                      </Field>
                    {chosenPlan && (
                      <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{chosenPlan.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {Number(chosenPlan.enrollment_fee ?? 0) > 0
                              ? `Taxa de matrícula ${brl(Number(chosenPlan.enrollment_fee))}`
                              : "Sem taxa de matrícula"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums">{brl(chosenPlanAmount ?? 0)}</div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {parseAmountBR(enrollment.custom_amount) != null ? "valor customizado" : "por cobrança"}
                          </div>
                        </div>
                      </div>
                    )}
                      <Field label="Data de início">
                        <Input
                          type="date"
                          value={enrollment.start_date}
                          onChange={(e) => setEnrollment((s) => ({ ...s, start_date: e.target.value }))}
                        />
                      </Field>
                      <Field label="Dia de vencimento (1-31)" hint="Meses mais curtos usam o último dia disponível.">
                        <Input
                          inputMode="numeric"
                          maxLength={2}
                          placeholder="05"
                          value={String(enrollment.due_day)}
                          onChange={(e) =>
                            setEnrollment((s) => ({ ...s, due_day: clampDueDay(e.target.value, s.due_day) }))
                          }
                          onBlur={(e) =>
                            setEnrollment((s) => ({ ...s, due_day: clampDueDay(e.target.value, 5) }))
                          }
                        />
                      </Field>
                      <Field label="Vencimento da 1ª mensalidade">
                        <Input
                          type="date"
                          value={enrollment.first_due_date}
                          onChange={(e) => setEnrollment((s) => ({ ...s, first_due_date: e.target.value }))}
                        />
                      </Field>
                      <Field label="Valor customizado (opcional)">
                        <CurrencyInput
                          placeholder="Em branco = valor do plano"
                          value={enrollment.custom_amount}
                          onValueChange={(v) => setEnrollment((s) => ({ ...s, custom_amount: currencyText(v) }))}
                        />
                        {(() => {
                          const selectedPlan = (plans.data as any[] | undefined)?.find((p) => p.id === enrollment.plan_id);
                          const custom = parseAmountBR(enrollment.custom_amount);
                          const typed = enrollment.custom_amount.trim() !== "";
                          if (typed && custom === null) {
                            return <p className="mt-1 text-xs text-destructive">Valor inválido — use apenas números, ex.: 150,00</p>;
                          }
                          const eff = custom != null ? custom : (selectedPlan?.amount != null ? Number(selectedPlan.amount) : null);
                          if (eff == null) return null;
                          return (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Será cobrado: <strong className="text-foreground">{brl(eff)}</strong>
                              {custom != null ? " (valor customizado)" : " (valor do plano)"}
                            </p>
                          );
                        })()}
                      </Field>

                      <div className="md:col-span-2">
                        <BoolChk
                          label="Cobrar taxa de matrícula na 1ª fatura (se o plano tiver)"
                          checked={enrollment.include_enrollment_fee}
                          onChange={(v) => setEnrollment((s) => ({ ...s, include_enrollment_fee: v }))}
                        />
                      </div>
                      <Field label="Forma de pagamento da matrícula" className="md:col-span-2">
                        {(() => {
                          const selectedPlan = (plans.data as any[] | undefined)?.find(
                            (p) => p.id === enrollment.plan_id,
                          );
                          const planMethods = selectedPlan
                            ? normalizePlanPaymentMethods(selectedPlan.payment_methods).filter((m) => m.enabled)
                            : [];
                          const gatewayCodes = new Set(["pix", "boleto", "credit_card", "debit_card", "payment_link", "recurring"]);

                          // AMT Pay desativado → tudo é manual, esconde os demais métodos.
                          if (!amtPayActive) {
                            if (enrollment.payment_method !== "manual") {
                              setTimeout(() => setEnrollment((s) => ({ ...s, payment_method: "manual" })), 0);
                            }
                            return (
                              <>
                                <select
                                  className={SELECT_CLS}
                                  value="manual"
                                  disabled
                                >
                                  <option value="manual">Registrar manualmente</option>
                                </select>
                                <p className="text-xs text-amber-600 mt-1">
                                  AMT Pay desativado — todas as cobranças deste dojo são registradas manualmente.
                                  Ative o AMT Pay em Menu → AMT Pay para emitir PIX, boleto e cartão automaticamente.
                                </p>
                              </>
                            );
                          }

                          // AMT Pay ativo → mostra métodos habilitados no plano.
                          const isGateway = gatewayCodes.has(enrollment.payment_method);
                          return (
                            <>
                              <select
                                className={SELECT_CLS}
                                value={enrollment.payment_method}
                                onChange={(e) =>
                                  setEnrollment((s) => ({ ...s, payment_method: e.target.value }))
                                }
                              >
                                {planMethods.length === 0 && (
                                  <option value="manual">Registrar manualmente</option>
                                )}
                                {planMethods.map((m) => (
                                  <option key={m.code} value={m.code}>
                                    {paymentMethodLabel(m.code)}
                                  </option>
                                ))}
                              </select>
                              {isGateway && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  AMT Pay ativo — o AMT Pay emitirá as cobranças automaticamente no ciclo do plano.
                                  O aluno recebe a fatura por e-mail e as cobranças aparecem no Financeiro.
                                </p>
                              )}
                              {!isGateway && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Cobrança manual: a 1ª fatura é criada no sistema e as próximas são geradas conforme a frequência do plano.
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </Field>
                  </Section>
                </TabsContent>

                {/* ============ ANAMNESE ============ */}
                <TabsContent value="anamnese" className="mt-0 space-y-4">
                  <Section icon={HeartPulse} title="Condições de saúde" description="Marque o que se aplica ao aluno.">
                    <BoolChk label="Problemas cardíacos" checked={!!form.anamnesis.heart_issues} onChange={(v) => setAnamn("heart_issues", v)} />
                    <BoolChk label="Hipertensão" checked={!!form.anamnesis.hypertension} onChange={(v) => setAnamn("hypertension", v)} />
                    <BoolChk label="Diabetes" checked={!!form.anamnesis.diabetes} onChange={(v) => setAnamn("diabetes", v)} />
                    <BoolChk label="Asma / bronquite" checked={!!form.anamnesis.asthma} onChange={(v) => setAnamn("asthma", v)} />
                    <BoolChk label="Fumante" checked={!!form.anamnesis.smoking} onChange={(v) => setAnamn("smoking", v)} />
                    <BoolChk label="Consumo de álcool" checked={!!form.anamnesis.alcohol} onChange={(v) => setAnamn("alcohol", v)} />
                    <BoolChk label="Gestante" checked={!!form.anamnesis.pregnant} onChange={(v) => setAnamn("pregnant", v)} />
                  </Section>
                  <Section icon={Stethoscope} title="Histórico e objetivos" description="Informações essenciais para uma prática segura.">
                    <Field label="Doenças / condições diagnosticadas" className="md:col-span-2">
                      <Textarea rows={2} value={form.anamnesis.medical_conditions ?? ""} onChange={(e) => setAnamn("medical_conditions", e.target.value)} />
                    </Field>
                    <Field label="Medicamentos em uso" className="md:col-span-2">
                      <Textarea rows={2} value={form.anamnesis.medications ?? ""} onChange={(e) => setAnamn("medications", e.target.value)} />
                    </Field>
                    <Field label="Alergias">
                      <Textarea rows={2} value={form.anamnesis.allergies ?? ""} onChange={(e) => setAnamn("allergies", e.target.value)} />
                    </Field>
                    <Field label="Cirurgias anteriores">
                      <Textarea rows={2} value={form.anamnesis.surgeries ?? ""} onChange={(e) => setAnamn("surgeries", e.target.value)} />
                    </Field>
                    <Field label="Lesões / dores atuais" className="md:col-span-2">
                      <Textarea rows={2} value={form.anamnesis.injuries ?? ""} onChange={(e) => setAnamn("injuries", e.target.value)} />
                    </Field>
                    <Field label="Nível de atividade física">
                      <select
                        className={SELECT_CLS}
                        value={form.anamnesis.physical_activity_level ?? ""}
                        onChange={(e) => setAnamn("physical_activity_level", e.target.value)}
                      >
                        <option value="">—</option>
                        <option value="sedentario">Sedentário</option>
                        <option value="leve">Leve (1-2x/semana)</option>
                        <option value="moderado">Moderado (3-4x/semana)</option>
                        <option value="intenso">Intenso (5+x/semana)</option>
                      </select>
                    </Field>
                    <Field label="Objetivos com a prática">
                      <Input value={form.anamnesis.objectives ?? ""} onChange={(e) => setAnamn("objectives", e.target.value)} placeholder="Ex.: saúde, competição, defesa pessoal" />
                    </Field>
                    <Field label="Outras observações" className="md:col-span-2">
                      <Textarea rows={2} value={form.anamnesis.other ?? ""} onChange={(e) => setAnamn("other", e.target.value)} />
                    </Field>
                  </Section>
                  <Section icon={BadgeCheck} title="Liberação médica">
                    <BoolChk
                      label="Possui liberação médica para atividade física"
                      checked={form.has_medical_clearance}
                      onChange={(v) => set("has_medical_clearance", v)}
                    />
                    <Field label="Data da liberação">
                      <Input
                        type="date"
                        value={form.medical_clearance_date}
                        onChange={(e) => set("medical_clearance_date", e.target.value)}
                        disabled={!form.has_medical_clearance}
                      />
                    </Field>
                  </Section>
                </TabsContent>

                {/* ============ FOTO ============ */}
                <TabsContent value="foto" className="mt-0 space-y-4">
                  <Section icon={Camera} title="Foto do aluno" description="Aparece na ficha, no app do aluno e no check-in por reconhecimento facial." gridClassName="">
                  <StudentPhotoCapture value={form.photo_url} onChange={(url) => set("photo_url", url)} />
                  </Section>
                </TabsContent>

                {/* ============ CONSENTIMENTOS ============ */}
                <TabsContent value="consent" className="mt-0 space-y-4">
                  <Section
                    icon={ShieldCheck}
                    title="Consentimentos"
                    description="LGPD, biometria facial e os termos são obrigatórios para concluir. Ficam registrados com data e hora, como exige a LGPD."
                    gridClassName="space-y-2.5"
                    tone={flaggedStep === "consent" && !consentsOk ? "warn" : "default"}
                  >
                  <BoolChk
                    label="Autorizo o tratamento dos meus dados pessoais conforme a LGPD (Lei nº 13.709/2018) para fins de matrícula, controle acadêmico e comunicação da academia."
                    checked={form.lgpd_consent}
                    required
                    onChange={(v) => set("lgpd_consent", v)}
                  />
                  <BoolChk
                    label="Autorizo a coleta e processamento de biometria facial para identificação automática em check-ins por foto (Reconhecimento Facial)."
                    checked={form.facial_recognition_consent}
                    required
                    onChange={(v) => set("facial_recognition_consent", v)}
                  />
                  <BoolChk
                    label="Autorizo o uso da minha imagem em fotos e vídeos para divulgação da academia (redes sociais, site e materiais internos)."
                    checked={form.image_rights_consent}
                    onChange={(v) => set("image_rights_consent", v)}
                  />
                  <BoolChk
                    label="Declaro estar ciente dos riscos inerentes à prática esportiva e aceito o regulamento interno e o termo de responsabilidade da academia."
                    checked={form.terms_accepted}
                    required
                    onChange={(v) => set("terms_accepted", v)}
                  />
                  </Section>
                </TabsContent>

                {/* ============ CONTRATO ============ */}
                <TabsContent value="contrato" className="mt-0 space-y-4">
                  <Section
                    icon={FileText}
                    title="Contrato no ato da matrícula"
                    description="Escolha um modelo para gerar o contrato ao concluir. Os dados do aluno, plano e valores preenchem as variáveis do modelo, e o contrato fica no perfil e no app do aluno para assinatura."
                    gridClassName="space-y-4"
                  >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Modelo de contrato</Label>
                      <Select
                        value={contractSel.template_id || "none"}
                        onValueChange={(v) => setContractSel((p) => ({ ...p, template_id: v === "none" ? "" : v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não gerar contrato agora</SelectItem>
                          {(contractTemplates.data ?? []).map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(contractTemplates.data ?? []).length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Nenhum modelo cadastrado. Crie modelos em Contratos.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Título do contrato (opcional)</Label>
                      <Input
                        value={contractSel.title}
                        placeholder="Contrato de prestação de serviços"
                        onChange={(e) => setContractSel((p) => ({ ...p, title: e.target.value }))}
                      />
                    </div>
                  </div>

                  {contractSel.template_id && (() => {
                    const tpl: any = (contractTemplates.data ?? []).find((t: any) => t.id === contractSel.template_id);
                    if (!tpl) return null;
                    const plan: any = (plans.data ?? []).find((p: any) => p.id === enrollment.plan_id);
                    const customAmt = parseAmountBR(enrollment.custom_amount);
                    const monthly = customAmt != null ? customAmt : (plan?.amount != null ? Number(plan.amount) : null);
                    const merged = [
                      tpl.header_html ? `<div>${tpl.header_html}</div>` : "",
                      tpl.content ?? "",
                      tpl.footer_html ? `<div style="margin-top:24px;">${tpl.footer_html}</div>` : "",
                    ].join("");
                    const html = resolveContractHtml(merged, buildContractValues({
                      student: form,
                      academy: contractAcademy.data,
                      contract: {
                        plan_name: plan?.name ?? null,
                        monthly_value: monthly,
                        payment_method: enrollment.payment_method,
                        due_day: enrollment.due_day,
                        start_date: enrollment.start_date,
                      },
                    } as any));
                    return (
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Pré-visualização</Label>
                        <div
                          className="max-h-72 overflow-y-auto rounded-xl border bg-background p-4 text-[13px] leading-relaxed"
                          style={{ fontFamily: "Georgia, serif" }}
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
                        />
                      </div>
                    );
                  })()}
                  </Section>
                </TabsContent>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 border-t bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
                    <p className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground sm:block">
                      {approving
                        ? "Ao aprovar, o aluno fica ativo e é matriculado no plano escolhido."
                        : form.id
                          ? "As alterações só valem ao clicar em Salvar."
                          : "Ao concluir, o aluno é matriculado no plano selecionado."}
                    </p>
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)} disabled={saving}>
                        Cancelar
                      </Button>
                      {form.id ? (
                        <Button data-tour="student-save" onClick={onSave} disabled={saving} className="rounded-xl px-5 shadow-sm transition-transform active:scale-[0.98]">
                          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                          {approving ? "Aprovar matrícula" : "Salvar alterações"}
                        </Button>
                      ) : (
                        <>
                          {tabIndex > 0 && (
                            <Button variant="outline" className="rounded-xl" onClick={goBack} disabled={saving}>
                              <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
                            </Button>
                          )}
                          {isLastTab ? (
                            <Button data-tour="student-save" onClick={onSave} disabled={saving} className="rounded-xl px-5 shadow-sm transition-transform active:scale-[0.98]">
                              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                              Cadastrar aluno
                            </Button>
                          ) : (
                            <Button data-tour="student-next" onClick={goNext} className="rounded-xl px-5 shadow-sm transition-transform active:scale-[0.98]">
                              Continuar <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Tabs>
            </DialogContent>
          </Dialog>

          <Dialog open={importOpen} onOpenChange={(v) => { if (!importing) setImportOpen(v); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Importar alunos ({importRows.length})</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                Revise as primeiras linhas antes de confirmar. Todas serão criadas com status ativo por padrão.
              </p>
              <div className="mt-3 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Nome</th>
                      <th className="text-left p-2">CPF</th>
                      <th className="text-left p-2">Nascimento</th>
                      <th className="text-left p-2">Telefone</th>
                      <th className="text-left p-2">E-mail</th>
                      <th className="text-left p-2">Cidade/UF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 25).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{r.full_name}</td>
                        <td className="p-2">{r.cpf ?? ""}</td>
                        <td className="p-2">{r.birth_date ?? ""}</td>
                        <td className="p-2">{r.phone ?? ""}</td>
                        <td className="p-2">{r.email ?? ""}</td>
                        <td className="p-2">{[r.city, r.state].filter(Boolean).join("/")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 25 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    + {importRows.length - 25} linha(s) não exibidas
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancelar</Button>
                <Button onClick={onConfirmImport} disabled={importing}>
                  {importing ? "Importando…" : `Importar ${importRows.length} aluno(s)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        </div>
      </div>


      {/* Pré-cadastros da matrícula online aguardando análise */}
      {pendingStudents.length > 0 && (
        <section id="pre-cadastros" className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-xs">
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 px-4 py-3 sm:px-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
              <ClipboardCheck className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-neutral-950">
                {pendingStudents.length} {pendingStudents.length === 1 ? "pré-cadastro aguardando" : "pré-cadastros aguardando"} análise
              </h2>
              <p className="text-xs text-neutral-600">
                Enviados pela matrícula online. Abra a ficha, confira os dados, escolha o plano e aprove.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-amber-200/70">
            {pendingStudents.map((s) => {
              const cb = currentBeltEntries(s).find((x: any) => x?.belt);
              const beltText = cb?.belt ? formatBeltFull(cb.belt.name, cb.modality, cb.degree) : null;
              const age = ageFrom(s.birth_date ?? "");
              const sent = s.created_at ? new Date(s.created_at) : null;
              return (
                <li key={s.id} className="flex flex-col gap-3 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-neutral-950">
                      {s.full_name}
                      {age != null ? <span className="font-normal text-neutral-500"> · {age} anos</span> : null}
                    </p>
                    <p className="truncate text-xs text-neutral-600">
                      {[s.phone, beltText ? `${modalityLabel(cb?.modality)} · ${beltText}` : null].filter(Boolean).join(" · ")}
                    </p>
                    {sent ? (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-500">
                        <Clock className="h-3 w-3" /> Enviado em {sent.toLocaleDateString("pt-BR")} às{" "}
                        {sent.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-lg border-neutral-200 bg-white text-neutral-700 hover:text-red-700"
                      onClick={() => void rejectPending(s)}
                    >
                      <X className="mr-1 h-4 w-4" /> Recusar
                    </Button>
                    <Button size="sm" className="h-9 rounded-lg" onClick={() => openApproval(s)}>
                      <ClipboardCheck className="mr-1 h-4 w-4" /> Analisar e aprovar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StudentKpi icon={Users} label="Total de alunos" value={kpiTotal} accent="from-red-500 to-red-700" />
        <StudentKpi icon={UserCheck} label="Ativos" value={kpiActive} accent="from-emerald-500 to-teal-600" />
        <StudentKpi icon={Snowflake} label="Trancados" value={kpiFrozen} accent="from-amber-500 to-orange-600" />
        <StudentKpi icon={UserX} label="Inativos" value={kpiInactive} accent="from-neutral-500 to-neutral-700" />
      </div>

      {/* Filtros ampliados */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-3 md:p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-10 rounded-full"
              placeholder="Buscar por nome, telefone, CPF, e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="h-10 w-full rounded-full border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="frozen">Trancados</option>
          </select>
          <select className="h-10 w-full rounded-full border border-input bg-background px-3 text-sm" value={beltFilter} onChange={(e) => setBeltFilter(e.target.value)}>
            <option value="all">Todas as faixas</option>
            {(belts.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select className="h-10 w-full rounded-full border border-input bg-background px-3 text-sm" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="all">Todas as unidades</option>
            {(units.data ?? []).map((u: any) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Input className="h-10 w-full rounded-full" placeholder="Cidade" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} />

        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)]">
        {/* Cabeçalho (desktop) */}
        <div className="hidden bg-neutral-50/80 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto_auto] sm:items-center sm:gap-4">
          <span>Aluno</span>
          <span>Graduação</span>
          <span className="text-center">Situação</span>
          <span className="text-right">Ações</span>
        </div>

        <div className="divide-y divide-neutral-100">
        {pageItems.map((s: any) => {
          const statusLabel = studentStatusLabel(s.status);
          const statusClass = STATUS_PILL[studentStatusTone(s.status)];
          const contact = s.email ?? s.phone;
          return (
            <div
              key={s.id}
              className="group px-4 py-3 transition-colors hover:bg-neutral-50/70 sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto_auto] sm:items-center sm:gap-4 sm:px-5"
            >
              {/* Aluno */}
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-100 ring-1 ring-neutral-200">
                  {s.photo_url ? (
                    <img src={s.photo_url} alt={s.full_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-sm font-semibold text-neutral-500">
                      {s.full_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] font-semibold text-neutral-900">
                    {s.anamnesis?.autism ? (
                      <img
                        src={autismIcon.url}
                        alt="TEA"
                        title="Aluno TEA (Transtorno do Espectro Autista)"
                        className="h-4 w-4 shrink-0"
                      />
                    ) : null}
                    <span className="break-words">{s.full_name}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {contact ? <div className="break-all">{contact}</div> : null}
                    {s.unit?.name ? (
                      <div className="mt-1">
                        <span className="inline-block max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                          {s.unit.name}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:hidden ${statusClass}`}
                >
                  {statusLabel}
                </span>
              </div>

              {/* Graduação — ilustração das faixas (todas as modalidades) */}
              <div className="mt-3 space-y-1.5 sm:mt-0">
                {(() => {
                  const list = rankedBelts(s);
                  if (list.length === 0) return <span className="text-xs text-neutral-400">Sem graduação</span>;
                  return list.map((cb, i) => (
                    <div key={beltEntryKey(cb, i)} className="flex items-center gap-3">
                      {/* Caixa de tamanho fixo: a ilustração (min 220px) é reduzida
                          proporcionalmente para nunca invadir o texto ao lado. */}
                      <div className="h-[24px] w-[154px] shrink-0 overflow-hidden">
                        <div className="w-[220px] origin-top-left scale-[0.7]">
                          <BeltAuto belt={cb.belt} degree={cb.degree ?? 0} className="w-full" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-neutral-800">
                          {formatBeltFull(cb.belt?.name ?? "Sem faixa", cb.belt?.modality, cb.degree ?? 0)}
                        </div>
                        {cb.belt?.modality ? (
                          <div className="truncate text-[10px] uppercase tracking-wide text-neutral-400">
                            {cb.belt?.modality}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ));
                })()}
              </div>


              {/* Status desktop */}
              <span
                className={`hidden shrink-0 justify-self-center rounded-full px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex ${statusClass}`}
              >
                {statusLabel}
              </span>

              {/* Ações */}
              <div className="mt-3 flex flex-wrap items-center gap-1 sm:mt-0 sm:flex-nowrap sm:justify-self-end sm:opacity-70 sm:transition-opacity sm:group-hover:opacity-100">
                <Link to="/dojo/app/students/$id" params={{ id: s.id }}>
                  <Button size="sm" variant="outline" className="rounded-full">Abrir</Button>
                </Link>
                <Button size="icon" variant="ghost" className="rounded-full" onClick={() => openEdit(s)} aria-label="Editar aluno">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="rounded-full" onClick={() => onDelete(s.id)} aria-label="Excluir aluno">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-neutral-500">Nenhum aluno.</div>
        )}
        </div>
      </div>



      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
          </div>
          <PaginationBar page={currentPage} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

function PaginationBar({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const go = (p: number) => onChange(Math.min(Math.max(1, p), totalPages));
  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="outline" onClick={() => go(1)} disabled={page === 1} aria-label="Primeira página">«</Button>
      <Button size="sm" variant="outline" onClick={() => go(page - 1)} disabled={page === 1} aria-label="Página anterior">‹</Button>
      {pages.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={p === page ? "default" : "outline"}
          onClick={() => go(p)}
          className="min-w-9"
        >
          {p}
        </Button>
      ))}
      <Button size="sm" variant="outline" onClick={() => go(page + 1)} disabled={page === totalPages} aria-label="Próxima página">›</Button>
      <Button size="sm" variant="outline" onClick={() => go(totalPages)} disabled={page === totalPages} aria-label="Última página">»</Button>
    </div>
  );

}


function Field({
  label,
  className,
  children,
  hint,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label.endsWith("*") ? (
          <>
            {label.slice(0, -1)}
            <span className="text-destructive">*</span>
          </>
        ) : (
          label
        )}
      </Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function BoolChk({
  label,
  checked,
  onChange,
  required,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
        checked
          ? "border-primary/35 bg-primary/[0.04]"
          : "border-neutral-200/80 bg-card hover:border-neutral-300 hover:bg-muted/40",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span className="flex-1 leading-snug">{label}</span>
      {required && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            checked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800",
          )}
        >
          {checked ? "Registrado" : "Obrigatório"}
        </span>
      )}
    </label>
  );
}

/** Bloco da ficha: cabeçalho com ícone, título e descrição + grade de campos. */
function Section({
  icon: Icon,
  title,
  description,
  badge,
  tone = "default",
  gridClassName = "grid gap-3 md:grid-cols-2",
  children,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: "default" | "warn";
  gridClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-xs transition-colors sm:p-5",
        tone === "warn" ? "border-amber-300/80 ring-2 ring-amber-100" : "border-neutral-200/80",
      )}
    >
      <div className="mb-4 flex items-start gap-2.5">
        {Icon && (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold leading-tight">{title}</h4>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className={gridClassName}>{children}</div>
    </section>
  );
}

/** Cartão lateral com o resumo ao vivo do aluno sendo cadastrado. */
function StudentSummaryCard({
  isEdit,
  name,
  photoUrl,
  age,
  cpf,
  unitName,
  beltText,
  planText,
  consentsOk,
}: {
  isEdit: boolean;
  name: string;
  photoUrl: string | null;
  age: number | null;
  cpf: string;
  unitName: string | null;
  beltText: string | null;
  planText: string | null;
  consentsOk: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const rows: Array<{ icon: ComponentType<{ className?: string }>; label: string; value: string; tone?: "ok" | "warn" }> = [
    { icon: Fingerprint, label: "CPF", value: cpf || "—" },
    { icon: Building2, label: "Unidade", value: unitName || "—" },
    { icon: Award, label: "Faixa", value: beltText || "—" },
    { icon: Wallet, label: "Plano", value: planText || "—" },
    { icon: ShieldCheck, label: "Termos", value: consentsOk ? "Registrados" : "Pendentes", tone: consentsOk ? "ok" : "warn" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-card shadow-xs">
      <div className="h-12 bg-[linear-gradient(135deg,#2a0a0c_0%,#7f1417_100%)]" />
      <div className="-mt-7 px-4 pb-4">
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-gradient-to-br from-red-500 to-red-800 text-lg font-bold text-white shadow-md">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : initials ? (
            initials
          ) : (
            <User className="h-6 w-6" />
          )}
        </div>
        <div className="mt-2 truncate text-sm font-semibold">{name || (isEdit ? "Aluno" : "Novo aluno")}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{age != null ? `${age} ${age === 1 ? "ano" : "anos"}` : "Idade não informada"}</span>
          {age != null && age < 18 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-800">Menor</span>
          )}
        </div>
        <dl className="mt-3 space-y-2 border-t pt-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-[12px]">
              <r.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <dt className="w-16 shrink-0 text-muted-foreground">{r.label}</dt>
              <dd
                className={cn(
                  "min-w-0 flex-1 truncate text-right font-medium",
                  r.tone === "ok" ? "text-emerald-700" : r.tone === "warn" ? "text-amber-700" : "text-foreground",
                )}
                title={r.value}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function StudentKpi({ icon: Icon, label, value, accent = "from-red-500 to-red-700" }: { icon: any; label: string; value: any; accent?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-all">
      <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-[0.08] blur-2xl group-hover:opacity-[0.14] transition-opacity`} />
      <div className="relative flex items-center gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md ring-1 ring-white/20`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="text-2xl font-black tracking-tight tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}

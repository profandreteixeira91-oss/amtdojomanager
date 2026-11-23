import { createFileRoute, useLoaderData, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  getPublicEnrollmentBundle,
  publicEnrollStudent,
  publicUploadEnrollmentPhoto,
  type PublicEnrollmentBundle,
  type PublicPlan,
} from "@/lib/dojo/public-enrollment.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { paymentMethodLabel } from "@/lib/dojo/payment-methods";
import { degreeUnit } from "@/lib/dojo/degree-label";
import { useForceLightTheme } from "@/hooks/useForceLightTheme";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertCircle,
  Banknote,
  Barcode,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  HeartPulse,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Rota: /matricula/<slug> (o mesmo componente atende /dojo/matricula) */
/* ------------------------------------------------------------------ */

/** Dados do dojo carregados no servidor: a página já abre pronta e o link compartilhado mostra o nome do dojo. */
export function loadEnrollmentBundle(slug: string): Promise<PublicEnrollmentBundle | null> {
  return getPublicEnrollmentBundle({ data: { slug } }).catch(() => null);
}

export function enrollmentHead(bundle: PublicEnrollmentBundle | null | undefined) {
  const name = bundle?.academy.trade_name || bundle?.academy.legal_name || "Dojo";
  const title = `Matrícula online · ${name}`;
  const description = `Faça sua matrícula no ${name} em poucos minutos: escolha o plano, preencha seus dados e pague online com segurança.`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      ...(bundle?.academy.logo_url
        ? [{ property: "og:image", content: bundle.academy.logo_url }]
        : []),
      { name: "theme-color", content: brandColor(bundle?.academy.brand_primary) },
    ],
  };
}

export const Route = createFileRoute("/matricula/$slug")({
  loader: ({ params }) => loadEnrollmentBundle(params.slug),
  head: ({ loaderData }) => enrollmentHead(loaderData),
  component: PublicEnrollmentPage,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const DEFAULT_BRAND = "#b91c1c";

function brandColor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : DEFAULT_BRAND;
}

function hexRgb(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Texto legível sobre a cor do dojo (preto em cores claras, branco nas escuras). */
function inkOn(hex: string): string {
  const [r, g, b] = hexRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111111" : "#ffffff";
}

/** Mistura a cor com preto (amount 0..1), para o degradê do topo. */
function shade(hex: string, amount: number): string {
  const [r, g, b] = hexRgb(hex).map((c) => Math.round(c * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

const digits = (v: string) => v.replace(/\D/g, "");

const capitalize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

function maskPhone(v: string): string {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function maskCpf(v: string): string {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

function maskCep(v: string): string {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function validCpf(v: string): boolean {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

function ageFrom(birth: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

function frequencyText(p: PublicPlan): string {
  const map: Record<string, string> = {
    monthly: "por mês",
    bimonthly: "a cada 2 meses",
    quarterly: "por trimestre",
    quadrimestral: "por quadrimestre",
    semiannual: "por semestre",
    annual: "por ano",
  };
  if (p.frequency === "custom")
    return p.custom_months ? `a cada ${p.custom_months} meses` : "por período";
  return map[p.frequency || "monthly"] ?? "por mês";
}

/** Nome da forma de pagamento; os códigos do gateway (cartão, boleto) não estão no catálogo manual. */
const GATEWAY_METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  boleto: "Boleto",
  cash: "Dinheiro",
  manual: "Combinar com a academia",
  bank_transfer: "Transferência bancária",
};

function methodLabel(code: string): string {
  const label = paymentMethodLabel(code);
  return label && label !== code ? label : (GATEWAY_METHOD_LABEL[code] ?? code);
}

function methodIcon(code: string) {
  if (code === "pix") return QrCode;
  if (code.includes("card")) return CreditCard;
  if (code === "boleto") return Barcode;
  if (code === "cash") return Banknote;
  return Wallet;
}

/* ------------------------------------------------------------------ */
/* Estado do formulário                                                */
/* ------------------------------------------------------------------ */

type Anamnesis = {
  heart_issues?: boolean;
  hypertension?: boolean;
  diabetes?: boolean;
  asthma?: boolean;
  smoking?: boolean;
  alcohol?: boolean;
  pregnant?: boolean;
  medical_conditions?: string;
  medications?: string;
  allergies?: string;
  surgeries?: string;
  injuries?: string;
  physical_activity_level?: string;
  objectives?: string;
  other?: string;
};

type ModalityRow = { modality: string; belt_id: string; degree: number };

type Form = {
  full_name: string;
  email: string;
  phone: string;
  cpf: string;
  rg: string;
  birth_date: string;
  gender: string;
  nationality: string;
  marital_status: string;
  profession: string;
  blood_type: string;
  health_insurance: string;
  zip: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  guardian_name: string;
  guardian_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  unit_id: string;
  already_trains: boolean;
  modalities: ModalityRow[];
  anamnesis: Anamnesis;
  has_medical_clearance: boolean;
  medical_clearance_date: string;
  photo_url: string;
  lgpd_consent: boolean;
  terms_accepted: boolean;
  image_rights_consent: boolean;
  facial_recognition_consent: boolean;
};

const EMPTY: Form = {
  full_name: "",
  email: "",
  phone: "",
  cpf: "",
  rg: "",
  birth_date: "",
  gender: "",
  nationality: "",
  marital_status: "",
  profession: "",
  blood_type: "",
  health_insurance: "",
  zip: "",
  street: "",
  address_number: "",
  address_complement: "",
  neighborhood: "",
  city: "",
  state: "",
  guardian_name: "",
  guardian_phone: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  unit_id: "",
  already_trains: false,
  modalities: [],
  anamnesis: {},
  has_medical_clearance: false,
  medical_clearance_date: "",
  photo_url: "",
  lgpd_consent: false,
  terms_accepted: false,
  image_rights_consent: false,
  facial_recognition_consent: false,
};

const STEPS = [
  { key: "plano", label: "Plano", title: "Escolha seu plano", icon: CreditCard },
  { key: "dados", label: "Dados", title: "Seus dados", icon: UserRound },
  { key: "endereco", label: "Endereço", title: "Endereço e contato de emergência", icon: MapPin },
  { key: "treino", label: "Treino", title: "Treino e saúde", icon: HeartPulse },
  { key: "confirmar", label: "Confirmar", title: "Foto e confirmação", icon: ShieldCheck },
] as const;
const LAST = STEPS.length - 1;

const CONDITIONS: Array<[keyof Anamnesis, string]> = [
  ["heart_issues", "Problema cardíaco"],
  ["hypertension", "Pressão alta"],
  ["diabetes", "Diabetes"],
  ["asthma", "Asma / bronquite"],
  ["smoking", "Fumante"],
  ["alcohol", "Consome álcool"],
  ["pregnant", "Gestante"],
];

const OBJECTIVES = [
  "Saúde e bem-estar",
  "Defesa pessoal",
  "Condicionamento",
  "Emagrecimento",
  "Competição",
  "Disciplina e foco",
];

const ACTIVITY = [
  { v: "sedentario", l: "Sedentário" },
  { v: "leve", l: "1–2x por semana" },
  { v: "moderado", l: "3–4x por semana" },
  { v: "intenso", l: "5x ou mais" },
];

const RELATIONS = ["Mãe", "Pai", "Cônjuge", "Irmão(ã)", "Amigo(a)"];

type Errors = Partial<Record<string, string>>;

/* ------------------------------------------------------------------ */
/* Peças de interface                                                  */
/* ------------------------------------------------------------------ */

const fieldCls = "h-11 text-base sm:text-sm";
const selectCls =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm";

function Field({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)} data-field={id}>
      <Label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
        {required ? <span className="ml-0.5 text-[var(--brand)]">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs font-medium text-red-600" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition",
        active
          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-neutral-900"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300",
        className,
      )}
    >
      {active ? <Check className="h-3.5 w-3.5 text-[var(--brand)]" /> : null}
      {children}
    </button>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-neutral-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Collapsible({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-xl border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-neutral-800"
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 text-neutral-500 transition", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-neutral-200 p-4">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function PublicEnrollmentPage() {
  useForceLightTheme();
  const { slug } = useParams({ strict: false }) as { slug: string };
  const bundle = useLoaderData({ strict: false }) as PublicEnrollmentBundle | null | undefined;
  const navigate = useNavigate();
  const enrollFn = useServerFn(publicEnrollStudent);
  const uploadPhotoFn = useServerFn(publicUploadEnrollmentPhoto);

  const draftKey = `amt-matricula:${slug}`;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [planId, setPlanId] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cepState, setCepState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [restored, setRestored] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  const academy = bundle?.academy;
  const plans = useMemo(() => bundle?.plans ?? [], [bundle]);
  const units = bundle?.units ?? [];
  const belts = useMemo(() => bundle?.belts ?? [], [bundle]);
  const brand = brandColor(academy?.brand_primary);
  const name = academy?.trade_name || academy?.legal_name || "Dojo";

  const modalitiesAvail = useMemo(
    () => Array.from(new Set(belts.map((b) => b.modality).filter(Boolean))) as string[],
    [belts],
  );
  const selectedPlan = plans.find((p) => p.id === planId);
  const methods = useMemo(() => {
    if (!selectedPlan) return [] as string[];
    const raw = Array.isArray(selectedPlan.payment_methods) ? selectedPlan.payment_methods : [];
    const enabled = raw.filter((m) => m && (m.enabled === true || m.enabled === undefined));
    return enabled.length ? enabled.map((m) => String(m.code)) : ["pix", "manual"];
  }, [selectedPlan]);
  const fee = Number(selectedPlan?.enrollment_fee ?? 0);
  const total = selectedPlan ? Number(selectedPlan.amount ?? 0) + fee : 0;
  const age = ageFrom(form.birth_date);
  const minor = age !== null && age < 18;

  // Rascunho na aba: recarregar a página não apaga o que já foi preenchido (some ao fechar a aba).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw);
        setForm({ ...EMPTY, ...d.form, photo_url: d.form?.photo_url ?? "" });
        if (d.planId) setPlanId(d.planId);
        if (d.method) setMethod(d.method);
        if (typeof d.step === "number") setStep(Math.min(LAST, Math.max(0, d.step)));
      }
    } catch {
      /* sem rascunho */
    }
    setRestored(true);
  }, [draftKey]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ form, planId, method, step }));
    } catch {
      /* armazenamento indisponível */
    }
  }, [draftKey, form, planId, method, step, restored]);

  // Um plano só: já vem escolhido. Uma forma de pagamento só: idem.
  useEffect(() => {
    if (restored && !planId && plans.length === 1) setPlanId(plans[0].id);
  }, [restored, planId, plans]);
  useEffect(() => {
    if (methods.length === 1 && method !== methods[0]) setMethod(methods[0]);
    if (method && methods.length && !methods.includes(method)) setMethod("");
  }, [methods, method]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: undefined }));
  };
  const setAnamn = <K extends keyof Anamnesis>(k: K, v: Anamnesis[K]) =>
    setForm((f) => ({ ...f, anamnesis: { ...f.anamnesis, [k]: v } }));

  async function lookupCep(value: string) {
    const d = digits(value);
    if (d.length !== 8) return;
    setCepState("loading");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = await res.json();
      if (j && !j.erro) {
        setForm((f) => ({
          ...f,
          street: j.logradouro || f.street,
          neighborhood: j.bairro || f.neighborhood,
          city: j.localidade || f.city,
          state: (j.uf || f.state || "").slice(0, 2),
        }));
        setCepState("ok");
        window.setTimeout(() => document.getElementById("f-number")?.focus(), 50);
      } else setCepState("fail");
    } catch {
      setCepState("fail");
    }
  }

  async function handlePhotoFile(file: File) {
    if (file.size > 3_000_000) {
      toast.error("Imagem muito grande (máx. 3 MB).");
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Falha ao ler o arquivo"));
        fr.readAsDataURL(file);
      });
      const res = await uploadPhotoFn({ data: { slug, data_url: dataUrl } });
      set("photo_url", res.url);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      if (!planId) e.plan = "Escolha um plano para continuar.";
      else if (!method) e.method = "Escolha a forma de pagamento.";
    }
    if (s === 1) {
      const n = form.full_name.trim();
      if (n.length < 2) e.full_name = "Informe o nome completo.";
      else if (!/\S+\s+\S+/.test(n)) e.full_name = "Informe nome e sobrenome.";
      if (digits(form.phone).length < 10) e.phone = "Informe um WhatsApp com DDD.";
      if (form.email && !validEmail(form.email)) e.email = "E-mail inválido.";
      if (form.cpf && !validCpf(form.cpf)) e.cpf = "CPF inválido. Confira os números.";
      if (form.birth_date) {
        if (age === null || age < 0 || age > 110) e.birth_date = "Data de nascimento inválida.";
      }
      if (minor) {
        if (form.guardian_name.trim().length < 2)
          e.guardian_name = "Informe o nome do responsável.";
        if (digits(form.guardian_phone).length < 10)
          e.guardian_phone = "Informe o WhatsApp do responsável.";
      }
    }
    if (s === 2) {
      if (form.emergency_contact_phone && digits(form.emergency_contact_phone).length < 10)
        e.emergency_contact_phone = "Telefone incompleto.";
    }
    if (s === 3) {
      if (form.already_trains && form.modalities.some((m) => !m.modality || !m.belt_id))
        e.modalities = "Escolha a faixa de cada modalidade, ou remova a linha.";
      if (form.has_medical_clearance && !form.medical_clearance_date)
        e.medical_clearance_date = "Informe a data da liberação.";
    }
    if (s === LAST) {
      if (!form.lgpd_consent) e.lgpd_consent = "Obrigatório para concluir a matrícula.";
      if (!form.terms_accepted) e.terms_accepted = "Obrigatório para concluir a matrícula.";
    }
    return e;
  }

  function showErrors(e: Errors) {
    setErrors(e);
    const first = Object.keys(e)[0];
    window.setTimeout(() => {
      const el =
        document.getElementById(`f-${first}`) ??
        document.querySelector<HTMLElement>(`[data-field="f-${first}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
        el.focus({ preventScroll: true });
    }, 30);
  }

  function goTo(s: number) {
    setErrors({});
    setStep(s);
    window.setTimeout(
      () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      20,
    );
  }

  function next(ev?: FormEvent) {
    ev?.preventDefault();
    const e = validate(step);
    if (Object.keys(e).length) return showErrors(e);
    if (step < LAST) goTo(step + 1);
    else void submit();
  }

  async function submit() {
    for (let s = 0; s <= LAST; s++) {
      const e = validate(s);
      if (Object.keys(e).length) {
        if (s !== step) goTo(s);
        window.setTimeout(() => showErrors(e), 60);
        return;
      }
    }
    if (!planId) return;
    setSubmitting(true);
    try {
      const { already_trains, ...rest } = form;
      const objectives = form.anamnesis.objectives;
      const res = await enrollFn({
        data: {
          ...rest,
          slug,
          plan_id: planId,
          payment_method: method || "manual",
          include_enrollment_fee: true,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          unit_id: form.unit_id || null,
          modalities: already_trains
            ? form.modalities
                .filter((m) => m.modality && m.belt_id)
                .map((m) => ({ modality: m.modality, belt_id: m.belt_id, degree: m.degree ?? 0 }))
            : [],
          anamnesis: { ...form.anamnesis, objectives: objectives || undefined },
        },
      });
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* nada */
      }
      toast.success("Matrícula concluída! Abrindo o pagamento…");
      navigate({ to: "/pay/$invoiceId", params: { invoiceId: res.invoice_id } });
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível concluir a matrícula. Tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------- estados de borda ------------------------- */

  if (!academy) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
            <AlertCircle className="h-6 w-6 text-neutral-500" />
          </div>
          <h1 className="text-lg font-semibold text-neutral-900">Link de matrícula indisponível</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Este endereço não existe ou o dojo desativou a matrícula online. Peça o link atualizado
            à academia.
          </p>
        </div>
      </div>
    );
  }

  const brandVars = {
    "--brand": brand,
    "--brand-ink": inkOn(brand),
    "--brand-soft": `color-mix(in oklab, ${brand} 10%, white)`,
  } as CSSProperties;
  const current = STEPS[step];
  const objectivesSel = (form.anamnesis.objectives ?? "").split(", ").filter(Boolean);
  const conditionsCount = CONDITIONS.filter(([k]) => form.anamnesis[k]).length;

  /* ------------------------------ resumo ------------------------------ */

  const summary = (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Resumo</p>
        {selectedPlan ? (
          <>
            <p className="mt-2 font-semibold text-neutral-900">{selectedPlan.name}</p>
            <p className="text-sm text-neutral-600">
              {brl(selectedPlan.amount)} {frequencyText(selectedPlan)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-500">Escolha um plano para ver o valor.</p>
        )}
      </div>
      {selectedPlan ? (
        <dl className="space-y-1.5 border-t border-neutral-200 pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-600">1ª mensalidade</dt>
            <dd className="tabular-nums">{brl(selectedPlan.amount)}</dd>
          </div>
          {fee > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Taxa de matrícula</dt>
              <dd className="tabular-nums">{brl(fee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-base font-semibold">
            <dt>Total hoje</dt>
            <dd className="tabular-nums text-[var(--brand)]">{brl(total)}</dd>
          </div>
          {method ? (
            <p className="pt-1 text-xs text-neutral-500">Pagamento: {methodLabel(method)}</p>
          ) : null}
        </dl>
      ) : null}
      <ul className="space-y-2 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
        <li className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-emerald-600" /> Pagamento online seguro
        </li>
        <li className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Dados protegidos (LGPD)
        </li>
        <li className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-emerald-600" /> Leva cerca de 3 minutos
        </li>
      </ul>
    </div>
  );

  /* ------------------------------ passos ------------------------------ */

  const stepPlan = (
    <div className="space-y-6">
      {plans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">
          Nenhum plano disponível no momento. Fale com a academia para concluir sua matrícula.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Planos"
          className="grid gap-3 sm:grid-cols-2"
          data-field="f-plan"
        >
          {plans.map((p) => {
            const active = p.id === planId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setPlanId(p.id);
                  setErrors({});
                }}
                className={cn(
                  "relative rounded-2xl border-2 bg-white p-3.5 text-left transition sm:p-4",
                  active
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-neutral-200 hover:border-neutral-300",
                )}
              >
                <span
                  className={cn(
                    "absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border-2",
                    active ? "border-[var(--brand)] bg-[var(--brand)]" : "border-neutral-300",
                  )}
                >
                  {active ? <Check className="h-3 w-3 text-[var(--brand-ink)]" /> : null}
                </span>
                <p className="pr-8 font-semibold text-neutral-900">{p.name}</p>
                {p.description ? (
                  <p className="mt-1 text-xs text-neutral-600">{p.description}</p>
                ) : null}
                <p className="mt-2 text-xl font-bold tracking-tight text-neutral-900 sm:mt-3 sm:text-2xl">
                  {brl(p.amount)}
                  <span className="ml-1 text-xs font-normal text-neutral-500">
                    {frequencyText(p)}
                  </span>
                </p>
                {Number(p.enrollment_fee ?? 0) > 0 ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    + taxa de matrícula de {brl(Number(p.enrollment_fee))}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-emerald-700">Sem taxa de matrícula</p>
                )}
              </button>
            );
          })}
        </div>
      )}
      {errors.plan ? (
        <p className="flex items-center gap-1 text-sm font-medium text-red-600" role="alert">
          <AlertCircle className="h-4 w-4" /> {errors.plan}
        </p>
      ) : null}

      {selectedPlan && methods.length > 0 ? (
        <Section title="Como você prefere pagar?">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3" data-field="f-method">
            {methods.map((code) => {
              const Icon = methodIcon(code);
              const active = method === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMethod(code);
                    setErrors({});
                  }}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium transition",
                    active
                      ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                      : "border-neutral-200 bg-white hover:border-neutral-300",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-[var(--brand)]" : "text-neutral-500",
                    )}
                  />
                  {methodLabel(code)}
                </button>
              );
            })}
          </div>
          {errors.method ? (
            <p className="flex items-center gap-1 text-sm font-medium text-red-600" role="alert">
              <AlertCircle className="h-4 w-4" /> {errors.method}
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );

  const stepData = (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="f-full_name"
          label="Nome completo"
          required
          error={errors.full_name}
          className="sm:col-span-2"
        >
          <Input
            id="f-full_name"
            className={fieldCls}
            autoComplete="name"
            autoCapitalize="words"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            placeholder="Como está no documento"
          />
        </Field>
        <Field
          id="f-phone"
          label="WhatsApp"
          required
          error={errors.phone}
          hint="A academia usa este número para falar com você."
        >
          <Input
            id="f-phone"
            className={fieldCls}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={form.phone}
            onChange={(e) => set("phone", maskPhone(e.target.value))}
            placeholder="(00) 00000-0000"
          />
        </Field>
        <Field
          id="f-email"
          label="E-mail"
          error={errors.email}
          hint="Para receber recibos e o acesso ao app."
        >
          <Input
            id="f-email"
            className={fieldCls}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="voce@email.com"
          />
        </Field>
        <Field id="f-birth_date" label="Data de nascimento" error={errors.birth_date}>
          <Input
            id="f-birth_date"
            className={fieldCls}
            type="date"
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
            value={form.birth_date}
            onChange={(e) => set("birth_date", e.target.value)}
          />
        </Field>
        <Field id="f-cpf" label="CPF" error={errors.cpf}>
          <Input
            id="f-cpf"
            className={fieldCls}
            inputMode="numeric"
            value={form.cpf}
            onChange={(e) => set("cpf", maskCpf(e.target.value))}
            placeholder="000.000.000-00"
          />
        </Field>
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-sm font-medium text-neutral-800">Gênero</p>
          <div className="flex flex-wrap gap-2">
            {[
              ["masculino", "Masculino"],
              ["feminino", "Feminino"],
              ["outro", "Outro"],
            ].map(([v, l]) => (
              <Chip
                key={v}
                active={form.gender === v}
                onClick={() => set("gender", form.gender === v ? "" : v)}
              >
                {l}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {minor ? (
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">Responsável pelo aluno</p>
            <p className="text-xs text-amber-800">
              O aluno tem {age} {age === 1 ? "ano" : "anos"}: os dados de um responsável são
              obrigatórios.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="f-guardian_name"
              label="Nome do responsável"
              required
              error={errors.guardian_name}
            >
              <Input
                id="f-guardian_name"
                className={cn(fieldCls, "bg-white")}
                autoCapitalize="words"
                value={form.guardian_name}
                onChange={(e) => set("guardian_name", e.target.value)}
              />
            </Field>
            <Field
              id="f-guardian_phone"
              label="WhatsApp do responsável"
              required
              error={errors.guardian_phone}
            >
              <Input
                id="f-guardian_phone"
                className={cn(fieldCls, "bg-white")}
                type="tel"
                inputMode="tel"
                value={form.guardian_phone}
                onChange={(e) => set("guardian_phone", maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
              />
            </Field>
          </div>
        </div>
      ) : null}

      <Collapsible title="Mais informações (opcional)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="f-rg" label="RG">
            <Input
              id="f-rg"
              className={fieldCls}
              value={form.rg}
              onChange={(e) => set("rg", e.target.value)}
            />
          </Field>
          <Field id="f-nationality" label="Nacionalidade">
            <Input
              id="f-nationality"
              className={fieldCls}
              value={form.nationality}
              onChange={(e) => set("nationality", e.target.value)}
              placeholder="Brasileira"
            />
          </Field>
          <Field id="f-marital_status" label="Estado civil">
            <select
              id="f-marital_status"
              className={selectCls}
              value={form.marital_status}
              onChange={(e) => set("marital_status", e.target.value)}
            >
              <option value="">Selecione</option>
              <option value="solteiro">Solteiro(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viuvo">Viúvo(a)</option>
              <option value="uniao_estavel">União estável</option>
            </select>
          </Field>
          <Field id="f-profession" label="Profissão">
            <Input
              id="f-profession"
              className={fieldCls}
              autoComplete="organization-title"
              value={form.profession}
              onChange={(e) => set("profession", e.target.value)}
            />
          </Field>
        </div>
      </Collapsible>
    </div>
  );

  const stepAddress = (
    <div className="space-y-8">
      <Section title="Endereço">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            id="f-zip"
            label="CEP"
            className="sm:col-span-2"
            hint={
              cepState === "loading" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando endereço…
                </span>
              ) : cepState === "ok" ? (
                <span className="text-emerald-700">Endereço preenchido. Confira o número.</span>
              ) : cepState === "fail" ? (
                "CEP não encontrado. Preencha abaixo."
              ) : (
                "Digite o CEP e completamos o resto."
              )
            }
          >
            <Input
              id="f-zip"
              className={fieldCls}
              inputMode="numeric"
              autoComplete="postal-code"
              value={form.zip}
              onChange={(e) => {
                const v = maskCep(e.target.value);
                set("zip", v);
                if (digits(v).length === 8) void lookupCep(v);
                else setCepState("idle");
              }}
              placeholder="00000-000"
            />
          </Field>
          <Field id="f-street" label="Rua" className="sm:col-span-4">
            <Input
              id="f-street"
              className={fieldCls}
              autoComplete="address-line1"
              value={form.street}
              onChange={(e) => set("street", e.target.value)}
            />
          </Field>
          <Field id="f-number" label="Número" className="sm:col-span-2">
            <Input
              id="f-number"
              className={fieldCls}
              inputMode="numeric"
              value={form.address_number}
              onChange={(e) => set("address_number", e.target.value)}
            />
          </Field>
          <Field id="f-address_complement" label="Complemento" className="sm:col-span-4">
            <Input
              id="f-address_complement"
              className={fieldCls}
              autoComplete="address-line2"
              value={form.address_complement}
              onChange={(e) => set("address_complement", e.target.value)}
              placeholder="Apto, bloco, casa…"
            />
          </Field>
          <Field id="f-neighborhood" label="Bairro" className="sm:col-span-3">
            <Input
              id="f-neighborhood"
              className={fieldCls}
              value={form.neighborhood}
              onChange={(e) => set("neighborhood", e.target.value)}
            />
          </Field>
          <Field id="f-city" label="Cidade" className="sm:col-span-2">
            <Input
              id="f-city"
              className={fieldCls}
              autoComplete="address-level2"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
          <Field id="f-state" label="UF" className="sm:col-span-1">
            <Input
              id="f-state"
              className={fieldCls}
              autoComplete="address-level1"
              maxLength={2}
              value={form.state}
              onChange={(e) => set("state", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Contato de emergência"
        description="Quem a academia deve avisar se algo acontecer durante o treino."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="f-emergency_contact_name" label="Nome">
            <Input
              id="f-emergency_contact_name"
              className={fieldCls}
              autoCapitalize="words"
              value={form.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name", e.target.value)}
            />
          </Field>
          <Field
            id="f-emergency_contact_phone"
            label="Telefone"
            error={errors.emergency_contact_phone}
          >
            <Input
              id="f-emergency_contact_phone"
              className={fieldCls}
              type="tel"
              inputMode="tel"
              value={form.emergency_contact_phone}
              onChange={(e) => set("emergency_contact_phone", maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </Field>
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-sm font-medium text-neutral-800">Parentesco</p>
            <div className="flex flex-wrap gap-2">
              {RELATIONS.map((r) => (
                <Chip
                  key={r}
                  active={form.emergency_contact_relationship === r}
                  onClick={() =>
                    set(
                      "emergency_contact_relationship",
                      form.emergency_contact_relationship === r ? "" : r,
                    )
                  }
                >
                  {r}
                </Chip>
              ))}
              <Input
                aria-label="Outro parentesco"
                className="h-10 w-40 rounded-full text-sm"
                placeholder="Outro…"
                value={
                  RELATIONS.includes(form.emergency_contact_relationship)
                    ? ""
                    : form.emergency_contact_relationship
                }
                onChange={(e) => set("emergency_contact_relationship", e.target.value)}
              />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );

  const stepTraining = (
    <div className="space-y-8">
      {units.length > 0 ? (
        <Section title="Onde você vai treinar?">
          <div className="grid gap-2 sm:grid-cols-2">
            {units.map((u) => (
              <Chip
                key={u.id}
                active={form.unit_id === u.id}
                onClick={() => set("unit_id", form.unit_id === u.id ? "" : u.id)}
                className="justify-start rounded-xl"
              >
                <MapPin className="h-4 w-4 text-neutral-500" /> {u.name}
              </Chip>
            ))}
          </div>
        </Section>
      ) : null}

      {belts.length > 0 ? (
        <Section
          title="Você já treina?"
          description="Se já tem graduação, informe para começar na faixa certa."
        >
          <div className="flex flex-wrap gap-2">
            <Chip
              active={!form.already_trains}
              onClick={() => setForm((f) => ({ ...f, already_trains: false }))}
            >
              Sou iniciante
            </Chip>
            <Chip
              active={form.already_trains}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  already_trains: true,
                  modalities: f.modalities.length
                    ? f.modalities
                    : [{ modality: modalitiesAvail[0] ?? "", belt_id: "", degree: 0 }],
                }))
              }
            >
              Já tenho graduação
            </Chip>
          </div>
          {form.already_trains ? (
            <div className="space-y-3" data-field="f-modalities">
              {form.modalities.map((m, idx) => {
                const beltsOfMod = belts.filter((b) => b.modality === m.modality);
                const belt = belts.find((b) => b.id === m.belt_id);
                const maxDeg = Number(belt?.max_degrees ?? 0);
                const update = (patch: Partial<ModalityRow>) =>
                  setForm((f) => {
                    const rows = f.modalities.slice();
                    rows[idx] = { ...rows[idx], ...patch };
                    return { ...f, modalities: rows };
                  });
                return (
                  <div
                    key={idx}
                    className="grid gap-3 rounded-xl border border-neutral-200 p-3 sm:grid-cols-12 sm:items-end"
                  >
                    {modalitiesAvail.length > 1 ? (
                      <Field id={`f-mod-${idx}`} label="Modalidade" className="sm:col-span-4">
                        <select
                          id={`f-mod-${idx}`}
                          className={selectCls}
                          value={m.modality}
                          onChange={(e) =>
                            update({ modality: e.target.value, belt_id: "", degree: 0 })
                          }
                        >
                          {modalitiesAvail.map((mod) => (
                            <option key={mod} value={mod}>
                              {capitalize(mod)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    <Field
                      id={`f-belt-${idx}`}
                      label={
                        modalitiesAvail.length > 1
                          ? "Faixa"
                          : `Faixa${m.modality ? ` (${capitalize(m.modality)})` : ""}`
                      }
                      className={modalitiesAvail.length > 1 ? "sm:col-span-4" : "sm:col-span-7"}
                    >
                      <select
                        id={`f-belt-${idx}`}
                        className={selectCls}
                        value={m.belt_id}
                        onChange={(e) => update({ belt_id: e.target.value, degree: 0 })}
                      >
                        <option value="">Selecione</option>
                        {beltsOfMod.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {maxDeg > 0 ? (
                      <Field
                        id={`f-deg-${idx}`}
                        label={degreeUnit(m.modality)}
                        className="sm:col-span-3"
                      >
                        <select
                          id={`f-deg-${idx}`}
                          className={selectCls}
                          value={m.degree}
                          onChange={(e) => update({ degree: Number(e.target.value) })}
                        >
                          {Array.from({ length: maxDeg + 1 }, (_, i) => (
                            <option key={i} value={i}>
                              {i === 0 ? "Sem grau" : i}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <div className="hidden sm:col-span-3 sm:block" />
                    )}
                    <div className="flex sm:col-span-1 sm:justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 text-neutral-500 hover:text-red-600"
                        aria-label="Remover modalidade"
                        onClick={() =>
                          setForm((f) => {
                            const rows = f.modalities.filter((_, i) => i !== idx);
                            return { ...f, modalities: rows, already_trains: rows.length > 0 };
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden">Remover</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
              {modalitiesAvail.length > 1 && form.modalities.length < modalitiesAvail.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      modalities: [
                        ...f.modalities,
                        {
                          modality:
                            modalitiesAvail.find(
                              (x) => !f.modalities.some((r) => r.modality === x),
                            ) ?? modalitiesAvail[0],
                          belt_id: "",
                          degree: 0,
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Outra modalidade
                </Button>
              ) : null}
              {errors.modalities ? (
                <p
                  className="flex items-center gap-1 text-xs font-medium text-red-600"
                  role="alert"
                >
                  <AlertCircle className="h-3.5 w-3.5" /> {errors.modalities}
                </p>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Saúde"
        description="Ajuda o professor a adaptar o treino com segurança. Marque o que se aplica."
      >
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map(([k, l]) => (
            <Chip
              key={k}
              active={!!form.anamnesis[k]}
              onClick={() => setAnamn(k, !form.anamnesis[k])}
            >
              {l}
            </Chip>
          ))}
        </div>
        {conditionsCount === 0 ? (
          <p className="text-xs text-neutral-500">Nenhuma condição marcada.</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="f-injuries" label="Lesões ou dores atuais">
            <Textarea
              id="f-injuries"
              rows={2}
              className="text-base sm:text-sm"
              value={form.anamnesis.injuries ?? ""}
              onChange={(e) => setAnamn("injuries", e.target.value)}
              placeholder="Ex.: dor no joelho direito"
            />
          </Field>
          <Field id="f-medications" label="Medicamentos em uso">
            <Textarea
              id="f-medications"
              rows={2}
              className="text-base sm:text-sm"
              value={form.anamnesis.medications ?? ""}
              onChange={(e) => setAnamn("medications", e.target.value)}
            />
          </Field>
        </div>
        <Collapsible title="Mais sobre sua saúde (opcional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="f-medical_conditions"
              label="Doenças ou condições diagnosticadas"
              className="sm:col-span-2"
            >
              <Textarea
                id="f-medical_conditions"
                rows={2}
                className="text-base sm:text-sm"
                value={form.anamnesis.medical_conditions ?? ""}
                onChange={(e) => setAnamn("medical_conditions", e.target.value)}
              />
            </Field>
            <Field id="f-allergies" label="Alergias">
              <Textarea
                id="f-allergies"
                rows={2}
                className="text-base sm:text-sm"
                value={form.anamnesis.allergies ?? ""}
                onChange={(e) => setAnamn("allergies", e.target.value)}
              />
            </Field>
            <Field id="f-surgeries" label="Cirurgias anteriores">
              <Textarea
                id="f-surgeries"
                rows={2}
                className="text-base sm:text-sm"
                value={form.anamnesis.surgeries ?? ""}
                onChange={(e) => setAnamn("surgeries", e.target.value)}
              />
            </Field>
            <Field id="f-blood_type" label="Tipo sanguíneo">
              <select
                id="f-blood_type"
                className={selectCls}
                value={form.blood_type}
                onChange={(e) => set("blood_type", e.target.value)}
              >
                <option value="">Não sei</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="f-health_insurance" label="Plano de saúde">
              <Input
                id="f-health_insurance"
                className={fieldCls}
                value={form.health_insurance}
                onChange={(e) => set("health_insurance", e.target.value)}
                placeholder="Nome do convênio"
              />
            </Field>
            <Field id="f-other" label="Outras observações" className="sm:col-span-2">
              <Textarea
                id="f-other"
                rows={2}
                className="text-base sm:text-sm"
                value={form.anamnesis.other ?? ""}
                onChange={(e) => setAnamn("other", e.target.value)}
              />
            </Field>
          </div>
        </Collapsible>
        <div className="space-y-3 rounded-xl bg-neutral-50 p-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-800">
            <Checkbox
              className="mt-0.5"
              checked={form.has_medical_clearance}
              onCheckedChange={(v) => set("has_medical_clearance", Boolean(v))}
            />
            Tenho liberação médica para atividade física
          </label>
          {form.has_medical_clearance ? (
            <Field
              id="f-medical_clearance_date"
              label="Data da liberação"
              required
              error={errors.medical_clearance_date}
              className="max-w-xs"
            >
              <Input
                id="f-medical_clearance_date"
                className={cn(fieldCls, "bg-white")}
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.medical_clearance_date}
                onChange={(e) => set("medical_clearance_date", e.target.value)}
              />
            </Field>
          ) : null}
        </div>
      </Section>

      <Section title="Seus objetivos">
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map((o) => {
            const on = objectivesSel.includes(o);
            return (
              <Chip
                key={o}
                active={on}
                onClick={() =>
                  setAnamn(
                    "objectives",
                    (on ? objectivesSel.filter((x) => x !== o) : [...objectivesSel, o]).join(", "),
                  )
                }
              >
                {o}
              </Chip>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-neutral-800">
            Com que frequência você se exercita hoje?
          </p>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY.map((a) => (
              <Chip
                key={a.v}
                active={form.anamnesis.physical_activity_level === a.v}
                onClick={() =>
                  setAnamn(
                    "physical_activity_level",
                    form.anamnesis.physical_activity_level === a.v ? "" : a.v,
                  )
                }
              >
                {a.l}
              </Chip>
            ))}
          </div>
        </div>
      </Section>
    </div>
  );

  const reviewRow = (label: string, value: ReactNode, to: number) => (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <div className="text-sm font-medium text-neutral-900">{value}</div>
      </div>
      <button
        type="button"
        onClick={() => goTo(to)}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
      >
        <Pencil className="h-3 w-3" /> Editar
      </button>
    </div>
  );

  const unitName = units.find((u) => u.id === form.unit_id)?.name;
  const grads = form.already_trains
    ? form.modalities
        .filter((m) => m.belt_id)
        .map((m) => {
          const b = belts.find((x) => x.id === m.belt_id);
          return `${b?.name ?? ""}${m.degree ? ` · ${m.degree} ${degreeUnit(m.modality).toLowerCase()}` : ""}`;
        })
    : [];

  const stepConfirm = (
    <div className="space-y-8">
      <Section
        title="Foto do aluno (opcional)"
        description="Aparece no seu perfil e permite o check-in por reconhecimento facial."
      >
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
            {form.photo_url ? (
              <img
                src={form.photo_url}
                alt="Foto do aluno"
                className="h-full w-full object-cover"
              />
            ) : (
              <Camera className="h-7 w-7 text-neutral-400" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePhotoFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />{" "}
                  {form.photo_url ? "Trocar foto" : "Tirar ou enviar foto"}
                </>
              )}
            </Button>
            {form.photo_url ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => set("photo_url", "")}
              >
                <X className="mr-1 h-4 w-4" /> Remover
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Confira seus dados">
        <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 px-4">
          {reviewRow(
            "Plano",
            selectedPlan
              ? `${selectedPlan.name} · ${brl(selectedPlan.amount)} ${frequencyText(selectedPlan)}`
              : "—",
            0,
          )}
          {reviewRow("Pagamento", method ? methodLabel(method) : "—", 0)}
          {reviewRow(
            "Aluno",
            <>
              {form.full_name || "—"}
              <span className="block text-xs font-normal text-neutral-600">
                {[form.phone, form.email].filter(Boolean).join(" · ")}
              </span>
              {minor && form.guardian_name ? (
                <span className="block text-xs font-normal text-neutral-600">
                  Responsável: {form.guardian_name}
                </span>
              ) : null}
            </>,
            1,
          )}
          {reviewRow(
            "Endereço",
            [
              form.street &&
                `${form.street}${form.address_number ? `, ${form.address_number}` : ""}`,
              form.city && `${form.city}${form.state ? `/${form.state}` : ""}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Não informado",
            2,
          )}
          {reviewRow(
            "Treino",
            [unitName, grads.length ? grads.join(" · ") : "Iniciante"].filter(Boolean).join(" · "),
            3,
          )}
        </div>
      </Section>

      <Section title="Termos e autorizações">
        <div className="space-y-3">
          {(
            [
              [
                "lgpd_consent",
                true,
                "Autorizo o tratamento dos meus dados pessoais pela academia, conforme a LGPD (Lei nº 13.709/2018), para matrícula, controle acadêmico e comunicação.",
              ],
              [
                "terms_accepted",
                true,
                "Estou ciente dos riscos da prática esportiva e aceito o regulamento interno e o termo de responsabilidade da academia.",
              ],
              [
                "image_rights_consent",
                false,
                "Autorizo o uso da minha imagem em fotos e vídeos de divulgação da academia (redes sociais, site e materiais internos).",
              ],
              [
                "facial_recognition_consent",
                false,
                "Autorizo o uso da minha foto para reconhecimento facial no check-in.",
              ],
            ] as Array<[keyof Form, boolean, string]>
          ).map(([k, required, text]) => (
            <div key={k} data-field={`f-${k}`}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-snug text-neutral-800 transition",
                  form[k]
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-neutral-200 hover:border-neutral-300",
                  errors[k] && "border-red-300 bg-red-50",
                )}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={!!form[k]}
                  onCheckedChange={(v) => set(k, Boolean(v) as never)}
                />
                <span>
                  {text}
                  {required ? (
                    <span className="ml-1 text-xs font-semibold text-[var(--brand)]">
                      (obrigatório)
                    </span>
                  ) : (
                    <span className="ml-1 text-xs text-neutral-500">(opcional)</span>
                  )}
                </span>
              </label>
              {errors[k] ? (
                <p
                  className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600"
                  role="alert"
                >
                  <AlertCircle className="h-3.5 w-3.5" /> {errors[k]}
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-neutral-500">
            Os aceites ficam registrados com data e hora. Ao concluir, você segue para o pagamento
            seguro da academia.
          </p>
        </div>
      </Section>
    </div>
  );

  const bodies = [stepPlan, stepData, stepAddress, stepTraining, stepConfirm];
  const nextLabel = step === LAST ? "Concluir e ir para o pagamento" : "Continuar";

  /* ------------------------------ layout ------------------------------ */

  return (
    <div className="min-h-dvh bg-neutral-100 pb-28 text-neutral-900 lg:pb-12" style={brandVars}>
      <header
        className="text-[var(--brand-ink)]"
        style={{ background: `linear-gradient(135deg, ${brand} 0%, ${shade(brand, 0.55)} 100%)` }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 pb-16 pt-6 sm:pt-8">
          {academy.logo_url ? (
            <img
              src={academy.logo_url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-lg sm:h-16 sm:w-16"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold sm:h-16 sm:w-16">
              {name[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
              Matrícula online
            </p>
            <h1 className="truncate text-xl font-bold leading-tight sm:text-3xl">{name}</h1>
            {academy.city || academy.state ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs opacity-80 sm:text-sm">
                <MapPin className="h-3.5 w-3.5" />{" "}
                {[academy.city, academy.state].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div ref={topRef} className="mx-auto -mt-10 max-w-6xl scroll-mt-4 px-4">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 rounded-3xl bg-white shadow-xl shadow-neutral-900/5 ring-1 ring-neutral-200">
            {/* Progresso */}
            <div className="border-b border-neutral-200 px-5 py-4 sm:px-8">
              <div className="flex items-center justify-between gap-3 sm:hidden">
                <p className="text-xs font-medium text-neutral-500">
                  Passo {step + 1} de {STEPS.length}
                </p>
                <p className="text-xs font-semibold text-neutral-800">{current.label}</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 sm:hidden">
                <div
                  className="h-full rounded-full bg-[var(--brand)] transition-all"
                  style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <ol className="hidden items-center gap-2 sm:flex">
                {STEPS.map((s, i) => {
                  const done = i < step;
                  const active = i === step;
                  const Icon = s.icon;
                  return (
                    <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
                      <button
                        type="button"
                        disabled={i > step}
                        onClick={() => goTo(i)}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium transition",
                          active && "bg-[var(--brand-soft)] text-neutral-900",
                          done && "text-neutral-700 hover:bg-neutral-100",
                          !active && !done && "text-neutral-400",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            done && "bg-emerald-600 text-white",
                            active && "bg-[var(--brand)] text-[var(--brand-ink)]",
                            !active && !done && "bg-neutral-100 text-neutral-400",
                          )}
                        >
                          {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                        </span>
                        <span className="truncate">{s.label}</span>
                      </button>
                      {i < LAST ? <span className="h-px min-w-3 flex-1 bg-neutral-200" /> : null}
                    </li>
                  );
                })}
              </ol>
            </div>

            <form noValidate onSubmit={next} className="px-5 py-6 sm:px-8 sm:py-8">
              <h2 className="mb-6 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                {current.title}
              </h2>
              {bodies[step]}

              {/* Ações (desktop) */}
              <div className="mt-8 hidden items-center justify-between gap-3 border-t border-neutral-200 pt-6 lg:flex">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={() => goTo(step - 1)}
                    disabled={submitting}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-11 bg-[var(--brand)] px-6 text-[var(--brand-ink)] hover:bg-[var(--brand)] hover:opacity-90"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Concluindo…
                    </>
                  ) : (
                    <>
                      {nextLabel} <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

              {/* Ações (celular): barra fixa com o total */}
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
                {selectedPlan ? (
                  <div className="mb-2 flex items-center justify-between text-xs text-neutral-600">
                    <span className="truncate">{selectedPlan.name}</span>
                    <span>
                      Total hoje <b className="text-sm text-neutral-900">{brl(total)}</b>
                    </span>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  {step > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-12 shrink-0 p-0"
                      aria-label="Voltar"
                      onClick={() => goTo(step - 1)}
                      disabled={submitting}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="h-12 flex-1 bg-[var(--brand)] text-base font-semibold text-[var(--brand-ink)] hover:bg-[var(--brand)] hover:opacity-90"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Concluindo…
                      </>
                    ) : (
                      <>
                        {step === LAST ? "Concluir e pagar" : "Continuar"}{" "}
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-6 rounded-3xl bg-white p-6 shadow-xl shadow-neutral-900/5 ring-1 ring-neutral-200">
              {summary}
            </div>
          </aside>
        </div>

        <p className="mt-8 text-center text-xs text-neutral-500">
          Matrícula online por{" "}
          <span className="font-medium text-neutral-700">AMT Dojo Manager</span>
        </p>
      </div>
    </div>
  );
}

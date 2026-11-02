import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  listCertificateTemplates, saveCertificateTemplate, deleteCertificateTemplate,
  listDojoStudents, listIssuedCertificates,
} from "@/lib/dojo/dojo.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Copy, Plus, Star, Search, Upload, ImageOff, Send, FileCheck, Award, Sparkles, Eye, MoreHorizontal, Pencil, CalendarCheck, LayoutTemplate, FilePlus2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CertificateThumb } from "@/components/dojo/certificates-studio/CertificateThumb";
import { CERTIFICATE_PRESETS } from "@/lib/dojo/certificates/presets";
import { cn } from "@/lib/utils";
import { CertificateEditor } from "@/components/dojo/certificate-editor/CertificateEditor";
import { migrateLegacyFields, toLegacyFields, type EditorSchema } from "@/components/dojo/certificate-editor/types";
import { CertificatePreviewDialog, type CertificateTemplate } from "@/components/dojo/CertificatePreview";
import { ALL_VARIABLES } from "@/components/dojo/certificate-editor/types";
import { systemValues } from "@/components/dojo/certificate-editor/qr";
import { IssuePanel } from "@/components/dojo/certificates-studio/IssuePanel";
import { IssuedList } from "@/components/dojo/certificates-studio/IssuedList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brDate } from "@/lib/format";

export const Route = createFileRoute("/dojo/app/certificates")({
  head: () => ({
    meta: [
      { title: "Certificados — AMT Dojo Manager" },
      { name: "description", content: "Studio de certificados: modelos, emissão e histórico com design premium." },
      { property: "og:title", content: "Certificados — AMT Dojo Manager" },
      { property: "og:description", content: "Crie modelos, emita certificados e acompanhe emissões com estética premium." },
    ],
  }),
  component: CertificatesPage,
});

const CATEGORIES = [
  { id: "graduacao", label: "Graduação" },
  { id: "seminario", label: "Seminário" },
  { id: "curso", label: "Curso" },
  { id: "participacao", label: "Participação" },
  { id: "evento", label: "Evento" },
  { id: "personalizado", label: "Personalizado" },
];

export function CertificatesPage() {
  const listFn = useServerFn(listCertificateTemplates);
  const saveFn = useServerFn(saveCertificateTemplate);
  const delFn = useServerFn(deleteCertificateTemplate);
  const studentsFn = useServerFn(listDojoStudents);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const templates = useQuery({ queryKey: ["dojo-templates"], queryFn: () => listFn() });
  const students = useQuery({ queryKey: ["dojo-students-mini"], queryFn: () => studentsFn() });
  const issuedFn = useServerFn(listIssuedCertificates);
  const issued = useQuery({ queryKey: ["dojo-issued-certificates"], queryFn: () => issuedFn() });

  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStudentId, setPreviewStudentId] = useState<string>("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [tab, setTab] = useState<"modelos" | "emitidos">("modelos");
  const [viewingTemplate, setViewingTemplate] = useState<any | null>(null);

  const filteredTemplates = useMemo(() => {
    return (templates.data ?? []).filter((t: any) => {
      if (category && t.category !== category) return false;
      if (q && !t.name?.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [templates.data, q, category]);

  const startNew = () => setEditing({
    name: "Novo modelo",
    category: "graduacao",
    is_default: false,
    variables: {
      editor_schema: {
        version: 2,
        page: { width: 1754, height: 1240, background: "#ffffff", margin: 40 },
        elements: [
          { id: "t1", kind: "text", text: "CERTIFICADO", x: 50, y: 20, fontSize: 72, color: "#111", bold: true, align: "center", uppercase: true, rotation: 0, opacity: 1, z: 1 },
          { id: "t2", kind: "text", text: "Certificamos que", x: 50, y: 38, fontSize: 24, color: "#555", align: "center", z: 2 },
          { id: "t3", kind: "text", text: "{{aluno_nome}}", x: 50, y: 48, fontSize: 52, color: "#111", bold: true, align: "center", z: 3 },
          { id: "t4", kind: "text", text: "recebeu a graduação de {{graduacao_atual}}", x: 50, y: 60, fontSize: 22, color: "#333", align: "center", z: 4 },
          { id: "t5", kind: "date", format: "long", x: 50, y: 72, fontSize: 20, color: "#666", align: "center", z: 5 },
          { id: "l1", kind: "line", x: 50, y: 82, w: 30, h: 0.3, fill: "#111", z: 6 },
          { id: "t6", kind: "text", text: "{{professor_nome}}", x: 50, y: 87, fontSize: 18, color: "#111", bold: true, align: "center", z: 7 },
        ],
      } as EditorSchema,
      favorites: [],
      recent: [],
    },
  });

  const openTemplate = (t: any) => {
    // Migrate legacy templates without editor_schema
    const editorSchema: EditorSchema | undefined = t.variables?.editor_schema;
    const schema = editorSchema ?? migrateLegacyFields(t);
    setEditing({
      id: t.id,
      name: t.name,
      category: t.category || "personalizado",
      is_default: !!t.is_default,
      variables: {
        editor_schema: schema,
        favorites: t.variables?.favorites ?? [],
        recent: t.variables?.recent ?? [],
      },
    });
  };

  const persist = async (payload: any, opts: { silent?: boolean } = {}) => {
    setSaving(true);
    try {
      const schema: EditorSchema = payload.variables.editor_schema;
      const legacy = toLegacyFields(schema);
      const body = {
        id: editing?.id,
        name: payload.name,
        background_url: legacy.background_url,
        width: legacy.width,
        height: legacy.height,
        fields: legacy.fields as any,
        variables: payload.variables,
        category: payload.category,
        is_default: payload.is_default,
        active: true,
      };
      const res = await saveFn({ data: body });
      if (!editing?.id && res?.id) setEditing((prev: any) => ({ ...prev, id: res.id }));
      if (!opts.silent) toast.success("Modelo salvo");
      qc.invalidateQueries({ queryKey: ["dojo-templates"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const duplicate = async (t: any) => {
    setSaving(true);
    try {
      const legacy = toLegacyFields(t.variables?.editor_schema ?? migrateLegacyFields(t));
      await saveFn({ data: {
        name: `${t.name} (cópia)`,
        background_url: legacy.background_url,
        width: legacy.width,
        height: legacy.height,
        fields: legacy.fields as any,
        variables: t.variables ?? undefined,
        category: t.category ?? "personalizado",
        is_default: false,
        active: true,
      }});
      toast.success("Modelo duplicado");
      qc.invalidateQueries({ queryKey: ["dojo-templates"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // Preview values
  const academyProfile = useQuery({
    queryKey: ["dojo-academy-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("dojo_academy_profile").select("*").eq("owner_id", u.user.id).maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });
  const previewValues = useMemo(() => {
    const base: Record<string, string> = { ...systemValues() };
    ALL_VARIABLES.forEach((v) => { base[v.key] = v.sample ? v.sample : `[${v.label}]`; });
    const s: any = students.data?.find((x: any) => x.id === previewStudentId);
    if (s) {
      base.aluno_nome = s.full_name || base.aluno_nome;
      base.aluno_nome_social = s.social_name || s.full_name || base.aluno_nome;
      base.aluno_cpf = s.cpf || base.aluno_cpf;
      base.aluno_data_nascimento = s.birth_date ? brDate(s.birth_date) : base.aluno_data_nascimento;
      base.aluno_faixa = s.current_belt || s.current_belt_id || base.aluno_faixa;
      base.aluno_grau = String(s.current_degree ?? "") || base.aluno_grau;
      base.aluno_modalidade = s.modality || s.discipline || base.aluno_modalidade;
      base.aluno_foto = s.photo_url || base.aluno_foto;
      base.student_name = base.aluno_nome; // compat
    }
    base.certificado_numero = base.certificado_numero || "0001";
    base.certificado_codigo = base.certificado_codigo || "AMT-2026-0001";
    base.certificado_validacao = base.certificado_validacao || "https://dojomanager.amtfightwear.com.br/validar/AMT-2026-0001";
    const ap: any = academyProfile.data;
    if (ap) {
      if (ap.trade_name || ap.legal_name) base.academia_nome = ap.trade_name || ap.legal_name;
      if (ap.address) base.academia_endereco = ap.address;
      if (ap.city) base.academia_cidade = ap.city;
      if (ap.state) base.academia_estado = ap.state;
      if (ap.cnpj) base.academia_cnpj = ap.cnpj;
      if (ap.phone) base.academia_telefone = ap.phone;
      if (ap.email) base.academia_email = ap.email;
      if (ap.logo_url && ap.logo_as_default !== false) base.academia_logo = ap.logo_url;
    }
    return base;
  }, [students.data, previewStudentId, academyProfile.data]);

  const previewTemplate: CertificateTemplate | null = useMemo(() => {
    if (!editing) return null;
    const schema = editing.variables?.editor_schema as EditorSchema;
    const legacy = toLegacyFields(schema);
    return {
      name: editing.name,
      background_url: legacy.background_url,
      width: legacy.width,
      height: legacy.height,
      fields: legacy.fields as any,
      variables: editing.variables,
    };
  }, [editing]);

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>← Voltar aos modelos</Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Pré-visualizar com aluno:
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={previewStudentId}
              onChange={(e) => setPreviewStudentId(e.target.value)}
            >
              <option value="">Dados de exemplo</option>
              {(students.data ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        </div>

        <CertificateEditor
          initialSchema={editing.variables.editor_schema}
          initialFavorites={editing.variables.favorites ?? []}
          initialRecent={editing.variables.recent ?? []}
          name={editing.name}
          category={editing.category}
          isDefault={!!editing.is_default}
          onNameChange={(name) => setEditing({ ...editing, name })}
          onCategoryChange={(category) => setEditing({ ...editing, category })}
          onDefaultChange={(is_default) => setEditing({ ...editing, is_default })}
          onSave={async ({ schema, favorites, recent }) => {
            const next = { ...editing, variables: { editor_schema: schema, favorites, recent } };
            setEditing(next);
            await persist(next, { silent: true });
          }}
          onPreview={() => setPreviewOpen(true)}
          saving={saving}
        />

        <CertificatePreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          template={previewTemplate}
          values={previewValues}
          title={editing.name}
        />
      </div>
    );
  }

  const openEditor = (id: string) => navigate({ to: "/dojo/certificate-editor/$id", params: { id } });
  const newFromPreset = (preset?: string) =>
    navigate({ to: "/dojo/certificate-editor/$id", params: { id: "new" }, search: preset ? { preset } : {} });
  const totalTemplates = (templates.data ?? []).length;
  const now = new Date();
  const issuedThisMonth = (issued.data ?? []).filter((c: any) => {
    const d = c.issued_at ? new Date(c.issued_at) : null;
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const categoryCount = (id: string) => (templates.data ?? []).filter((t: any) => (t.category || "personalizado") === id).length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
      {/* ===== CABEÇALHO ===== */}
      <section className="dojo-hero relative overflow-hidden">
        <div aria-hidden className="dojo-hero-pattern pointer-events-none absolute inset-0" />
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-800" />
        <div className="relative flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:px-7">
          <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:gap-4">
            <div className="dojo-hero-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white sm:h-12 sm:w-12 sm:rounded-2xl md:h-14 md:w-14">
              <Award className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
            </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">Certificados</div>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-neutral-950 sm:text-2xl md:text-[28px]">Certificados que valorizam cada conquista</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-600">
              Crie modelos no editor, emita para os alunos em poucos cliques e acompanhe tudo o que foi entregue — com validação por QR Code.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => newFromPreset()} className="rounded-xl px-4 shadow-sm">
                <Plus className="mr-1 h-4 w-4" /> Novo modelo
              </Button>
              <Button variant="outline" onClick={() => setIssueOpen(true)} className="rounded-xl px-4">
                <Send className="mr-1 h-4 w-4" /> Emitir certificado
              </Button>
            </div>
          </div>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:w-[420px]">
            {[
              { icon: LayoutTemplate, label: "Modelos", value: templates.isLoading ? "—" : totalTemplates },
              { icon: FileCheck, label: "Emitidos", value: issued.isLoading ? "—" : (issued.data ?? []).length },
              { icon: CalendarCheck, label: "Este mês", value: issued.isLoading ? "—" : issuedThisMonth },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-neutral-200/80 bg-white/70 p-3.5 backdrop-blur">
                <k.icon className="h-4 w-4 text-primary" />
                <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{k.value}</div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COMEÇAR DE UM MODELO PRONTO ===== */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Comece com um modelo pronto</h2>
            <p className="text-xs text-muted-foreground">Escolha um design e personalize tudo no editor — textos, cores, logo e assinaturas.</p>
          </div>
        </div>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] md:-mx-6 md:px-6">
          <button
            type="button"
            onClick={() => newFromPreset()}
            className="group flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-dashed border-neutral-300 bg-card text-left transition hover:border-primary/50 hover:shadow-md"
          >
            <div className="grid aspect-[1754/1240] w-full place-items-center bg-neutral-50 text-muted-foreground transition-colors group-hover:text-primary">
              <FilePlus2 className="h-8 w-8" />
            </div>
            <div className="border-t border-neutral-100 px-3 py-2.5">
              <div className="text-sm font-semibold">Em branco</div>
              <div className="text-[11px] text-muted-foreground">Comece do zero</div>
            </div>
          </button>
          {CERTIFICATE_PRESETS.map((p) => (
            <PresetTile key={p.id} preset={p} values={previewValues} onPick={() => newFromPreset(p.id)} />
          ))}
        </div>
      </section>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-10 w-full justify-start rounded-xl bg-muted p-1 sm:w-auto">
            <TabsTrigger value="modelos" className="h-8 rounded-lg px-4 text-sm">
              <LayoutTemplate className="mr-1.5 h-4 w-4" /> Meus modelos
              <span className="ml-1.5 rounded-full bg-foreground/[0.06] px-1.5 text-[11px] tabular-nums">{totalTemplates}</span>
            </TabsTrigger>
            <TabsTrigger value="emitidos" className="h-8 rounded-lg px-4 text-sm">
              <Sparkles className="mr-1.5 h-4 w-4" /> Emitidos
              <span className="ml-1.5 rounded-full bg-foreground/[0.06] px-1.5 text-[11px] tabular-nums">{(issued.data ?? []).length}</span>
            </TabsTrigger>
          </TabsList>
          {tab === "modelos" && (
            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar modelo…" className="h-10 rounded-xl pl-9" />
            </div>
          )}
        </div>

        <TabsContent value="modelos" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "", label: "Todos", count: totalTemplates }, ...CATEGORIES.map((c) => ({ ...c, count: categoryCount(c.id) }))]
              .filter((c) => c.id === "" || c.count > 0)
              .map((c) => (
                <button
                  key={c.id || "all"}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    category === c.id
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-neutral-200 bg-card text-muted-foreground hover:border-neutral-300 hover:text-foreground",
                  )}
                >
                  {c.label} <span className="ml-0.5 opacity-70">{c.count}</span>
                </button>
              ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templates.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-card">
                  <div className="aspect-[1754/1240] animate-pulse bg-neutral-100" />
                  <div className="space-y-2 p-3"><div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" /><div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" /></div>
                </div>
              ))}

            {filteredTemplates.map((t: any) => {
              const editorSchema: EditorSchema | undefined = t.variables?.editor_schema;
              const schema: EditorSchema = editorSchema ?? migrateLegacyFields(t);
              const elCount = schema.elements.length;
              const catLabel = CATEGORIES.find((c) => c.id === t.category)?.label ?? "Personalizado";
              const hasBackground = !!(schema.page.backgroundUrl || t.background_url);

              const setBackground = async (url: string | undefined, w?: number, h?: number) => {
                try {
                  const nextSchema: EditorSchema = {
                    ...schema,
                    page: { ...schema.page, backgroundUrl: url, ...(w ? { width: w } : {}), ...(h ? { height: h } : {}) },
                  };
                  const legacy = toLegacyFields(nextSchema);
                  await saveFn({ data: {
                    id: t.id,
                    name: t.name,
                    background_url: legacy.background_url,
                    width: legacy.width,
                    height: legacy.height,
                    fields: legacy.fields as any,
                    variables: { ...(t.variables ?? {}), editor_schema: nextSchema },
                    category: t.category ?? "personalizado",
                    is_default: !!t.is_default,
                    active: true,
                  }});
                  toast.success(url ? "Plano de fundo atualizado" : "Plano de fundo removido");
                  qc.invalidateQueries({ queryKey: ["dojo-templates"] });
                } catch (e: any) { toast.error(e.message); }
              };

              const uploadBackground = async (file: File) => {
                if (!file.type.startsWith("image/")) { toast.error("Envie um arquivo de imagem"); return; }
                if (file.size > 10 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 10MB)"); return; }
                try {
                  const path = `certificates/bg-${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
                  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true, contentType: file.type });
                  if (error) throw error;
                  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
                  const img = new Image();
                  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Falha ao ler imagem")); img.src = data.publicUrl; });
                  await setBackground(data.publicUrl, img.naturalWidth, img.naturalHeight);
                } catch (e: any) { toast.error(e.message); }
              };

              return (
                <TemplateCard
                  key={t.id}
                  name={t.name}
                  schema={schema}
                  values={previewValues}
                  isDefault={!!t.is_default}
                  categoryLabel={catLabel}
                  elementCount={elCount}
                  hasBackground={hasBackground}
                  onEdit={() => openEditor(t.id)}
                  onView={() => setViewingTemplate(t)}
                  onDuplicate={() => duplicate(t)}
                  onUploadBackground={uploadBackground}
                  onRemoveBackground={() => { if (confirm("Remover plano de fundo deste modelo?")) setBackground(undefined); }}
                  onDelete={async () => {
                    if (confirm(`Excluir modelo "${t.name}"?`)) {
                      await delFn({ data: { id: t.id } });
                      qc.invalidateQueries({ queryKey: ["dojo-templates"] });
                    }
                  }}
                />
              );
            })}

            {!templates.isLoading && filteredTemplates.length === 0 && (
              <div className="col-span-full flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-card px-6 py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Award className="h-6 w-6" /></div>
                <h3 className="mt-3 text-base font-semibold">
                  {totalTemplates === 0 ? "Crie o primeiro modelo da academia" : "Nenhum modelo encontrado"}
                </h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {totalTemplates === 0
                    ? "Escolha um modelo pronto acima ou comece em branco. Depois é só emitir para os alunos."
                    : "Ajuste a busca ou a categoria para ver outros modelos."}
                </p>
                {totalTemplates === 0 && (
                  <Button onClick={() => newFromPreset()} className="mt-4 rounded-xl"><Plus className="mr-1 h-4 w-4" /> Novo modelo</Button>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="emitidos" className="mt-4">
          <IssuedList />
        </TabsContent>
      </Tabs>

      <IssuePanel open={issueOpen} onOpenChange={setIssueOpen} />

      <CertificatePreviewDialog
        open={!!viewingTemplate}
        onOpenChange={(v) => { if (!v) setViewingTemplate(null); }}
        template={viewingTemplate ? (() => {
          const schema: EditorSchema = viewingTemplate.variables?.editor_schema ?? migrateLegacyFields(viewingTemplate);
          const legacy = toLegacyFields(schema);
          return {
            name: viewingTemplate.name,
            background_url: legacy.background_url,
            width: legacy.width,
            height: legacy.height,
            fields: legacy.fields as any,
            variables: viewingTemplate.variables,
          } as CertificateTemplate;
        })() : null}
        values={previewValues}
        title={viewingTemplate?.name ?? "Modelo"}
      />
    </div>
  );
}

/** Cartão de um modelo da academia, com miniatura fiel e ações. */
function TemplateCard({
  name, schema, values, isDefault, categoryLabel, elementCount, hasBackground,
  onEdit, onView, onDuplicate, onUploadBackground, onRemoveBackground, onDelete,
}: {
  name: string;
  schema: EditorSchema;
  values: Record<string, string>;
  isDefault: boolean;
  categoryLabel: string;
  elementCount: number;
  hasBackground: boolean;
  onEdit: () => void;
  onView: () => void;
  onDuplicate: () => void;
  onUploadBackground: (f: File) => void;
  onRemoveBackground: () => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const portrait = schema.page.height > schema.page.width;
  return (
    <div className="group overflow-hidden rounded-2xl border border-neutral-200/80 bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadBackground(f); e.target.value = ""; }} />
      <div
        className={cn("relative bg-[linear-gradient(180deg,#f4f4f5,#ececee)] p-4 transition-shadow", dragOver && "ring-2 ring-inset ring-primary")}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onUploadBackground(f);
        }}
      >
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${name}`}
          className={cn("mx-auto block overflow-hidden rounded-[3px] shadow-[0_8px_24px_-10px_rgba(15,23,42,0.45)] ring-1 ring-black/5", portrait ? "w-[58%]" : "w-full")}
        >
          <CertificateThumb doc={schema} values={values} />
        </button>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-neutral-950/0 opacity-0 transition-all group-hover:bg-neutral-950/35 group-hover:opacity-100">
          <Button size="sm" onClick={onEdit} className="pointer-events-auto rounded-lg bg-white text-foreground shadow-lg hover:bg-white/90">
            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={onView} className="pointer-events-auto rounded-lg border-white/40 bg-white/15 text-white backdrop-blur hover:bg-white/25 hover:text-white">
            <Eye className="mr-1 h-3.5 w-3.5" /> Ver
          </Button>
        </div>
        {isDefault && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm">
            <Star className="h-3 w-3 fill-current" /> Padrão
          </span>
        )}
        {dragOver && (
          <div className="absolute inset-0 grid place-items-center bg-primary/10 text-sm font-semibold text-primary">Solte para usar como fundo</div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-neutral-100 p-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={name}>{name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-1.5 py-px font-medium">{categoryLabel}</span>
            <span>{elementCount} elemento{elementCount === 1 ? "" : "s"}</span>
            <span>· {portrait ? "Retrato" : "Paisagem"}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit} className="h-8 rounded-lg">Editar</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onSelect={onView}><Eye className="h-4 w-4" /> Visualizar</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}><Copy className="h-4 w-4" /> Duplicar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> {hasBackground ? "Trocar imagem de fundo" : "Enviar imagem de fundo"}
            </DropdownMenuItem>
            {hasBackground && (
              <DropdownMenuItem onSelect={onRemoveBackground}><ImageOff className="h-4 w-4" /> Remover fundo</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Miniatura de um modelo pronto (galeria "Comece com um modelo pronto"). */
function PresetTile({ preset, values, onPick }: { preset: (typeof CERTIFICATE_PRESETS)[number]; values: Record<string, string>; onPick: () => void }) {
  const doc = useMemo(() => preset.build(), [preset]);
  const portrait = doc.page.height > doc.page.width;
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-card text-left shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="grid aspect-[1754/1240] w-full place-items-center bg-[linear-gradient(180deg,#f4f4f5,#ececee)] p-2.5">
        <div className={cn("overflow-hidden rounded-[2px] shadow-md ring-1 ring-black/5", portrait ? "h-full" : "w-full")}>
          <CertificateThumb doc={doc} values={values} width={portrait ? 74 : 168} />
        </div>
      </div>
      <div className="border-t border-neutral-100 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: preset.accent }} />
          <span className="truncate text-sm font-semibold">{preset.name}</span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{preset.description}</div>
      </div>
    </button>
  );
}

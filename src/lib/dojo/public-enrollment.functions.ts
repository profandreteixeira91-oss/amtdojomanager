/**
 * Pré-cadastro público (matrícula online).
 *
 * Fluxo: o aluno preenche os dados em /matricula/<slug> (ou /dojo/matricula/<slug>),
 * escolhe a modalidade e a graduação (só faixas do catálogo do sistema, o padrão
 * de cada modalidade) e envia. Nasce um aluno com status "pending" (pré-cadastro), sem
 * matrícula nem cobrança. O dono analisa em Alunos › Pré-cadastros, escolhe o
 * plano na ficha e aprova: só então o aluno fica ativo e a matrícula/cobrança
 * são criadas pelo fluxo normal do painel (enrollStudentWithPlan).
 *
 * As fns aqui usam supabaseAdmin: a página é pública e o aluno não tem sessão.
 * O dojo é resolvido pelo `slug` em `dojo_academy_profile` e todo insert leva
 * `owner_id`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { MODALITY_CATALOG, modalityLabel, normalizeModality } from "@/lib/dojo/modalities";
import type { BeltSpec } from "@/components/dojo/BeltSpecVisual";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "slug inválido");

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID inválido",
  );

/** Status do aluno enquanto o dono não aprova o pré-cadastro. */
export const PRE_ENROLLMENT_STATUS = "pending";

export type PublicPlan = {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  enrollment_fee: number | null;
  frequency: string | null;
  custom_months: number | null;
  payment_methods: Array<{ code: string; enabled?: boolean; gateway?: string }> | null;
};

export type PublicUnit = { id: string; name: string };
export type PublicBelt = {
  id: string;
  name: string;
  /** Modalidade normalizada do catálogo ("judo", "jiu-jitsu"…). */
  modality: string | null;
  max_degrees: number | null;
  sort_order: number | null;
  color_hex: string | null;
  stripe_hex: string | null;
  /** Desenho da faixa do Belt Studio (o mesmo do painel). */
  visual: BeltSpec | null;
  variants: Array<{
    id?: string;
    name?: string;
    degree: number;
    kind?: "degree" | "variant";
    visual?: BeltSpec | null;
  }> | null;
};
export type PublicModality = { id: string; label: string };

export type PublicEnrollmentBundle = {
  academy: {
    slug: string;
    trade_name: string | null;
    legal_name: string | null;
    logo_url: string | null;
    brand_primary: string | null;
    brand_secondary: string | null;
    city: string | null;
    state: string | null;
  };
  plans: PublicPlan[];
  units: PublicUnit[];
  belts: PublicBelt[];
  /** Modalidades oferecidas (as das turmas do dojo; sem turmas, todas com faixas). */
  modalities: PublicModality[];
};

export const getPublicEnrollmentBundle = createServerFn({ method: "GET" })
  .validator((i: unknown) => z.object({ slug: slugSchema }).parse(i))
  .handler(async ({ data }): Promise<PublicEnrollmentBundle> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: academy, error: acErr } = await supabaseAdmin
      .from("dojo_academy_profile")
      .select(
        "owner_id, slug, trade_name, legal_name, logo_url, brand_primary, brand_secondary, city, state",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (acErr) throw new Error(acErr.message);
    if (!academy) throw new Error("Dojo não encontrado");

    const ownerId = (academy as any).owner_id as string;

    const [{ data: plans, error: plansErr }, { data: units }, { data: belts }, { data: classes }] =
      await Promise.all([
        supabaseAdmin
          .from("dojo_plans")
          .select(
            "id, name, description, amount, enrollment_fee, frequency, custom_months, payment_methods, active, sort_order",
          )
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabaseAdmin
          .from("dojo_units")
          .select("id, name")
          .eq("owner_id", ownerId)
          .order("name", { ascending: true }),
        // Só o catálogo do sistema (owner_id nulo): as graduações seguem exatamente o padrão de cada modalidade.
        supabaseAdmin
          .from("dojo_belts")
          .select(
            "id, name, modality, max_degrees, sort_order, color_hex, stripe_hex, visual, variants",
          )
          .is("owner_id", null)
          .order("modality")
          .order("sort_order", { ascending: true }),
        supabaseAdmin.from("dojo_classes").select("modality").eq("owner_id", ownerId),
      ]);
    if (plansErr) throw new Error(plansErr.message);

    const publicBelts: PublicBelt[] = (belts ?? []).map((b: any) => ({
      id: b.id,
      name: b.name,
      modality: normalizeModality(b.modality) || null,
      max_degrees: b.max_degrees != null ? Number(b.max_degrees) : null,
      sort_order: b.sort_order != null ? Number(b.sort_order) : null,
      color_hex: b.color_hex ?? null,
      stripe_hex: b.stripe_hex ?? null,
      visual: b.visual ?? null,
      variants: b.variants ?? null,
    }));
    const withBelts = new Set(publicBelts.map((b) => b.modality).filter(Boolean) as string[]);
    const taught = new Set(
      (classes ?? [])
        .map((c: any) => normalizeModality(c.modality))
        .filter((m) => m && withBelts.has(m)),
    );
    const offered = taught.size ? taught : withBelts;
    const order = (id: string) => {
      const i = MODALITY_CATALOG.findIndex((m) => m.id === id);
      return i < 0 ? 99 : i;
    };
    const modalities = [...offered]
      .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
      .map((id) => ({ id, label: modalityLabel(id) }));

    return {
      academy: {
        slug: (academy as any).slug,
        trade_name: (academy as any).trade_name,
        legal_name: (academy as any).legal_name,
        logo_url: (academy as any).logo_url,
        brand_primary: (academy as any).brand_primary,
        brand_secondary: (academy as any).brand_secondary,
        city: (academy as any).city,
        state: (academy as any).state,
      },
      plans: (plans ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        amount: Number(p.amount ?? 0),
        enrollment_fee: p.enrollment_fee != null ? Number(p.enrollment_fee) : null,
        frequency: p.frequency,
        custom_months: p.custom_months,
        payment_methods: Array.isArray(p.payment_methods) ? p.payment_methods : null,
      })),
      units: (units ?? []).map((u: any) => ({ id: u.id, name: u.name })),
      belts: publicBelts.filter((b) => b.modality && offered.has(b.modality)),
      modalities,
    };
  });

const text = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const enrollInput = z.object({
  slug: slugSchema,
  // Dados do aluno (mesmas exigências da ficha do painel)
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(40),
  cpf: text(20),
  rg: text(30),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de nascimento inválida"),
  gender: text(30),
  nationality: text(60),
  marital_status: text(40),
  profession: text(120),
  blood_type: text(5),
  health_insurance: text(120),
  // Endereço
  zip: text(20),
  street: text(200),
  address_number: text(20),
  address_complement: text(120),
  neighborhood: text(120),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(2).max(2),
  // Responsável e emergência
  guardian_name: text(200),
  guardian_phone: text(40),
  emergency_contact_name: text(200),
  emergency_contact_phone: text(40),
  emergency_contact_relationship: text(60),
  // Unidade, modalidade e graduação
  unit_id: uuid.optional().nullable(),
  modalities: z
    .array(
      z.object({
        modality: z.string().max(60),
        belt_id: uuid,
        degree: z.number().int().min(0).max(20).optional(),
      }),
    )
    .min(1, "Escolha a modalidade e a graduação.")
    .max(6),
  // Saúde
  anamnesis: z.record(z.string(), z.any()).optional(),
  has_medical_clearance: z.boolean().optional(),
  medical_clearance_date: text(20),
  photo_url: text(600),
  // Consentimentos obrigatórios (os mesmos que o painel exige para salvar a ficha)
  lgpd_consent: z.boolean(),
  terms_accepted: z.boolean(),
  facial_recognition_consent: z.boolean(),
  image_rights_consent: z.boolean().optional(),
});

export const publicEnrollStudent = createServerFn({ method: "POST" })
  .validator((i: unknown) => enrollInput.parse(i))
  .handler(async ({ data }) => {
    if (!data.lgpd_consent || !data.terms_accepted || !data.facial_recognition_consent) {
      throw new Error(
        "É necessário aceitar os termos, o consentimento LGPD e o reconhecimento facial.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Dojo pelo slug
    const { data: academy, error: acErr } = await supabaseAdmin
      .from("dojo_academy_profile")
      .select("owner_id, trade_name")
      .eq("slug", data.slug)
      .maybeSingle();
    if (acErr) throw new Error(acErr.message);
    if (!academy) throw new Error("Dojo não encontrado");
    const ownerId = (academy as any).owner_id as string;

    // 2) Pré-cadastro repetido (mesmo CPF ou WhatsApp ainda em análise): não duplica.
    const digits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");
    const { data: pendings } = await supabaseAdmin
      .from("dojo_students")
      .select("id, cpf, phone")
      .eq("owner_id", ownerId)
      .eq("status", PRE_ENROLLMENT_STATUS);
    const cpf = digits(data.cpf);
    const phone = digits(data.phone);
    const dup = (pendings ?? []).find(
      (s: any) => (cpf && digits(s.cpf) === cpf) || (phone && digits(s.phone) === phone),
    );
    if (dup) {
      throw new Error(
        "Já recebemos um pré-cadastro com este CPF ou WhatsApp. A academia vai entrar em contato.",
      );
    }

    // 3) Unidade do dojo; faixas do catálogo do sistema e da modalidade escolhida.
    let unitId: string | null = null;
    if (data.unit_id) {
      const { data: unit } = await supabaseAdmin
        .from("dojo_units")
        .select("id, owner_id")
        .eq("id", data.unit_id)
        .maybeSingle();
      if (unit && (unit as any).owner_id === ownerId) unitId = (unit as any).id;
    }
    const wantedBeltIds = Array.from(new Set(data.modalities.map((m) => m.belt_id)));
    const { data: beltRows } = await supabaseAdmin
      .from("dojo_belts")
      .select("id, owner_id, modality, max_degrees")
      .in("id", wantedBeltIds);
    const beltById = new Map(
      (beltRows ?? []).filter((b: any) => b.owner_id === null).map((b: any) => [b.id as string, b]),
    );
    const validModalities = data.modalities.filter((m) => {
      const b: any = beltById.get(m.belt_id);
      return b && normalizeModality(b.modality) === normalizeModality(m.modality);
    });
    if (!validModalities.length) throw new Error("Escolha a modalidade e a graduação.");
    const primary = validModalities[0];
    const primaryBelt: any = beltById.get(primary.belt_id);
    const clampDegree = (m: (typeof validModalities)[number]) =>
      Math.min(Number(m.degree ?? 0), Number((beltById.get(m.belt_id) as any)?.max_degrees ?? 0));

    const now = new Date().toISOString();
    const empty = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

    // 4) Aluno em pré-cadastro (sem matrícula e sem cobrança até o dono aprovar)
    const studentPayload: any = {
      owner_id: ownerId,
      full_name: data.full_name.trim(),
      email: empty(data.email),
      phone: empty(data.phone),
      cpf: empty(data.cpf),
      rg: empty(data.rg),
      birth_date: data.birth_date,
      gender: empty(data.gender),
      nationality: empty(data.nationality),
      marital_status: empty(data.marital_status),
      profession: empty(data.profession),
      blood_type: empty(data.blood_type),
      health_insurance: empty(data.health_insurance),
      zip: empty(data.zip),
      street: empty(data.street),
      address_number: empty(data.address_number),
      address_complement: empty(data.address_complement),
      neighborhood: empty(data.neighborhood),
      city: data.city.trim(),
      state: data.state.trim().toUpperCase(),
      guardian_name: empty(data.guardian_name),
      guardian_phone: empty(data.guardian_phone),
      emergency_contact_name: empty(data.emergency_contact_name),
      emergency_contact_phone: empty(data.emergency_contact_phone),
      emergency_contact_relationship: empty(data.emergency_contact_relationship),
      unit_id: unitId,
      current_belt_id: primary.belt_id,
      current_degree: clampDegree(primary),
      anamnesis: data.anamnesis && Object.keys(data.anamnesis).length > 0 ? data.anamnesis : {},
      has_medical_clearance: data.has_medical_clearance ?? false,
      medical_clearance_date:
        data.has_medical_clearance && data.medical_clearance_date
          ? data.medical_clearance_date
          : null,
      photo_url: empty(data.photo_url),
      status: PRE_ENROLLMENT_STATUS,
      lgpd_consent: true,
      lgpd_consent_date: now,
      terms_accepted: true,
      terms_accepted_date: now,
      image_rights_consent: data.image_rights_consent ?? false,
      facial_recognition_consent: true,
      facial_recognition_consent_at: now,
    };
    const { data: studentRow, error: sErr } = await supabaseAdmin
      .from("dojo_students")
      .insert(studentPayload)
      .select("id, full_name")
      .single();
    if (sErr) throw new Error(sErr.message);

    // 5) Graduações informadas (o dono confere na análise)
    try {
      await supabaseAdmin.from("dojo_graduations").insert(
        validModalities.map((m) => ({
          owner_id: ownerId,
          student_id: studentRow.id,
          belt_id: m.belt_id,
          degree: clampDegree(m),
          graduation_date: todayISO(),
          notes: "Informada no pré-cadastro online",
        })) as any,
      );
    } catch (e) {
      console.warn("[pre-cadastro] falha ao registrar graduações:", e);
    }

    // 6) Avisa o dono
    try {
      const { sendPushToDojoOwner } = await import("@/lib/push/dojo-owner-push.server");
      await sendPushToDojoOwner(ownerId, "enrollments", {
        title: "Novo pré-cadastro para analisar",
        body: `${studentRow.full_name ?? "Novo aluno"} · ${modalityLabel(primaryBelt?.modality)}. Confira e aprove a matrícula.`,
        url: "/dojo/app/students?pre=1",
        tag: `dojo-pre-enroll-${studentRow.id}`,
      }).catch(() => {});
    } catch {
      /* sem push */
    }

    return { student_id: studentRow.id as string, status: PRE_ENROLLMENT_STATUS };
  });

/**
 * Upload público da foto do aluno durante a auto-matrícula.
 * Recebe um data URL (JPEG/PNG) e grava no bucket `dojo-students`
 * dentro da pasta do dono do dojo resolvido pelo slug.
 */
const photoInput = z.object({
  slug: slugSchema,
  data_url: z.string().min(32).max(4_500_000),
});

export const publicUploadEnrollmentPhoto = createServerFn({ method: "POST" })
  .validator((i: unknown) => photoInput.parse(i))
  .handler(async ({ data }) => {
    const match = /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      data.data_url,
    );
    if (!match) throw new Error("Formato de imagem inválido");
    const contentType = match[1];
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const bytes = Uint8Array.from(atob(match[3]), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 3_500_000) throw new Error("Imagem muito grande (máx. 3MB)");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: academy } = await supabaseAdmin
      .from("dojo_academy_profile")
      .select("owner_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!academy) throw new Error("Dojo não encontrado");
    const ownerId = (academy as any).owner_id as string;

    const path = `${ownerId}/students/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from("dojo-students")
      .upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(error.message);

    const { data: pub } = supabaseAdmin.storage.from("dojo-students").getPublicUrl(path);
    return { url: pub.publicUrl };
  });

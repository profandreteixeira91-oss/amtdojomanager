/**
 * Graduações previstas (pré-registro de graduação).
 *
 * O dono registra quem vai graduar, a faixa/grau e as taxas — as cobranças vão
 * para o financeiro na hora — SEM aplicar a faixa, sem "Parabéns" ao aluno e sem
 * certificado. Depois das avaliações, abre a lista "Aguardando confirmação",
 * confirma quem passou (vira registro em dojo_graduations: faixa atual,
 * histórico e parabéns) e emite os certificados.
 *
 * Previstas ficam em dojo_graduation_plans para não aparecerem como faixa
 * atual, no histórico ou no app do aluno antes da confirmação.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStudentsCanBeBilled } from "@/lib/dojo/billable";

const uuid = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "UUID inválido");
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const todayBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
// A tabela é nova e ainda não está nos tipos gerados do Supabase (types.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plansTable = (sb: unknown) => (sb as any).from("dojo_graduation_plans");
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export type GraduationPlan = {
  id: string;
  student_id: string;
  belt_id: string;
  degree: number;
  planned_date: string;
  evaluator: string | null;
  notes: string | null;
  fee_amount: number | null;
  invoice_id: string | null;
  invoice_status: string | null;
  status: "planned" | "confirmed";
  created_at: string;
  student: { id: string; full_name: string; photo_url: string | null; status: string | null } | null;
  belt: { id: string; name: string; modality: string | null; color_hex: string | null; max_degrees: number | null } | null;
};

/** Registra graduações previstas e lança as taxas no financeiro. */
export const planGraduations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      items: z.array(z.object({
        student_id: uuid,
        belt_id: uuid,
        degree: z.number().int().min(0).max(10).default(0),
        fee_amount: z.number().min(0).max(1_000_000).optional().nullable(),
        paid: z.boolean().optional(),
      })).min(1).max(300),
      planned_date: isoDay,
      evaluator: z.string().max(200).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const owner = context.userId;
    const sb = context.supabase;
    const { data: settingsRow } = await sb.from("dojo_graduation_settings").select("price_by_belt").eq("owner_id", owner).maybeSingle();
    const priceByBelt = ((settingsRow as any)?.price_by_belt ?? {}) as Record<string, number>;
    const beltIds = Array.from(new Set(data.items.map((i) => i.belt_id)));
    const { data: belts } = await sb.from("dojo_belts").select("id, name").in("id", beltIds);
    const beltName = new Map(((belts ?? []) as any[]).map((b) => [b.id as string, b.name as string]));

    // Um registro por aluno, mesmo que a lista venha repetida.
    const items = Array.from(new Map(data.items.map((it) => [it.student_id, it])).values())
      .map((it) => ({ ...it, fee: it.fee_amount != null ? Number(it.fee_amount) : Number(priceByBelt[it.belt_id] ?? 0) }));

    // Confere tudo antes de gravar qualquer coisa.
    await assertStudentsCanBeBilled(sb, items);

    // Quem já está aguardando confirmação na mesma faixa/grau não ganha outro
    // registro (nem outra cobrança): só atualiza data, avaliador e observações.
    const { data: existingRows, error: exErr } = await plansTable(sb)
      .select("id, student_id, belt_id, degree, invoice_id")
      .eq("status", "planned")
      .in("student_id", items.map((i) => i.student_id));
    if (exErr) throw new Error(exErr.message);
    const existingByKey = new Map<string, { id: string; invoice_id: string | null }>();
    for (const r of (existingRows ?? []) as any[]) existingByKey.set(`${r.student_id}|${r.belt_id}|${r.degree}`, r);

    const created: Array<{ id: string; student_id: string; invoice_id: string | null }> = [];
    const pushes: Array<{ student_id: string; invoice_id: string; amount: number; belt: string }> = [];
    const newInvoiceIds: string[] = [];
    const newPlanIds: string[] = [];
    let updated = 0;
    try {
    for (const it of items) {
      const fee = it.fee;
      const existing = existingByKey.get(`${it.student_id}|${it.belt_id}|${it.degree}`);
      if (existing) {
        const { error: upErr } = await plansTable(sb)
          .update({ planned_date: data.planned_date, evaluator: data.evaluator ?? null, notes: data.notes ?? null })
          .eq("id", existing.id);
        if (upErr) throw new Error(upErr.message);
        updated++;
        created.push({ id: existing.id, student_id: it.student_id, invoice_id: existing.invoice_id });
        continue;
      }
      let invoiceId: string | null = null;
      if (fee > 0) {
        const paid = it.paid === true;
        const { data: inv, error: invErr } = await sb
          .from("dojo_invoices")
          .insert({
            student_id: it.student_id,
            owner_id: owner,
            amount: fee,
            due_date: data.planned_date,
            description: `Taxa de graduação — ${beltName.get(it.belt_id) ?? "Faixa"}`,
            status: paid ? "paid" : "pending",
            paid_at: paid ? new Date().toISOString() : null,
            source: "other",
          } as never)
          .select("id, status")
          .single();
        if (invErr) throw new Error(invErr.message);
        invoiceId = (inv as any).id;
        newInvoiceIds.push(invoiceId!);
        if (!paid) pushes.push({ student_id: it.student_id, invoice_id: invoiceId!, amount: fee, belt: beltName.get(it.belt_id) ?? "Faixa" });
      }
      const { data: row, error } = await plansTable(sb)
        .insert({
          owner_id: owner,
          student_id: it.student_id,
          belt_id: it.belt_id,
          degree: it.degree,
          planned_date: data.planned_date,
          evaluator: data.evaluator ?? null,
          notes: data.notes ?? null,
          fee_amount: fee > 0 ? fee : null,
          invoice_id: invoiceId,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      newPlanIds.push((row as any).id);
      created.push({ id: (row as any).id, student_id: it.student_id, invoice_id: invoiceId });
    }
    } catch (err) {
      // Falhou no meio: desfaz o que esta tentativa gravou, para não sobrar
      // registro pela metade nem duplicar quando o usuário tentar de novo.
      if (newPlanIds.length) await plansTable(sb).delete().in("id", newPlanIds);
      if (newInvoiceIds.length) await sb.from("dojo_invoices").delete().in("id", newInvoiceIds);
      throw new Error(`Nada foi registrado. ${(err as any)?.message ?? err}`);
    }

    // Só o aviso da cobrança (a graduação ainda não aconteceu: nada de "Parabéns").
    try {
      const { sendPushToStudent } = await import("@/lib/push/push.server");
      const dueLabel = new Date(`${data.planned_date}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
      await Promise.allSettled(pushes.map((p) => sendPushToStudent(p.student_id, {
        title: "Nova cobrança disponível",
        body: `Taxa de graduação — ${p.belt} • ${brl(p.amount)} • vence em ${dueLabel}`,
        url: "/app/finance",
        tag: `invoice-${p.invoice_id}`,
      }, "invoice_due_soon")));
    } catch (err) {
      console.warn("[planGraduations] push falhou:", (err as any)?.message ?? err);
    }
    return { count: created.length, updated, plans: created, invoices: newInvoiceIds.length };
  });

/** Graduações previstas aguardando confirmação. */
export const listGraduationPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GraduationPlan[]> => {
    const { data, error } = await plansTable(context.supabase)
      .select("id, student_id, belt_id, degree, planned_date, evaluator, notes, fee_amount, invoice_id, status, created_at, student:dojo_students(id, full_name, photo_url, status), belt:dojo_belts(id, name, modality, color_hex, max_degrees), invoice:dojo_invoices(status)")
      .eq("status", "planned")
      .order("planned_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      fee_amount: r.fee_amount != null ? Number(r.fee_amount) : null,
      invoice_status: r.invoice?.status ?? null,
      invoice: undefined,
    })) as GraduationPlan[];
  });

/**
 * Confirma graduações previstas (o aluno passou na avaliação): cria o registro
 * em dojo_graduations com a taxa já lançada, aplica a faixa e dá os parabéns.
 * Data futura fica agendada (aplicada no dia pelo cron).
 */
export const confirmGraduationPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({
      ids: z.array(uuid).min(1).max(300),
      graduation_date: isoDay.optional(),
      evaluator: z.string().max(200).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: plans, error } = await plansTable(sb)
      .select("id, student_id, belt_id, degree, planned_date, evaluator, notes, fee_amount, invoice_id, status, belt:dojo_belts(name)")
      .in("id", data.ids)
      .eq("status", "planned");
    if (error) throw new Error(error.message);
    if (!plans?.length) throw new Error("Nenhuma graduação prevista encontrada (já confirmada?).");
    const today = todayBR();
    const confirmed: Array<{ id: string; student_id: string; plan_id: string; graduation_date: string; belt_id: string; degree: number }> = [];
    const congrats: Array<{ student_id: string; grad_id: string; belt: string; degree: number }> = [];
    for (const p of plans as any[]) {
      const date = data.graduation_date ?? String(p.planned_date).slice(0, 10);
      const scheduled = date > today;
      const { data: grad, error: gErr } = await sb
        .from("dojo_graduations")
        .insert({
          owner_id: context.userId,
          student_id: p.student_id,
          belt_id: p.belt_id,
          degree: p.degree ?? 0,
          graduation_date: date,
          evaluator: data.evaluator ?? p.evaluator ?? null,
          notes: p.notes ?? null,
          fee_amount: p.fee_amount,
          invoice_id: p.invoice_id,
          applied_at: scheduled ? null : new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (gErr) throw new Error(gErr.message);
      const gradId = (grad as any).id as string;
      await plansTable(sb)
        .update({ status: "confirmed", graduation_id: gradId, confirmed_at: new Date().toISOString() } as never)
        .eq("id", p.id);
      confirmed.push({ id: gradId, student_id: p.student_id, plan_id: p.id, graduation_date: date, belt_id: p.belt_id, degree: p.degree ?? 0 });
      if (!scheduled) congrats.push({ student_id: p.student_id, grad_id: gradId, belt: p.belt?.name ?? "Nova faixa", degree: p.degree ?? 0 });
    }
    try {
      const { sendPushToStudent } = await import("@/lib/push/push.server");
      await Promise.allSettled(congrats.map((c) => sendPushToStudent(c.student_id, {
        title: "Parabéns pela graduação! 🥋",
        body: `Você foi graduado(a): ${c.belt}${c.degree > 0 ? ` — ${c.degree}º grau` : ""}.`,
        url: "/app/graduations",
        tag: `graduation-${c.grad_id}`,
      }, "graduation")));
    } catch (err) {
      console.warn("[confirmGraduationPlans] push falhou:", (err as any)?.message ?? err);
    }
    return { count: confirmed.length, graduations: confirmed };
  });

/** Remove uma graduação prevista. A taxa em aberto é cancelada; paga, continua no financeiro. */
export const cancelGraduationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: plan } = await plansTable(sb).select("id, invoice_id, status").eq("id", data.id).maybeSingle();
    if (!plan) throw new Error("Graduação prevista não encontrada.");
    if ((plan as any).status !== "planned") throw new Error("Esta graduação já foi confirmada.");
    let invoice: "cancelled" | "kept_paid" | null = null;
    const invoiceId = (plan as any).invoice_id as string | null;
    if (invoiceId) {
      const { data: inv } = await sb.from("dojo_invoices").select("status, asaas_charge_id, owner_id").eq("id", invoiceId).maybeSingle();
      if ((inv as any)?.status === "paid") invoice = "kept_paid";
      else if (inv) {
        if ((inv as any).asaas_charge_id) {
          try {
            const { getDojoAsaasCredentials } = await import("@/lib/asaas/dojo-credentials.server");
            const { asaasCancelCharge } = await import("@/lib/asaas/client.server");
            const { apiKey } = await getDojoAsaasCredentials((inv as any).owner_id);
            await asaasCancelCharge((inv as any).asaas_charge_id, apiKey);
          } catch (err) {
            console.warn("[cancelGraduationPlan] Asaas:", (err as any)?.message ?? err);
          }
        }
        await sb.from("dojo_invoices").update({ status: "cancelled" }).eq("id", invoiceId);
        invoice = "cancelled";
      }
    }
    const { error } = await plansTable(sb).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, invoice };
  });

/** Histórico de graduações confirmadas, com a data e se o certificado já foi emitido. */
export const listGraduationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z.object({ from: isoDay.optional(), to: isoDay.optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("dojo_graduations")
      .select("id, student_id, belt_id, degree, graduation_date, evaluator, notes, applied_at, fee_amount, invoice_id, created_at, student:dojo_students(id, full_name, photo_url, status), belt:dojo_belts(id, name, modality, color_hex, max_degrees), invoice:dojo_invoices(status)")
      .order("graduation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.from) q = q.gte("graduation_date", data.from);
    if (data.to) q = q.lte("graduation_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = ((rows ?? []) as any[]).map((r) => r.id);
    const certified = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: certs } = await context.supabase.from("dojo_certificates").select("graduation_id").in("graduation_id", ids.slice(i, i + 300));
      for (const c of (certs ?? []) as any[]) if (c.graduation_id) certified.add(c.graduation_id);
    }
    return ((rows ?? []) as any[]).map((r) => ({
      ...r,
      fee_amount: r.fee_amount != null ? Number(r.fee_amount) : null,
      invoice_status: r.invoice?.status ?? null,
      invoice: undefined,
      scheduled: !r.applied_at,
      has_certificate: certified.has(r.id),
    }));
  });

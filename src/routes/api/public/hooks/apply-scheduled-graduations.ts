// Cron — Processa assinaturas e graduações.
import { createFileRoute } from "@tanstack/react-router";
import { checkInternalHookAuth } from "@/lib/security/hook-auth";

export const Route = createFileRoute("/api/public/hooks/apply-scheduled-graduations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkInternalHookAuth(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPushToStudent } = await import("@/lib/push/push.server");

        const todayDate = new Date();
        const todayISO = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
        }).format(todayDate);

        // ============================================================
        // 1) GRADUAÇÕES AGENDADAS
        // ============================================================
        const { data: pendingGrads } = await (supabaseAdmin as any)
          .from("dojo_graduations")
          .select("id, owner_id, student_id, belt_id, degree, graduation_date, created_at")
          .is("applied_at", null)
          .lte("graduation_date", todayISO)
          .order("graduation_date", { ascending: true })
          .limit(200);

        let gradsApplied = 0;
        if (pendingGrads?.length) {
          const beltIds = [...new Set(pendingGrads.map((g: any) => g.belt_id).filter(Boolean))];
          const { data: belts } = await (supabaseAdmin as any)
            .from("dojo_belts")
            .select("id, name, modality")
            .in("id", beltIds);
          const beltById = new Map((belts ?? []).map((b: any) => [b.id, b]));

          for (const g of pendingGrads) {
            try {
              const { data: claimed } = await (supabaseAdmin as any)
                .from("dojo_graduations")
                .update({ applied_at: new Date().toISOString() })
                .eq("id", g.id)
                .is("applied_at", null)
                .select("id")
                .maybeSingle();
              if (!claimed) continue;

              const { data: student } = await (supabaseAdmin as any)
                .from("dojo_students")
                .select("id, status, current_belt_id, cancelled_at, dojo_belts:current_belt_id(modality)")
                .eq("id", g.student_id)
                .maybeSingle();

              const currentMod = (student as any)?.dojo_belts?.modality ?? null;
              const belt = beltById.get(g.belt_id) as any;
              const newMod = belt?.modality ?? "jiu-jitsu";

              const { data: newer } = await (supabaseAdmin as any)
                .from("dojo_graduations")
                .select("id, graduation_date, dojo_belts:belt_id(modality)")
                .eq("student_id", g.student_id)
                .not("applied_at", "is", null)
                .gt("graduation_date", g.graduation_date);
              const hasNewerSameMod = (newer ?? []).some(
                (n: any) => (n?.dojo_belts?.modality ?? "jiu-jitsu") === newMod,
              );

              if (!hasNewerSameMod && (!student?.current_belt_id || currentMod === null || currentMod === newMod)) {
                const { error: updErr } = await (supabaseAdmin as any)
                  .from("dojo_students")
                  .update({ current_belt_id: g.belt_id, current_degree: g.degree ?? 0 })
                  .eq("id", g.student_id);
                if (updErr) {
                  // Devolve a graduação para a fila: a próxima execução tenta de novo.
                  await (supabaseAdmin as any)
                    .from("dojo_graduations")
                    .update({ applied_at: null })
                    .eq("id", g.id);
                  throw new Error(`atualizar faixa do aluno: ${updErr.message}`);
                }
              }
              gradsApplied++;

              // "Parabéns" só para graduação de verdade: aluno ativo e data que não
              // seja anterior ao registro (histórico lançado depois não é cerimônia).
              const createdDay = g.created_at
                ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(g.created_at))
                : null;
              const backdated = !!createdDay && String(g.graduation_date).slice(0, 10) < createdDay;
              if (student && !student.cancelled_at && student.status === "active" && !backdated) {
                const belt = beltById.get(g.belt_id) as any;
                const degreeTxt = typeof g.degree === "number" && g.degree > 0 ? ` — ${g.degree}º grau` : "";
                await sendPushToStudent(g.student_id, {
                  title: "Parabéns pela graduação! 🥋",
                  body: `Você foi graduado(a): ${belt?.name ?? "Nova faixa"}${degreeTxt}.`,
                  url: "/app/graduations",
                  tag: `graduation-${g.id}`,
                }, "graduation");
              }
            } catch (err: any) {
              console.error("[apply-scheduled-graduations] graduação", g.id, err?.message ?? err);
            }
          }
        }

        // ============================================================
        // 2) RENOVAÇÃO DE ASSINATURAS PIX
        // ============================================================
        // Busca assinaturas PIX que vencem em breve (ex: 3 dias) ou já venceram
        // e que ainda não têm uma nova cobrança pendente.
        const threeDaysAhead = new Date();
        threeDaysAhead.setDate(threeDaysAhead.getDate() + 3);
        const threeDaysAheadISO = threeDaysAhead.toISOString().split("T")[0];

        const { data: subsToRenew } = await (supabaseAdmin as any)
          .from("dojo_subscriptions")
          .select("id, owner_id, status, subscription_type, next_due_date, current_payment_status, plan_code, last_payment_id")
          .eq("subscription_type", "pix")
          .eq("status", "active")
          .lte("next_due_date", threeDaysAheadISO)
          .not("current_payment_status", "eq", "pending") // Só renova se o atual não estiver pendente
          .limit(100);

        let pixRenewals = 0;
        if (subsToRenew?.length) {
          // Legacy renova no valor antigo; contas novas, no valor do plano.
          const { subscriptionAmount } = await import("@/lib/dojo/subscription.functions");
          const { createSubscriptionPixCharge } = await import("@/lib/dojo/subscription-pix.server");
          const { SAAS_PLANS, isSaasPlanCode } = await import("@/lib/dojo/saas-plans");
          type SaasPlanCode = keyof typeof SAAS_PLANS;

          for (const sub of subsToRenew) {
            try {
              const { data: owner } = await supabaseAdmin.auth.admin.getUserById(sub.owner_id);
              const email = owner.user?.email;
              if (!email) continue;
              // PIX recorrente: a cobrança do ciclo fica salva e o QR Code aparece no
              // painel do dono (Assinatura e aviso no topo) — sem depender de e-mail.
              await createSubscriptionPixCharge(supabaseAdmin, sub, {
                amount: subscriptionAmount(sub),
                payerEmail: email,
                description: isSaasPlanCode(sub.plan_code)
                  ? `AMT Dojo Manager — Plano ${SAAS_PLANS[sub.plan_code as SaasPlanCode].name} (PIX)`
                  : "Renovação AMT Dojo Manager — PIX",
              });
              pixRenewals++;
            } catch (err) {
              console.error("[renovação PIX]", sub.id, (err as Error)?.message ?? err);
            }
          }
        }

        // ============================================================
        // 3) SUSPENSÃO POR ATRASO (PIX)
        // ============================================================
        // Suspende se estiver vencido há mais de 5 dias
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const fiveDaysAgoISO = fiveDaysAgo.toISOString().split("T")[0];

        const { data: overdueSubs } = await (supabaseAdmin as any)
          .from("dojo_subscriptions")
          .select("id")
          .eq("subscription_type", "pix")
          .eq("status", "active")
          .lte("next_due_date", fiveDaysAgoISO)
          .not("current_payment_status", "eq", "approved")
          .limit(100);

        if (overdueSubs?.length) {
          const ids = overdueSubs.map((s: any) => s.id);
          await (supabaseAdmin as any)
            .from("dojo_subscriptions")
            .update({ status: "suspended" })
            .in("id", ids);
        }

        return Response.json({ 
          ok: true, 
          today: todayISO, 
          gradsApplied, 
          pixRenewals, 
          suspended: overdueSubs?.length ?? 0 
        });
      },
    },
  },
});

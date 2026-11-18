// Implantação assistida — lado do dono (painel). O acesso é garantido no banco:
// RLS de `dojo_implementation_requests` (só o próprio dono, editável enquanto
// rascunho/enviada) e o gatilho `dojo_implementation_guard` (campos da AMT
// intocáveis; o envio segura o teste grátis). Aplicar no banco é só pela AMT
// (Edge Function `implementation` → `dojo_apply_implementation`).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  implementationIssues,
  implementationPayloadSchema,
  readImplementationPayload,
} from "@/lib/dojo/implementation";

const SELECT =
  "id, status, payload, trial_after_implementation, admin_notes, result, submitted_at, started_at, completed_at, updated_at";

async function loadOwn(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase
    .from("dojo_implementation_requests")
    .select(SELECT)
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as null | {
    id: string;
    status: string;
    payload: unknown;
    trial_after_implementation: boolean;
    admin_notes: string | null;
    result: Record<string, string | number | boolean | null> | null;
    submitted_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    updated_at: string;
  };
}

export const getMyImplementation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await loadOwn(context);
    if (!row) return null;
    return { ...row, payload: readImplementationPayload(row.payload) };
  });

export type MyImplementation = Awaited<ReturnType<typeof getMyImplementation>>;

const draftInput = z.object({
  payload: implementationPayloadSchema,
  trial_after_implementation: z.boolean(),
});

/** Cria ou atualiza o rascunho (o formulário salva sozinho). */
export const saveImplementationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => draftInput.parse(input))
  .handler(async ({ context, data }) => {
    const row = await loadOwn(context);
    if (row && row.status !== "rascunho") {
      throw new Error('O pedido já foi enviado. Para alterar, clique em "Editar pedido".');
    }
    const values = {
      payload: data.payload,
      trial_after_implementation: data.trial_after_implementation,
    };
    const { error } = row
      ? await context.supabase.from("dojo_implementation_requests").update(values).eq("id", row.id)
      : await context.supabase
          .from("dojo_implementation_requests")
          .insert({ owner_id: context.userId, status: "rascunho", ...values });
    if (error) {
      if (/row-level security/i.test(error.message)) {
        throw new Error("Só o dono da academia pode pedir a implantação.");
      }
      throw new Error(error.message);
    }
    return { ok: true as const, savedAt: new Date().toISOString() };
  });

/** Envia para a AMT. Valida de novo no servidor o que o formulário já confere. */
export const submitImplementation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => draftInput.parse(input))
  .handler(async ({ context, data }) => {
    const issues = implementationIssues(data.payload);
    if (issues.length) throw new Error(issues[0]);
    const row = await loadOwn(context);
    if (row && row.status !== "rascunho") throw new Error("Este pedido já foi enviado.");
    const values = {
      payload: data.payload,
      trial_after_implementation: data.trial_after_implementation,
      status: "enviada",
    };
    if (row) {
      const { error } = await context.supabase
        .from("dojo_implementation_requests")
        .update(values)
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    } else {
      // A política de inserção só aceita rascunho: cria e envia em seguida.
      const created = await context.supabase
        .from("dojo_implementation_requests")
        .insert({
          owner_id: context.userId,
          status: "rascunho",
          payload: data.payload,
          trial_after_implementation: data.trial_after_implementation,
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      const { error } = await context.supabase
        .from("dojo_implementation_requests")
        .update({ status: "enviada" })
        .eq("id", created.data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

/** Volta um pedido enviado (que a AMT ainda não começou) para rascunho. */
export const reopenImplementation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await loadOwn(context);
    if (!row) throw new Error("Nenhum pedido de implantação.");
    if (row.status !== "enviada")
      throw new Error("A AMT já começou a implantação; fale com o suporte para alterar.");
    const { error } = await context.supabase
      .from("dojo_implementation_requests")
      .update({ status: "rascunho" })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Desiste da implantação assistida (apaga o rascunho) e volta ao assistente. */
export const discardImplementationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await loadOwn(context);
    if (!row) return { ok: true as const };
    if (row.status !== "rascunho") throw new Error("Só é possível descartar um rascunho.");
    const { error } = await context.supabase
      .from("dojo_implementation_requests")
      .delete()
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

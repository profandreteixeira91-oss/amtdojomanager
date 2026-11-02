/**
 * Autenticação dos endpoints internos de automação (cron / triggers do banco).
 *
 * As rotinas são chamadas pelo pg_cron/pg_net (public.dojo_hook_post) com o
 * header `x-cron-secret` = CRON_SECRET, guardado no Vault do Supabase e nos
 * segredos da hospedagem. Só ele vale: a chave publishable/anon do projeto é
 * pública (vai no build do navegador) e não pode disparar rotinas.
 *
 * Webhooks de terceiros (Asaas, Mercado Pago, Instagram, Melhor Envio) NÃO usam
 * este guard: eles têm verificação própria de assinatura/token.
 */
export function checkInternalHookAuth(request: Request): Response | null {
  const expected = (process.env.CRON_SECRET ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (expected.length < 32) {
    // Sem segredo (ou segredo fraco) no ambiente: falha fechada.
    return new Response("Unauthorized", { status: 401 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const provided = [
    request.headers.get("x-cron-secret") ?? "",
    auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "",
  ].map((v) => v.trim());

  return provided.includes(expected) ? null : new Response("Unauthorized", { status: 401 });
}

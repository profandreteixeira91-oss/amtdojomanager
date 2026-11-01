/** Domínio público (canônico) do AMT Dojo Manager. */
export const DOJO_HOST = "dojomanager.amtfightwear.com.br";

/**
 * Domínios que servem o Dojo Manager diretamente, sem redirecionar para o
 * canônico. `teste.amtsistemas.com.br` (branch `1nov26`) também vale como
 * produção e deve substituir o endereço atual.
 */
export const DOJO_HOSTS: readonly string[] = [DOJO_HOST, "teste.amtsistemas.com.br"];

export function isDojoHostname(hostname: string): boolean {
  return DOJO_HOSTS.includes(hostname);
}

/**
 * Origem pública do Dojo pela qual a requisição chegou, para montar URLs de
 * retorno (ex.: back_url do Mercado Pago). Só aceita domínios da lista — um
 * cabeçalho forjado nunca vira redirecionamento externo; senão usa o canônico.
 */
export function dojoOriginFromRequest(request: Request): string {
  const normalize = (h: string | null | undefined) =>
    (h ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const host = [
    normalize(request.headers.get("x-forwarded-host")),
    normalize(request.headers.get("host")),
    normalize(new URL(request.url).host),
  ].find(isDojoHostname);
  return `https://${host ?? DOJO_HOST}`;
}

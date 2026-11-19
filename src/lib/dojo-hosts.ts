/** Domínio público (canônico) do AMT Dojo Manager. */
export const DOJO_HOST = "amtdojomanager.com.br";

/**
 * Domínios que servem o Dojo Manager diretamente, sem redirecionar para o
 * canônico. Os endereços antigos continuam funcionando (links já enviados a
 * alunos, QR Codes impressos); `teste.amtsistemas.com.br` é a branch `1nov26`.
 */
export const DOJO_HOSTS: readonly string[] = [
  DOJO_HOST,
  "www.amtdojomanager.com.br",
  "dojomanager.amtfightwear.com.br",
  "teste.amtsistemas.com.br",
];

/**
 * Páginas fora de /dojo que também existem no domínio do Dojo e não podem ser
 * mandadas para /dojo/... (lá não existem e dariam 404): ferramentas gratuitas,
 * textos legais, verificação de certificado, troca de senha e arquivos de SEO.
 */
export const DOJO_SHARED_PATH_PREFIXES: readonly string[] = [
  "/ferramentas/",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/certificate/",
  "/reset-password",
  "/sitemap.xml",
  "/robots.txt",
  "/llms.txt",
];

export function isDojoSharedPath(pathname: string): boolean {
  return DOJO_SHARED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Host de teste (branch 1nov26): nunca deve ser indexado (robots.txt fechado e X-Robots-Tag: noindex). */
export const DOJO_TEST_HOST = "teste.amtsistemas.com.br";

/** Variante com www: as páginas públicas redirecionam (301) para o domínio principal. */
export const DOJO_WWW_HOST = `www.${DOJO_HOST}`;

/**
 * Hosts pelos quais a requisição chegou (x-forwarded-host, host, URL), normalizados: os proxies nem sempre
 * concordam sobre o host público.
 */
export function requestHostnames(request: Request): string[] {
  const normalize = (h: string | null | undefined) =>
    (h ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return [
    normalize(request.headers.get("x-forwarded-host")),
    normalize(request.headers.get("host")),
    normalize(new URL(request.url).host),
  ].filter(Boolean);
}

/** Endereço público canônico de uma página do Dojo. */
export function dojoCanonical(path: string): string {
  return `https://${DOJO_HOST}${path}`;
}

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

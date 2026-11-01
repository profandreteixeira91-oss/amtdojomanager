/** Domínio público (canônico) do AMT Dojo Manager. */
export const DOJO_HOST = "dojomanager.amtfightwear.com.br";

/**
 * Domínios que servem o Dojo Manager diretamente, sem redirecionar para o
 * canônico. Inclui o ambiente de testes (branch `1nov26`).
 */
export const DOJO_HOSTS: readonly string[] = [DOJO_HOST, "teste.amtsistemas.com.br"];

export function isDojoHostname(hostname: string): boolean {
  return DOJO_HOSTS.includes(hostname);
}

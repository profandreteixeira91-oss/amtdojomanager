/**
 * Tema do painel do AMT Dojo Manager (dono e Portal da Equipe).
 *
 * Preferência guardada no aparelho:
 *   - "auto"  → escuro das 18h às 6h (horário do aparelho), claro no resto do dia;
 *   - "light" → sempre claro;
 *   - "dark"  → sempre escuro.
 * O tema resolvido vai para <html data-dojo-theme="..."> (o CSS escuro do painel
 * só vale com esse atributo) e para a classe `.dark` (variantes `dark:`).
 */

export type DojoThemePref = "auto" | "light" | "dark";
export type DojoResolvedTheme = "light" | "dark";

export const DOJO_THEME_KEY = "amt-dojo-theme";
export const DOJO_THEME_EVENT = "amt-dojo-theme-change";
/** Início e fim do escuro automático (horas cheias, horário local). */
export const DARK_FROM_HOUR = 18;
export const DARK_UNTIL_HOUR = 6;

export function isDojoThemePref(v: unknown): v is DojoThemePref {
  return v === "auto" || v === "light" || v === "dark";
}

export function readDojoThemePref(): DojoThemePref {
  try {
    const v = window.localStorage.getItem(DOJO_THEME_KEY);
    return isDojoThemePref(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeDojoThemePref(pref: DojoThemePref): void {
  try {
    window.localStorage.setItem(DOJO_THEME_KEY, pref);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  window.dispatchEvent(new CustomEvent(DOJO_THEME_EVENT, { detail: pref }));
}

export function isNightTime(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= DARK_FROM_HOUR || h < DARK_UNTIL_HOUR;
}

export function resolveDojoTheme(pref: DojoThemePref, now: Date = new Date()): DojoResolvedTheme {
  if (pref === "auto") return isNightTime(now) ? "dark" : "light";
  return pref;
}

/** Milissegundos até a próxima virada do automático (18h ou 6h). */
export function msUntilNextSwitch(now: Date = new Date()): number {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  const h = now.getHours();
  if (h >= DARK_UNTIL_HOUR && h < DARK_FROM_HOUR) next.setHours(DARK_FROM_HOUR);
  else {
    if (h >= DARK_FROM_HOUR) next.setDate(next.getDate() + 1);
    next.setHours(DARK_UNTIL_HOUR);
  }
  return Math.max(1000, next.getTime() - now.getTime());
}

import { useCallback, useEffect, useState } from "react";
import {
  DOJO_THEME_EVENT,
  DOJO_THEME_KEY,
  isDojoThemePref,
  msUntilNextSwitch,
  readDojoThemePref,
  resolveDojoTheme,
  writeDojoThemePref,
  type DojoResolvedTheme,
  type DojoThemePref,
} from "@/lib/dojo/panel-theme";

/** Preferência de tema do painel, sincronizada entre componentes e abas. */
export function useDojoThemePref() {
  const [pref, setPrefState] = useState<DojoThemePref>("auto");
  const [resolved, setResolved] = useState<DojoResolvedTheme>("light");

  useEffect(() => {
    const sync = () => {
      const p = readDojoThemePref();
      setPrefState(p);
      setResolved(resolveDojoTheme(p));
    };
    sync();
    const onEvent = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === DOJO_THEME_KEY) sync();
    };
    window.addEventListener(DOJO_THEME_EVENT, onEvent);
    window.addEventListener("storage", onStorage);
    // No automático, troca sozinho às 18h e às 6h (e confere de novo ao voltar para a aba).
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sync();
        schedule();
      }, msUntilNextSwitch() + 500);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sync();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(DOJO_THEME_EVENT, onEvent);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, []);

  const setPref = useCallback((p: DojoThemePref) => {
    if (!isDojoThemePref(p)) return;
    writeDojoThemePref(p);
  }, []);

  return { pref, resolved, setPref };
}

/**
 * Aplica o tema do painel ao <html> enquanto o painel estiver montado.
 * Áreas que precisam ficar claras (editor de certificados) marcam
 * `data-force-light` no <html> via useForceLightTheme e têm prioridade.
 * Ao sair do painel, devolve o <html> como estava.
 */
export function useApplyDojoPanelTheme(): DojoResolvedTheme {
  const { resolved } = useDojoThemePref();

  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    const apply = () => {
      const theme: DojoResolvedTheme = root.dataset.forceLight ? "light" : resolved;
      if (root.dataset.dojoTheme !== theme) root.dataset.dojoTheme = theme;
      const wantDark = theme === "dark";
      if (root.classList.contains("dark") !== wantDark) root.classList.toggle("dark", wantDark);
      if (root.style.colorScheme !== theme) root.style.colorScheme = theme;
      const meta = document.querySelector('meta[name="theme-color"]');
      const color = wantDark ? "#0b0b0c" : "#dc2626";
      if (meta && meta.getAttribute("content") !== color) meta.setAttribute("content", color);
    };
    apply();
    // Outros pontos do app (ThemeProvider global) também mexem na classe `.dark`.
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-force-light"] });
    return () => {
      observer.disconnect();
      delete root.dataset.dojoTheme;
      root.classList.toggle("dark", hadDark);
      root.style.colorScheme = prevScheme;
    };
  }, [resolved]);

  return resolved;
}

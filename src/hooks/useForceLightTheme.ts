import { useEffect } from "react";

const THEME_STORAGE_KEY = "amt-theme";

/**
 * Áreas sempre claras (editor de certificados, matrícula online, Central AMT /admin),
 * independente do tema do sistema/navegador e do tema escuro do painel.
 * Marca `data-force-light` no <html> (o tema do painel respeita a marca), remove `.dark`
 * enquanto montado (inclusive se outro ponto reaplicar depois) e devolve o tema ao sair.
 */
export function useForceLightTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.forceLight = "1";
    const enforce = () => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
      if (root.style.colorScheme !== "light") root.style.colorScheme = "light";
    };
    enforce();
    const mo = new MutationObserver(enforce);
    mo.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    return () => {
      mo.disconnect();
      // Tira a marca primeiro: se o painel estiver montado, ele reaplica o tema dele.
      delete root.dataset.forceLight;
      if (root.dataset.dojoTheme) return;
      const isDark = window.localStorage.getItem(THEME_STORAGE_KEY) === "dark";
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    };
  }, []);
}

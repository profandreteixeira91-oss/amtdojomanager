import { cn } from "@/lib/utils";

interface DojoLogoProps {
  className?: string;
  alt?: string;
}

/**
 * Marca oficial do AMT Dojo Manager, servida pelo próprio site (public/brand).
 * WebP de 640×214 (12 KB): cobre até 3x a maior altura usada (h-16). O PNG
 * original de 1280×428 (484 KB, no Supabase sem cache) deixava a página pública
 * lenta no celular.
 */
export const DOJO_LOGO_SRC = "/brand/dojo-manager-logo.webp";
export const DOJO_LOGO_WIDTH = 640;
export const DOJO_LOGO_HEIGHT = 214;

/**
 * Use `className` para controlar o tamanho (ex.: h-12 w-auto). Largura e altura
 * reais no HTML reservam o espaço antes da imagem chegar.
 */
export function DojoLogo({ className, alt = "AMT Dojo Manager" }: DojoLogoProps) {
  return (
    <img
      src={DOJO_LOGO_SRC}
      width={DOJO_LOGO_WIDTH}
      height={DOJO_LOGO_HEIGHT}
      alt={alt}
      className={cn("h-10 w-auto select-none", className)}
      draggable={false}
      loading="eager"
      decoding="async"
    />
  );
}

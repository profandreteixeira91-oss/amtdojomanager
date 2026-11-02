import type { ComponentType, ReactNode } from "react";
import { DojoPageHero } from "@/components/dojo/DojoPageHero";

type DojoPageShellProps = {
  /**
   * Descrição/subtítulo opcional (o título já é exibido pelo header sticky do layout).
   */
  description?: ReactNode;
  /** Ações no canto direito (botões primários da página). */
  actions?: ReactNode;
  /** Título da página. Com `title`, o topo vira o card de título padrão (DojoPageHero). */
  title?: ReactNode;
  /** Ícone do módulo no card de título. */
  icon?: ComponentType<{ className?: string }>;
  /** Rótulo curto acima do título no card. */
  eyebrow?: ReactNode;
  children: ReactNode;
  /** Largura máxima menor para páginas de formulário. */
  narrow?: boolean;
};

/**
 * Container padrão do AMT Dojo Manager.
 *
 * Com `title` (e de preferência `icon`), o topo vira o card de título padrão das
 * páginas; sem título, mostra só descrição e ações numa barra simples.
 *
 * Uso:
 *   <DojoPageShell description="Detalhe" actions={<Button>Novo</Button>}>
 *     <Card>...</Card>
 *   </DojoPageShell>
 */
export function DojoPageShell({
  title,
  icon,
  eyebrow,
  description,
  actions,
  children,
  narrow,
}: DojoPageShellProps) {
  const maxW = narrow ? "max-w-4xl" : "max-w-7xl";
  const showBar = Boolean(description || actions);
  return (
    <div className={`mx-auto flex w-full ${maxW} flex-col gap-6 md:gap-7`}>
      {title ? (
        <DojoPageHero icon={icon} eyebrow={eyebrow} title={title} description={description} actions={actions} />
      ) : (
        showBar && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            {description && (
              <p className="min-w-0 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            )}
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )
      )}
      {children}
    </div>
  );
}

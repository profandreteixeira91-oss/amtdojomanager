import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type DojoPageHeroProps = {
  /** Ícone do módulo, desenhado num selo vermelho. */
  icon?: ComponentType<{ className?: string }>;
  /** Substitui o selo do ícone (avatar, logo, foto). */
  media?: ReactNode;
  /** Rótulo curto acima do título (seção ou contexto). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Botões da página, à direita no desktop e abaixo do texto no celular. */
  actions?: ReactNode;
  /** Chips/indicadores logo abaixo da descrição (use HeroChip). */
  meta?: ReactNode;
  /** Faixa inferior do card: atalhos, abas ou indicadores rápidos. */
  footer?: ReactNode;
  /** Conteúdo extra na coluna do texto. */
  children?: ReactNode;
  className?: string;
  /** Marcador do tutorial guiado. */
  tour?: string;
};

/**
 * Card de título padrão das páginas do Dojo Manager: claro, com o selo
 * vermelho do módulo, título, descrição e ações. Mantém todas as telas com a
 * mesma hierarquia visual.
 */
export function DojoPageHero({
  icon: Icon,
  media,
  eyebrow,
  title,
  description,
  actions,
  meta,
  footer,
  children,
  className,
  tour,
}: DojoPageHeroProps) {
  return (
    <section className={cn("dojo-hero relative overflow-hidden", className)} data-tour={tour}>
      <div aria-hidden className="dojo-hero-pattern pointer-events-none absolute inset-0" />
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-red-600 to-red-800" />
      <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-7">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          {media ??
            (Icon && (
              <div className="dojo-hero-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white sm:h-12 sm:w-12 sm:rounded-2xl md:h-14 md:w-14">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
              </div>
            ))}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">
                {eyebrow}
              </div>
            )}
            <h1 className="break-words text-[22px] font-bold leading-tight tracking-tight text-neutral-950 sm:text-2xl md:text-[28px]">
              {title}
            </h1>
            {description && (
              <div className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-600">{description}</div>
            )}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
            {children}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-[50%] lg:justify-end">{actions}</div>
        )}
      </div>
      {footer && (
        <div className="relative border-t border-[color:var(--dojo-border)] bg-neutral-50/70 px-5 py-3 sm:px-6 lg:px-7">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Faixa de abas das páginas (rola na horizontal no celular). */
export const SUBNAV_CLS = "-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const SUBNAV_ROW_CLS = "flex w-max min-w-full flex-nowrap gap-1";

/** Classe de um item de aba: vermelho sólido quando ativo. */
export function subnavItemClass(active: boolean) {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
    active
      ? "bg-red-600 text-white shadow-[0_6px_14px_-8px_rgb(220_38_38_/_0.9)]"
      : "text-neutral-600 hover:bg-white hover:text-neutral-950 hover:shadow-xs",
  );
}

/** Mesmo visual para abas do Radix (TabsList/TabsTrigger). */
export const SUBNAV_TABSLIST_CLS = "flex h-auto w-max min-w-full flex-nowrap justify-start gap-1 bg-transparent p-0";
export const SUBNAV_TRIGGER_CLS =
  "h-auto flex-none gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-600 shadow-none hover:bg-white hover:text-neutral-950 data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-[0_6px_14px_-8px_rgb(220_38_38_/_0.9)] [&_svg]:h-3.5 [&_svg]:w-3.5";

/** Chip discreto para a linha `meta` do DojoPageHero. */
export function HeroChip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "red" | "green" | "amber";
  className?: string;
}) {
  const tones = {
    neutral: "border-neutral-200 bg-white text-neutral-700",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium [&_svg]:h-3.5 [&_svg]:w-3.5",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

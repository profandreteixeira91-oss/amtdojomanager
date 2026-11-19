import * as React from "react";

import { Input } from "@/components/ui/input";
import { formatCurrencyBR, maskCurrencyBR, parseAmountBR } from "@/lib/br-masks";
import { cn } from "@/lib/utils";

type CurrencyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "min" | "max" | "step"
> & {
  /** Número, texto ("150.5", "150,50", "R$ 1.200,00") ou vazio. */
  value: number | string | null | undefined;
  /** Recebe o valor em reais (2 casas) ou `null` quando o campo fica vazio. */
  onValueChange: (value: number | null) => void;
  /** Classes do contêiner (largura, grid); `className` vai para o campo. */
  wrapperClassName?: string;
};

/**
 * Campo de dinheiro padrão do Dojo Manager: "R$" fixo à esquerda e máscara
 * brasileira (os dígitos entram pela direita: 15000 → 150,00). Colar "1.200,50",
 * "1200.50" ou "R$ 1.200" também funciona.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    { value, onValueChange, className, wrapperClassName, placeholder = "0,00", onPaste, ...props },
    ref,
  ) {
    const shown = formatCurrencyBR(value);
    return (
      <div className={cn("relative", wrapperClassName)}>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
        >
          R$
        </span>
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          className={cn("pl-9 tabular-nums", className)}
          value={shown}
          onChange={(e) => {
            const masked = maskCurrencyBR(e.target.value, shown);
            onValueChange(masked ? parseAmountBR(masked) : null);
          }}
          onPaste={(e) => {
            onPaste?.(e);
            const pasted = parseAmountBR(e.clipboardData.getData("text"));
            if (pasted === null) return;
            e.preventDefault();
            onValueChange(Math.round(Math.abs(pasted) * 100) / 100);
          }}
          {...props}
        />
      </div>
    );
  },
);

/** Para estados guardados como texto: `null` vira "" e o número vira "150.5". */
export const currencyText = (value: number | null) => (value === null ? "" : String(value));

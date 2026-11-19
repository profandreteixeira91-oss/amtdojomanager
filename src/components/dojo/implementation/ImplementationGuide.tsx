import type { ReactNode } from "react";
import { Info } from "lucide-react";

/** Caixa de orientação das etapas da implantação assistida. */
export function StepGuide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <p className="mb-1.5 flex items-center gap-2 font-medium">
        <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {title}
      </p>
      <div className="space-y-1.5 text-muted-foreground [&_li]:pl-0.5 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

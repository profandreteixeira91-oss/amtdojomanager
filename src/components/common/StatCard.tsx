import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type StatCardProps = {
  label: string;
  value: string | number;
  delta?: number | null;
  hint?: string;
  icon: LucideIcon;
  loading?: boolean;
  index?: number;
};

export function StatCard({ label, value, delta, hint, icon: Icon, loading, index = 0 }: StatCardProps) {
  const positive = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="min-w-0"
    >
      <Card className="group relative h-full min-w-0 overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-foreground/15 hover:shadow-md hover:shadow-black/[0.04]">
        <CardContent className="min-w-0 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 break-words text-xs font-medium leading-tight text-muted-foreground">
              {label}
            </div>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-7 w-24" />
          ) : (
            <div className="mt-2 truncate text-2xl font-bold tracking-tight tabular-nums">{value}</div>
          )}
          {(typeof delta === "number" || hint) && !loading && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {typeof delta === "number" && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    positive
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                  }`}
                >
                  {positive ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {positive ? "+" : ""}
                  {delta.toFixed(1)}%
                </span>
              )}
              {hint && <span className="break-words text-xs text-muted-foreground">{hint}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

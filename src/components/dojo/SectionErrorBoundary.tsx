import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Card de erro de tela inteira (errorComponent de rota): mostra a mensagem
 * real, permite tentar de novo e voltar para uma página segura.
 */
export function RouteErrorCard({
  title,
  message,
  onRetry,
  backTo,
  backLabel,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <AlertTriangle className="mx-auto h-6 w-6 text-red-600" />
      <div className="text-sm font-semibold text-red-800">{title}</div>
      <div className="break-words text-xs text-red-700">{message}</div>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Tentar de novo
        </Button>
        {backTo && (
          <Button size="sm" variant="ghost" asChild>
            <Link to={backTo}>{backLabel ?? "Voltar"}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Limite de erro por seção: um dado inesperado numa aba ou card mostra um
 * aviso só naquele trecho, sem derrubar o resto da página.
 * `resetKey` limpa o erro quando muda (ex.: id do aluno, dados recarregados).
 */
export class SectionErrorBoundary extends Component<
  { children: ReactNode; label?: string; resetKey?: unknown },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[section:${this.props.label ?? "?"}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Não foi possível exibir {this.props.label ? `"${this.props.label}"` : "esta seção"}.
            </div>
            <div className="mt-0.5 break-words opacity-80">{this.state.error.message}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0"
            onClick={() => this.setState({ error: null })}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
}

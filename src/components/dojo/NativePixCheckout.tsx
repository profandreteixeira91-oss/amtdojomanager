import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, QrCode, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeWithPix, syncPixPayment, PLAN_AMOUNT } from "@/lib/dojo/subscription.functions";
import type { SaasPlanCode } from "@/lib/dojo/saas-plans";

export type PixChargeData = {
  paymentId: string;
  qrCodeBase64: string | null;
  qrCodeCopyPaste: string | null;
  amount?: number;
  expiresAt?: string | null;
  dueDate?: string | null;
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : null;

/**
 * QR Code PIX na tela + código copia e cola. Confere o pagamento a cada 5 s e
 * chama `onPaid` quando o Mercado Pago aprova.
 */
export function PixChargeView({ charge, onPaid }: { charge: PixChargeData; onPaid?: () => void }) {
  const sync = useServerFn(syncPixPayment);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    const t = setInterval(() => {
      void sync({ data: { paymentId: charge.paymentId } })
        .then((r) => {
          if (!stop && r.status === "approved") {
            stop = true;
            clearInterval(t);
            toast.success("Pagamento confirmado! Assinatura em dia.");
            onPaid?.();
          }
        })
        .catch(() => {});
    }, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [charge.paymentId, onPaid, sync]);

  function copy() {
    if (!charge.qrCodeCopyPaste) return;
    void navigator.clipboard.writeText(charge.qrCodeCopyPaste);
    setCopied(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4 text-center">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-neutral-900">Pague com PIX</h3>
        <p className="text-sm text-neutral-500">
          Escaneie o QR Code no app do banco ou copie o código.
          {charge.amount != null && (
            <>
              {" "}Valor: <span className="font-semibold text-neutral-900">R$ {charge.amount.toFixed(2).replace(".", ",")}</span>.
            </>
          )}
        </p>
      </div>
      <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl border bg-white p-4 shadow-sm ring-4 ring-emerald-50">
        {charge.qrCodeBase64 ? (
          <img src={`data:image/png;base64,${charge.qrCodeBase64}`} alt="QR Code PIX" className="h-full w-full" />
        ) : (
          <div className="text-xs text-neutral-400">QR Code indisponível — use o código abaixo</div>
        )}
      </div>
      {charge.qrCodeCopyPaste && (
        <div className="relative">
          <Input readOnly value={charge.qrCodeCopyPaste} className="border-neutral-200 bg-neutral-50 pr-24 font-mono text-xs" />
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-1 top-1 h-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
            onClick={copy}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-1.5">{copied ? "Copiado" : "Copiar"}</span>
          </Button>
        </div>
      )}
      <p className="text-[11px] text-neutral-500">
        {fmtDate(charge.dueDate) && <>Vencimento: <b>{fmtDate(charge.dueDate)}</b>. </>}
        {fmtDate(charge.expiresAt) && <>Este código vale até {fmtDate(charge.expiresAt)}. </>}
        A confirmação aparece aqui em instantes depois do pagamento.
      </p>
    </div>
  );
}

interface Props {
  onSuccess?: () => void;
  /** Plano escolhido (contas novas). Contas legacy não enviam. */
  planCode?: SaasPlanCode;
  /** Valor exibido; padrão = valor das contas legacy. */
  amount?: number;
  /** Mantido por compatibilidade: o e-mail da conta é usado automaticamente. */
  defaultEmail?: string;
}

/**
 * Assinatura por PIX recorrente: o QR Code é gerado aqui na tela (nada por
 * e-mail). Nos meses seguintes o sistema gera o PIX da mensalidade sozinho,
 * 3 dias antes do vencimento, e ele aparece em Minha conta › Assinatura.
 */
export function NativePixCheckout({ onSuccess, planCode, amount = PLAN_AMOUNT }: Props) {
  const subscribePix = useServerFn(subscribeWithPix);
  const [busy, setBusy] = useState(false);
  const [charge, setCharge] = useState<PixChargeData | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await subscribePix({ data: { planCode } });
      setCharge({ ...res, amount });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao gerar o PIX");
    } finally {
      setBusy(false);
    }
  }

  if (charge) return <PixChargeView charge={charge} onPaid={onSuccess} />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        <div className="mb-2 flex items-center gap-2 font-semibold text-neutral-800">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-100 text-emerald-600">
            <RefreshCw className="h-3 w-3" />
          </span>
          PIX recorrente
        </div>
        O QR Code aparece aqui na tela. Nos meses seguintes, o PIX da mensalidade é gerado automaticamente
        3 dias antes do vencimento e fica disponível em <b>Minha conta › Assinatura</b> — você recebe o aviso no
        próprio painel, sem depender de e-mail.
      </div>
      <Button
        onClick={generate}
        disabled={busy}
        className="h-12 w-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
      >
        {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <QrCode className="mr-2 h-5 w-5" />}
        Gerar QR Code do PIX · R$ {amount.toFixed(2).replace(".", ",")}
      </Button>
    </div>
  );
}

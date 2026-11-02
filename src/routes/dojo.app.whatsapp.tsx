import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  MessageCircle,
  PauseCircle,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Unplug,
  XCircle,
} from "lucide-react";

import { DojoPageHero, HeroChip } from "@/components/dojo/DojoPageHero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { NOTIFICATION_CATEGORY_META } from "@/lib/student-app/notification-prefs.functions";
import {
  disconnectWhatsApp,
  getWhatsAppStatus,
  listWhatsAppMessages,
  pollWhatsAppConnection,
  saveWhatsAppSettings,
  sendWhatsAppTest,
  startWhatsAppConnection,
} from "@/lib/whatsapp/whatsapp.functions";

export const Route = createFileRoute("/dojo/app/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — AMT Dojo Manager" }] }),
  component: WhatsAppPage,
});

const STATUS_KEY = ["dojo-whatsapp-status"];
const MESSAGES_KEY = ["dojo-whatsapp-messages"];
const QR_REFRESH_MS = 25_000;
const POLL_MS = 3_000;

function formatPhone(digits: string | null | undefined): string {
  const d = String(digits ?? "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return `+55 (${ddd}) ${rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`}`;
  }
  return d ? `+${d}` : "—";
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getWhatsAppStatus);
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => statusFn(), refetchInterval: 30_000 });

  const data = status.data;
  const instance = data?.instance ?? null;
  const connected = instance?.status === "connected";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-7">
      <DojoPageHero
        icon={MessageCircle}
        eyebrow="App do Aluno"
        title="WhatsApp da academia"
        description="Conecte o WhatsApp do dojo lendo o QR Code. As mesmas notificações do app — mensalidades, lembretes de aula, graduações, avisos e muito mais — passam a chegar também no WhatsApp dos alunos."
        meta={
          data ? (
            <>
              {connected ? (
                <HeroChip tone="green">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Conectado · {formatPhone(instance?.phone_number)}
                </HeroChip>
              ) : (
                <HeroChip tone="amber">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Não conectado
                </HeroChip>
              )}
              {connected && !instance?.enabled && (
                <HeroChip tone="red">
                  <PauseCircle /> Envio pausado
                </HeroChip>
              )}
              <HeroChip>
                <Send /> {data.stats.sent24h} enviadas em 24 h
              </HeroChip>
              {data.stats.pending > 0 && (
                <HeroChip>
                  <Clock /> {data.stats.pending} na fila
                </HeroChip>
              )}
            </>
          ) : undefined
        }
      />

      {status.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </CardContent>
        </Card>
      ) : status.isError ? (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-red-800">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>{(status.error as Error)?.message ?? "Não foi possível carregar o WhatsApp."}</div>
          </CardContent>
        </Card>
      ) : !data?.configured ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-amber-900">
            <Clock className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">WhatsApp em implantação</div>
              O servidor de WhatsApp da AMT ainda não foi ativado neste ambiente. Assim que estiver no ar, esta página
              mostra o QR Code para você conectar o número do dojo.
            </div>
          </CardContent>
        </Card>
      ) : connected ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-6">
            <ConnectedCard
              phone={instance!.phone_number}
              profile={instance!.profile_name}
              connectedAt={instance!.connected_at}
              enabled={instance!.enabled}
              onChanged={() => qc.invalidateQueries({ queryKey: STATUS_KEY })}
            />
            <TestCard />
          </div>
          <CategoriesCard
            categories={instance!.categories}
            onSaved={() => qc.invalidateQueries({ queryKey: STATUS_KEY })}
          />
        </div>
      ) : (
        <ConnectCard onConnected={() => qc.invalidateQueries({ queryKey: STATUS_KEY })} />
      )}

      {data?.configured && <MessagesCard />}
    </div>
  );
}

/* ------------------------------ Conectar ------------------------------ */

function ConnectCard({ onConnected }: { onConnected: () => void }) {
  const startFn = useServerFn(startWhatsAppConnection);
  const pollFn = useServerFn(pollWhatsAppConnection);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [usePhone, setUsePhone] = useState(false);
  const [phone, setPhone] = useState("");
  const lastQrAt = useRef(0);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  const start = useMutation({
    mutationFn: (p: string | null) => startFn({ data: { phone: p } }),
    onSuccess: (r) => {
      if (r.status === "connected") {
        toast.success("WhatsApp conectado!");
        onConnected();
        return;
      }
      setQr(r.qr);
      setPairingCode(r.pairingCode);
      lastQrAt.current = Date.now();
      setActive(true);
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível iniciar a conexão."),
  });

  // Acompanha a leitura; renova o QR antes de expirar.
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const refreshQr = !pairingCode && Date.now() - lastQrAt.current > QR_REFRESH_MS;
        const r = await pollFn({ data: { refreshQr } });
        if (stop) return;
        if (r.status === "connected") {
          setActive(false);
          toast.success("WhatsApp conectado!");
          onConnectedRef.current();
          return;
        }
        if (r.qr) {
          setQr(r.qr);
          lastQrAt.current = Date.now();
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active, pairingCode, pollFn]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-red-600" /> Conectar o WhatsApp do dojo
          </CardTitle>
          <CardDescription>Leva menos de um minuto. Use o celular com o número que vai enviar as mensagens.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="space-y-3 text-sm text-neutral-700">
            {[
              "Abra o WhatsApp (ou WhatsApp Business) no celular do dojo.",
              "Toque em ⋮ ou Configurações › Aparelhos conectados › Conectar um aparelho.",
              usePhone
                ? "Escolha “Conectar com número de telefone” e digite o código que aparece aqui."
                : "Aponte a câmera para o QR Code ao lado.",
            ].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-600 text-xs font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>

          {usePhone && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-600">Celular do dojo (com DDD)</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setPairingCode(null);
                setQr(null);
                start.mutate(usePhone ? phone : null);
              }}
              disabled={start.isPending || (usePhone && phone.replace(/\D/g, "").length < 10)}
              className="font-semibold"
            >
              {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : usePhone ? <KeyRound className="mr-2 h-4 w-4" /> : <QrCode className="mr-2 h-4 w-4" />}
              {active ? (usePhone ? "Gerar novo código" : "Gerar novo QR Code") : usePhone ? "Gerar código" : "Gerar QR Code"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setUsePhone((v) => !v);
                setActive(false);
                setQr(null);
                setPairingCode(null);
              }}
            >
              {usePhone ? "Prefiro ler o QR Code" : "Conectar com código pelo número"}
            </Button>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-900">
            <b>Dica:</b> use um número só do dojo (de preferência WhatsApp Business). As mensagens saem aos poucos para
            proteger o número, e cada aluno pode responder <b>SAIR</b> para parar de receber.
          </div>
        </CardContent>
      </Card>

      <Card className="flex flex-col">
        <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          {pairingCode ? (
            <>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-red-600">Código de pareamento</div>
              <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-4 font-mono text-3xl font-bold tracking-[0.3em] text-neutral-950 shadow-xs">
                {pairingCode.length === 8 ? `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}` : pairingCode}
              </div>
              <p className="max-w-xs text-sm text-neutral-600">Digite este código no WhatsApp do celular. Aguardando a confirmação…</p>
              <Loader2 className="h-5 w-5 animate-spin text-red-600" />
            </>
          ) : qr ? (
            <>
              <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                <img src={qr} alt="QR Code para conectar o WhatsApp" className="h-64 w-64 sm:h-72 sm:w-72" />
              </div>
              <p className="flex items-center gap-2 text-sm text-neutral-600">
                <Loader2 className="h-4 w-4 animate-spin text-red-600" /> Aguardando a leitura do QR Code…
              </p>
              <p className="text-xs text-neutral-500">O código é renovado automaticamente.</p>
            </>
          ) : active ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
              <p className="text-sm text-neutral-600">Preparando a conexão…</p>
            </>
          ) : (
            <>
              <div className="grid h-20 w-20 place-items-center rounded-3xl bg-red-50 text-red-600">
                <Smartphone className="h-9 w-9" />
              </div>
              <div className="text-base font-bold text-neutral-950">Nenhum WhatsApp conectado</div>
              <p className="max-w-xs text-sm text-neutral-600">
                Gere o {usePhone ? "código" : "QR Code"} para conectar o número do dojo.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------ Conectado ------------------------------ */

function ConnectedCard({
  phone,
  profile,
  connectedAt,
  enabled,
  onChanged,
}: {
  phone: string | null;
  profile: string | null;
  connectedAt: string | null;
  enabled: boolean;
  onChanged: () => void;
}) {
  const saveFn = useServerFn(saveWhatsAppSettings);
  const disconnectFn = useServerFn(disconnectWhatsApp);
  const [confirm, setConfirm] = useState(false);

  const toggle = useMutation({
    mutationFn: (v: boolean) => saveFn({ data: { enabled: v } }),
    onSuccess: (_r, v) => {
      toast.success(v ? "Envio por WhatsApp ligado." : "Envio por WhatsApp pausado.");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível salvar."),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("WhatsApp desconectado.");
      setConfirm(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível desconectar."),
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Conectado</div>
            <div className="truncate text-lg font-bold text-neutral-950">{formatPhone(phone)}</div>
            <div className="truncate text-sm text-neutral-500">
              {profile ? `${profile} · ` : ""}
              {connectedAt ? `desde ${new Date(connectedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
          <div>
            <div className="text-sm font-semibold text-neutral-950">Enviar notificações por WhatsApp</div>
            <div className="text-xs text-neutral-500">Pausar não desconecta o número; o push do app continua.</div>
          </div>
          <Switch checked={enabled} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate(!!v)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Quem responder SAIR deixa de receber.
          </span>
          <Button variant="outline" size="sm" onClick={() => setConfirm(true)} className="text-red-700 hover:bg-red-50 hover:text-red-800">
            <Unplug className="mr-1.5 h-4 w-4" /> Desconectar
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              As notificações deixam de sair pelo WhatsApp (o push do app continua). Mensagens que ainda estavam na fila
              não serão enviadas. Você pode conectar de novo quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                disconnect.mutate();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {disconnect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TestCard() {
  const testFn = useServerFn(sendWhatsAppTest);
  const [phone, setPhone] = useState("");
  const send = useMutation({
    mutationFn: () => testFn({ data: { phone } }),
    onSuccess: () => toast.success("Mensagem de teste enviada!"),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível enviar o teste."),
  });
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Mensagem de teste</CardTitle>
        <CardDescription>Envie para o seu celular e veja como a mensagem chega.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" />
        <Button onClick={() => send.mutate()} disabled={send.isPending || phone.replace(/\D/g, "").length < 10} className="shrink-0">
          {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Enviar teste
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Categorias ------------------------------ */

function CategoriesCard({ categories, onSaved }: { categories: Record<string, boolean>; onSaved: () => void }) {
  const saveFn = useServerFn(saveWhatsAppSettings);
  const [local, setLocal] = useState<Record<string, boolean>>(categories);
  useEffect(() => setLocal(categories), [categories]);

  const save = useMutation({
    mutationFn: (next: Record<string, boolean>) => saveFn({ data: { categories: next } }),
    onSuccess: () => onSaved(),
    onError: (e: any) => {
      toast.error(e?.message ?? "Não foi possível salvar.");
      setLocal(categories);
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, typeof NOTIFICATION_CATEGORY_META>();
    for (const c of NOTIFICATION_CATEGORY_META) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return Array.from(map.entries());
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">O que vai por WhatsApp</CardTitle>
        <CardDescription>
          Segue as mesmas notificações do app. Uma categoria desligada em “Notificações do App do Aluno” também não vai
          por WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-red-600">{group}</div>
            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {items.map((c) => {
                const on = local[c.key] !== false;
                return (
                  <label key={c.key} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-neutral-900">{c.label}</span>
                      <span className="block text-xs text-neutral-500">{c.description}</span>
                    </span>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) => {
                        const next = { ...local, [c.key]: !!v };
                        setLocal(next);
                        save.mutate(next);
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Histórico ------------------------------ */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Na fila", cls: "border-neutral-200 bg-neutral-50 text-neutral-700" },
  sending: { label: "Enviando", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  sent: { label: "Enviada", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "Falhou", cls: "border-red-200 bg-red-50 text-red-700" },
  skipped: { label: "Não enviada", cls: "border-amber-200 bg-amber-50 text-amber-800" },
};

function MessagesCard() {
  const listFn = useServerFn(listWhatsAppMessages);
  const q = useQuery({ queryKey: MESSAGES_KEY, queryFn: () => listFn(), refetchInterval: 20_000 });
  const rows = q.data ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Últimas mensagens</CardTitle>
          <CardDescription>As 50 mais recentes enviadas (ou na fila) para alunos e responsáveis.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.pending;
              return (
                <li key={r.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-neutral-900">{r.preview}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {r.student_name ?? "Aluno"} · {formatPhone(r.phone)}
                      {r.last_error && r.status !== "sent" ? ` · ${r.last_error}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums text-neutral-500">
                      {new Date(r.sent_at ?? r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <Badge variant="outline" className={meta.cls}>
                      {meta.label}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

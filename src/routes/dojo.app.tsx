import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";

import { TutorialProvider, useTutorial } from "@/components/dojo/tutorial/TutorialProvider";
import {
  Compass,
  LayoutDashboard,
  Users,
  Award,
  GraduationCap,
  ClipboardList,
  FileBadge,
  Wallet,
  Building2,
  ScrollText,
  QrCode,
  Plug,
  LogOut,
  Search,
  Bell,
  ChevronDown,
  UserCircle,
  CalendarDays,
  Trophy,
  Film,
  Smartphone,
  CreditCard,
  Megaphone,
  ShoppingBag,
  UsersRound,
  HeartHandshake,
  ShoppingCart,
  Gavel,
  LifeBuoy,
  ShieldAlert,
  MessageCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DojoLogo } from "@/components/dojo/DojoLogo";
import { TrialBadge, AccountTrialInline, TrialDropdownCard, TrialBanner, TrialExpiredOverlay } from "@/components/dojo/TrialBadge";
import { UnsavedChangesProvider } from "@/components/common/UnsavedChangesGuard";
import { DojoPermissionsProvider, useDojoPermissions } from "@/components/dojo/DojoPermissionsProvider";
import { findModuleForPath } from "@/lib/dojo/permissions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAcademyBranding } from "@/lib/dojo/academy-public.functions";
import { listDojoBelts } from "@/lib/dojo/dojo.functions";
import { syncBeltTerms } from "@/lib/dojo/belt-terms";
import { UnitScopeProvider } from "@/components/dojo/UnitScope";
import { UnitSwitcher } from "@/components/dojo/UnitSwitcher";
import { DojoSplash } from "@/components/dojo/DojoSplash";
import { EmailVerificationBanner } from "@/components/dojo/EmailVerificationBanner";
import { DojoCommandPalette } from "@/components/dojo/DojoCommandPalette";
import { attachPushRotationListener, subscriptionToPayload, syncPushSubscription } from "@/lib/pwa/push-client";
import { getOwnerPushPublicKey, subscribeOwnerPush } from "@/lib/dojo/owner-push.functions";



export const Route = createFileRoute("/dojo/app")({
  head: () => ({ meta: [{ title: "Painel — AMT Dojo Manager" }] }),
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/dojo/auth", search: { redirect: location.href } });
    }
    // Bloqueia contas de aluno: e-mails vinculados a dojo_students só
    // podem acessar o App do Aluno, nunca o painel do Dojo Manager.
    const { data: studentRows } = await supabase
      .from("dojo_students")
      .select("id")
      .eq("user_id", data.user.id)
      .limit(1);
    if (studentRows && studentRows.length > 0) {
      throw redirect({ to: "/app" });
    }
    // Bloqueia contas de equipe (professores): o login da equipe tem base e
    // portal próprios. Mesmo digitando a URL do painel do dono, a conta é
    // devolvida ao Portal da Equipe.
    const { data: staffRows } = await supabase
      .from("dojo_staff_accounts")
      .select("id")
      .eq("auth_user_id", data.user.id)
      .limit(1);
    if (staffRows && staffRows.length > 0) {
      throw redirect({ to: "/dojo/staff" });
    }
    return { user: data.user };
  },
  component: DojoLayout,
});

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };

const nav: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [
      { to: "/dojo/app", label: "Painel", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Pessoas",
    items: [
      { to: "/dojo/app/students", label: "Alunos", icon: Users },
      { to: "/dojo/app/team", label: "Equipe", icon: UsersRound },
    ],
  },
  {
    label: "Rotina",
    items: [
      { to: "/dojo/app/schedule", label: "Agenda", icon: CalendarDays },
      { to: "/dojo/app/classes", label: "Turmas", icon: GraduationCap },
      { to: "/dojo/app/checkin", label: "Check-in", icon: QrCode },
      { to: "/dojo/app/ranking", label: "Ranking", icon: Trophy },
      { to: "/dojo/app/announcements", label: "Quadro de Avisos", icon: Megaphone },
    ],
  },
  {
    label: "Ensino & Graduação",
    items: [
      { to: "/dojo/app/belts", label: "Modalidades e Faixas", icon: Award },
      { to: "/dojo/app/lesson-plans", label: "Planos de Aula", icon: ClipboardList },
      { to: "/dojo/app/graduations", label: "Graduações", icon: Award },
      { to: "/dojo/app/evaluations", label: "Avaliações", icon: ClipboardList },
      { to: "/dojo/app/certificates", label: "Certificados", icon: FileBadge },
      { to: "/dojo/app/videos", label: "Vídeos", icon: Film },
    ],
  },

  {
    label: "Competitivo",
    items: [
      { to: "/dojo/app/competitions", label: "Competições", icon: Trophy },
    ],
  },
  {
    label: "Comercial",
    items: [
      { to: "/dojo/app/store", label: "AMT Store", icon: ShoppingBag },
      { to: "/dojo/app/sales", label: "Vendas avulsas", icon: ShoppingCart },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { to: "/dojo/app/plans", label: "Planos", icon: ScrollText },
      { to: "/dojo/app/finance", label: "Financeiro", icon: Wallet },
      { to: "/dojo/app/integrations", label: "AMT Pay", icon: CreditCard },
    ],
  },
  {
    label: "Jurídico",
    items: [
      { to: "/dojo/app/contracts", label: "Central de Contratos", icon: Gavel },
    ],
  },
  {
    label: "Estrutura",
    items: [
      { to: "/dojo/app/units", label: "Unidades e Filiais", icon: Building2 },
      { to: "/dojo/app/corporate-benefits", label: "Benefícios Corporativos", icon: HeartHandshake },
      { to: "/dojo/app/system-users", label: "Usuários do Sistema", icon: UserCircle },
    ],
  },
  {
    label: "App do Aluno",
    items: [
      { to: "/dojo/app/student-app-qr", label: "QR do App", icon: Smartphone },
      { to: "/dojo/app/whatsapp", label: "WhatsApp", icon: MessageCircle },
    ],
  },
  {
    label: "Ajuda",
    items: [
      { to: "/dojo/app/tutorial", label: "Tutorial guiado", icon: Compass },
      { to: "/dojo/app/notifications", label: "App & Notificações", icon: Bell },
      { to: "/dojo/app/support", label: "Suporte", icon: LifeBuoy },
    ],
  },
];

const routeTitles: Array<{ match: (p: string) => boolean; title: string; subtitle?: string }> = [
  { match: (p) => p === "/dojo/app", title: "Painel", subtitle: "Visão geral do dojo" },
  { match: (p) => p.startsWith("/dojo/app/students"), title: "Alunos", subtitle: "Gestão de matrículas e histórico" },
  { match: (p) => p.startsWith("/dojo/app/schedule"), title: "Agenda", subtitle: "Turmas, horários e ocupação" },
  { match: (p) => p.startsWith("/dojo/app/checkin"), title: "Check-in", subtitle: "Presenças e frequência" },
  { match: (p) => p.startsWith("/dojo/app/graduations"), title: "Graduações", subtitle: "Nova graduação e certificados" },
  { match: (p) => p.startsWith("/dojo/app/ranking"), title: "Ranking", subtitle: "Classificação de alunos por check-ins em cada turma" },
  { match: (p) => p.startsWith("/dojo/app/lesson-plans"), title: "Planos de Aula", subtitle: "Planejamento pedagógico, biblioteca e banco de técnicas" },


  { match: (p) => p.startsWith("/dojo/app/evaluations"), title: "Avaliações", subtitle: "Provas teóricas e práticas" },
  { match: (p) => p.startsWith("/dojo/app/certificates"), title: "Certificados", subtitle: "Modelos e emissões" },
  { match: (p) => p.startsWith("/dojo/app/competitions"), title: "Competições", subtitle: "Calendário, atletas e histórico" },
  { match: (p) => p.startsWith("/dojo/app/videos"), title: "Vídeos", subtitle: "Biblioteca de conteúdos da academia" },
  { match: (p) => p.startsWith("/dojo/app/sales"), title: "Vendas", subtitle: "Cobrança avulsa (uma vez) — produtos, taxas e serviços" },
  { match: (p) => p.startsWith("/dojo/app/plans"), title: "Planos", subtitle: "Modelos de mensalidade (recorrência)" },
  { match: (p) => p.startsWith("/dojo/app/finance"), title: "Financeiro", subtitle: "Recebimentos, contas a receber e a pagar" },
  { match: (p) => p.startsWith("/dojo/app/team"), title: "Equipe", subtitle: "Colaboradores, folha e escalas" },
  { match: (p) => p.startsWith("/dojo/app/corporate-benefits"), title: "Benefícios Corporativos", subtitle: "Gympass, TotalPass e beneficiários" },
  { match: (p) => p.startsWith("/dojo/app/units"), title: "Unidades e Filiais", subtitle: "Unidades próprias e rede de afiliados" },
  { match: (p) => p.startsWith("/dojo/app/contracts"), title: "Central de Contratos", subtitle: "Modelos, contratos emitidos e histórico jurídico" },
  
  { match: (p) => p.startsWith("/dojo/app/subscription"), title: "Assinatura AMT", subtitle: "Plano mensal do sistema" },
  { match: (p) => p.startsWith("/dojo/app/integrations"), title: "AMT Pay", subtitle: "Central financeira do dojo" },
  { match: (p) => p.startsWith("/dojo/app/student-app-qr"), title: "QR do App do Aluno", subtitle: "Imprima e distribua para os alunos" },
  { match: (p) => p.startsWith("/dojo/app/whatsapp"), title: "WhatsApp", subtitle: "Notificações dos alunos pelo WhatsApp da academia" },
  { match: (p) => p.startsWith("/dojo/app/system-users"), title: "Usuários do Sistema", subtitle: "Logins e permissões da equipe" },
  { match: (p) => p.startsWith("/dojo/app/notifications"), title: "App & Notificações", subtitle: "Instalação do app e alertas push" },
  { match: (p) => p.startsWith("/dojo/app/tutorial"), title: "Tutorial guiado", subtitle: "Escolha uma dúvida e siga o passo a passo dentro do sistema" },
];

function DojoLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // PWA: troca o manifest para o do Dojo Manager e registra o Service Worker
  useEffect(() => {
    if (typeof document === "undefined") return;
    const head = document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previous = link?.getAttribute("href") ?? null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      head.appendChild(link);
    }
    link.setAttribute("href", "/api/public/dojo-manifest.webmanifest?v=3");

    let themeMeta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevTheme = themeMeta?.getAttribute("content") ?? null;
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      head.appendChild(themeMeta);
    }
    themeMeta.setAttribute("content", "#dc2626");

    // Swap apple-touch-icon para o ícone do Dojo (iOS home screen)
    let appleIcon = head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const prevApple = appleIcon?.getAttribute("href") ?? null;
    if (!appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      appleIcon.setAttribute("sizes", "180x180");
      head.appendChild(appleIcon);
    }
    appleIcon.setAttribute("href", "/dojo-icon-180.png");

    void import("@/lib/pwa/register").then((m) => m.registerPwa());
    // Garante captura global do beforeinstallprompt o mais cedo possível.
    void import("@/lib/pwa/install-prompt");

    return () => {
      if (previous) link!.setAttribute("href", previous);
      if (prevTheme && themeMeta) themeMeta.setAttribute("content", prevTheme);
      if (prevApple && appleIcon) appleIcon.setAttribute("href", prevApple);
    };
  }, []);


  // Força tema claro em todo o Dojo Manager (inclusive popups/dialogs portados fora do escopo .dojo-theme)
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevColorScheme = root.style.colorScheme;
    const forceLight = () => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
      root.style.colorScheme = "light";
    };
    forceLight();
    const observer = new MutationObserver(forceLight);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = prevColorScheme;
    };
  }, []);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/dojo";
  };

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/") || pathname.startsWith(to + "?") || pathname === to;

  const header = routeTitles.find((r) => r.match(pathname)) ?? { title: "Dojo Manager", subtitle: "" };
  const initial = (email?.[0] ?? "D").toUpperCase();

  return (
    <div className="dojo-theme min-h-screen">
      <DojoSplash />

      
      <SidebarProvider>
        <DojoPermissionsProvider>
          <UnitScopeProvider>
            <TutorialProvider>
            <DojoLayoutInner
              pathname={pathname}
              email={email}
              initial={initial}
              header={header}
              onLogout={handleLogout}
              isActive={isActive}
            />
            </TutorialProvider>
          </UnitScopeProvider>
        </DojoPermissionsProvider>
      </SidebarProvider>
    </div>
  );
}

function DojoLayoutInner({
  pathname,
  email,
  initial,
  header,
  onLogout,
  isActive,
}: {
  pathname: string;
  email: string | null;
  initial: string;
  header: { title: string; subtitle?: string };
  onLogout: () => void;
  isActive: (to: string, exact?: boolean) => boolean;
}) {
  const { can, isOwner, loading } = useDojoPermissions();
  const currentModule = findModuleForPath(pathname);
  const blocked = !loading && !isOwner && currentModule ? !can(currentModule.key, "read") : false;
  const fetchBranding = useServerFn(getMyAcademyBranding);
  const { data: branding } = useQuery({
    queryKey: ["dojo", "branding", "me"],
    queryFn: () => fetchBranding(),
    staleTime: 5 * 60 * 1000,
  });
  const dojoName = branding?.trade_name || branding?.legal_name || null;

  // Sincroniza o termo (Faixa/Grau) por modalidade a partir do Belt Studio.
  // Assim que as faixas são renomeadas lá, o termo passa a valer em todo o sistema.
  const fetchBelts = useServerFn(listDojoBelts);
  const { data: allBelts } = useQuery<any[]>({
    queryKey: ["dojo", "belts", "term-sync"],
    queryFn: () => fetchBelts() as any,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (allBelts?.length) syncBeltTerms(allBelts);
  }, [allBelts]);

  // Push do dono ao abrir o painel: se este aparelho já tinha ativado, mantém a
  // inscrição válida (reinscreve com a chave atual se ela mudou) e acompanha
  // rotações do SW. Categorias escolhidas antes são preservadas no servidor.
  const ownerPushKeyFn = useServerFn(getOwnerPushPublicKey);
  const ownerPushSubscribeFn = useServerFn(subscribeOwnerPush);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { publicKey } = await ownerPushKeyFn();
        const s = await syncPushSubscription(publicKey);
        if (!s || cancelled) return;
        await ownerPushSubscribeFn({ data: subscriptionToPayload(s) });
      } catch {
        /* noop */
      }
    })();
    attachPushRotationListener((payload) => {
      ownerPushSubscribeFn({ data: payload }).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [ownerPushKeyFn, ownerPushSubscribeFn]);

  // Fecha automaticamente o menu mobile ao navegar entre rotas
  const { isMobile, setOpenMobile, setOpen, state } = useSidebar();
  const hoverExpanded = useRef(false);
  const { track, stepIndex } = useTutorial();
  const step = track?.steps?.[stepIndex];

  /** O passo atual aponta para um elemento dentro da sidebar? */
  const stepTargetsSidebar = (() => {
    if (!step?.target || typeof document === "undefined") return false;
    const raw = step.target;
    if (raw.startsWith("text:")) {
      const needle = raw.slice(5).trim().toLowerCase();
      const links = Array.from(document.querySelectorAll("[data-sidebar] a, [data-sidebar] button"));
      return links.some((el) => (el.textContent || "").toLowerCase().includes(needle));
    }
    try {
      const el = document.querySelector(raw);
      return Boolean(el?.closest("[data-sidebar]"));
    } catch {
      return false;
    }
  })();

  // Enquanto o tutorial estiver ativo, a sidebar permanece fixa e aberta
  // exatamente no ponto que o tutorial está guiando.
  useEffect(() => {
    if (!track) return;
    setOpen(true);
    if (isMobile && stepTargetsSidebar) setOpenMobile(true);
  }, [track, stepIndex, stepTargetsSidebar, isMobile, setOpen, setOpenMobile]);

  useEffect(() => {
    // Não fecha o menu mobile quando o tutorial está destacando um item da sidebar
    if (isMobile && !(track && stepTargetsSidebar)) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile, track, stepTargetsSidebar]);

  // Colapso inteligente: quando recolhida, reaparece ao passar o mouse
  const onSidebarEnter = () => {
    if (isMobile || track || state !== "collapsed") return;
    hoverExpanded.current = true;
    setOpen(true);
  };
  const onSidebarLeave = () => {
    if (isMobile || !hoverExpanded.current) return;
    hoverExpanded.current = false;
    setOpen(false);
  };

  const visibleNav = nav
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        const mod = findModuleForPath(item.to);
        if (!mod) return true;
        return can(mod.key, "read");
      }),
    }))
    .filter((group) => group.items.length > 0);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const sectionLabel =
    nav.find((g) => g.items.some((item) => isActive(item.to, item.exact)))?.label ??
    (pathname.startsWith("/dojo/app/account") || pathname.startsWith("/dojo/app/subscription") ? "Minha conta" : null);

  return (
    <>
      <TrialBanner />
      <TrialExpiredOverlay pathname={pathname} onLogout={onLogout} />
      <EmailVerificationBanner />
      <DojoCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={visibleNav} />
      <Sidebar
        collapsible="icon"
        className="border-r-0 shadow-[4px_0_24px_-12px_rgb(127_29_29_/_0.45)]"
        onMouseEnter={onSidebarEnter}
        onMouseLeave={onSidebarLeave}
      >
        <SidebarHeader className="h-[4.5rem] justify-center border-b border-white/15 px-3 py-2.5 group-data-[collapsible=icon]:h-14 group-data-[collapsible=icon]:px-1.5 md:h-[4.75rem]">
          {/* O logo tem partes vermelhas: fica numa placa branca para não sumir no fundo da sidebar. */}
          <Link
            to="/dojo"
            className="no-red-underline flex h-full items-center justify-center rounded-xl bg-white px-3 shadow-[0_6px_16px_-8px_rgb(60_0_0_/_0.6)] ring-1 ring-black/5 transition-transform hover:scale-[1.01] group-data-[collapsible=icon]:px-1"
          >
            <DojoLogo className="h-11 w-auto max-w-full shrink-0 group-data-[collapsible=icon]:h-6" />
            <span className="sr-only">AMT Dojo Manager</span>
          </Link>
        </SidebarHeader>

        <SidebarContent className="gap-0 py-2">
          {visibleNav.map((group) => (
            <SidebarGroup key={group.label} className="py-1.5">
              <SidebarGroupLabel className="h-7 px-2">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.to, item.exact);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={item.to}>
                            <Icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-white/15 p-2">
          <div className="flex items-center gap-2.5 rounded-xl bg-black/15 px-2 py-2 ring-1 ring-white/10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:ring-0">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-red-700 shadow-sm">
              {initial}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-xs font-semibold text-white">{email ?? "Instrutor"}</div>
              <div className="flex items-center gap-1 text-[10px] text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Conta ativa
              </div>
            </div>
            <button
              onClick={onLogout}
              title="Sair"
              aria-label="Sair"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/75 transition-colors hover:bg-white/15 hover:text-white group-data-[collapsible=icon]:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="dojo-canvas min-w-0 overflow-x-hidden">
        <header className="dojo-topbar sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[color:var(--dojo-border)] px-2 sm:px-3 md:h-16 md:gap-3 md:px-6">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-700 via-red-600 to-red-500" />
          <SidebarTrigger className="-ml-0.5 h-8 w-8 shrink-0 rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" />
          <span aria-hidden className="hidden h-6 w-px bg-[color:var(--dojo-border)] md:block" />
          {/* Localização no sistema; o título grande fica no card de cada página. */}
          <div className="min-w-0 flex-1">
            {sectionLabel && (
              <div className="hidden truncate text-[10px] font-bold uppercase leading-tight tracking-[0.14em] text-red-600 sm:block">
                {sectionLabel}
              </div>
            )}
            <div className="truncate text-sm font-bold leading-tight tracking-tight text-neutral-950 sm:text-[15px] md:mt-0.5">
              {header.title}
            </div>
          </div>

          <TrialBadge />
          <div className="hidden md:block">
            <UnitSwitcher />
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-[color:var(--dojo-border)] bg-white px-3 text-sm text-neutral-500 shadow-xs transition-colors hover:border-[color:var(--dojo-border-strong)] hover:text-neutral-700 xl:flex"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">Buscar no sistema…</span>
            <kbd className="rounded border border-[color:var(--dojo-border)] bg-neutral-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-neutral-500">
              Ctrl K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Buscar no sistema"
            aria-label="Buscar no sistema"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 xl:hidden"
          >
            <Search className="h-4 w-4" />
          </button>
          <Link
            to="/dojo/app/notifications"
            title="App & Notificações"
            aria-label="App & Notificações"
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 md:grid"
          >
            <Bell className="h-4 w-4" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title={dojoName ?? "Academia"}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-[color:var(--dojo-border)] bg-white py-1 pl-1 pr-1 shadow-xs transition-colors hover:border-[color:var(--dojo-border-strong)] sm:pr-2"
              >
                {branding?.logo_url ? (
                  <img
                    src={branding.logo_url}
                    alt={dojoName ?? "Logo do dojo"}
                    className="h-7 w-7 shrink-0 rounded-md bg-white object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                    {(dojoName?.[0] ?? initial).toUpperCase()}
                  </div>
                )}
                <span className="hidden max-w-[160px] truncate text-sm font-medium text-neutral-900 lg:inline">
                  {dojoName ?? "Minha academia"}
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-neutral-500 sm:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="truncate">
                <div className="font-semibold truncate">{dojoName ?? "Minha academia"}</div>
                {email && <div className="text-[11px] font-normal text-muted-foreground truncate">{email}</div>}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <TrialDropdownCard />
              <DropdownMenuItem asChild>
                <Link to="/dojo/app/account" search={{ tab: "profile", onboarding: undefined }} className="flex items-center gap-2">
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span className="flex-1">Minha conta</span>
                  <AccountTrialInline />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                {/* O dono não entra no Portal da Equipe (login separado): aqui
                    ele gerencia colaboradores e compartilha o link do portal. */}
                <Link to="/dojo/app/team" className="flex items-center gap-2">
                  <UsersRound className="mr-2 h-4 w-4" />
                  <span className="flex-1">Equipe e Portal do Professor</span>
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 max-w-full overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8">
          <UnsavedChangesProvider>
            {blocked ? (
              <div className="mx-auto mt-16 flex max-w-md flex-col items-center rounded-2xl border border-[color:var(--dojo-border)] bg-white p-8 text-center shadow-sm">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="mb-1.5 text-lg font-semibold tracking-tight">Sem permissão</div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Você não tem acesso ao módulo <b className="text-foreground">{currentModule?.label}</b>. Fale com o administrador do dojo para liberar.
                </p>
              </div>
            ) : (
              <Outlet />
            )}
          </UnsavedChangesProvider>
        </main>
      </SidebarInset>
    </>
  );
}

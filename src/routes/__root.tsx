import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DOJO_HOST, DOJO_HOSTS, DOJO_SHARED_PATH_PREFIXES, isDojoHostname, isDojoSharedPath } from "@/lib/dojo-hosts";
import { DOJO_OG_IMAGE, DOJO_SITE_DESCRIPTION, DOJO_SITE_NAME } from "@/lib/dojo/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          AMT Dojo Manager
        </div>
        <h1 className="text-8xl font-black tracking-tighter text-foreground">
          4<span className="text-primary">0</span>4
        </h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A rota que você tentou acessar não existe ou foi movida.
        </p>
        <div className="mt-6">
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              to="/dojo"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"
            >
              Ir para o início
            </Link>
            <Link
              to="/dojo/app"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Entrar no painel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-destructive">
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
          Ops — algo saiu do trilho
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não conseguimos carregar esta tela
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente novamente. Se o problema persistir, volte ao dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/dojo/app"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

const FONT_INTER = "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap";
const FONT_DECORATIVE = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Outfit:wght@400;500;600;700;800&family=Figtree:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Cinzel:wght@400;600;700;900&family=EB+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Great+Vibes&family=Dancing+Script:wght@400;600;700&family=Allura&family=Pinyon+Script&family=Montserrat:wght@300;400;600;700;800&family=Poppins:wght@300;400;600;700;800&family=Bebas+Neue&family=Raleway:wght@300;400;600;700;800&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap";

/** Páginas públicas (indexadas): só Inter, para carregar rápido. */
const PUBLIC_PAGE_IDS = new Set<string>(["/dojo/", "/dojo/planos", "/ferramentas/calculadora-ticket-medio", "/privacy", "/terms", "/data-deletion", "/dojo/termos", "/dojo/privacidade"]);

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Padrões do Dojo Manager; cada página pública sobrescreve título, descrição e canônico.
      { title: DOJO_SITE_NAME },
      { name: "description", content: DOJO_SITE_DESCRIPTION },
      { name: "author", content: "AMT Sistemas" },
      { property: "og:site_name", content: DOJO_SITE_NAME },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:title", content: DOJO_SITE_NAME },
      { property: "og:description", content: DOJO_SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:image", content: DOJO_OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Painel do AMT Dojo Manager, sistema de gestão para academias de artes marciais" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: DOJO_SITE_NAME },
      { name: "twitter:description", content: DOJO_SITE_DESCRIPTION },
      { name: "twitter:image", content: DOJO_OG_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", sizes: "16x16 32x32 48x48", href: "/favicon.ico?v=4" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png?v=4" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png?v=4" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=4" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://connect.facebook.net" },
      { rel: "stylesheet", href: FONT_INTER },
      // As fontes decorativas (certificados, contratos, loja) pesam no carregamento; as páginas públicas não usam.
      ...(matches.some((match) => PUBLIC_PAGE_IDS.has(match.routeId)) ? [] : [{ rel: "stylesheet", href: FONT_DECORATIVE }]),
    ],
    scripts: [
      {
        children:
          "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','2149647638877087');fbq('track','PageView');",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const DOMAIN_ROUTING_SCRIPT = `(function(){try{var h=location.hostname,p=location.pathname,s=location.search||"",x=location.hash||"",dh=${JSON.stringify(DOJO_HOSTS)};if(h!=="localhost"&&h!=="127.0.0.1"&&!h.endsWith(".workers.dev")){var sp=${JSON.stringify(DOJO_SHARED_PATH_PREFIXES)},shared=false;for(var i=0;i<sp.length;i++){if(p.indexOf(sp[i])===0){shared=true;break;}}var isDojoArea=shared||p.indexOf("/dojo")===0||p.indexOf("/app")===0||p.indexOf("/api/public/app")===0;var onDojo=dh.indexOf(h)!==-1;if(!onDojo&&p.indexOf("/dojo")===0){location.replace("https://${DOJO_HOST}"+p+s+x);return;}if(onDojo&&!isDojoArea){location.replace("https://"+h+"/dojo"+(p==="/"?"":p)+s+x);return;}}}catch(e){}try{window.__amtInstallPrompt=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__amtInstallPrompt=e;window.dispatchEvent(new Event("amt:install-ready"));});window.addEventListener("appinstalled",function(){window.__amtInstallPrompt=null;window.__amtInstalled=true;window.dispatchEvent(new Event("amt:install-ready"));});}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DOMAIN_ROUTING_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <noscript
          dangerouslySetInnerHTML={{
            __html:
              '<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=2149647638877087&ev=PageView&noscript=1" alt="" />',
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}


function useDojoDomainRouting() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { hostname, pathname, search, hash } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".workers.dev")) return;
    const isDojoArea =
      isDojoSharedPath(pathname) ||
      pathname.startsWith("/dojo") ||
      pathname.startsWith("/app") ||
      pathname.startsWith("/api/public/app");
    const onDojoHost = isDojoHostname(hostname);
    // Off-domain access to /dojo/* → send to dedicated subdomain
    if (!onDojoHost && pathname.startsWith("/dojo")) {
      window.location.replace(`https://${DOJO_HOST}${pathname}${search}${hash}`);
      return;
    }
    // On a Dojo domain (production or test), anything outside the dojo area goes to /dojo
    if (onDojoHost && !isDojoArea) {
      window.location.replace(`https://${hostname}/dojo${pathname === "/" ? "" : pathname}${search}${hash}`);
    }
  }, []);
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useDojoDomainRouting();
  useEffect(() => {
    if (typeof window === "undefined") return;
    void import("@/lib/pwa/register").then((m) => m.registerPwa());
    void import("@/lib/cep-autofill").then((m) => m.attachCepAutofill());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <Outlet />
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

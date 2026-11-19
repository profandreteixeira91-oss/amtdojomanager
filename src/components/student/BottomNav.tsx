import { Link, useRouterState } from "@tanstack/react-router";
import { studentAppIcon } from "@/lib/student-app/icons";
import type { NavItem, Features, FeatureKey } from "@/lib/student-app/schema";

// Mapa de rotas → feature key para gate.
const ROUTE_FEATURE: Record<string, FeatureKey> = {
  "/app/agenda": "agenda",
  "/app/checkin": "checkin",
  "/app/videos": "videos",
  "/app/graduations": "graduations",
  "/app/certificates": "certificates",
  "/app/finance": "finance",
  "/app/competitions": "competitions",
  "/app/profile": "profile",
  "/app/documents": "documents",
  "/app/notifications": "news",
};

function iconFor(name: string) {
  return studentAppIcon(name);
}

export function BottomNav({ items, features }: { items: NavItem[]; features: Features }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const filtered = items.filter((it) => {
    if (it.route === "/app/home") return true;
    const f = ROUTE_FEATURE[it.route];
    return f ? features[f] !== false : true;
  });
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.12)] backdrop-blur-xl"
      style={{
        background: "color-mix(in oklab, var(--sa-bottom-nav, #ffffff) 92%, transparent)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {filtered.map((it) => {
          const Icon = iconFor(it.icon);
          const active = pathname === it.route || (it.route !== "/app/home" && pathname.startsWith(it.route));
          if (it.primary) {
            return (
              <li key={it.id} className="-mt-6">
                <Link
                  to={it.route}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl text-white ring-4 ring-white transition active:scale-95"
                  style={{
                    background: "var(--sa-button, var(--sa-primary, #dc2626))",
                    boxShadow: "0 10px 24px -8px color-mix(in oklab, var(--sa-button, var(--sa-primary, #dc2626)) 70%, transparent)",
                  }}
                  aria-label={it.label}
                >
                  <Icon className="h-6 w-6" />
                </Link>
              </li>
            );
          }
          return (
            <li key={it.id} className="flex-1">
              <Link
                to={it.route}
                className={`flex flex-col items-center gap-1 pb-2 pt-2 text-[11px] transition-colors ${
                  active ? "font-semibold text-[color:var(--sa-primary,#dc2626)]" : "font-medium text-neutral-500"
                }`}
              >
                <span
                  className="grid h-7 w-12 place-items-center rounded-full transition-colors"
                  style={active ? { background: "color-mix(in oklab, var(--sa-primary, #dc2626) 12%, transparent)" } : undefined}
                >
                  <Icon className={`h-5 w-5 ${active ? "" : "text-neutral-500"}`} />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

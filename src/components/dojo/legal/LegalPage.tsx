import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { DojoLogo } from "@/components/dojo/DojoLogo";
import { Footer } from "@/components/dojo/landing/Footer";

// Moldura dos textos legais do AMT Dojo Manager (/dojo/termos e /dojo/privacidade).

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="dojo-theme min-h-screen bg-white text-[#111111] antialiased">
      <header className="border-b border-black/5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link to="/dojo" aria-label="AMT Dojo Manager, página inicial">
            <DojoLogo className="h-12 w-auto" />
          </Link>
          <nav className="flex gap-4 text-sm text-[#111111]/60">
            <Link to="/dojo/termos" className="hover:text-[#C1121F]" activeProps={{ className: "text-[#111111] font-semibold" }}>
              Termos de Uso
            </Link>
            <Link to="/dojo/privacidade" className="hover:text-[#C1121F]" activeProps={{ className: "text-[#111111] font-semibold" }}>
              Privacidade
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6">
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-[#111111]/50">Última atualização: {updated}</p>
        <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-[#111111]/80 [&_a]:text-[#C1121F] [&_a]:underline [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#111111] [&_li]:mt-1.5 [&_strong]:text-[#111111] [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}

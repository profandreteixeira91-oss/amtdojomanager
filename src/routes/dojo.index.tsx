import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordStoreVisit } from "@/lib/store/visits.functions";


import { LandingNav } from "@/components/dojo/landing/LandingNav";
import { Hero } from "@/components/dojo/landing/Hero";
import { Benefits } from "@/components/dojo/landing/Benefits";
import { ModulesShowcase } from "@/components/dojo/landing/ModulesShowcase";
import { RealScreenshots } from "@/components/dojo/landing/RealScreenshots";
import { Differentiators } from "@/components/dojo/landing/Differentiators";
import { Integrations } from "@/components/dojo/landing/Integrations";
import { Plans } from "@/components/dojo/landing/Plans";
import { FAQ } from "@/components/dojo/landing/FAQ";
import { FreeTools } from "@/components/dojo/landing/FreeTools";
import { FinalCTA } from "@/components/dojo/landing/FinalCTA";
import { Footer } from "@/components/dojo/landing/Footer";
import { dojoCanonical } from "@/lib/dojo-hosts";
import { LANDING_FAQS } from "@/lib/dojo/landing-faq";
import { DOJO_ORGANIZATION, DOJO_SITE_NAME, dojoPageHead, dojoSoftwareApplication } from "@/lib/dojo/seo";

export const Route = createFileRoute("/dojo/")({
  head: () =>
    dojoPageHead({
      title: "Sistema para academias de artes marciais | AMT Dojo Manager",
      description:
        "Sistema para academias de Jiu-Jitsu, Judô, Muay Thai e outras artes marciais: alunos, mensalidades, check-in, graduações e app do aluno. Teste grátis por 14 dias.",
      path: "/dojo",
      jsonLd: [
        { "@type": "WebSite", "@id": dojoCanonical("/dojo#website"), name: DOJO_SITE_NAME, url: dojoCanonical("/dojo"), inLanguage: "pt-BR", publisher: { "@id": DOJO_ORGANIZATION["@id"] } },
        dojoSoftwareApplication(),
        {
          "@type": "FAQPage",
          mainEntity: LANDING_FAQS.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
        },
      ],
    }),
  component: DojoLanding,
});

function DojoLanding() {
  const track = useServerFn(recordStoreVisit);
  useEffect(() => {
    try {
      const KEY = "amt_sid";
      let sid = localStorage.getItem(KEY);
      if (!sid) {
        sid = crypto.randomUUID();
        localStorage.setItem(KEY, sid);
      }
      track({
        data: {
          session_id: sid,
          path: window.location.pathname,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent.slice(0, 500),
        },
      }).catch(() => {});
    } catch {}
  }, [track]);

  return (
    <div className="dojo-theme min-h-screen overflow-x-clip bg-white text-[#111111] antialiased hyphens-none break-normal [overflow-wrap:normal] [&_*]:hyphens-none">
      <LandingNav />

      <main>
        <Hero />
        <Benefits />
        <ModulesShowcase />
        <RealScreenshots />
        <Differentiators />
        <Integrations />
        <Plans />
        <FAQ />
        <FreeTools />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

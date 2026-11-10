// SEO das páginas públicas do AMT Dojo Manager (landing, planos, ferramentas e textos legais).
//
// Cada página pública chama `dojoPageHead()` no `head` da rota: título, descrição, endereço canônico no domínio
// principal, Open Graph/Twitter e dados estruturados (schema.org). O sitemap (/sitemap.xml) lista as mesmas
// páginas de DOJO_PUBLIC_PAGES. Manter as duas coisas juntas ao criar uma página pública nova.

import { dojoCanonical } from "@/lib/dojo-hosts";
import { SAAS_PLAN_ORDER, SAAS_PLANS } from "@/lib/dojo/saas-plans";

export const DOJO_SITE_NAME = "AMT Dojo Manager";
export const DOJO_SITE_DESCRIPTION =
  "Sistema de gestão para academias de artes marciais: alunos, mensalidades, check-in, graduações, certificados, competições e app do aluno.";
/** Imagem de compartilhamento 1200×630 (public/og/dojo-manager.png). */
export const DOJO_OG_IMAGE = dojoCanonical("/og/dojo-manager.png");

/** Páginas que o Google deve indexar (sitemap.xml). */
export const DOJO_PUBLIC_PAGES: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: "/dojo", priority: "1.0", changefreq: "weekly" },
  { path: "/dojo/planos", priority: "0.9", changefreq: "monthly" },
  { path: "/ferramentas/calculadora-ticket-medio", priority: "0.7", changefreq: "monthly" },
  { path: "/dojo/termos", priority: "0.3", changefreq: "yearly" },
  { path: "/dojo/privacidade", priority: "0.3", changefreq: "yearly" },
  // /privacy e /terms são os textos da AMT Fight Wear (canônico lá); os do Dojo são os dois acima.
];

/** Perfis oficiais do Dojo Manager (rodapé e sameAs). */
export const DOJO_SOCIAL_PROFILES = ["https://www.instagram.com/amtdojomanager", "https://www.facebook.com/amtdojomanager"];

export const DOJO_ORGANIZATION = {
  "@type": "Organization",
  "@id": "https://amtsistemas.com.br/#organization",
  name: "AMT Sistemas",
  url: "https://amtsistemas.com.br",
  logo: dojoCanonical("/dojo-icon-512.png"),
} as const;

/** Oferta de cada plano (schema.org Offer), a partir de SAAS_PLANS. */
export function dojoPlanOffers() {
  const prices = SAAS_PLAN_ORDER.map((code) => SAAS_PLANS[code].price);
  return {
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: Math.min(...prices).toFixed(2),
    highPrice: Math.max(...prices).toFixed(2),
    offerCount: SAAS_PLAN_ORDER.length,
    offers: SAAS_PLAN_ORDER.map((code) => ({
      "@type": "Offer",
      name: `Plano ${SAAS_PLANS[code].name}`,
      description: SAAS_PLANS[code].tagline,
      price: SAAS_PLANS[code].price.toFixed(2),
      priceCurrency: "BRL",
      url: dojoCanonical(`/dojo/planos?plan=${code}`),
      availability: "https://schema.org/InStock",
    })),
  };
}

/** O produto (schema.org SoftwareApplication). */
export function dojoSoftwareApplication() {
  return {
    "@type": "SoftwareApplication",
    "@id": dojoCanonical("/dojo#software"),
    name: DOJO_SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Gestão de academias de artes marciais",
    operatingSystem: "Web, Android, iOS",
    url: dojoCanonical("/dojo"),
    image: DOJO_OG_IMAGE,
    description: DOJO_SITE_DESCRIPTION,
    inLanguage: "pt-BR",
    sameAs: DOJO_SOCIAL_PROFILES,
    publisher: { "@id": DOJO_ORGANIZATION["@id"] },
    offers: dojoPlanOffers(),
  };
}

type HeadInput = {
  title: string;
  description: string;
  /** Caminho no domínio principal, ex.: "/dojo/planos". */
  path: string;
  /** Itens do @graph do schema.org desta página. */
  jsonLd?: Array<Record<string, unknown>>;
  /** Trilha (schema.org BreadcrumbList), do início até esta página. */
  breadcrumb?: Array<{ name: string; path: string }>;
};

export function dojoPageHead({ title, description, path, jsonLd = [], breadcrumb }: HeadInput) {
  const url = dojoCanonical(path);
  const graph: Array<Record<string, unknown>> = [DOJO_ORGANIZATION, ...jsonLd];
  if (breadcrumb?.length) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: breadcrumb.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: dojoCanonical(item.path),
      })),
    });
  }
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }],
  };
}

// SEO das páginas públicas do AMT Dojo Manager (landing, planos, ferramentas e textos legais).
//
// Cada página pública chama `dojoPageHead()` no `head` da rota: título, descrição, endereço canônico no domínio
// principal, Open Graph/Twitter e dados estruturados (schema.org). O sitemap (/sitemap.xml) lista as mesmas
// páginas de DOJO_PUBLIC_PAGES. Manter as duas coisas juntas ao criar uma página pública nova.

import { dojoCanonical } from "@/lib/dojo-hosts";
import { DOJO_LEGAL } from "@/lib/dojo/legal";
import { SAAS_PLAN_ORDER, SAAS_PLANS } from "@/lib/dojo/saas-plans";

export const DOJO_SITE_NAME = "AMT Dojo Manager";
export const DOJO_SITE_DESCRIPTION =
  "Sistema de gestão para academias de artes marciais: alunos, mensalidades, check-in, graduações, certificados, competições e app do aluno.";
/** Imagem de compartilhamento 1200×630 (public/og/dojo-manager.png). */
export const DOJO_OG_IMAGE = dojoCanonical("/og/dojo-manager.png");

/**
 * Páginas que o Google deve indexar (sitemap.xml e llms.txt). `lastmod` é a data da última mudança de conteúdo
 * da página (AAAA-MM-DD): atualize ao mexer no texto. Uma data que muda todo dia faz o Google ignorar o campo.
 */
export const DOJO_PUBLIC_PAGES: Array<{
  path: string;
  title: string;
  summary: string;
  priority: string;
  changefreq: string;
  lastmod: string;
}> = [
  {
    path: "/dojo",
    title: "AMT Dojo Manager",
    summary: "Apresentação do sistema, módulos, planos e perguntas frequentes.",
    priority: "1.0",
    changefreq: "weekly",
    lastmod: "2026-11-17",
  },
  {
    path: "/dojo/planos",
    title: "Planos e preços",
    summary: "Comparativo dos planos Essencial, Profissional e Premium, com limites e recursos.",
    priority: "0.9",
    changefreq: "monthly",
    lastmod: "2026-11-10",
  },
  {
    path: "/ferramentas/calculadora-ticket-medio",
    title: "Calculadora de Ticket Médio para Academias",
    summary: "Ferramenta gratuita: ticket médio atual e quanto cobrar por aluno para cobrir despesas e atingir a meta de lucro.",
    priority: "0.7",
    changefreq: "monthly",
    lastmod: "2026-11-19",
  },
  {
    path: "/dojo/termos",
    title: "Termos de Uso",
    summary: "Conta, teste grátis, cobrança, cancelamento e responsabilidades.",
    priority: "0.3",
    changefreq: "yearly",
    lastmod: "2026-11-10",
  },
  {
    path: "/dojo/privacidade",
    title: "Política de Privacidade",
    summary: "Como os dados das academias e dos alunos são tratados (LGPD).",
    priority: "0.3",
    changefreq: "yearly",
    lastmod: "2026-11-10",
  },
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
  email: DOJO_LEGAL.email,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: DOJO_LEGAL.email,
    availableLanguage: "pt-BR",
    areaServed: "BR",
  },
} as const;

/** O que o sistema faz, para o schema.org (featureList) e o llms.txt. */
export const DOJO_FEATURES: string[] = [
  "Cadastro de alunos, matrículas e planos de mensalidade",
  "Agenda, turmas e check-in por QR Code",
  "Financeiro com cobrança recorrente por Pix, cartão e boleto (AMT Pay)",
  "Modalidades, faixas, graus e graduações com certificados",
  "App do Aluno com notificações, carteirinha e pagamento",
  "Avaliações, planos de aula e ranking",
  "Competições e inscrições",
  "Equipe, permissões, folha e comissões",
  "Contratos digitais de alunos e equipe",
  "Vendas avulsas e loja integrada (AMT Store)",
  "Várias unidades com visão consolidada (plano Premium)",
];

/** Telas reais do painel (public/dojo-shots), para o schema.org (screenshot). */
const DOJO_SCREENSHOTS = ["dashboard", "students", "checkin", "finance", "graduations"].map((name) =>
  dojoCanonical(`/dojo-shots/${name}.webp`),
);

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
    featureList: DOJO_FEATURES,
    screenshot: DOJO_SCREENSHOTS,
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

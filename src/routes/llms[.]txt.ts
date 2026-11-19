import { createFileRoute } from "@tanstack/react-router";

import { dojoCanonical } from "@/lib/dojo-hosts";
import { LANDING_FAQS } from "@/lib/dojo/landing-faq";
import { DOJO_LEGAL } from "@/lib/dojo/legal";
import { SAAS_PLAN_ORDER, SAAS_PLANS } from "@/lib/dojo/saas-plans";
import {
  DOJO_FEATURES,
  DOJO_PUBLIC_PAGES,
  DOJO_SITE_DESCRIPTION,
  DOJO_SITE_NAME,
  DOJO_SOCIAL_PROFILES,
} from "@/lib/dojo/seo";

// /llms.txt (https://llmstxt.org): resumo do produto em Markdown para assistentes de IA (ChatGPT, Claude,
// Perplexity, Gemini). Montado das mesmas fontes da landing e dos planos, para nunca ficar desatualizado.

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function buildLlmsTxt(): string {
  const plans = SAAS_PLAN_ORDER.map((code) => {
    const plan = SAAS_PLANS[code];
    return `### Plano ${plan.name} — ${brl(plan.price)}/mês\n${plan.tagline}.\n${plan.highlights.map((h) => `- ${h}`).join("\n")}`;
  }).join("\n\n");
  const pages = DOJO_PUBLIC_PAGES.map(
    (page) => `- [${page.title}](${dojoCanonical(page.path)}): ${page.summary}`,
  ).join("\n");
  const faqs = LANDING_FAQS.map((faq) => `### ${faq.q}\n${faq.a}`).join("\n\n");

  return `# ${DOJO_SITE_NAME}

> ${DOJO_SITE_DESCRIPTION} Feito no Brasil pela ${DOJO_LEGAL.operator}, para academias de Jiu-Jitsu, Judô, Muay Thai, Karatê, Taekwondo, Boxe, MMA e outras artes marciais. Teste grátis de 14 dias, sem cartão.

O ${DOJO_SITE_NAME} é um sistema online (navegador e app instalável no celular) para o dono da academia, a equipe e os alunos. O dono gerencia a academia no painel; professores e recepção usam o portal da equipe; os alunos usam o App do Aluno, incluído no plano, sem custo para eles.

## O que o sistema faz
${DOJO_FEATURES.map((feature) => `- ${feature}`).join("\n")}

## Planos (preço mensal, sem fidelidade)
${plans}

## Páginas
${pages}

## Perguntas frequentes
${faqs}

## Contato
- Site: ${dojoCanonical("/dojo")}
- E-mail: ${DOJO_LEGAL.email}
- Empresa: ${DOJO_LEGAL.operator} (${DOJO_LEGAL.site})
${DOJO_SOCIAL_PROFILES.map((url) => `- ${url}`).join("\n")}
`;
}

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildLlmsTxt(), {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});

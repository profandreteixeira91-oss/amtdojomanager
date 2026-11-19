import { createFileRoute } from "@tanstack/react-router";

import { DOJO_HOST, DOJO_WWW_HOST, dojoCanonical, requestHostnames } from "@/lib/dojo-hosts";

// robots.txt do AMT Dojo Manager. Gerado pelo servidor (e não em public/) porque depende do domínio:
// - amtdojomanager.com.br (e www): páginas públicas liberadas, áreas logadas fechadas, sitemap.
// - qualquer outro (teste.amtsistemas.com.br = branch 1nov26, previews): tudo fechado. Lá o servidor também
//   responde X-Robots-Tag: noindex (src/start.ts).

const PRODUCTION_ROBOTS = `# AMT Dojo Manager (${DOJO_HOST})
User-agent: *
Allow: /dojo
Allow: /dojo/planos
Allow: /ferramentas/
Allow: /llms.txt

# Áreas logadas, pagamento, contas e APIs
Disallow: /dojo/app
Disallow: /dojo/staff
Disallow: /dojo/auth
Disallow: /dojo/onboarding
Disallow: /dojo/checkout
Disallow: /dojo/pay
Disallow: /dojo/certificate-editor
Disallow: /dojo/matricula
Disallow: /app
Disallow: /pay
Disallow: /matricula
Disallow: /certificate
Disallow: /reset-password
Disallow: /api/

Sitemap: ${dojoCanonical("/sitemap.xml")}
`;

const CLOSED_ROBOTS = `# Ambiente de teste do AMT Dojo Manager: não indexar. O site oficial é https://${DOJO_HOST}
User-agent: *
Disallow: /
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const hosts = requestHostnames(request);
        const production = hosts.some((h) => h === DOJO_HOST || h === DOJO_WWW_HOST);
        return new Response(production ? PRODUCTION_ROBOTS : CLOSED_ROBOTS, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});

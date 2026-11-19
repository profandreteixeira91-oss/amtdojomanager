import { createFileRoute } from "@tanstack/react-router";

import { dojoCanonical } from "@/lib/dojo-hosts";
import { DOJO_PUBLIC_PAGES } from "@/lib/dojo/seo";

// Sitemap do AMT Dojo Manager (https://amtdojomanager.com.br/sitemap.xml), citado no robots.txt.
// As páginas vêm de DOJO_PUBLIC_PAGES (src/lib/dojo/seo.ts); os endereços são sempre os do domínio principal.

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = DOJO_PUBLIC_PAGES.map(
          (page) =>
            `  <url>\n    <loc>${dojoCanonical(page.path)}</loc>\n    <lastmod>${page.lastmod}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`,
        ).join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
        return new Response(xml, {
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});

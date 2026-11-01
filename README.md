# AMT Dojo Manager

Gestão de academias de artes marciais: alunos, turmas e agenda, check-in, graduações e certificados,
avaliações, planos de aula, competições e ranking, financeiro (AMT Pay/Asaas, Mercado Pago), contratos,
equipe, unidades, vídeos, loja da academia, matrícula pública, portal da equipe e app do aluno (PWA).

## Stack

Vite + TanStack Start/Router, React 19, TanStack Query, Tailwind v4 + shadcn/ui, Supabase
(banco compartilhado com a AMT Fight Wear). Build para Cloudflare Workers via Nitro
(`.output/server/wrangler.json`).

## Rodando localmente

```bash
npm ci
npm run dev        # http://localhost:8080/dojo
```

`.env` traz só as chaves públicas do Supabase. Segredos de servidor vão em `.env.local`
(não versionado):

| Variável | Uso |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | operações administrativas no servidor |
| `CRON_SECRET` | autenticação dos hooks chamados pelo pg_cron |
| `ASAAS_API_KEY`, `ASAAS_PRODUCTION_API_KEY`, `ASAAS_SANDBOX_API_KEY`, `ASAAS_ENV`, `ASAAS_WALLET_ID_AMT`, `ASAAS_WEBHOOK_TOKEN` | AMT Pay / cobranças |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` | assinatura do SaaS e pagamentos |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notificações push (manter o mesmo par da produção) |
| `RESEND_API_KEY`, `EMAIL_FROM` | lembretes de fatura por e-mail (os e-mails de autenticação saem do `amtfightwear`) |
| `FIRECRAWL_API_KEY` | coleta de competições |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY` | recursos de IA |
| `SITE_URL` | URL pública deste app |

## Banco

As migrations ficam no repositório `amtfightwear` — veja [AGENTS.md](AGENTS.md).

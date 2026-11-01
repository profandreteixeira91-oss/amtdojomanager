# AMT Dojo Manager — instruções do projeto

Produto SaaS de gestão de academias (painel da academia, portal da equipe, app do aluno).
Separado do repositório `amtfightwear` em 2026-11-01, **sem dependências da Lovable**.

## Banco de dados compartilhado

- O Supabase é o mesmo da AMT Fight Wear: projeto `gudjmkiyprgwgxmzbgji`.
- **As migrations vivem só no repositório `amtfightwear`** (`supabase/migrations`). Este repositório
  não cria nem aplica migrations: mudanças de schema são feitas lá, e depois o
  `src/integrations/supabase/types.ts` é regenerado/copiado para cá.
- O painel de dono do SaaS (gestão das academias, suporte, AMT Pay) fica no `/admin` do `amtfightwear`.
- Auth é compartilhado: o Send Email Hook do Supabase (`/api/public/hooks/auth-email`) e o webhook de
  eventos da Resend (`/api/public/hooks/email-events`) existem só no `amtfightwear` — não recriar aqui.

## Regras

- Ferramentas públicas gratuitas (`/ferramentas/*`) mantêm o cálculo em funções puras em
  `src/lib/dojo/*-calculator.ts` e nunca persistem nem enviam o que o usuário digita — funcionam sem
  login nem backend.
- O primeiro passo do dono (setup) usa uma tabela de progresso própria, por dono, e as operações já
  existentes de aluno/plano/turma; nunca reutilizar flags de onboarding do AMT Pay nem semear dados da
  academia, para o setup continuar opcional e isolado financeiramente.
- O acesso por status do aluno é garantido pelos helpers de identidade do banco e pelo trigger de
  presença; o gate do app e a revalidação periódica do perfil limpam o cache do aluno para que sessões
  abertas não mantenham acesso bloqueado.
- Segredos de servidor ficam em `.env.local` (fora do Git) ou nos segredos da hospedagem — nunca no
  `.env` versionado e nunca com prefixo `VITE_`.
- Hooks internos (`/api/public/hooks/*` chamados por cron/trigger) usam `checkInternalHookAuth`
  (`CRON_SECRET` no header `x-cron-secret`). Webhooks de terceiros verificam a própria assinatura.

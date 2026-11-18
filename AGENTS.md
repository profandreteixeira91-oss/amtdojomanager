# AMT Dojo Manager — instruções do projeto

Produto SaaS de gestão de academias (painel da academia, portal da equipe, app do aluno).
Separado do repositório `amtfightwear` em 2026-11-01, **sem dependências da Lovable**.

## Banco de dados compartilhado

- O Supabase é o mesmo da AMT Fight Wear: projeto `gudjmkiyprgwgxmzbgji`.
- **As migrations vivem só no repositório `amtfightwear`** (`supabase/migrations`). Este repositório
  não cria nem aplica migrations: mudanças de schema são feitas lá, e depois o
  `src/integrations/supabase/types.ts` é regenerado/copiado para cá.
- O painel de dono do SaaS (gestão das academias, suporte, chamados) é o Control Center da AMT Sistemas
  (`amtsistemas.com.br/admin`, repositório `amtsistemas` em `H:/Projetos/amtsistemas`, Supabase próprio).
  O `/admin` do `amtfightwear` cuida só da loja. O Control Center acessa o banco do Dojo pelas Edge
  Functions em `supabase/functions` deste repositório, autenticadas com `assertControlCenterAdmin`
  (`_shared/control-center.ts`): toda nova operação do Control Center sobre o Dojo entra por elas.
- Auth é compartilhado: o Send Email Hook do Supabase (`/api/public/hooks/auth-email`) e o webhook de
  eventos da Resend (`/api/public/hooks/email-events`) existem só no `amtfightwear` — não recriar aqui.

## Regras

- Ferramentas públicas gratuitas (`/ferramentas/*`) mantêm o cálculo em funções puras em
  `src/lib/dojo/*-calculator.ts` e nunca persistem nem enviam o que o usuário digita — funcionam sem
  login nem backend.
- O primeiro passo do dono (setup) usa uma tabela de progresso própria, por dono, e as operações já
  existentes de aluno/plano/turma; nunca reutilizar flags de onboarding do AMT Pay nem semear dados da
  academia, para o setup continuar opcional e isolado financeiramente.
- A implantação assistida (grátis, pedida no onboarding) fica em `dojo_implementation_requests`, separada do
  setup: o dono preenche e envia em `/dojo/app/implantacao`; só a AMT aplica, pelo Control Center (Edge Function
  `implementation` → `dojo_apply_implementation`, só para `service_role`, uma transação que pode ser repetida
  sem duplicar). As chaves do formato em `src/lib/dojo/implementation.ts` são lidas por essa função SQL: mudar
  uma exige migration. Se o dono pedir, o teste grátis fica guardado enquanto espera (+30 dias no envio) e os
  14 dias contam a partir da conclusão.
- O acesso por status do aluno é garantido pelos helpers de identidade do banco e pelo trigger de
  presença; o gate do app e a revalidação periódica do perfil limpam o cache do aluno para que sessões
  abertas não mantenham acesso bloqueado.
- Segredos de servidor ficam em `.env.local` (fora do Git) ou nos segredos da hospedagem — nunca no
  `.env` versionado e nunca com prefixo `VITE_`.
- Hooks internos (`/api/public/hooks/*` chamados por cron/trigger) usam `checkInternalHookAuth`
  (`CRON_SECRET` no header `x-cron-secret`). Webhooks de terceiros verificam a própria assinatura.

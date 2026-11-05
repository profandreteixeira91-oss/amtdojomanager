# Agendamentos das rotinas do AMT Dojo Manager

As rotas abaixo são endpoints internos. Todas exigem o header `x-cron-secret` com o valor do segredo `CRON_SECRET`. O banco chama as rotas por `public.dojo_hook_post`, que lê `dojo_base_url` e `cron_secret` do Supabase Vault.

## Agendamentos de produção

Os horários abaixo usam o fuso UTC do pg_cron. Para Maceió/São Paulo (UTC-3), some três horas para obter o horário local.

| Rotina | Endpoint | Frequência recomendada | Horário local aproximado |
|---|---|---:|---:|
| Gerar mensalidades | `/api/public/hooks/generate-dojo-invoices` | `0 7 * * *` | 04:00 diariamente |
| Avisos de mensalidade | `/api/public/hooks/send-dojo-reminders` | `0 12 * * *` | 09:00 diariamente |
| Lembretes de aula | `/api/public/hooks/send-class-reminders` | `*/5 * * * *` | A cada 5 minutos |
| Aplicar graduações agendadas | `/api/public/hooks/apply-scheduled-graduations` | `5 * * * *` | A cada hora, no minuto 5 |
| Publicar avisos agendados | `/api/public/hooks/publish-scheduled-announcements` | `* * * * *` | A cada minuto |
| Despachar fila de WhatsApp | `/api/public/hooks/whatsapp-dispatch` | `* * * * *` | A cada minuto |

## Cadastrar o novo job após o deploy

O cron de avisos agendados só deve ser cadastrado depois que a versão que contém a rota `publish-scheduled-announcements` estiver publicada na hospedagem. Depois do deploy, confirme que ainda não existe um job com esse nome e execute no SQL Editor do Supabase:

```sql
select cron.schedule(
  'dojo-publish-scheduled-announcements',
  '* * * * *',
  $select public.dojo_hook_post('publish-scheduled-announcements');$
);
```

O job do pg_cron apenas agenda a chamada; um status `succeeded` em `cron.job_run_details` confirma que o SQL de agendamento executou, não que a requisição HTTP terminou com sucesso. A resposta HTTP deve ser conferida em `net._http_response`.

## Verificação operacional

1. Conferir `cron.job` para confirmar que cada job está ativo e com a frequência esperada.
2. Conferir `cron.job_run_details` para falhas na execução do agendador.
3. Conferir `net._http_response` para status HTTP, timeouts e erros de DNS.
4. Conferir os logs da hospedagem para o JSON de retorno de cada endpoint (`created`, `sent`, `failed`, `skipped`).
5. Não considerar uma rotina entregue apenas porque o job SQL aparece como `succeeded`; confirmar também resposta HTTP 200 e o resultado da rotina.

## Configuração de e-mail

Os lembretes por e-mail dependem de `RESEND_API_KEY` na hospedagem da aplicação. Sem essa variável, o endpoint responde normalmente, mas as tentativas de e-mail são registradas como falhas. Depois de cadastrar a chave, o operador pode reenviar manualmente a cobrança pelo painel. O código também permite repetir uma tentativa falha para a mesma fatura, canal e offset, atualizando o registro existente em vez de ficar bloqueado pela falha anterior.

Nunca colocar o valor de `CRON_SECRET` ou `RESEND_API_KEY` no repositório ou em documentação.

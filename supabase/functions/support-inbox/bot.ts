import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Assistente Virtual AMT Sistemas: atendimento por regras no WhatsApp do suporte (sem IA).
//
// Responde a toda conversa nova com um menu numerado e faz um diagnóstico curto: recomenda o plano do Dojo Manager
// ou do OptiOne pelos limites do catálogo (API pública de planos do site), coleta o pedido de projeto sob medida ou
// o problema do cliente e passa para um atendente quando pedem ou quando não entende. Regras:
// - fica quieto quando um atendente escreveu na conversa nas últimas 24 h (pelo /admin ou pelo celular);
// - fica quieto por 24 h depois de passar a conversa para um atendente;
// - pausa manual por conversa no /admin (bot_paused_until) e liga/desliga geral (app_settings 'support_whatsapp_bot');
// - "0"/"menu" volta ao início; "atendente" passa para uma pessoa a qualquer momento;
// - nunca responde à própria conversa do número do suporte nem a mensagens antigas (sincronização).
// Leads vão para o funil do site (bot_upsert_lead no projeto amt-sistemas, com BOT_LEAD_SECRET).

export const BOT_SETTINGS_KEY = "support_whatsapp_bot";
export const BOT_NAME = "Assistente Virtual AMT Sistemas";

const QUIET_AFTER_HUMAN_MS = 24 * 3600_000;
const QUIET_AFTER_HANDOFF_MS = 24 * 3600_000;
const SESSION_MS = 24 * 3600_000;
const MAX_MESSAGE_AGE_MS = 3 * 60_000;
const DEBOUNCE_MS = 2500;
const MAX_REPLIES_PER_HOUR = 15;
const PLANS_CACHE_MS = 10 * 60_000;

const SITE = "https://amtsistemas.com.br";
const DOJO_PLANS_URL = "https://amtdojomanager.com.br/dojo/planos";
const OPTIONE_TRIAL_URL = `${SITE}/optione/teste-gratis`;
/** Prints do guia (JPG, em amtdojomanager public/whatsapp). */
const MEDIA = "https://amtdojomanager.com.br/whatsapp";
const LEAD_RPC_URL = "https://yqxmxevphdumyuwlvppg.supabase.co/rest/v1/rpc/bot_upsert_lead";
// Chave pública (publishable) do projeto amt-sistemas: só dá acesso ao que o RLS e as funções liberam.
const AMT_PUBLIC_KEY = "sb_publishable_jK7lhco6DQLlfjYm8LGS3g_sGBkVtK2";

type Path = "dojo" | "optione" | "sob_medida" | "cliente";
type Step =
  | "menu"
  | "dojo_apresentacao" | "dojo_alunos" | "dojo_unidades" | "dojo_recursos"
  | "opt_apresentacao" | "opt_usuarios" | "opt_computadores" | "opt_whatsapp"
  | "sm_tipo" | "sm_detalhe" | "sm_prazo"
  | "cli_sistema" | "cli_descricao"
  | "done";

export type BotState = { step: Step; path?: Path; answers: Record<string, string>; invalid?: number; updated_at: string; replies?: string[] };

type ChatRow = {
  id: string; remote_jid: string; phone_normalized: string | null; name: string | null; unread_count: number;
  bot_state: BotState | null; bot_handoff_at: string | null; bot_paused_until: string | null;
};
type Incoming = { id: string; message_id: string; type: string; body: string | null; sent_at: string };

export type BotDeps = {
  /** Envia um texto pelo WhatsApp e devolve a resposta da Evolution (com key.id). */
  sendText: (to: string, text: string) => Promise<any>;
  /** Envia o texto com botões de resposta rápida (rótulos curtos; o id de cada botão é o número da opção). */
  sendButtons: (to: string, text: string, labels: string[]) => Promise<any>;
  /** Envia uma imagem (URL pública) com legenda. */
  sendImage: (to: string, url: string, caption: string) => Promise<any>;
  /** Número do próprio suporte (a conversa dele nunca recebe o bot). */
  ownPhone: string | null;
  recipient: (jid: string) => string | null;
};

/* ------------------------------ Catálogo ------------------------------ */

type Plan = { slug: string; nome: string; preco_mensal: number; recursos: string[]; limites: Record<string, number | boolean | null> };
type Catalog = { trial: number; plans: Plan[] };

const FALLBACK: Record<"amt-dojo-manager" | "amt-optione", Catalog> = {
  "amt-dojo-manager": {
    trial: 14,
    plans: [
      { slug: "essencial", nome: "Essencial", preco_mensal: 99.9, recursos: [], limites: { alunos: 100, unidades: 1, usuarios: 2 } },
      { slug: "profissional", nome: "Profissional", preco_mensal: 159.9, recursos: [], limites: { alunos: 300, unidades: 1, usuarios: 5 } },
      { slug: "premium", nome: "Premium", preco_mensal: 229.9, recursos: [], limites: { alunos: null, unidades: null, usuarios: null } },
    ],
  },
  "amt-optione": {
    trial: 14,
    plans: [
      { slug: "essencial", nome: "Essencial", preco_mensal: 149, recursos: [], limites: { usuarios: 3, computadores: 2, whatsapp_automatico: false } },
      { slug: "profissional", nome: "Profissional", preco_mensal: 249, recursos: [], limites: { usuarios: 10, computadores: 5, whatsapp_automatico: true } },
      { slug: "rede", nome: "Rede", preco_mensal: 399, recursos: [], limites: { usuarios: null, computadores: null, whatsapp_automatico: true } },
    ],
  },
};
const catalogCache = new Map<string, { at: number; data: Catalog }>();

/** Planos e preços vivos do catálogo do site (mesma fonte do /admin); se o site não responder, usa os valores fixos. */
async function catalog(slug: "amt-dojo-manager" | "amt-optione"): Promise<Catalog> {
  const hit = catalogCache.get(slug);
  if (hit && Date.now() - hit.at < PLANS_CACHE_MS) return hit.data;
  try {
    const res = await fetch(`${SITE}/api/public/planos/${slug}`, { signal: AbortSignal.timeout(6000) });
    const body = (await res.json()) as { sistema?: { trial_dias?: number }; planos?: Plan[] };
    const plans = (body.planos ?? []).filter((p) => p && p.slug && Number(p.preco_mensal) > 0);
    if (!res.ok || plans.length === 0) throw new Error("catálogo vazio");
    const data = { trial: Number(body.sistema?.trial_dias) || 14, plans: plans.map((p) => ({ ...p, preco_mensal: Number(p.preco_mensal), recursos: Array.isArray(p.recursos) ? p.recursos : [], limites: p.limites ?? {} })) };
    catalogCache.set(slug, { at: Date.now(), data });
    return data;
  } catch {
    return FALLBACK[slug];
  }
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function planText(plan: Plan): string {
  const items = plan.recursos.filter((r) => !/^tudo do/i.test(r)).slice(0, 4);
  return [`*${plan.nome}* · ${brl(plan.preco_mensal)}/mês`, ...items.map((r) => `• ${r}`)].join("\n");
}

/* ------------------------------- Textos ------------------------------- */

/**
 * Mensagem do assistente: texto puro ou texto com botões. O texto sempre traz as opções numeradas, então quem não
 * vê os botões (WhatsApp antigo, botões desligados) continua respondendo pelo número.
 */
export type OutMessage = string | { text: string; buttons: string[] } | { image: string; caption: string };

/** Até quantas opções vão como botões; perguntas maiores ficam só no texto numerado. */
const MAX_BUTTONS = 3;

/** `short`: rótulo do botão (curto, o WhatsApp corta textos longos). */
type Question = { text: string; options: string[]; short?: string[] };

const MENU_Q: Question = {
  text: "Como posso te ajudar? Responda com o número da opção:",
  options: ["Sistema para academia (AMT Dojo Manager)", "Sistema para ótica (AMT OptiOne)", "Site, app ou automação sob medida", "Já sou cliente / suporte", "Falar com um atendente"],
  short: ["Academia (Dojo)", "Ótica (OptiOne)", "Sob medida", "Já sou cliente", "Atendente"],
};
const MENU = MENU_Q.options.map((o, i) => `*${i + 1}* ${o}`).join("\n");

const FOOTER = "_Digite *0* para voltar ao menu ou *atendente* para falar com uma pessoa._";

function greeting(name: string | null, again: boolean): OutMessage {
  const first = (name ?? "").trim().split(/\s+/)[0];
  const hello = again ? `Olá${first ? `, ${first}` : ""}! Posso ajudar em mais alguma coisa?` : `Olá${first ? `, ${first}` : ""}! 👋 Eu sou o *${BOT_NAME}*.`;
  return { text: `${hello}\n${MENU_Q.text}\n\n${MENU}`, buttons: MENU_Q.short! };
}

const Q: Record<Exclude<Step, "menu" | "done" | "sm_detalhe" | "cli_descricao" | "dojo_apresentacao" | "opt_apresentacao">, Question> = {
  dojo_alunos: { text: "Ótimo! Vou te ajudar a escolher o plano ideal do *AMT Dojo Manager*.\n\nQuantos alunos ativos a academia tem hoje?", options: ["Até 100", "De 100 a 300", "Mais de 300"], short: ["Até 100", "100 a 300", "Mais de 300"] },
  dojo_unidades: { text: "A academia tem mais de uma unidade (filiais)?", options: ["Não, só uma", "Sim, mais de uma"], short: ["Só uma", "Mais de uma"] },
  dojo_recursos: { text: "Você precisa de avaliações, certificados, competições, contratos ou controle de equipe?", options: ["Sim", "Não, só o básico (alunos, agenda, check-in e financeiro)"], short: ["Sim, preciso", "Só o básico"] },
  opt_usuarios: { text: "Vamos encontrar o plano ideal do *AMT OptiOne* para a sua ótica.\n\nQuantas pessoas vão usar o sistema?", options: ["Até 3", "De 4 a 10", "Mais de 10"], short: ["Até 3", "4 a 10", "Mais de 10"] },
  opt_computadores: { text: "Em quantos computadores ele vai ser instalado?", options: ["Até 2", "De 3 a 5", "Mais de 5"], short: ["Até 2", "3 a 5", "Mais de 5"] },
  opt_whatsapp: { text: "Quer enviar pedidos, PDFs e mensagens de pós-venda aos clientes pelo WhatsApp automaticamente?", options: ["Sim", "Não"], short: ["Sim", "Não"] },
  sm_tipo: { text: "Legal! Qual é o tipo de projeto?", options: ["Site", "App para Android/iOS", "Sistema (Windows ou web)", "Automação", "Sistema White Label", "Outro"], short: ["Site", "App", "Sistema", "Automação", "White Label", "Outro"] },
  sm_prazo: { text: "Para quando você precisa?", options: ["O quanto antes (até 1 mês)", "De 1 a 3 meses", "Sem pressa, estou pesquisando"], short: ["Até 1 mês", "1 a 3 meses", "Sem pressa"] },
  cli_sistema: { text: "Qual sistema ou serviço você usa?", options: ["AMT Dojo Manager", "AMT OptiOne", "Outro serviço da AMT"], short: ["Dojo Manager", "OptiOne", "Outro serviço"] },
};

/** Depois da apresentação: segue para o diagnóstico (venda) ou tira uma dúvida com a equipe. */
const NEXT_Q = (sistema: string): Question => ({
  text: `Quer descobrir qual plano do *${sistema}* é o ideal para você? São só 3 perguntas rápidas.`,
  options: ["Sim, quero ver o plano ideal", "Tenho uma dúvida antes"],
  short: ["Ver plano ideal", "Tenho uma dúvida"],
});

/**
 * Guia de apresentação (prints reais + o que cada parte resolve), com o conteúdo das páginas oficiais
 * (landing do Dojo Manager e página do OptiOne). Ao mudar recursos nas páginas, atualizar aqui também.
 */
const GUIDE: Record<"dojo" | "optione", OutMessage[]> = {
  dojo: [
    {
      image: `${MEDIA}/dojo-dashboard.jpg`,
      caption:
        "*AMT Dojo Manager* é o sistema de gestão feito para academias de artes marciais: alunos, aulas, graduações, financeiro e app do aluno num só lugar, no computador e no celular.\n\nVou te mostrar em 1 minuto 👇",
    },
    {
      image: `${MEDIA}/dojo-finance.jpg`,
      caption:
        "💰 *Financeiro no automático*\n• Mensalidades e cobranças por Pix, boleto e cartão (AMT Pay), com baixa automática\n• Contas a pagar e a receber e fluxo de caixa do mês\n• Controle de inadimplência e bloqueio de check-in de quem está em atraso",
    },
    {
      image: `${MEDIA}/dojo-checkin.jpg`,
      caption:
        "📅 *Aulas e frequência*\n• Agenda e turmas por modalidade\n• Check-in por QR Code e presença por aluno e turma\n• Integração com Gympass e TotalPass",
    },
    {
      image: `${MEDIA}/dojo-graduations.jpg`,
      caption:
        "🥋 *Graduações e ensino*\n• Modalidades, faixas e graus da sua arte (Jiu-Jitsu, Judô, Karatê, Muay Thai e outras)\n• Critérios de graduação e avaliações feitas pelo instrutor\n• Certificados com editor próprio, competições e ranking",
    },
    {
      image: `${MEDIA}/dojo-app-aluno.jpg`,
      caption:
        "📱 *App do aluno incluso*\n• Carteirinha com QR Code, mensalidades e contratos no celular\n• Avisos com notificação\n\nE ainda: contratos digitais, equipe com acesso por função, várias unidades e a loja AMT Fight Wear integrada.",
    },
  ],
  optione: [
    {
      image: `${MEDIA}/optione-capa.jpg`,
      caption:
        "*AMT OptiOne* é o sistema completo para óticas: vendas, receitas, laboratório, estoque e financeiro, instalado no computador da loja (Windows).\n\nVou te mostrar rapidinho 👇",
    },
    {
      image: `${MEDIA}/optione-visao-geral.jpg`,
      caption:
        "🧾 *Vendas, receitas e laboratório*\n• PDV com leitor de código de barras, pagamentos múltiplos, crediário e orçamentos que viram venda\n• Receitas OD/OE com alertas de digitação e histórico por cliente\n• Pedidos ao laboratório por etapa, com prazos e alerta de atraso",
    },
    "📦 *Estoque, financeiro e indicadores*\n• Armações, lentes, lentes de contato e acessórios, com estoque mínimo e pedidos de compra\n• Contas a pagar e a receber, parcelas do crediário e relatórios em PDF\n• Faturamento, lucro, ticket médio e conversão de orçamentos\n\n💬 *Relacionamento*: pós-venda, revisão de receita e aniversariantes com mensagem pronta para WhatsApp\n📄 Ordem de serviço e orçamento com a logo da ótica\n👥 Um login por pessoa e vendas registradas por vendedor",
  ],
};

const CLOSING = "Se travar em algum passo ou surgir qualquer dúvida, é só responder *atendente* que alguém da nossa equipe te ajuda por aqui. 😉";

const askText = (q: Question) => `${q.text}\n\n${q.options.map((o, i) => `*${i + 1}* ${o}`).join("\n")}`;
const ask = (q: Question): OutMessage => ({ text: askText(q), buttons: q.short ?? q.options });

/* ------------------------------ Entrada ------------------------------ */

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** Número da opção escolhida (1..n) ou null. Aceita "1", "1.", "opção 1", "um". */
function choice(text: string, n: number): number | null {
  const t = normalize(text);
  const words = ["um", "dois", "tres", "quatro", "cinco", "seis"];
  const m = t.match(/^(?:opcao |numero |n )?(\d{1,2})(?: [a-z ]*)?$/) ?? null;
  const v = m ? Number(m[1]) : words.indexOf(t) + 1 || null;
  return v && v >= 1 && v <= n ? v : null;
}

/** Opção pelo rótulo (toque num botão manda o texto dele; ou a pessoa digita a opção). */
function labelChoice(text: string, q: Question): number | null {
  const t = normalize(text);
  if (!t) return null;
  const at = (list?: string[]) => (list ?? []).findIndex((o) => normalize(o) === t);
  const i = at(q.short) >= 0 ? at(q.short) : at(q.options);
  return i >= 0 ? i + 1 : null;
}

const pick = (text: string, q: Question) => choice(text, q.options.length) ?? labelChoice(text, q);

const wantsHuman =(t: string) => /\b(atendente|humano|pessoa|falar com alguem|falar com voce|consultor|vendedor)\b/.test(normalize(t));
const THANKS = /^(obrigad[oa]s?|obg|valeu|vlw|ok|okay|blz|beleza|show|perfeito|certo|top|otimo|joia|tmj|grato|grata)( .*)?$/;
const wantsMenu =(t: string) => /^(0|menu|inicio|voltar|recomecar)$/.test(normalize(t));

/** Atalho pelo texto livre no menu (ex.: "quero um sistema para academia"). */
function menuByKeyword(text: string): number | null {
  const t = normalize(text);
  if (/\b(academia|dojo|jiu|judo|karate|muay|luta|tatame|artes marciais|taekwondo|boxe|mma)\b/.test(t)) return 1;
  if (/\b(otica|optione|oculos|lente|lentes)\b/.test(t)) return 2;
  if (/\b(site|aplicativo|app|white label|automacao|automatizar|software sob medida|landing)\b/.test(t)) return 3;
  if (/\b(suporte|problema|erro|nao funciona|nao abre|bug|travou|ajuda com o sistema)\b/.test(t)) return 4;
  return null;
}

/* ------------------------------ Execução ------------------------------ */

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Agenda o bot para uma mensagem recebida sem segurar a resposta do webhook. */
export function scheduleBot(sb: SupabaseClient, chatId: string, messageId: string, deps: BotDeps) {
  const task = runBot(sb, chatId, messageId, deps).catch((err) => console.error("support-inbox: assistente", err instanceof Error ? err.message : err));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
}

export type BotSettings = { enabled: boolean; buttons: boolean };

/** Liga/desliga geral e o uso de botões (app_settings 'support_whatsapp_bot'). */
export async function botSettings(sb: SupabaseClient): Promise<BotSettings> {
  const { data } = await sb.from("app_settings").select("value").eq("key", BOT_SETTINGS_KEY).maybeSingle();
  const value = (data?.value ?? {}) as { enabled?: boolean; buttons?: boolean };
  return { enabled: value.enabled === true, buttons: value.buttons === true };
}

/** Sem confirmação de entrega dos botões nesse tempo, manda a versão em texto. */
const BUTTONS_DELIVERY_WAIT_MS = 20_000;

async function runBot(sb: SupabaseClient, chatId: string, messageId: string, deps: BotDeps) {
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(messageId)) return;
  // Junta mensagens enviadas em sequência: só a última da rajada é tratada.
  await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
  const settings = await botSettings(sb);
  if (!settings.enabled) return;

  const { data: last } = await sb
    .from("support_wa_messages")
    .select("id, message_id, type, body, sent_at")
    .eq("chat_id", chatId).eq("from_me", false).eq("hidden", false)
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const incoming = last as Incoming | null;
  if (!incoming || incoming.message_id !== messageId) return;
  if (Date.now() - new Date(incoming.sent_at).getTime() > MAX_MESSAGE_AGE_MS) return;

  const { data: chatRow } = await sb
    .from("support_wa_chats")
    .select("id, remote_jid, phone_normalized, name, unread_count, bot_state, bot_handoff_at, bot_paused_until")
    .eq("id", chatId).maybeSingle();
  const chat = chatRow as ChatRow | null;
  if (!chat) return;
  if (deps.ownPhone && chat.phone_normalized === deps.ownPhone) return;
  if (chat.bot_paused_until && new Date(chat.bot_paused_until).getTime() > Date.now()) return;
  if (chat.bot_handoff_at && Date.now() - new Date(chat.bot_handoff_at).getTime() < QUIET_AFTER_HANDOFF_MS) return;

  // Um atendente escreveu nas últimas 24 h: a conversa é dele.
  const { count: human } = await sb
    .from("support_wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId).eq("from_me", true).eq("hidden", false)
    .not("source", "in", "(bot,auto,relay)")
    .gte("sent_at", new Date(Date.now() - QUIET_AFTER_HUMAN_MS).toISOString());
  if ((human ?? 0) > 0) return;

  // Trava: a mesma mensagem nunca é tratada duas vezes (reentregas do webhook, execuções simultâneas).
  const { data: claimed } = await sb
    .from("support_wa_chats")
    .update({ bot_last_in: messageId })
    .eq("id", chatId)
    .or(`bot_last_in.is.null,bot_last_in.neq.${messageId}`)
    .select("id");
  if (!claimed?.length) return;

  const now = new Date().toISOString();
  const prev = chat.bot_state;
  const recent = (prev?.replies ?? []).filter((t) => Date.now() - new Date(t).getTime() < 3600_000);
  if (recent.length >= MAX_REPLIES_PER_HOUR) return;

  const fresh = !prev || Date.now() - new Date(prev.updated_at).getTime() > SESSION_MS;
  const state: BotState = fresh ? { step: "menu", answers: {}, updated_at: now } : { ...prev, answers: { ...prev.answers } };
  const text = incoming.type === "text" ? (incoming.body ?? "").trim() : "";

  const out = await decide(sb, chat, state, text, incoming, fresh);
  if (!out.messages.length) return;

  const to = chat.phone_normalized ?? deps.recipient(chat.remote_jid);
  if (!to) return;
  const record = async (res: any, body: string, type = "text") => {
    const id: string | undefined = res?.key?.id;
    if (!id) return null;
    const media = { media_mime: type === "image" ? "image/jpeg" : null };
    const row = { chat_id: chatId, message_id: id, from_me: true, type, body, ...media, status: "sent", sent_at: new Date().toISOString(), source: "bot", hidden: false };
    await sb.from("support_wa_messages").upsert(row, { onConflict: "message_id", ignoreDuplicates: true });
    // O webhook pode ter gravado antes como mensagem comum: corrige origem e texto.
    await sb.from("support_wa_messages").update({ source: "bot", type, body, ...media }).eq("message_id", id);
    return id;
  };
  const withButtons: Array<{ id: string; text: string }> = [];
  for (const message of out.messages) {
    if (typeof message !== "string" && "image" in message) {
      try {
        await record(await deps.sendImage(to, message.image, message.caption), message.caption, "image");
      } catch (err) {
        // Sem a imagem, o texto do guia ainda chega.
        console.error("support-inbox: imagem do guia não enviada", message.image, err instanceof Error ? err.message : err);
        await record(await deps.sendText(to, message.caption), message.caption);
      }
      continue;
    }
    const text = typeof message === "string" ? message : message.text;
    const buttons = typeof message === "string" ? [] : message.buttons;
    if (settings.buttons && buttons.length > 0 && buttons.length <= MAX_BUTTONS) {
      try {
        const res = await deps.sendButtons(to, text, buttons);
        const id = await record(res, `${text}\n\n${buttons.map((b) => `[ ${b} ]`).join("  ")}`);
        if (id) withButtons.push({ id, text });
        continue;
      } catch (err) {
        console.error("support-inbox: botões não enviados, indo em texto", err instanceof Error ? err.message : err);
      }
    }
    await record(await deps.sendText(to, text), text);
  }

  const next: BotState = { ...out.state, updated_at: new Date().toISOString(), replies: [...recent, now].slice(-MAX_REPLIES_PER_HOUR) };
  await sb.from("support_wa_chats").update({
    bot_state: next,
    ...(out.handoff ? { bot_handoff_at: new Date().toISOString() } : {}),
    // A resposta do bot não conta como atendimento: a conversa continua como não lida no /admin.
    unread_count: Math.max(1, chat.unread_count),
  }).eq("id", chatId);

  if (out.handoff) await notifyHandoff(sb, chat, out.handoff);

  // Botões sem confirmação de entrega (alguns WhatsApp não recebem mensagens interativas): manda em texto.
  if (withButtons.length) {
    await new Promise((r) => setTimeout(r, BUTTONS_DELIVERY_WAIT_MS));
    for (const sent of withButtons) {
      const { data } = await sb.from("support_wa_messages").select("status").eq("message_id", sent.id).maybeSingle();
      if (data?.status === "delivered" || data?.status === "read") continue;
      console.error("support-inbox: botões sem entrega confirmada, reenviando em texto", sent.id, data?.status ?? "sem status");
      await record(await deps.sendText(to, sent.text), sent.text);
    }
  }
}

type Outcome = { messages: OutMessage[]; state: BotState; handoff?: string };

export async function decide(sb: SupabaseClient, chat: ChatRow, state: BotState, text: string, incoming: Incoming, fresh: boolean): Promise<Outcome> {
  const reset = (again: boolean): Outcome => ({ messages: [greeting(chat.name, again)], state: { step: "menu", answers: {}, updated_at: state.updated_at } });
  const handoff = (reason: string, message?: string): Outcome => ({
    messages: [message ?? "Certo! Já avisei a nossa equipe e um atendente vai continuar a conversa por aqui. 🙂\nSe quiser, já pode adiantar o assunto."],
    state: { ...state, step: "done", invalid: 0 },
    handoff: reason,
  });

  if (text && wantsHuman(text)) return handoff("Pediu para falar com um atendente");

  if (fresh) {
    // Primeira mensagem: se já disse o que quer, pula direto para o caminho.
    const shortcut = text ? menuByKeyword(text) : null;
    if (shortcut && shortcut !== 5) {
      const opened = await openPath(sb, chat, { step: "menu", answers: {}, updated_at: state.updated_at }, shortcut);
      return { ...opened, messages: [`Olá${chat.name ? `, ${chat.name.split(/\s+/)[0]}` : ""}! 👋 Eu sou o *${BOT_NAME}*.`, ...opened.messages] };
    }
    return reset(false);
  }
  if (text && wantsMenu(text)) return reset(false);
  // Fluxo encerrado: um "obrigado"/"ok" não precisa de resposta; qualquer outra coisa reabre o menu.
  // (Só emoji, como 👍, também não.)
  if (state.step === "done") return text && (!normalize(text) || THANKS.test(normalize(text))) ? { messages: [], state } : reset(true);

  const invalid = (question: string | Question): Outcome => {
    const n = (state.invalid ?? 0) + 1;
    if (n >= 2) return handoff("O assistente não entendeu as respostas", "Para não te fazer perder tempo, já chamei uma pessoa da nossa equipe para continuar a conversa por aqui. 🙂");
    const hint = incoming.type !== "text" ? "Por aqui eu só consigo ler mensagens de texto." : "Não entendi. 🙂";
    const body = `${hint} Responda só com o *número* da opção.\n\n${typeof question === "string" ? question : askText(question)}\n\n${FOOTER}`;
    const again: OutMessage = typeof question === "string" ? body : { text: body, buttons: question.short ?? question.options };
    return { messages: [again], state: { ...state, invalid: n } };
  };
  const ok = (s: BotState): BotState => ({ ...s, invalid: 0 });

  switch (state.step) {
    case "menu": {
      const c = pick(text, MENU_Q) ?? (text ? menuByKeyword(text) : null);
      if (!c) return invalid(MENU_Q);
      if (c === 5) return handoff("Pediu para falar com um atendente");
      return openPath(sb, chat, state, c);
    }

    case "dojo_apresentacao":
    case "opt_apresentacao": {
      const dojo = state.step === "dojo_apresentacao";
      const sistema = dojo ? "AMT Dojo Manager" : "AMT OptiOne";
      const q = NEXT_Q(sistema);
      const c = pick(text, q);
      if (!c) return invalid(q);
      if (c === 2) {
        await registerLead(chat, dojo ? "amt-dojo-manager" : "amt-optione", [`Viu a apresentação do ${sistema} e tem uma dúvida.`]);
        return handoff(`Tem uma dúvida sobre o ${sistema} (depois da apresentação)`, "Claro! Pode mandar a sua dúvida por aqui que um especialista da nossa equipe te responde. 🙂");
      }
      return step(ok({ ...state }), dojo ? "dojo_alunos" : "opt_usuarios");
    }

    case "dojo_alunos":
    case "dojo_unidades":
    case "dojo_recursos":
    case "opt_usuarios":
    case "opt_computadores":
    case "opt_whatsapp":
    case "sm_tipo":
    case "sm_prazo":
    case "cli_sistema": {
      const q = Q[state.step];
      const c = pick(text, q);
      if (!c) return invalid(q);
      const answers = { ...state.answers, [state.step]: q.options[c - 1] };
      const s = ok({ ...state, answers });
      if (state.step === "dojo_alunos") return step(s, "dojo_unidades");
      if (state.step === "dojo_unidades") return step(s, "dojo_recursos");
      if (state.step === "dojo_recursos") return recommendDojo(sb, chat, s, answers);
      if (state.step === "opt_usuarios") return step(s, "opt_computadores");
      if (state.step === "opt_computadores") return step(s, "opt_whatsapp");
      if (state.step === "opt_whatsapp") return recommendOptione(sb, chat, s, answers);
      if (state.step === "sm_tipo") return { messages: ["Me conte em poucas palavras o que você precisa (o objetivo, para quem é e o que não pode faltar)."], state: { ...s, step: "sm_detalhe" } };
      if (state.step === "sm_prazo") {
        await registerLead(chat, null, [
          `Projeto sob medida: ${answers.sm_tipo}`, `Descrição: ${answers.sm_detalhe ?? "-"}`, `Prazo: ${answers.sm_prazo}`,
        ]);
        return handoff(`Projeto sob medida: ${answers.sm_tipo}`, "Perfeito! Registrei o seu pedido e um especialista vai analisar e te responder por aqui com os próximos passos. 🙂");
      }
      // cli_sistema
      const dojoTip = c === 1 ? "\n\nDica: no próprio Dojo Manager, no menu *Suporte*, você também abre um chamado e acompanha a resposta." : "";
      return { messages: [`Entendi. Me conte em uma mensagem o que está acontecendo. Se puder, mande também um print da tela.${dojoTip}`], state: { ...s, step: "cli_descricao" } };
    }

    case "sm_detalhe": {
      if (!text || text.length < 3) return invalid("Me conte em poucas palavras o que você precisa.");
      return step(ok({ ...state, answers: { ...state.answers, sm_detalhe: text.slice(0, 800) } }), "sm_prazo");
    }

    case "cli_descricao": {
      const desc = text || (incoming.type === "image" ? "📷 Enviou um print" : incoming.type === "audio" ? "🎤 Enviou um áudio" : "");
      if (!desc) return invalid("Me conte em uma mensagem o que está acontecendo.");
      const system = state.answers.cli_sistema ?? "cliente";
      return handoff(`Suporte (${system}): ${desc.slice(0, 140)}`, "Obrigado! Registrei o seu relato e a nossa equipe de suporte vai te responder por aqui o quanto antes. 🙂");
    }

  }
  return reset(false);
}

function step(state: BotState, next: keyof typeof Q): Outcome {
  return { messages: [ask(Q[next])], state: { ...state, step: next } };
}

async function openPath(_sb: SupabaseClient, _chat: ChatRow, state: BotState, option: number): Promise<Outcome> {
  const base = { ...state, answers: {}, invalid: 0 };
  // Dojo e OptiOne: primeiro o guia de apresentação, depois o convite para o diagnóstico (venda).
  if (option === 1) return { messages: [...GUIDE.dojo, ask(NEXT_Q("AMT Dojo Manager"))], state: { ...base, path: "dojo", step: "dojo_apresentacao" } };
  if (option === 2) return { messages: [...GUIDE.optione, ask(NEXT_Q("AMT OptiOne"))], state: { ...base, path: "optione", step: "opt_apresentacao" } };
  if (option === 3) return step({ ...base, path: "sob_medida" }, "sm_tipo");
  return step({ ...base, path: "cliente" }, "cli_sistema");
}

async function recommendDojo(_sb: SupabaseClient, chat: ChatRow, state: BotState, a: Record<string, string>): Promise<Outcome> {
  const { trial, plans } = await catalog("amt-dojo-manager");
  const alunos = Q.dojo_alunos.options.indexOf(a.dojo_alunos) + 1;
  const varias = a.dojo_unidades === Q.dojo_unidades.options[1];
  const recursos = a.dojo_recursos === Q.dojo_recursos.options[0];
  const slug = varias || alunos === 3 ? "premium" : alunos === 2 || recursos ? "profissional" : "essencial";
  const plan = plans.find((p) => p.slug === slug) ?? plans[plans.length - 1];
  const why = varias ? "porque tem mais de uma unidade" : alunos === 3 ? "porque tem mais de 300 alunos" : alunos === 2 ? "pelo número de alunos" : recursos ? "pelos recursos que você precisa" : "para o dia a dia da academia";
  await registerLead(chat, "amt-dojo-manager", [
    `Diagnóstico do assistente (Dojo Manager): ${a.dojo_alunos} alunos · ${a.dojo_unidades} · recursos avançados: ${a.dojo_recursos}`,
    `Plano recomendado: ${plan.nome} (${brl(plan.preco_mensal)}/mês). Recebeu o link do teste grátis.`,
  ]);
  return {
    messages: [
      `Recomendo o plano ${planText(plan)}\n\nEle é o mais indicado ${why}.`,
      `✅ *Comece agora o seu teste grátis de ${trial} dias* no plano ${plan.nome}, sem cartão de crédito:\n${DOJO_PLANS_URL}?plan=${plan.slug}\n\nLeva cerca de 2 minutos: você cadastra a academia e já começa a usar, com todos os recursos do plano.`,
      CLOSING,
    ],
    state: { ...state, step: "done", answers: { ...a, plano: plan.slug } },
  };
}

async function recommendOptione(_sb: SupabaseClient, chat: ChatRow, state: BotState, a: Record<string, string>): Promise<Outcome> {
  const { trial, plans } = await catalog("amt-optione");
  const usuarios = Q.opt_usuarios.options.indexOf(a.opt_usuarios) + 1;
  const pcs = Q.opt_computadores.options.indexOf(a.opt_computadores) + 1;
  const zap = a.opt_whatsapp === Q.opt_whatsapp.options[0];
  const slug = usuarios === 3 || pcs === 3 ? "rede" : usuarios === 2 || pcs === 2 || zap ? "profissional" : "essencial";
  const plan = plans.find((p) => p.slug === slug) ?? plans[plans.length - 1];
  const why = usuarios === 3 || pcs === 3 ? "pelo tamanho da equipe" : zap ? "porque inclui o WhatsApp automático" : usuarios === 2 || pcs === 2 ? "pelo número de usuários e computadores" : "para organizar a operação da ótica";
  await registerLead(chat, "amt-optione", [
    `Diagnóstico do assistente (OptiOne): ${a.opt_usuarios} usuários · ${a.opt_computadores} computadores · WhatsApp automático: ${a.opt_whatsapp}`,
    `Plano recomendado: ${plan.nome} (${brl(plan.preco_mensal)}/mês). Recebeu o link do teste grátis.`,
  ]);
  return {
    messages: [
      `Recomendo o plano ${planText(plan)}\n\nEle é o mais indicado ${why}.`,
      `✅ *Comece agora o seu teste grátis de ${trial} dias* no plano ${plan.nome}:\n${OPTIONE_TRIAL_URL}?plano=${plan.slug}\n\nLeva cerca de 2 minutos: você cadastra a ótica, recebe a chave de acesso e instala no Windows.`,
      CLOSING,
    ],
    state: { ...state, step: "done", answers: { ...a, plano: plan.slug } },
  };
}

/* ---------------------------- Lead e alerta ---------------------------- */

async function registerLead(chat: ChatRow, sistema: string | null, notes: string[]) {
  const secret = Deno.env.get("BOT_LEAD_SECRET") ?? "";
  if (!secret) return;
  try {
    const res = await fetch(LEAD_RPC_URL, {
      method: "POST",
      headers: { apikey: AMT_PUBLIC_KEY, Authorization: `Bearer ${AMT_PUBLIC_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_secret: secret,
        p_chat_id: chat.id,
        p_nome: chat.name ?? null,
        p_telefone: chat.phone_normalized ? `+${chat.phone_normalized}` : null,
        p_sistema_slug: sistema,
        p_observacoes: notes.join("\n"),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("support-inbox: lead do assistente não registrado", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("support-inbox: lead do assistente não registrado", err instanceof Error ? err.message : err);
  }
}

async function notifyHandoff(sb: SupabaseClient, chat: ChatRow, reason: string) {
  const who = chat.name || (chat.phone_normalized ? `+${chat.phone_normalized}` : "Contato do WhatsApp");
  const { error } = await sb.rpc("admin_notify", {
    p_title: `🙋 ${who} quer falar com a equipe`,
    p_body: reason.slice(0, 160),
    p_url: `/admin/whatsapp?conversa=${chat.id}`,
    p_tag: `bot-${chat.id}`,
  });
  if (error) console.error("support-inbox: alerta do assistente", error.message);
}

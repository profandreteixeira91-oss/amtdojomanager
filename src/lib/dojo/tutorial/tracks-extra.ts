/**
 * Trilhas complementares do Tutorial Guiado — módulos avançados do Dojo Manager.
 * Mesmas regras de escrita de `tracks.ts`: um passo, uma ação, com o nome
 * exato do botão como aparece na tela.
 */
import type { TutorialTrack } from "./tracks";

export const EXTRA_TRACKS: TutorialTrack[] = [
  // ───────────────────── Ensino & Avaliações ─────────────────────
  {
    id: "criar-plano-aula",
    title: "Montar um plano de aula",
    question: "Como planejo o conteúdo das minhas aulas?",
    category: "Ensino & Avaliações",
    route: "/dojo/app/lesson-plans",
    steps: [
      {
        title: "Planos de aula",
        text: "Aqui você planeja o conteúdo de cada aula.",
        hint: "Em “Modelo” você começa a partir de um plano pronto.",
        seconds: 10,
      },
      {
        title: "Novo",
        text: "Clique em “Novo”: a aula é criada e o editor abre.",
        target: "text:Novo",
        action: "navigate",
        validate: { route: "/dojo/app/lesson-plans/" },
        seconds: 10,
      },
      {
        title: "Informações gerais",
        text: "Dê um título, escolha a turma, a data e o horário.",
        seconds: 30,
      },
      {
        title: "Objetivos e estrutura",
        text: "Escreva os objetivos e monte a estrutura da aula em blocos (aquecimento, técnica, treino…).",
        hint: "Cada bloco tem título, duração e as técnicas ou exercícios.",
        seconds: 60,
      },
      {
        title: "Salvo automaticamente",
        text: "Não precisa clicar em salvar: o plano é salvo sozinho enquanto você edita.",
        hint: "Para reaproveitar, use “Salvar como modelo”.",
        seconds: 10,
      },
    ],
  },
  {
    id: "aplicar-avaliacao",
    title: "Aplicar uma avaliação técnica",
    question: "Como avalio o desempenho técnico de um aluno?",
    category: "Ensino & Avaliações",
    route: "/dojo/app/evaluations/sessions",
    steps: [
      {
        title: "Avaliações",
        text: "Aqui ficam as avaliações aplicadas aos alunos.",
        hint: "Você precisa de um modelo pronto. Crie em Avaliações › Modelos, se ainda não tiver.",
        seconds: 10,
      },
      {
        title: "Nova avaliação",
        text: "Clique em “Nova Avaliação”.",
        target: "text:Nova Avaliação",
        action: "click",
        seconds: 10,
      },
      {
        title: "Modelo e aluno",
        text: "Escolha o modelo de avaliação e o aluno.",
        action: "select",
        seconds: 20,
      },
      {
        title: "Criar e iniciar",
        text: "Clique em “Criar e Iniciar”.",
        target: "text:Criar e Iniciar",
        action: "navigate",
        validate: { route: "/dojo/app/evaluations/sessions/" },
        seconds: 10,
      },
      {
        title: "Notas",
        text: "Dê a nota de cada critério e escreva as observações.",
        hint: "A avaliação é 100% manual: o resultado é sempre do professor. Use “Salvar” para continuar depois.",
        seconds: 90,
      },
      {
        title: "Resultado",
        text: "Finalize com “Aprovar”, “Condicional”, “Revisão” ou “Reprovar”.",
        target: "text:Aprovar",
        action: "click",
        seconds: 10,
      },
    ],
  },
  {
    id: "biblioteca-videos",
    title: "Publicar vídeos técnicos",
    question: "Como envio vídeos de técnicas para os alunos?",
    category: "Ensino & Avaliações",
    route: "/dojo/app/videos",
    steps: [
      {
        title: "Vídeos",
        text: "Os vídeos publicados aqui aparecem no app do aluno.",
        seconds: 10,
      },
      {
        title: "Novo vídeo",
        text: "Clique em “Novo Vídeo”.",
        target: "text:Novo Vídeo",
        action: "navigate",
        validate: { route: "/dojo/app/videos/novo" },
        seconds: 10,
      },
      {
        title: "Informações",
        text: "Digite o título e escolha a categoria.",
        action: "input",
        validate: { minLength: 3 },
        seconds: 30,
      },
      {
        title: "O vídeo",
        text: "Escolha a origem: envio direto do arquivo, YouTube, Vimeo ou URL externa — e cole o link.",
        seconds: 30,
      },
      {
        title: "Publicar",
        text: "Clique em “Publicar”.",
        hint: "“Salvar rascunho” guarda sem mostrar aos alunos.",
        target: "text:Publicar",
        action: "create",
        seconds: 10,
      },
    ],
  },

  // ───────────────────────── Competições ─────────────────────────
  {
    id: "gerenciar-competicoes",
    title: "Cadastrar competição e resultados",
    question: "Como registro campeonatos, atletas e resultados?",
    category: "Competições",
    route: "/dojo/app/competitions",
    steps: [
      {
        title: "Biblioteca",
        text: "Clique na aba “Biblioteca”: lá ficam os campeonatos encontrados.",
        target: "text:Biblioteca",
        action: "click",
        seconds: 10,
      },
      {
        title: "Não achou o campeonato?",
        text: "Clique em “Nova competição” e preencha nome, datas e local. Depois, “Cadastrar”.",
        target: "text:Nova competição",
        seconds: 60,
      },
      {
        title: "Adicionar ao calendário",
        text: "No card da competição, clique em “Adicionar”.",
        target: "text:Adicionar",
        action: "click",
        seconds: 15,
      },
      {
        title: "Meu Calendário",
        text: "Clique na aba “Meu Calendário”.",
        target: "text:Meu Calendário",
        action: "click",
        seconds: 10,
      },
      {
        title: "Gerenciar",
        text: "Clique em “Gerenciar” na competição.",
        target: "text:Gerenciar",
        action: "navigate",
        validate: { route: "/dojo/app/competitions/" },
        seconds: 10,
      },
      {
        title: "Atletas",
        text: "Na aba “Atletas”, clique em “Novo atleta” para inscrever seus alunos.",
        target: "text:Novo atleta",
        seconds: 40,
      },
      {
        title: "Resultados",
        text: "Depois do evento, vá na aba “Resultados” e clique em “Registrar resultado”.",
        hint: "As colocações alimentam o ranking e as estatísticas da academia.",
        seconds: 30,
      },
    ],
  },
  {
    id: "ranking-checkins",
    title: "Usar o ranking de presença",
    question: "Como funciona o ranking de check-ins?",
    category: "Rotina",
    route: "/dojo/app/ranking",
    steps: [
      {
        title: "Ranking",
        text: "O ranking ordena os alunos pela quantidade de check-ins.",
        seconds: 10,
      },
      {
        title: "Turma",
        text: "Escolha a turma no seletor.",
        seconds: 10,
      },
      {
        title: "Período",
        text: "Alterne entre “Total”, “Ano”, “Mês” e “Semana”.",
        target: "text:Mês",
        seconds: 10,
      },
      {
        title: "No app do aluno",
        text: "O aluno vê o mesmo ranking no app — ótimo para estimular a frequência.",
        seconds: 10,
      },
    ],
  },

  // ───────────────────────── Financeiro ─────────────────────────
  {
    id: "relatorios-financeiros",
    title: "Gerar e exportar relatórios",
    question: "Como vejo o fluxo de caixa e exporto os dados?",
    category: "Financeiro",
    route: "/dojo/app/finance",
    steps: [
      {
        title: "Financeiro",
        text: "O Dashboard mostra recebimentos, projeção e os últimos 12 meses.",
        hint: "Se o Financeiro pedir um PIN, digite-o para liberar a tela.",
        seconds: 10,
      },
      {
        title: "Despesas",
        text: "Para o resultado ficar real, lance as despesas em “Contas a pagar” › “Nova despesa”.",
        target: "text:Contas a pagar",
        seconds: 20,
      },
      {
        title: "Fluxo de caixa",
        text: "Clique em “Fluxo de caixa” para ver entradas, saídas e o saldo do período.",
        target: "text:Fluxo de caixa",
        action: "click",
        seconds: 15,
      },
      {
        title: "Relatórios",
        text: "Clique em “Relatórios”.",
        target: "text:Relatórios",
        action: "click",
        seconds: 10,
      },
      {
        title: "Exportar",
        text: "Em cada relatório, use “PDF” ou “CSV”. “PDF completo” gera tudo de uma vez.",
        hint: "O CSV abre no Excel — é o formato para enviar ao contador.",
        target: "text:PDF completo",
        seconds: 20,
      },
    ],
  },
  {
    id: "contratos-digitais",
    title: "Emitir contratos digitais",
    question: "Como gero o contrato de matrícula do aluno?",
    category: "Financeiro",
    route: "/dojo/app/contracts/templates",
    steps: [
      {
        title: "Modelos de contrato",
        text: "Aqui ficam os modelos que o sistema usa para gerar os contratos.",
        seconds: 10,
      },
      {
        title: "Novo modelo",
        text: "Clique em “Novo modelo”.",
        target: "text:Novo modelo",
        action: "navigate",
        validate: { route: "/dojo/app/contract-templates/" },
        seconds: 10,
      },
      {
        title: "Texto do contrato",
        text: "Escreva as cláusulas e insira as variáveis do aluno (nome, CPF, plano…) pelo painel “Variáveis”.",
        hint: "As variáveis são trocadas pelos dados do aluno na hora de gerar.",
        seconds: 90,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar”.",
        target: "text:Salvar",
        action: "create",
        seconds: 10,
      },
      {
        title: "Gerar para o aluno",
        text: "O contrato é gerado na última etapa do cadastro do aluno, ou na ficha dele › aba “Contratos” › “Novo contrato”.",
        seconds: 15,
      },
      {
        title: "Emitidos",
        text: "Todos os contratos gerados e o status de cada um ficam em “Emitidos”.",
        route: "/dojo/app/contracts/issued",
        seconds: 10,
      },
    ],
  },

  // ───────────────────────── Configurações ─────────────────────────
  {
    id: "usuarios-permissoes",
    title: "Mudar o que um colaborador pode ver",
    question: "Como mudo as permissões de um professor ou da recepção?",
    category: "Configurações",
    route: "/dojo/app/system-users",
    steps: [
      {
        title: "Usuários do Sistema",
        text: "Aqui ficam os logins da equipe e o que cada um pode ver no painel.",
        hint: "A pessoa precisa estar cadastrada em Pessoas › Equipe, com e-mail.",
        seconds: 10,
      },
      {
        title: "Abrir o colaborador",
        text: "Clique no nome do colaborador para ver os módulos.",
        seconds: 10,
      },
      {
        title: "Módulos visíveis",
        text: "Marque ou desmarque os módulos. Só os marcados aparecem no menu dele.",
        target: "[role='checkbox']",
        action: "confirm",
        seconds: 30,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar permissões”.",
        target: "text:Salvar permissões",
        action: "create",
        seconds: 10,
      },
      {
        title: "Senha e acesso",
        text: "No mesmo cartão: “Trocar senha” define uma senha nova e “Revogar acesso” tira o acesso ao painel.",
        seconds: 10,
      },
    ],
  },
  {
    id: "assinatura-amt",
    title: "Assinatura e plano contratado",
    question: "Como vejo e pago a minha assinatura do Dojo Manager?",
    category: "Configurações",
    route: "/dojo/app/subscription",
    steps: [
      {
        title: "Assinatura",
        text: "Aqui você vê o plano, a situação da assinatura e o que está incluído.",
        seconds: 10,
      },
      {
        title: "Período de teste",
        text: "No teste gratuito você tem acesso a tudo; a data de fim do teste aparece no cartão do plano.",
        seconds: 10,
      },
      {
        title: "Ativar",
        text: "Em “Ativar Assinatura”, escolha “Cartão” ou “PIX” e siga o pagamento.",
        hint: "Com a assinatura ativa, a próxima renovação aparece no cartão do plano.",
        seconds: 30,
      },
    ],
  },
];

/**
 * Catálogo de trilhas do módulo Tutorial do Dojo Manager.
 *
 * Conteúdo puro (sem banco): cada trilha aponta para uma rota do sistema e
 * descreve os passos que o dono do dojo deve seguir. O alvo (`target`) pode ser:
 *  - `[data-tour='algo']`  → seletor CSS normal
 *  - `text:Novo aluno`     → botão/aba/link cujo texto é (ou começa com) a frase.
 *                            O menu lateral é ignorado nessa busca.
 * Se o alvo não existir na tela, o passo é exibido apenas como instrução.
 *
 * Regras de escrita (para manter os tutoriais simples):
 *  - `title` curto; `text` com UMA ação, citando o nome exato do botão entre “ ”.
 *  - Nomes de botões, abas e campos precisam existir de verdade na tela
 *    (confira no componente antes de mudar).
 *  - `action` só quando dá para detectar a ação; senão deixe só a instrução.
 *  - Telas fora de /dojo/app (ex.: editor de certificado) desmontam o tutorial:
 *    deixe-as como último passo, apenas informativo.
 */

import { EXTRA_TRACKS } from "./tracks-extra";

/** Tipo de interação que o passo espera do usuário. */
export type TutorialAction =
  | "none"
  | "click"
  | "input"
  | "select"
  | "navigate"
  | "submit"
  | "upload"
  | "confirm"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "print";

export type TutorialStep = {
  /** Título curto do passo (cabeçalho da caixa de instrução). */
  title?: string;
  /** Instrução curta e direta. */
  text: string;
  /** O que o usuário alcança ao concluir este passo. */
  objective?: string;
  /** Detalhe opcional exibido abaixo da instrução. */
  hint?: string;
  /** Elemento a destacar na tela. */
  target?: string;
  /** Se preenchido, navega para esta rota ao entrar no passo. */
  route?: string;
  /** Ação exigida para liberar o botão "Próximo" (padrão: none). */
  action?: TutorialAction;
  /**
   * Validação alternativa da ação: `selector` conta como feita quando o
   * elemento aparece na tela; `route` quando a página é aberta.
   */
  validate?: { selector?: string; route?: string; minLength?: number };
  /** Passo ignorado automaticamente se este seletor não existir na tela. */
  requires?: string;
  /** Tempo estimado do passo, em segundos (padrão 20s). */
  seconds?: number;
};

export type TutorialCategory =
  | "Primeiros passos"
  | "Alunos"
  | "Rotina"
  | "Financeiro"
  | "Graduações"
  | "Ensino & Avaliações"
  | "Competições"
  | "App do aluno"
  | "Comercial"
  | "Configurações";

export type TutorialTrack = {
  id: string;
  title: string;
  /** A "dúvida" como o dono a formularia. */
  question: string;
  category: TutorialCategory;
  /** Legado: o tempo exibido é calculado pelos `seconds` dos passos. */
  duration?: string;
  route: string;
  steps: TutorialStep[];
  /** Trilha criada pelo administrador no editor interno. */
  custom?: boolean;
};

export const TUTORIAL_CATEGORIES: TutorialCategory[] = [
  "Primeiros passos",
  "Alunos",
  "Rotina",
  "Financeiro",
  "Graduações",
  "Ensino & Avaliações",
  "Competições",
  "App do aluno",
  "Comercial",
  "Configurações",
];

const FINANCE_PIN_HINT = "Se o Financeiro pedir um PIN, digite-o para liberar a tela.";

const BASE_TRACKS: TutorialTrack[] = [
  // ───────────────────────── Primeiros passos ─────────────────────────
  {
    id: "configurar-academia",
    title: "Configurar os dados da academia",
    question: "Como coloco o nome, a logo e os dados do meu dojo?",
    category: "Primeiros passos",
    route: "/dojo/app/account",
    steps: [
      {
        title: "Minha conta",
        text: "Aqui ficam os seus dados e os dados da academia, separados em abas.",
        seconds: 10,
      },
      {
        title: "Aba Academia",
        text: "Clique na aba “Academia”.",
        target: "text:Academia",
        action: "click",
        seconds: 10,
      },
      {
        title: "Dados da academia",
        text: "Preencha razão social, nome fantasia, CPF ou CNPJ e o contato.",
        hint: "Digite o CEP e saia do campo: o endereço é preenchido sozinho.",
        objective: "Esses dados aparecem nos contratos, recibos e no app do aluno.",
        seconds: 60,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar academia”.",
        target: "text:Salvar academia",
        action: "create",
        seconds: 10,
      },
      {
        title: "Logo",
        text: "Agora clique na aba “Identidade Visual”.",
        target: "text:Identidade Visual",
        action: "click",
        seconds: 10,
      },
      {
        title: "Enviar a logo",
        text: "Clique em “Enviar logo” e escolha a imagem.",
        hint: "PNG com fundo transparente fica melhor. Em “Onde utilizar a logomarca” você escolhe onde ela aparece.",
        target: "text:logo",
        seconds: 30,
      },
      {
        title: "Salvar a identidade",
        text: "Clique em “Salvar identidade visual” para aplicar a logo.",
        target: "text:Salvar identidade visual",
        action: "create",
        seconds: 10,
      },
    ],
  },
  {
    id: "criar-unidade",
    title: "Criar a primeira unidade",
    question: "Como cadastro minha unidade (ou uma nova filial)?",
    category: "Primeiros passos",
    route: "/dojo/app/units",
    steps: [
      {
        title: "Unidades e Filiais",
        text: "Aqui você cadastra os endereços onde a academia funciona.",
        seconds: 10,
      },
      {
        title: "Nova unidade",
        text: "Clique em “Nova unidade”.",
        target: "text:Nova unidade",
        action: "click",
        seconds: 10,
      },
      {
        title: "Dados da unidade",
        text: "Dê um nome à unidade e preencha o endereço e o contato.",
        hint: "Só “Nome (interno)” é para você; o “Nome fantasia” é o que o aluno vê.",
        seconds: 60,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar”.",
        target: "text:Salvar",
        action: "create",
        seconds: 10,
      },
      {
        title: "Pronto",
        text: "A unidade já pode ser escolhida nas turmas, no cadastro de alunos e nos planos.",
        seconds: 10,
      },
    ],
  },
  {
    id: "criar-faixas",
    title: "Configurar modalidades e faixas",
    question: "Como configuro as faixas e modalidades do meu dojo?",
    category: "Primeiros passos",
    route: "/dojo/app/belts",
    steps: [
      {
        title: "Modalidades e Faixas",
        text: "Cada modalidade tem a sua régua de faixas.",
        hint: "As faixas marcadas como “global AMT” já vêm prontas e não podem ser editadas; as que você criar ficam só para o seu dojo.",
        seconds: 15,
      },
      {
        title: "Escolha a modalidade",
        text: "Clique na modalidade que quer configurar (ex.: Jiu-Jitsu).",
        hint: "Não achou a sua? Digite o nome em “Nova modalidade” e clique em “Criar modalidade e faixa”.",
        seconds: 15,
      },
      {
        title: "Nova faixa",
        text: "Clique em “Nova faixa”.",
        target: "text:Nova faixa",
        action: "click",
        seconds: 10,
      },
      {
        title: "Dados da faixa",
        text: "Preencha nome, cor, ordem e o máximo de graus.",
        hint: "A ordem define a sequência de progressão. No Judô, o máximo de graus vale como Dans.",
        seconds: 40,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar”. Repita para as outras faixas.",
        target: "text:Salvar",
        action: "create",
        seconds: 10,
      },
    ],
  },
  {
    id: "criar-planos",
    title: "Criar planos de mensalidade",
    question: "Como cadastro os planos e valores das mensalidades?",
    category: "Primeiros passos",
    route: "/dojo/app/plans",
    steps: [
      {
        title: "Planos",
        text: "Plano é o modelo de mensalidade que você escolhe ao matricular o aluno.",
        seconds: 10,
      },
      {
        title: "Novo plano",
        text: "Clique em “Novo Plano”.",
        target: "text:Novo plano",
        action: "click",
        seconds: 10,
      },
      {
        title: "Informações gerais",
        text: "Dê um nome, informe o valor mensal e escolha a frequência (mensal, trimestral…).",
        hint: "Ex.: “Mensal Jiu-Jitsu”. A taxa de matrícula é opcional.",
        seconds: 40,
      },
      {
        title: "Formas de pagamento",
        text: "Em “Formas de Pagamento Aceitas”, ative pelo menos uma forma.",
        hint: "Sem nenhuma forma ativa o plano não é salvo.",
        seconds: 30,
      },
      {
        title: "Regras",
        text: "Se quiser, ajuste as regras: bloqueio por atraso e antecedência da cobrança.",
        hint: "O dia de vencimento é escolhido em cada aluno, na matrícula.",
        seconds: 20,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar”, no topo do plano.",
        target: "text:Salvar",
        action: "create",
        seconds: 10,
      },
    ],
  },
  {
    id: "convidar-equipe",
    title: "Dar acesso a professores e equipe",
    question: "Como dou acesso ao sistema para meus professores?",
    category: "Primeiros passos",
    route: "/dojo/app/team",
    steps: [
      {
        title: "Equipe",
        text: "Primeiro você cadastra a pessoa na Equipe; depois cria o login dela.",
        seconds: 10,
      },
      {
        title: "Novo colaborador",
        text: "Clique em “Novo Colaborador”.",
        target: "text:Novo colaborador",
        action: "click",
        seconds: 10,
      },
      {
        title: "Dados",
        text: "Preencha o nome completo e o e-mail.",
        hint: "O e-mail é obrigatório para criar o login depois.",
        action: "input",
        validate: { minLength: 3 },
        seconds: 40,
      },
      {
        title: "Cadastrar",
        text: "Clique em “Cadastrar colaborador”.",
        target: "text:Cadastrar colaborador",
        action: "create",
        seconds: 10,
      },
      {
        title: "Usuários do Sistema",
        text: "Agora vamos criar o login. Esta é a tela Usuários do Sistema.",
        route: "/dojo/app/system-users",
        seconds: 10,
      },
      {
        title: "Abrir o colaborador",
        text: "Clique no nome do colaborador para abrir o cartão dele.",
        seconds: 10,
      },
      {
        title: "Criar login",
        text: "Clique em “Criar login” e defina uma senha para ele.",
        hint: "Ele entra no painel com o e-mail cadastrado e essa senha.",
        target: "text:Criar login",
        action: "click",
        seconds: 30,
      },
      {
        title: "Permissões",
        text: "Marque os módulos que ele pode ver.",
        hint: "Ex.: professor vê Alunos e Check-in, mas não o Financeiro.",
        seconds: 30,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar permissões”.",
        target: "text:Salvar permissões",
        action: "create",
        seconds: 10,
      },
    ],
  },

  // ───────────────────────────── Alunos ─────────────────────────────
  {
    id: "cadastrar-aluno",
    title: "Cadastrar um novo aluno",
    question: "Como cadastro um novo aluno?",
    category: "Alunos",
    route: "/dojo/app/students",
    steps: [
      {
        title: "Lista de alunos",
        text: "Aqui ficam todos os alunos, com busca, filtros e a situação de cada um.",
        hint: "Antes de começar, tenha pelo menos um plano criado em Financeiro › Planos.",
        seconds: 10,
      },
      {
        title: "Novo aluno",
        text: "Clique em “Novo aluno”.",
        target: "[data-tour='novo-aluno']",
        action: "click",
        validate: { selector: "[data-tour='student-dialog']" },
        seconds: 10,
      },
      {
        title: "Janela de cadastro",
        text: "O cadastro tem 9 etapas, listadas na lateral. Avance sempre pelo botão “Continuar”.",
        hint: "Se faltar algo obrigatório, o sistema avisa qual campo antes de avançar.",
        target: "[data-tour='student-dialog']",
        seconds: 15,
      },
      {
        title: "Etapa 1 · Dados",
        text: "Digite o nome completo do aluno.",
        hint: "Data de nascimento também é obrigatória. O CPF é opcional e se formata sozinho. Para menores, preencha o responsável.",
        target: "[data-tour='student-name']",
        action: "input",
        validate: { minLength: 3 },
        seconds: 40,
      },
      {
        title: "Continuar",
        text: "Clique em “Continuar”, no rodapé da janela.",
        target: "[data-tour='student-next']",
        action: "click",
        seconds: 10,
      },
      {
        title: "Etapa 2 · Endereço",
        text: "Digite o CEP: rua, bairro, cidade e estado são preenchidos sozinhos. Depois clique em “Continuar”.",
        target: "[data-tour='student-cep']",
        seconds: 25,
      },
      {
        title: "Etapa 3 · Contatos",
        text: "Informe o telefone ou o e-mail do aluno (pelo menos um) e clique em “Continuar”.",
        hint: "O e-mail é o login do aluno no app. Aqui também vai o contato de emergência.",
        target: "[data-tour='student-step-contato']",
        seconds: 30,
      },
      {
        title: "Etapa 4 · Dojo",
        text: "Escolha a unidade e clique em “Adicionar modalidade” para informar a modalidade e a faixa atual. Depois, “Continuar”.",
        hint: "Pelo menos uma modalidade com faixa é obrigatória.",
        target: "[data-tour='student-step-dojo']",
        seconds: 40,
      },
      {
        title: "Etapa 5 · Plano",
        text: "Escolha o plano do aluno na lista.",
        hint: "Confira também a data de início e o dia de vencimento (1 a 31).",
        target: "[data-tour='student-plan']",
        action: "select",
        seconds: 30,
      },
      {
        title: "Etapas 6 e 7 · Anamnese e Foto",
        text: "Clique em “Continuar” para passar pela ficha de saúde e pela foto.",
        hint: "As duas são opcionais, mas a foto é usada no check-in por reconhecimento facial.",
        target: "[data-tour='student-next']",
        seconds: 30,
      },
      {
        title: "Etapa 8 · Consentimentos",
        text: "Marque as autorizações de LGPD, biometria facial e o termo de responsabilidade.",
        hint: "Essas três são obrigatórias para concluir. O uso de imagem é opcional.",
        target: "[data-tour='student-step-consent']",
        seconds: 30,
      },
      {
        title: "Etapa 9 · Contrato",
        text: "Clique em “Continuar” e escolha o modelo de contrato, ou “Não gerar contrato agora”.",
        target: "[data-tour='student-step-contrato']",
        seconds: 20,
      },
      {
        title: "Concluir",
        text: "Clique em “Cadastrar aluno”.",
        target: "[data-tour='student-save']",
        action: "create",
        seconds: 10,
      },
      {
        title: "Pronto!",
        text: "O aluno aparece na lista, já matriculado no plano e com a 1ª mensalidade gerada.",
        seconds: 10,
      },
    ],
  },
  {
    id: "matricular-plano",
    title: "Matricular um aluno em um plano",
    question: "Como coloco um aluno já cadastrado em um plano?",
    category: "Alunos",
    route: "/dojo/app/students",
    steps: [
      {
        title: "Encontre o aluno",
        text: "Use a busca para achar o aluno na lista.",
        seconds: 15,
      },
      {
        title: "Abrir a ficha",
        text: "Clique em “Abrir”, na linha do aluno.",
        target: "text:Abrir",
        action: "navigate",
        validate: { route: "/dojo/app/students/" },
        seconds: 10,
      },
      {
        title: "Aba Plano",
        text: "Na ficha, clique na aba “Plano”.",
        target: "text:Plano",
        action: "click",
        seconds: 10,
      },
      {
        title: "Matrícula",
        text: "Escolha o plano, o dia de vencimento e a data de início.",
        hint: "Se o aluno já tem plano, use “Trocar de plano”, logo abaixo.",
        seconds: 30,
      },
      {
        title: "Criar matrícula",
        text: "Clique em “Criar matrícula”.",
        target: "text:Criar matrícula",
        action: "create",
        seconds: 10,
      },
      {
        title: "Pronto",
        text: "As mensalidades passam a ser geradas sozinhas. Você as acompanha em Financeiro › Contas a receber.",
        seconds: 10,
      },
    ],
  },
  {
    id: "auto-matricula",
    title: "Link público de auto-matrícula",
    question: "Como deixo o próprio aluno se matricular pelo celular?",
    category: "Alunos",
    route: "/dojo/app/students",
    steps: [
      {
        title: "Página de matrícula",
        text: "Clique em “Página de matrícula”, no topo da lista de alunos.",
        target: "text:Página de matrícula",
        action: "click",
        seconds: 10,
      },
      {
        title: "Copie o link",
        text: "Copie o link da sua academia (ícone de copiar) ou clique em “Abrir” para ver como fica.",
        hint: "Se o link não aparecer, preencha os dados em Minha conta › Academia.",
        seconds: 20,
      },
      {
        title: "Divulgue",
        text: "Envie o link por WhatsApp, coloque na bio do Instagram ou num QR na recepção.",
        seconds: 10,
      },
      {
        title: "Como funciona",
        text: "O aluno preenche os dados, escolhe o plano e já recebe a cobrança da 1ª mensalidade.",
        hint: "Você recebe um aviso e o aluno aparece na lista de alunos.",
        seconds: 15,
      },
    ],
  },
  {
    id: "inativar-aluno",
    title: "Congelar ou cancelar a matrícula",
    question: "Como removo um aluno que saiu da academia?",
    category: "Alunos",
    route: "/dojo/app/students",
    steps: [
      {
        title: "Encontre o aluno",
        text: "Use a busca para achar o aluno na lista.",
        seconds: 15,
      },
      {
        title: "Abrir a ficha",
        text: "Clique em “Abrir”, na linha do aluno.",
        target: "text:Abrir",
        action: "navigate",
        validate: { route: "/dojo/app/students/" },
        seconds: 10,
      },
      {
        title: "Cancelar matrícula",
        text: "Clique em “Cancelar matrícula”.",
        target: "text:Cancelar matrícula",
        action: "click",
        seconds: 10,
      },
      {
        title: "Congelar ou cancelar?",
        text: "Escolha “Congelar matrícula” para pausar, ou “Cancelar definitivamente” para encerrar.",
        hint: "Congelar pausa as cobranças e pode ser revertido. Cancelar definitivamente apaga todos os registros do aluno e não tem volta.",
        seconds: 30,
      },
      {
        title: "Confirmar",
        text: "Clique no botão de confirmação, no rodapé da janela.",
        hint: "Na dúvida, prefira congelar: depois é só usar “Reativar matrícula”.",
        seconds: 10,
      },
    ],
  },

  // ───────────────────────────── Rotina ─────────────────────────────
  {
    id: "criar-turma",
    title: "Criar uma turma",
    question: "Como crio uma turma e coloco na agenda?",
    category: "Rotina",
    route: "/dojo/app/classes",
    steps: [
      {
        title: "Turmas",
        text: "Toda turma criada aqui aparece sozinha na Agenda.",
        seconds: 10,
      },
      {
        title: "Nova turma",
        text: "Clique em “Nova turma”.",
        target: "text:Nova turma",
        action: "click",
        seconds: 10,
      },
      {
        title: "Informações gerais",
        text: "Digite o nome da turma e escolha a modalidade.",
        hint: "Nível, status, limite de alunos e cor são opcionais.",
        action: "input",
        validate: { minLength: 3 },
        seconds: 30,
      },
      {
        title: "Local e professor",
        text: "Escolha a unidade e o professor principal.",
        hint: "Só aparecem professores cadastrados em Pessoas › Equipe.",
        seconds: 20,
      },
      {
        title: "Horários",
        text: "Em “Adicionar horário”, clique no dia da semana e informe o início e o fim.",
        hint: "Pode adicionar vários dias e mais de um horário no mesmo dia.",
        seconds: 40,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar turma”.",
        target: "text:Salvar turma",
        action: "create",
        seconds: 10,
      },
      {
        title: "Veja na Agenda",
        text: "Pronto: a turma já aparece nos dias e horários da Agenda.",
        route: "/dojo/app/schedule",
        seconds: 10,
      },
    ],
  },
  {
    id: "usar-agenda",
    title: "Usar a agenda",
    question: "Como acompanho os horários da semana?",
    category: "Rotina",
    route: "/dojo/app/schedule",
    steps: [
      {
        title: "Agenda",
        text: "A agenda mostra todas as aulas das turmas cadastradas.",
        seconds: 10,
      },
      {
        title: "Visualização",
        text: "Alterne entre “Dia”, “Semana” e “Mês”. Use as setas e “Hoje” para navegar.",
        target: "text:Semana",
        seconds: 15,
      },
      {
        title: "Filtros",
        text: "Filtre por modalidade, espaço, unidade, status ou professor.",
        hint: "No celular, toque em “Filtros” para mostrar as opções.",
        seconds: 15,
      },
      {
        title: "Detalhes da aula",
        text: "Clique em uma aula para ver horários, alunos e ações.",
        hint: "No painel da aula, “Editar” muda a turma (a alteração vale também em Turmas).",
        seconds: 20,
      },
    ],
  },
  {
    id: "checkin-qr",
    title: "Configurar o check-in",
    question: "Como funciona o check-in dos alunos?",
    category: "Rotina",
    route: "/dojo/app/checkin",
    steps: [
      {
        title: "Check-in",
        text: "O check-in registra a presença e alimenta o ranking e a graduação por aulas.",
        seconds: 10,
      },
      {
        title: "Configurações",
        text: "Clique na aba “Configurações”.",
        target: "text:Configurações",
        action: "click",
        seconds: 10,
      },
      {
        title: "Formas de check-in",
        text: "Ative as formas que quer usar: GPS pelo app, QR fixo na parede, PIN ou QR pessoal no kiosk, ou foto.",
        seconds: 30,
      },
      {
        title: "QR fixo",
        text: "Com o QR fixo ativo, clique em “Gerar QR” na unidade e depois em “Imprimir”.",
        hint: "Cole o QR na entrada. O aluno escaneia pelo app e a presença é registrada.",
        seconds: 30,
      },
      {
        title: "Localização (opcional)",
        text: "Em “Validação por localização (GPS)”, defina o raio permitido em metros.",
        hint: "Abra esta tela na academia e use a localização atual para mais precisão. O padrão é 50 m.",
        seconds: 30,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar”, no fim da página.",
        target: "text:Salvar",
        action: "create",
        seconds: 10,
      },
    ],
  },
  {
    id: "quadro-avisos",
    title: "Publicar um aviso para os alunos",
    question: "Como envio um recado para todos os alunos?",
    category: "Rotina",
    route: "/dojo/app/announcements",
    steps: [
      {
        title: "Quadro de Avisos",
        text: "Os avisos aparecem no app do aluno.",
        seconds: 10,
      },
      {
        title: "Novo aviso",
        text: "Clique em “Novo aviso”.",
        target: "text:Novo aviso",
        action: "click",
        seconds: 10,
      },
      {
        title: "Texto",
        text: "Preencha o título e o conteúdo.",
        action: "input",
        validate: { minLength: 3 },
        seconds: 40,
      },
      {
        title: "Público-alvo",
        text: "Em “Público-alvo”, escolha todos os alunos ou filtre por turma, filial ou graduação.",
        seconds: 20,
      },
      {
        title: "Notificação",
        text: "Deixe “Enviar notificação” ligado para os alunos receberem o aviso no celular.",
        seconds: 10,
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

  // ─────────────────────────── Financeiro ───────────────────────────
  {
    id: "cobranca-avulsa",
    title: "Cobrar algo que não é mensalidade",
    question: "Como cobro algo que não é mensalidade (kimono, exame de faixa)?",
    category: "Financeiro",
    route: "/dojo/app/sales",
    steps: [
      {
        title: "Vendas avulsas",
        text: "Aqui você registra cobranças únicas, separadas das mensalidades.",
        hint: "Cadastre seus itens na aba “Produtos & Serviços” para escolher mais rápido.",
        seconds: 10,
      },
      {
        title: "Nova venda",
        text: "Clique em “Nova venda”.",
        target: "text:Nova venda",
        action: "click",
        seconds: 10,
      },
      {
        title: "Cliente e itens",
        text: "Escolha o aluno e adicione o item (do catálogo ou digitando a descrição e o preço).",
        seconds: 40,
      },
      {
        title: "Pagamento",
        text: "Escolha a forma de pagamento e o vencimento.",
        hint: "Dinheiro e PIX manual já entram como pagos.",
        seconds: 20,
      },
      {
        title: "Registrar",
        text: "Clique em “Registrar venda”.",
        target: "text:Registrar venda",
        action: "create",
        seconds: 10,
      },
      {
        title: "Pronto",
        text: "A venda entra em Financeiro › Contas a receber. Mensalidades continuam saindo dos Planos.",
        seconds: 10,
      },
    ],
  },
  {
    id: "baixar-pagamento",
    title: "Dar baixa em um pagamento",
    question: "Como marco uma mensalidade como paga?",
    category: "Financeiro",
    route: "/dojo/app/finance",
    steps: [
      {
        title: "Financeiro",
        text: "Aqui ficam as contas a receber e a pagar.",
        hint: FINANCE_PIN_HINT,
        seconds: 10,
      },
      {
        title: "Contas a receber",
        text: "Clique em “Contas a receber”.",
        target: "text:Contas a receber",
        action: "click",
        seconds: 10,
      },
      {
        title: "Encontre a cobrança",
        text: "Busque pelo nome do aluno, descrição ou valor.",
        seconds: 20,
      },
      {
        title: "Receber",
        text: "Na linha da cobrança, clique em “Receber”.",
        target: "text:Receber",
        action: "click",
        seconds: 10,
      },
      {
        title: "Dados do pagamento",
        text: "Informe a data e a forma de pagamento.",
        hint: "Pagamentos feitos pelo AMT Pay são baixados sozinhos.",
        seconds: 20,
      },
      {
        title: "Confirmar",
        text: "Clique em “Confirmar recebimento”.",
        target: "text:Confirmar recebimento",
        action: "create",
        seconds: 10,
      },
    ],
  },
  {
    id: "inadimplencia",
    title: "Controlar a inadimplência",
    question: "Como vejo quem está devendo?",
    category: "Financeiro",
    route: "/dojo/app/finance",
    steps: [
      {
        title: "Contas a receber",
        text: "Clique em “Contas a receber”.",
        hint: FINANCE_PIN_HINT,
        target: "text:Contas a receber",
        action: "click",
        seconds: 10,
      },
      {
        title: "Vencidas",
        text: "Clique na aba “Vencidas”: são as cobranças em atraso.",
        target: "text:Vencidas",
        action: "click",
        seconds: 10,
      },
      {
        title: "Cobrar o aluno",
        text: "Use o botão de compartilhar da cobrança para enviar por WhatsApp, e-mail ou copiar o link.",
        hint: "Recebeu por fora? Clique em “Receber” para dar baixa.",
        seconds: 20,
      },
      {
        title: "Lembretes automáticos",
        text: "Para avisar o aluno sozinho, configure os lembretes de cobrança.",
        route: "/dojo/app/student-notifications-config",
        seconds: 10,
      },
      {
        title: "Cobrança vencida",
        text: "Ligue “Cobrança vencida” e adicione os dias de atraso em que o aluno será avisado.",
        target: "[data-tour='notif-overdue']",
        seconds: 20,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar preferências”.",
        target: "text:Salvar preferências",
        action: "create",
        seconds: 10,
      },
    ],
  },
  {
    id: "amt-pay",
    title: "Ativar o AMT Pay",
    question: "Como recebo pagamentos online (Pix, boleto e cartão)?",
    category: "Financeiro",
    route: "/dojo/app/integrations",
    steps: [
      {
        title: "AMT Pay",
        text: "Com o AMT Pay o aluno paga por PIX, boleto ou cartão, e a baixa é automática.",
        hint: "É opcional: sem ele você continua dando baixa manual no Financeiro.",
        seconds: 15,
      },
      {
        title: "Ativar",
        text: "Clique em “Ativar AMT Pay”.",
        hint: "Se o AMT Pay já estiver ativo, você verá direto o painel com as abas.",
        target: "text:Ativar AMT Pay",
        action: "click",
        seconds: 10,
      },
      {
        title: "Dados",
        text: "Preencha os dados do responsável, da academia e o endereço.",
        seconds: 90,
      },
      {
        title: "Recebimentos",
        text: "Informe a chave PIX onde quer receber o dinheiro.",
        seconds: 20,
      },
      {
        title: "Documentos e termos",
        text: "Envie os documentos pedidos e aceite os termos.",
        hint: "A taxa da AMT aparece nos termos antes de você aceitar.",
        seconds: 60,
      },
      {
        title: "Concluir",
        text: "Clique em “Concluir ativação do AMT Pay”.",
        target: "text:Concluir ativação do AMT Pay",
        action: "create",
        seconds: 10,
      },
      {
        title: "Depois de ativo",
        text: "Acompanhe o saldo em “Carteira” e peça transferências na aba “Saques”, em “Solicitar saque”.",
        seconds: 15,
      },
    ],
  },

  // ────────────────────────── Graduações ──────────────────────────
  {
    id: "criterios-graduacao",
    title: "Definir critérios de graduação",
    question: "Como configuro o tempo e as aulas necessárias para graduar?",
    category: "Graduações",
    route: "/dojo/app/belts",
    steps: [
      {
        title: "Onde ficam",
        text: "O critério para a próxima graduação fica em cada faixa.",
        seconds: 10,
      },
      {
        title: "Abrir a faixa",
        text: "Clique no lápis (Editar) da faixa, ou em “Nova faixa”.",
        hint: "Faixas “global AMT” não podem ser editadas — crie a sua própria.",
        seconds: 15,
      },
      {
        title: "Modo",
        text: "Em “Critério para próxima graduação”, escolha o Modo.",
        hint: "Tempo mínimo, mínimo de aulas (check-ins), mediante avaliação ou mérito (decisão do instrutor).",
        seconds: 20,
      },
      {
        title: "Mínimos",
        text: "Preencha os meses mínimos e/ou as aulas mínimas.",
        seconds: 20,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar”.",
        hint: "Na ficha do aluno dá para mudar o critério só para ele.",
        target: "text:Salvar",
        action: "create",
        seconds: 10,
      },
      {
        title: "Acompanhar",
        text: "Em Graduações, cada aluno mostra o progresso em relação ao critério da faixa.",
        route: "/dojo/app/graduations",
        seconds: 10,
      },
    ],
  },
  {
    id: "graduar-aluno",
    title: "Graduar um aluno",
    question: "Como registro a graduação de um aluno?",
    category: "Graduações",
    route: "/dojo/app/graduations",
    steps: [
      {
        title: "Etapa 1 · Alunos",
        text: "Marque os alunos que serão graduados.",
        hint: "Use a busca e os filtros para achar o aluno.",
        seconds: 30,
      },
      {
        title: "Continuar",
        text: "Clique em “Continuar”.",
        target: "text:Continuar",
        action: "click",
        seconds: 10,
      },
      {
        title: "Etapa 2 · Graduação",
        text: "Escolha a nova faixa e o grau, e preencha data, avaliador e observações.",
        seconds: 40,
      },
      {
        title: "Pagamento",
        text: "Clique em “Próximo: pagamento”.",
        target: "text:Próximo: pagamento",
        action: "click",
        seconds: 10,
      },
      {
        title: "Etapa 3 · Pagamento",
        text: "Confira a taxa de graduação de cada aluno e clique em “Confirmar e emitir certificados”.",
        target: "text:Confirmar e emitir certificados",
        action: "create",
        seconds: 20,
      },
      {
        title: "Etapa 4 · Certificado",
        text: "Escolha o modelo e clique em “Emitir todos”.",
        hint: "A nova faixa já aparece no app do aluno.",
        target: "text:Emitir todos",
        action: "create",
        seconds: 20,
      },
    ],
  },
  {
    id: "emitir-certificado",
    title: "Emitir um certificado",
    question: "Como emito o certificado de faixa?",
    category: "Graduações",
    route: "/dojo/app/certificates",
    steps: [
      {
        title: "Certificados",
        text: "Aqui ficam os modelos de certificado e os que já foram emitidos.",
        seconds: 10,
      },
      {
        title: "Emitir",
        text: "Clique em “Emitir certificado”.",
        target: "text:Emitir certificado",
        action: "click",
        seconds: 10,
      },
      {
        title: "Modelo e alunos",
        text: "Escolha o modelo e marque os alunos.",
        seconds: 30,
      },
      {
        title: "Confirmar",
        text: "Clique em “Emitir” no rodapé da janela.",
        target: "text:Emitir",
        action: "create",
        seconds: 15,
      },
      {
        title: "Criar seu modelo",
        text: "Para criar um modelo, clique em “Novo modelo”: o editor abre em tela cheia.",
        hint: "No editor, use “Elementos” e “Variáveis” (nome, faixa, data), adicione a assinatura e clique em “Salvar”. O tutorial termina aqui.",
        seconds: 15,
      },
    ],
  },

  // ────────────────────────── App do aluno ──────────────────────────
  {
    id: "app-aluno-acesso",
    title: "Como o aluno acessa o app",
    question: "Como meu aluno entra no aplicativo?",
    category: "App do aluno",
    route: "/dojo/app/student-app-qr",
    steps: [
      {
        title: "Login do aluno",
        text: "O aluno entra com o e-mail cadastrado na ficha dele.",
        hint: "No primeiro acesso ele cria a própria senha.",
        seconds: 10,
      },
      {
        title: "Cartaz com QR",
        text: "Clique em “Imprimir cartaz” e deixe o QR visível na recepção.",
        hint: "Também dá para “Baixar PNG” ou “Copiar link” e enviar por WhatsApp.",
        target: "text:Imprimir cartaz",
        seconds: 15,
      },
      {
        title: "Ao escanear",
        text: "O aluno cai direto no login do app da sua academia — sem baixar nada.",
        seconds: 10,
      },
      {
        title: "Esqueceu a senha",
        text: "A academia gera um código no painel e o aluno usa esse código para criar uma senha nova.",
        seconds: 10,
      },
      {
        title: "Mais de um aluno",
        text: "Um mesmo e-mail pode ter vários alunos (ex.: pai e filho); o app mostra um seletor.",
        hint: "Alunos excluídos perdem o acesso automaticamente.",
        seconds: 10,
      },
    ],
  },
  {
    id: "notificacoes-push",
    title: "Configurar notificações automáticas",
    question: "Como aviso o aluno sobre aula e cobrança?",
    category: "App do aluno",
    route: "/dojo/app/student-notifications-config",
    steps: [
      {
        title: "Notificações do app",
        text: "Aqui você liga os avisos automáticos enviados ao celular do aluno.",
        hint: "Você chega aqui também por App do Aluno › QR do App.",
        seconds: 10,
      },
      {
        title: "Lembretes de aula",
        text: "Ligue “Lembretes de aula” e adicione quantos minutos antes avisar.",
        hint: "Digite o número e clique em “Add”. Pode ter vários horários.",
        target: "[data-tour='notif-class-reminder']",
        seconds: 20,
      },
      {
        title: "Cobrança a vencer",
        text: "Ligue “Cobrança a vencer” e adicione quantos dias antes do vencimento avisar.",
        target: "[data-tour='notif-due-soon']",
        seconds: 20,
      },
      {
        title: "Cobrança vencida",
        text: "Ligue “Cobrança vencida” e adicione os dias de atraso para reenviar o aviso.",
        target: "[data-tour='notif-overdue']",
        seconds: 20,
      },
      {
        title: "Salvar",
        text: "Clique em “Salvar preferências”.",
        hint: "O aluno também precisa permitir notificações no celular dele.",
        target: "text:Salvar preferências",
        action: "create",
        seconds: 10,
      },
    ],
  },

  // ─────────────────────────── Comercial ───────────────────────────
  {
    id: "amt-store",
    title: "Comprar produtos na AMT Store",
    question: "Como compro kimonos e produtos para revender aos alunos?",
    category: "Comercial",
    route: "/dojo/app/store",
    steps: [
      {
        title: "AMT Store",
        text: "Catálogo oficial da AMT com preço de parceiro.",
        seconds: 10,
      },
      {
        title: "Escolha os produtos",
        text: "Navegue pelas categorias e adicione os produtos ao carrinho.",
        seconds: 40,
      },
      {
        title: "Carrinho",
        text: "Clique em “Carrinho”, no topo da loja.",
        target: "a[href='/dojo/app/store/carrinho']",
        action: "click",
        seconds: 10,
      },
      {
        title: "Finalizar",
        text: "Confira os itens e finalize: o pagamento abre em uma nova janela.",
        hint: "Se nada abrir, libere pop-ups no navegador.",
        seconds: 30,
      },
      {
        title: "Pedidos",
        text: "Acompanhe o status no ícone de pedidos, no topo da loja.",
        target: "a[href='/dojo/app/store/pedidos']",
        seconds: 10,
      },
      {
        title: "Vender ao aluno",
        text: "Ao entregar ao aluno, registre a venda em Vendas avulsas.",
        route: "/dojo/app/sales",
        seconds: 10,
      },
    ],
  },
];

export const TUTORIAL_TRACKS: TutorialTrack[] = [...BASE_TRACKS, ...EXTRA_TRACKS];

/** Tempo estimado da trilha em minutos (usa `seconds` de cada passo). */
export function trackMinutes(track: TutorialTrack) {
  const secs = track.steps.reduce((acc, s) => acc + (s.seconds ?? 20), 0);
  return Math.max(1, Math.round(secs / 60));
}

/** Tempo restante estimado, em minutos, a partir de um passo. */
export function remainingMinutes(track: TutorialTrack, fromStep: number) {
  const secs = track.steps
    .slice(fromStep)
    .reduce((acc, s) => acc + (s.seconds ?? 20), 0);
  return Math.max(1, Math.round(secs / 60));
}

export function getTrack(id: string | null | undefined) {
  if (!id) return null;
  return TUTORIAL_TRACKS.find((t) => t.id === id) ?? null;
}

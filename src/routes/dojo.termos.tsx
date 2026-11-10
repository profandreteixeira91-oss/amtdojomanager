import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage } from "@/components/dojo/legal/LegalPage";
import { DOJO_LEGAL } from "@/lib/dojo/legal";
import { SAAS_PLAN_ORDER, SAAS_PLANS } from "@/lib/dojo/saas-plans";
import { dojoPageHead } from "@/lib/dojo/seo";

export const Route = createFileRoute("/dojo/termos")({
  head: () =>
    dojoPageHead({
      title: "Termos de Uso | AMT Dojo Manager",
      description: "Condições de uso do AMT Dojo Manager: conta da academia, teste grátis, planos, cobrança, cancelamento, AMT Pay e responsabilidades.",
      path: "/dojo/termos",
      breadcrumb: [
        { name: "AMT Dojo Manager", path: "/dojo" },
        { name: "Termos de Uso", path: "/dojo/termos" },
      ],
    }),
  component: TermsPage,
});

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function TermsPage() {
  const { operator, email } = DOJO_LEGAL;
  return (
    <LegalPage title="Termos de Uso" updated={DOJO_LEGAL.updated}>
      <p>
        Estes Termos regem o uso do <strong>AMT Dojo Manager</strong>, sistema de gestão para academias de artes marciais
        oferecido pela <strong>{operator}</strong>. Ao criar uma conta ou usar o sistema, a academia (por meio de quem a
        representa) concorda com estes Termos e com a <Link to="/dojo/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. O serviço</h2>
      <p>
        O AMT Dojo Manager reúne, conforme o plano contratado, cadastro de alunos e matrículas, agenda e turmas, check-in,
        financeiro, cobranças pelo AMT Pay, modalidades, faixas e graduações, certificados, avaliações, competições,
        contratos, equipe, WhatsApp da academia, unidades e o App do Aluno. Os recursos de cada plano estão descritos em{" "}
        <Link to="/dojo/planos">Planos e preços</Link>.
      </p>

      <h2>2. Conta e acesso</h2>
      <ul>
        <li>A conta é da academia. Quem a cria declara ter poderes para representá-la e ser maior de 18 anos.</li>
        <li>A academia é responsável pelos acessos que libera à equipe e aos alunos e por manter as senhas em sigilo.</li>
        <li>As informações cadastradas devem ser verdadeiras e mantidas atualizadas.</li>
      </ul>

      <h2>3. Teste grátis</h2>
      <p>
        Toda conta nova pode testar o plano escolhido por 14 dias, sem cartão de crédito. Durante o teste valem os recursos e
        limites desse plano. Ao fim do teste, para continuar usando o sistema, é preciso assinar um plano.
      </p>

      <h2>4. Planos, preços e cobrança</h2>
      <ul>
        <li>
          Planos mensais:{" "}
          {SAAS_PLAN_ORDER.map((code, index) => (
            <span key={code}>
              {index ? (index === SAAS_PLAN_ORDER.length - 1 ? " e " : ", ") : ""}
              {SAAS_PLANS[code].name} ({brl(SAAS_PLANS[code].price)}/mês)
            </span>
          ))}
          . Os limites de alunos ativos, unidades e usuários de cada plano são aplicados pelo sistema.
        </li>
        <li>A assinatura é cobrada por mês, por Pix ou cartão de crédito, pelo meio de pagamento escolhido no painel.</li>
        <li>A academia pode trocar de plano pelo painel. Se os dados atuais passarem do limite do plano novo, a troca pode exigir ajustes antes.</li>
        <li>Mudanças de preço são avisadas com antecedência pelo painel ou por e-mail e valem a partir da cobrança seguinte.</li>
        <li>Sem pagamento, o acesso ao painel pode ser suspenso até a regularização. Os dados não são apagados por isso.</li>
      </ul>

      <h2>5. Cancelamento</h2>
      <p>
        Não há fidelidade nem multa. A academia pode cancelar a assinatura a qualquer momento pelo painel. Para excluir a conta
        e os dados, basta pedir pelo e-mail <a href={`mailto:${email}`}>{email}</a>; antes disso, a academia pode solicitar uma
        cópia dos seus dados.
      </p>

      <h2>6. AMT Pay e cobrança dos alunos</h2>
      <p>
        O AMT Pay permite à academia cobrar mensalidades e vendas dos alunos por Pix, boleto e cartão, por meio de
        instituição de pagamento parceira. As tarifas aplicáveis são informadas no painel antes da ativação. A relação de
        cobrança é entre a academia e seus alunos; a academia responde pelos valores, prazos e condições que definir.
      </p>

      <h2>7. Responsabilidades da academia</h2>
      <ul>
        <li>
          Os dados de alunos, responsáveis e equipe são da academia, que decide como usá-los e é a controladora desses dados
          na LGPD. Cabe a ela informar os alunos e obter, quando necessário, o consentimento dos responsáveis por menores de
          idade.
        </li>
        <li>Usar o sistema de acordo com a lei, sem enviar conteúdo ilícito, ofensivo ou mensagens não autorizadas pelo WhatsApp.</li>
        <li>Não tentar acessar dados de outras academias nem interferir no funcionamento do sistema.</li>
      </ul>

      <h2>8. Responsabilidades da {operator}</h2>
      <ul>
        <li>Manter o sistema funcionando e seguro, com cópias de segurança e controle de acesso por academia.</li>
        <li>Tratar os dados de alunos apenas para prestar o serviço, conforme as instruções da academia.</li>
        <li>Prestar suporte pelos canais informados no sistema.</li>
      </ul>
      <p>
        O sistema pode passar por manutenções e por falhas de serviços de terceiros (internet, nuvem, meios de pagamento,
        WhatsApp). Nesses casos, trabalhamos para restabelecer o acesso o quanto antes. A {operator} não responde por decisões
        da academia tomadas com base nos dados que ela mesma cadastrou nem por lucros cessantes.
      </p>

      <h2>9. Propriedade intelectual</h2>
      <p>
        O sistema, a marca AMT Dojo Manager e seus materiais pertencem à {operator}. A assinatura dá à academia o direito de uso
        do sistema enquanto estiver ativa, sem transferência de propriedade. O conteúdo e os dados cadastrados continuam
        sendo da academia.
      </p>

      <h2>10. Alterações destes Termos</h2>
      <p>
        Estes Termos podem ser atualizados. Mudanças relevantes são avisadas pelo painel ou por e-mail antes de valerem. Se a
        academia não concordar, pode cancelar a assinatura.
      </p>

      <h2>11. Lei aplicável e contato</h2>
      <p>
        Estes Termos seguem a legislação brasileira. Dúvidas: <a href={`mailto:${email}`}>{email}</a>.
      </p>
    </LegalPage>
  );
}

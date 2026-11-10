import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage } from "@/components/dojo/legal/LegalPage";
import { DOJO_LEGAL } from "@/lib/dojo/legal";
import { dojoPageHead } from "@/lib/dojo/seo";

export const Route = createFileRoute("/dojo/privacidade")({
  head: () =>
    dojoPageHead({
      title: "Política de Privacidade | AMT Dojo Manager",
      description: "Como o AMT Dojo Manager trata os dados das academias, dos alunos e da equipe, de acordo com a LGPD.",
      path: "/dojo/privacidade",
      breadcrumb: [
        { name: "AMT Dojo Manager", path: "/dojo" },
        { name: "Política de Privacidade", path: "/dojo/privacidade" },
      ],
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { operator, email, site } = DOJO_LEGAL;
  return (
    <LegalPage title="Política de Privacidade" updated={DOJO_LEGAL.updated}>
      <p>
        Esta Política explica como o <strong>AMT Dojo Manager</strong>, oferecido pela <strong>{operator}</strong> (
        <a href={site}>{site.replace("https://", "")}</a>), trata dados pessoais, de acordo com a Lei Geral de Proteção de
        Dados (Lei 13.709/2018, LGPD). Ela vale para o site, o painel da academia, o portal da equipe e o App do Aluno.
      </p>

      <h2>1. Quem decide sobre cada dado</h2>
      <ul>
        <li>
          <strong>Dados da academia e de quem cria a conta</strong> (nome, e-mail, telefone, CNPJ ou CPF, endereço e dados
          da assinatura): a {operator} é a <strong>controladora</strong>.
        </li>
        <li>
          <strong>Dados de alunos, responsáveis e equipe</strong> cadastrados pela academia: a academia é a{" "}
          <strong>controladora</strong> e a {operator} é a <strong>operadora</strong>, tratando esses dados apenas para
          prestar o serviço, conforme as instruções da academia.
        </li>
      </ul>

      <h2>2. Dados tratados</h2>
      <ul>
        <li><strong>Conta e assinatura:</strong> dados de cadastro da academia e do responsável, plano, pagamentos e notas.</li>
        <li>
          <strong>Alunos e responsáveis:</strong> nome, contato, data de nascimento, documento, endereço, foto, matrícula,
          turmas, presenças e check-ins, faixas e graduações, avaliações, certificados, competições, contratos e situação
          financeira, conforme a academia cadastrar.
        </li>
        <li><strong>Equipe:</strong> nome, contato, função, escalas e acessos.</li>
        <li><strong>Pagamentos:</strong> valores, vencimentos e status das cobranças. Dados de cartão são tratados pela instituição de pagamento, não ficam no Dojo Manager.</li>
        <li><strong>Uso e segurança:</strong> data e hora de acesso, endereço IP, navegador e registros de ações, para segurança e suporte.</li>
        <li><strong>Notificações:</strong> identificador do aparelho para enviar avisos (push), quando a pessoa permite.</li>
      </ul>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Prestar o serviço contratado: gestão de alunos, aulas, presença, graduações, financeiro e App do Aluno.</li>
        <li>Cobrar a assinatura da academia e, pelo AMT Pay, as mensalidades dos alunos, quando a academia usa esse recurso.</li>
        <li>Enviar avisos do sistema por e-mail, push e WhatsApp.</li>
        <li>Dar suporte, prevenir fraudes e manter a segurança.</li>
        <li>Cumprir obrigações legais, como as fiscais.</li>
      </ul>

      <h2>4. Bases legais</h2>
      <p>
        Execução de contrato (art. 7º, V), cumprimento de obrigação legal (art. 7º, II), legítimo interesse para segurança e
        melhoria do serviço (art. 7º, IX) e consentimento quando exigido, por exemplo para notificações no aparelho. Para dados
        de alunos, a base legal é definida pela academia, que é a controladora.
      </p>

      <h2>5. Menores de idade</h2>
      <p>
        Academias costumam ter alunos menores de idade. Os dados deles são cadastrados pela academia, que deve tratá-los no
        melhor interesse da criança e do adolescente e obter o consentimento de um dos pais ou responsável quando a lei
        exigir (art. 14 da LGPD).
      </p>

      <h2>6. Com quem compartilhamos</h2>
      <p>Não vendemos dados. Compartilhamos apenas com quem é necessário para o serviço funcionar:</p>
      <ul>
        <li>Infraestrutura em nuvem e banco de dados (Supabase e Cloudflare).</li>
        <li>Instituições de pagamento, para a assinatura e o AMT Pay (Mercado Pago e Asaas).</li>
        <li>Envio de e-mails (Resend) e de mensagens de WhatsApp.</li>
        <li>Autoridades, quando houver obrigação legal ou ordem judicial.</li>
      </ul>
      <p>Alguns desses fornecedores podem armazenar dados fora do Brasil, com as garantias previstas na LGPD.</p>

      <h2>7. Por quanto tempo guardamos</h2>
      <p>
        Enquanto a conta estiver ativa. Depois do cancelamento, a academia pode pedir a exclusão da conta e dos dados; mantemos
        apenas o que a lei obriga a guardar (por exemplo, registros de pagamento e de acesso) pelo prazo legal.
      </p>

      <h2>8. Segurança</h2>
      <p>
        Conexões criptografadas, separação dos dados de cada academia no banco, controle de acesso por perfil, cópias de
        segurança e registro das ações administrativas. Nenhum sistema é totalmente imune a incidentes; se houver um que
        possa causar risco relevante, avisaremos as academias afetadas e a ANPD, como manda a lei.
      </p>

      <h2>9. Direitos dos titulares</h2>
      <p>
        Você pode pedir confirmação, acesso, correção, portabilidade, anonimização ou exclusão dos seus dados e revogar
        consentimentos. Alunos, responsáveis e membros da equipe devem fazer o pedido primeiro à academia; nós ajudamos a
        academia a atendê-lo. Pedidos e dúvidas: <a href={`mailto:${email}`}>{email}</a>.
      </p>

      <h2>10. Cookies e armazenamento local</h2>
      <p>
        Usamos cookies e armazenamento do navegador necessários para manter a sessão, lembrar preferências e medir visitas
        (incluindo o Pixel da Meta).
      </p>

      <h2>11. Alterações</h2>
      <p>
        Esta Política pode ser atualizada. Mudanças relevantes são avisadas pelo painel ou por e-mail. Veja também os{" "}
        <Link to="/dojo/termos">Termos de Uso</Link>.
      </p>
    </LegalPage>
  );
}

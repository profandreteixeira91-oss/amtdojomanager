/**
 * Rótulos em português para valores gravados no banco em inglês (status, forma,
 * tipo). A tela nunca mostra o valor cru: usa `enumLabel(MAPA, valor)`.
 */

/** Rótulo do valor; cai no próprio valor só se ele for novo e ainda não tiver rótulo. */
export function enumLabel(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return "—";
  return map[value] ?? value;
}

/** Forma de pagamento de uma cobrança (`dojo_invoices.method`, sem padrão fixo no banco). */
export const INVOICE_METHOD_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  pix_direct: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  card: "Cartão",
  cartao: "Cartão",
  card_machine: "Cartão (maquininha)",
  boleto: "Boleto",
  transfer: "Transferência",
  bank_transfer: "Transferência",
  payment_link: "Link de pagamento",
  link: "Link de pagamento",
  wallet: "Carteira",
  other: "Outro",
  outros: "Outros",
};

/** Rótulo da forma de pagamento; "pix" e "PIX" caem no mesmo rótulo. */
export function invoiceMethodLabel(method: string | null | undefined): string {
  if (!method) return "Outros";
  return INVOICE_METHOD_LABEL[method.toLowerCase()] ?? method;
}

/** Forma de check-in (`dojo_attendance.method`). */
export const CHECKIN_METHOD_LABEL: Record<string, string> = {
  app: "App",
  qr: "QR Code",
  fixed_qr: "QR fixo",
  pin: "PIN",
  manual: "Manual",
  gps: "Localização",
  photo: "Foto",
};

/** Situação da aula na agenda (`dojo_class_occurrences.status`). */
export const OCCURRENCE_STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  done: "Realizada",
  completed: "Realizada",
};

/** Situação do atleta na competição (`academy_competition_athletes.status`). */
export const COMPETITION_ATHLETE_STATUS_LABEL: Record<string, string> = {
  interested: "Interessado",
  confirmed: "Confirmado",
  registered: "Inscrito",
  weigh_in: "Pesagem",
  competing: "Competindo",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

/** Validação de check-in de parceiro (Gympass/TotalPass). */
export const PARTNER_CHECKIN_STATUS_LABEL: Record<string, string> = {
  approved: "Aprovado",
  denied: "Negado",
  pending: "Pendente",
  error: "Erro",
};

/** Situação do lançamento no extrato do AMT Pay (`amtpay_tx_status`). */
export const WALLET_TX_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  available: "Disponível",
  blocked: "Bloqueado",
  reversed: "Estornado",
};

/** Forma do lançamento no extrato do AMT Pay (`amtpay_tx_method`). */
export const WALLET_TX_METHOD_LABEL: Record<string, string> = {
  pix: "PIX",
  card: "Cartão",
  boleto: "Boleto",
  link: "Link",
  cash: "Dinheiro",
  transfer: "Transferência",
  internal: "Interno",
  other: "Outro",
};

/** Tipo do registro de sincronização com benefícios corporativos. */
export const CORPORATE_SYNC_KIND_LABEL: Record<string, string> = {
  manual_sync: "Sincronização manual",
  auto_sync: "Sincronização automática",
  sync: "Sincronização",
  webhook: "Aviso do parceiro",
};

/** Situação do modelo de contrato (`dojo_contract_templates.status`). */
export const CONTRACT_TEMPLATE_STATUS_LABEL: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  review: "Em revisão",
  archived: "Arquivado",
};

/** Tipo do elemento no editor de certificados. */
export const CERTIFICATE_ELEMENT_LABEL: Record<string, string> = {
  text: "Texto",
  variable: "Campo variável",
  static: "Texto fixo",
  image: "Imagem",
  logo: "Logo",
  signature: "Assinatura",
  "signature-block": "Bloco de assinatura",
  rect: "Retângulo",
  circle: "Círculo",
  line: "Linha",
  qr: "QR Code",
  date: "Data",
};

/** Tipo do anexo de um vídeo. */
export const ATTACHMENT_KIND_LABEL: Record<string, string> = {
  pdf: "PDF",
  image: "Imagem",
  link: "Link",
  file: "Arquivo",
};

// Informações institucionais públicas do GuinCheck (fonte única para as páginas legais, o rodapé e o formulário).
// Só entram dados já autorizados para publicação. NÃO incluir CPF, telefone pessoal ou endereço residencial.

export const SITE_URL = "https://guincheck.com.br"
export const BRAND = "GuinCheck"
export const SUPPORT_EMAIL = "suporte@guincheck.com.br"

/** Identificação do aplicativo na Google Play (exigida na página de exclusão de conta). */
export const PLAY_APP = {
  name: "GuinCheck",
  developer: "Douglas Pallone Vasconcelos dos Santos",
  /** applicationId do app Android. */
  packageId: "com.ncc.checklistguincho",
} as const

/**
 * Responsável indicado para atendimento de questões de LGPD e dados empresariais informados pelo projeto.
 * A definição jurídica final dos papéis (controlador/operador) será feita na redação definitiva dos documentos;
 * por isso os rótulos aqui são neutros e não afirmam um papel legal.
 */
export const LGPD_CONTACT = {
  name: "Douglas Pallone Vasconcelos dos Santos",
  email: SUPPORT_EMAIL,
} as const

export const COMPANY = {
  legalName: "61.654.517 REBECA SANTANA DE OLIVEIRA",
  cnpj: "61.654.517/0001-99",
  city: "Santo André — SP, Brasil",
} as const

export const LEGAL_PATHS = {
  terms: "/termos",
  privacy: "/privacidade",
  accountDeletion: "/exclusao-de-conta",
} as const

/** Endereço público de leitura dos documentos vigentes (backend jurídico do GuinCheck). */
export const LEGAL_API_BASE_URL =
  process.env.NEXT_PUBLIC_LEGAL_API_BASE_URL || "https://us-central1-checklistguincho-doug.cloudfunctions.net"

/**
 * Backend das solicitações de privacidade originadas no site. VAZIO por padrão: enquanto não houver endpoint
 * público aprovado, a página de exclusão usa o caminho por e-mail e NÃO simula recebimento nem protocolo.
 */
export const PRIVACY_API_BASE_URL = process.env.NEXT_PUBLIC_PRIVACY_API_BASE_URL || ""

/** Chave pública (site key) do Cloudflare Turnstile. Vazia = sem Turnstile (a proteção fica só no servidor). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""

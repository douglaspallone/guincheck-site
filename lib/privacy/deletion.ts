// Cliente da solicitação pública de exclusão de conta (site institucional).
// Funções PURAS + fetch injetável (testadas em tests/deletion.test.ts). Sem React, sem armazenamento local, sem
// parâmetros de URL: nada do que o titular digita é guardado no navegador nem enviado a analytics.
//
// Contrato do backend: docs/contrato-exclusao-de-conta.md. O endpoint ainda não existe em produção; sem
// NEXT_PUBLIC_PRIVACY_API_BASE_URL a página usa o caminho por e-mail e não simula recebimento.

export const DELETION_REASONS = [
  { value: "no_longer_use", label: "Não utilizo mais o aplicativo" },
  { value: "found_other", label: "Encontrei outra solução" },
  { value: "price", label: "Preço da assinatura" },
  { value: "technical", label: "Dificuldades técnicas" },
  { value: "privacy", label: "Questões de privacidade" },
  { value: "other", label: "Outro motivo" },
  { value: "prefer_not", label: "Prefiro não informar" },
] as const
export type DeletionReason = (typeof DELETION_REASONS)[number]["value"]

export const EMAIL_MAX_LENGTH = 254
// Formato razoável (não tenta ser RFC completo): algo@dominio.tld, sem espaços, sem vírgulas/ponto e vírgula.
const EMAIL_PATTERN = /^[^\s@,;<>()[\]\\"]+@[^\s@,;<>()[\]\\"]+\.[^\s@,;<>()[\]\\"]{2,}$/
const PROTOCOL_PATTERN = /^[A-Za-z0-9-]{6,40}$/

export function validateEmail(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim()
  if (!value) return { ok: false, error: "Informe o e-mail cadastrado no GuinCheck." }
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(value) || value.includes("..")) {
    return { ok: false, error: "Esse e-mail parece estar incorreto. Confira se digitou algo como nome@exemplo.com.br." }
  }
  return { ok: true, value }
}

export type DeletionFormInput = {
  email: string
  reason: string
  confirmed: boolean
  turnstileToken?: string
  /** Exigir o token do Turnstile (quando a chave está configurada). */
  requireTurnstile?: boolean
}
export type DeletionFormErrors = { email?: string; confirmed?: string; turnstile?: string }

export function validateDeletionForm(input: DeletionFormInput): {
  ok: boolean
  errors: DeletionFormErrors
  value?: { email: string; reason: DeletionReason | null }
} {
  const errors: DeletionFormErrors = {}
  const email = validateEmail(input.email)
  if (!email.ok) errors.email = email.error
  if (!input.confirmed) errors.confirmed = "Marque a caixa para confirmar que deseja solicitar a exclusão."
  if (input.requireTurnstile && !input.turnstileToken) errors.turnstile = "Confirme que você não é um robô para continuar."
  if (Object.keys(errors).length > 0 || !email.ok) return { ok: false, errors }
  const reason = DELETION_REASONS.find((r) => r.value === input.reason)?.value ?? null
  return { ok: true, errors, value: { email: email.value, reason } }
}

/** E-mail pré-preenchido para o caminho alternativo. O envio é feito pelo próprio usuário no app de e-mail. */
export function buildDeletionMailto(supportEmail: string, email: string, reason: string): string {
  const reasonLabel = DELETION_REASONS.find((r) => r.value === reason)?.label
  const lines = [
    "Olá, equipe GuinCheck.",
    "",
    "Solicito a exclusão da minha conta GuinCheck e dos dados pessoais associados.",
    "",
    `E-mail cadastrado: ${email.trim() || "(informe aqui o e-mail da sua conta)"}`,
  ]
  if (reasonLabel && reason !== "prefer_not") lines.push(`Motivo (opcional): ${reasonLabel}`)
  lines.push("", "Estou ciente de que a exclusão poderá resultar na perda definitiva de acesso ao meu histórico.")
  return `mailto:${supportEmail}?subject=${encodeURIComponent("Solicitação de exclusão de conta GuinCheck")}&body=${encodeURIComponent(lines.join("\n"))}`
}

export const parseProtocol = (value: unknown): string | null =>
  typeof value === "string" && PROTOCOL_PATTERN.test(value) ? value : null

// ---------------------------------------------------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------------------------------------------------

export type SubmitResult =
  | { kind: "received"; protocol: string | null }
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "unavailable" }
  | { kind: "not_configured" }

export type ConfirmResult =
  | { kind: "confirmed" }
  | { kind: "expired" }
  | { kind: "invalid_token" }
  | { kind: "rate_limited" }
  | { kind: "unavailable" }
  | { kind: "not_configured" }

type NetOptions = { fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number }

async function postJson(baseUrl: string, path: string, body: unknown, options: NetOptions) {
  const doFetch = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true })
  try {
    const response = await doFetch(`${baseUrl.replace(/\/+$/, "")}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    })
    let json: Record<string, unknown> | null = null
    try {
      const parsed: unknown = await response.json()
      json = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
    } catch {
      json = null
    }
    return { status: response.status, ok: response.ok, json }
  } finally {
    clearTimeout(timer)
  }
}

export async function submitDeletionRequest(
  baseUrl: string,
  payload: { email: string; reason: DeletionReason | null; turnstileToken?: string; honeypot?: string; requestId: string },
  options: NetOptions = {},
): Promise<SubmitResult> {
  if (!baseUrl) return { kind: "not_configured" }
  try {
    const result = await postJson(
      baseUrl,
      "requestSiteAccountDeletion",
      {
        email: payload.email,
        reason: payload.reason,
        confirmed: true,
        turnstileToken: payload.turnstileToken || undefined,
        website: payload.honeypot || "",
        requestId: payload.requestId,
      },
      options,
    )
    if (result.status === 429) return { kind: "rate_limited" }
    // Nunca repassa texto do servidor à tela: uma mensagem específica poderia revelar se existe conta.
    if (result.status >= 400 && result.status < 500) return { kind: "invalid" }
    // Só vale como "recebida" a resposta de sucesso explícita do servidor (nunca presumir).
    if (!result.ok || result.json?.ok !== true) return { kind: "unavailable" }
    return { kind: "received", protocol: parseProtocol(result.json.protocol) }
  } catch {
    return { kind: "unavailable" }
  }
}

export async function confirmDeletionRequest(baseUrl: string, token: string, options: NetOptions = {}): Promise<ConfirmResult> {
  if (!baseUrl) return { kind: "not_configured" }
  try {
    const result = await postJson(baseUrl, "confirmSiteAccountDeletion", { token }, options)
    if (result.status === 429) return { kind: "rate_limited" }
    // 410 = prazo do link terminou (contrato). Demais 4xx = inválido ou já utilizado.
    if (result.status === 410) return { kind: "expired" }
    if (result.status >= 400 && result.status < 500) return { kind: "invalid_token" }
    if (!result.ok || result.json?.ok !== true) return { kind: "unavailable" }
    return { kind: "confirmed" }
  } catch {
    return { kind: "unavailable" }
  }
}

/** Token do e-mail de confirmação vem no fragmento (#t=...), que o navegador nunca envia ao servidor. */
export function readTokenFromHash(hash: string): string | null {
  const match = /^#t=([A-Za-z0-9_-]{20,200})$/.exec(hash)
  return match ? match[1] : null
}

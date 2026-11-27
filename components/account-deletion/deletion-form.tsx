"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Copy, Info, Loader2, Mail, MessageCircle, ShieldAlert } from "lucide-react"
import { Turnstile } from "@/components/account-deletion/turnstile"
import {
  buildDeletionMailto,
  DELETION_REASONS,
  submitDeletionRequest,
  validateDeletionForm,
  type DeletionFormErrors,
} from "@/lib/privacy/deletion"
import { PRIVACY_API_BASE_URL, SUPPORT_EMAIL, TURNSTILE_SITE_KEY } from "@/lib/institutional"
import { SUPPORT_WHATSAPP_URL } from "@/lib/links"

type Phase =
  | { name: "form" }
  | { name: "submitting" }
  | { name: "received"; protocol: string | null }
  | { name: "mail"; mailto: string }

type Failure = null | "rate_limited" | "unavailable" | "invalid"

const apiConfigured = Boolean(PRIVACY_API_BASE_URL)
const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY)

function newRequestId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
  }
}

export function DeletionForm() {
  const uid = useId()
  const ids = {
    email: `${uid}-email`,
    emailError: `${uid}-email-error`,
    reason: `${uid}-reason`,
    confirm: `${uid}-confirm`,
    confirmError: `${uid}-confirm-error`,
    turnstileError: `${uid}-turnstile-error`,
  }

  // Campos NÃO controlados: o que a pessoa digita antes de a página terminar de carregar (celular lento) não se
  // perde, e os valores só são lidos no envio. `saved` repõe os dados se o formulário for remontado (voltar).
  const saved = useRef({ email: "", reason: "", confirmed: false })
  const [hydrated, setHydrated] = useState(false)
  // Antes do JavaScript carregar, o botão fica desabilitado: um envio nativo poria o e-mail na URL.
  useEffect(() => setHydrated(true), [])
  const [token, setToken] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [errors, setErrors] = useState<DeletionFormErrors>({})
  const [failure, setFailure] = useState<Failure>(null)
  const [phase, setPhase] = useState<Phase>({ name: "form" })

  // Trava síncrona: impede duas requisições mesmo com cliques/Enter em sequência antes do re-render.
  const inFlight = useRef(false)
  // Mesma chave para as tentativas da mesma solicitação (o servidor trata repetição como a mesma solicitação).
  const requestId = useRef<string>("")
  const emailRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLSelectElement>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLHeadingElement>(null)

  const submitting = phase.name === "submitting"

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setFailure(null)

    const email = emailRef.current?.value ?? ""
    const reason = reasonRef.current?.value ?? ""
    const confirmed = confirmRef.current?.checked ?? false
    const honeypot = honeypotRef.current?.value ?? ""
    saved.current = { email, reason, confirmed }
    const check = validateDeletionForm({ email, reason, confirmed, turnstileToken: token ?? undefined, requireTurnstile: apiConfigured && turnstileEnabled })
    setErrors(check.errors)
    if (!check.ok || !check.value) {
      if (check.errors.email) emailRef.current?.focus()
      else if (check.errors.confirmed) confirmRef.current?.focus()
      return
    }

    // Caminho alternativo: sem backend aprovado NÃO se finge recebimento. O usuário envia o e-mail por conta própria.
    if (!apiConfigured) {
      setPhase({ name: "mail", mailto: buildDeletionMailto(SUPPORT_EMAIL, check.value.email, check.value.reason ?? "") })
      queueMicrotask(() => resultRef.current?.focus())
      return
    }

    inFlight.current = true
    setPhase({ name: "submitting" })
    requestId.current ||= newRequestId()
    try {
      const result = await submitDeletionRequest(PRIVACY_API_BASE_URL, {
        email: check.value.email,
        reason: check.value.reason,
        turnstileToken: token ?? undefined,
        honeypot,
        requestId: requestId.current,
      })
      if (result.kind === "received") {
        setPhase({ name: "received", protocol: result.protocol })
        queueMicrotask(() => resultRef.current?.focus())
        return
      }
      setFailure(result.kind === "rate_limited" ? "rate_limited" : result.kind === "invalid" ? "invalid" : "unavailable")
      setPhase({ name: "form" })
      setToken(null)
      setResetSignal((n) => n + 1)
    } finally {
      inFlight.current = false
    }
  }

  if (phase.name === "received") return <Received protocol={phase.protocol} headingRef={resultRef} />
  if (phase.name === "mail") return <MailFallback mailto={phase.mailto} headingRef={resultRef} onBack={() => setPhase({ name: "form" })} />

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting} className="space-y-8">
      {!apiConfigured && (
        <div role="note" className="flex gap-3 rounded-xl border border-border bg-muted/50 p-4">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold">Como funciona agora:</span> ao clicar em “Solicitar exclusão da conta”,
            abriremos o seu aplicativo de e-mail com a mensagem pronta. <span className="font-semibold">A solicitação só
            é feita depois que você enviar esse e-mail</span> para {SUPPORT_EMAIL}.
          </p>
        </div>
      )}

      {failure && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="space-y-2 text-sm leading-relaxed text-foreground">
              <p className="font-semibold">
                {failure === "rate_limited"
                  ? "Muitas tentativas em pouco tempo."
                  : failure === "invalid"
                    ? "Não conseguimos aceitar os dados informados."
                    : "Não conseguimos enviar sua solicitação agora."}
              </p>
              <p>
                {failure === "rate_limited"
                  ? "Aguarde alguns minutos e tente de novo."
                  : failure === "invalid"
                    ? "Confira o e-mail digitado e tente de novo."
                    : "Pode ser a sua conexão ou uma instabilidade nossa. Seus dados continuam preenchidos: toque no botão para tentar de novo."}
              </p>
              <p>
                Se preferir, fale com a gente:{" "}
                <a className="font-semibold text-primary underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
                ou{" "}
                <a className="font-semibold text-primary underline underline-offset-2" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* E-mail */}
      <div className="space-y-2">
        <label htmlFor={ids.email} className="block text-base font-semibold text-foreground">
          E-mail cadastrado no GuinCheck <span className="text-destructive" aria-hidden="true">*</span>
          <span className="sr-only"> (obrigatório)</span>
        </label>
        <input
          ref={emailRef}
          id={ids.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          defaultValue={saved.current.email}
          disabled={submitting}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? ids.emailError : undefined}
          className="h-14 w-full rounded-lg border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive disabled:opacity-60"
          placeholder="nome@exemplo.com.br"
        />
        {errors.email && (
          <p id={ids.emailError} className="flex items-start gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {errors.email}
          </p>
        )}
      </div>

      {/* Motivo (opcional) */}
      <div className="space-y-2">
        <label htmlFor={ids.reason} className="block text-base font-semibold text-foreground">
          Motivo da exclusão <span className="text-sm font-normal text-muted-foreground">(opcional)</span>
        </label>
        <select
          id={ids.reason}
          name="reason"
          ref={reasonRef}
          defaultValue={saved.current.reason}
          disabled={submitting}
          className="h-14 w-full rounded-lg border border-input bg-background px-4 text-base text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-60"
        >
          <option value="">Selecione, se quiser</option>
          {DELETION_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">Responder não é obrigatório e não muda o andamento da sua solicitação.</p>
      </div>

      {/* Avisos importantes */}
      <div className="space-y-3" role="group" aria-label="Informações importantes">
        <h2 className="text-lg font-semibold text-foreground">Informações importantes</h2>
        <Notice icon="alert">
          Antes de solicitar a exclusão, salve os checklists e PDFs que deseja conservar. A exclusão poderá resultar na perda definitiva de acesso ao seu histórico.
        </Notice>
        <Notice icon="alert">
          Se você possui uma assinatura ativa, verifique também o cancelamento no canal em que realizou a contratação. A exclusão da conta não substitui necessariamente esse procedimento.
        </Notice>
        <Notice icon="info">
          Determinadas informações poderão ser conservadas quando houver fundamento jurídico legítimo, conforme nossa{" "}
          <a href="/privacidade" className="font-semibold text-primary underline underline-offset-2">Política de Privacidade</a>.
        </Notice>
      </div>

      {/* Confirmação */}
      <div className="space-y-2">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
          <input
            ref={confirmRef}
            id={ids.confirm}
            name="confirmed"
            type="checkbox"
            defaultChecked={saved.current.confirmed}
            disabled={submitting}
            aria-invalid={errors.confirmed ? true : undefined}
            aria-describedby={errors.confirmed ? ids.confirmError : undefined}
            className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer accent-[oklch(0.25_0.06_255)]"
          />
          <label htmlFor={ids.confirm} className="cursor-pointer text-base leading-snug text-foreground">
            Confirmo que desejo solicitar a exclusão da minha conta e estou ciente das consequências.
          </label>
        </div>
        {errors.confirmed && (
          <p id={ids.confirmError} className="flex items-start gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {errors.confirmed}
          </p>
        )}
      </div>

      {/* Isca para robôs: invisível e fora da navegação por teclado. Preenchida = automação. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input ref={honeypotRef} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {apiConfigured && turnstileEnabled && (
        <div className="space-y-2">
          <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setToken} resetSignal={resetSignal} />
          {errors.turnstile && (
            <p id={ids.turnstileError} role="alert" className="text-sm font-medium text-destructive">{errors.turnstile}</p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !hydrated}
        aria-disabled={submitting || !hydrated}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-lg font-bold text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:min-w-80"
      >
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Enviando…
          </>
        ) : (
          "Solicitar exclusão da conta"
        )}
      </button>
      <p className="sr-only" role="status" aria-live="polite">{submitting ? "Enviando sua solicitação, aguarde." : ""}</p>
    </form>
  )
}

function Notice({ icon, children }: { icon: "alert" | "info"; children: React.ReactNode }) {
  const Icon = icon === "alert" ? ShieldAlert : Info
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-muted/50 p-4">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-base leading-relaxed text-foreground">{children}</p>
    </div>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted"
    >
      <Copy className="h-4 w-4" aria-hidden="true" />
      <span aria-live="polite">{copied ? "Copiado!" : label}</span>
    </button>
  )
}

function Received({ protocol, headingRef }: { protocol: string | null; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <section aria-live="polite" className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
      <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold text-foreground outline-none">Solicitação recebida</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        Recebemos sua solicitação de exclusão de conta. Caso seja necessário confirmar sua identidade ou obter informações adicionais, nossa equipe entrará em contato pelo e-mail informado.
      </p>
      {protocol && (
        <div className="mt-6 rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-muted-foreground">Número do protocolo</p>
          <p className="mt-1 break-all font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-xl font-bold text-foreground">{protocol}</p>
          <div className="mt-3"><CopyButton text={protocol} label="Copiar protocolo" /></div>
          <p className="mt-3 text-sm text-muted-foreground">Guarde este número para falar com o suporte sobre a sua solicitação.</p>
        </div>
      )}
    </section>
  )
}

/** Sem backend: instruções claras de que o envio do e-mail é do próprio usuário. Não é "solicitação recebida". */
function MailFallback({ mailto, headingRef, onBack }: { mailto: string; headingRef: React.RefObject<HTMLHeadingElement | null>; onBack: () => void }) {
  const body = decodeURIComponent(mailto.split("&body=")[1] ?? "")
  return (
    <section aria-live="polite" className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
      <Mail className="h-10 w-10 text-primary" aria-hidden="true" />
      <h2 ref={headingRef} tabIndex={-1} className="mt-4 text-2xl font-bold text-foreground outline-none">Falta enviar o e-mail</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        <span className="font-semibold">Sua solicitação ainda não foi enviada.</span> Para fazê-la, envie a mensagem abaixo
        para <span className="font-semibold">{SUPPORT_EMAIL}</span> usando o e-mail da sua conta GuinCheck.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href={mailto}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-lg font-bold text-accent-foreground hover:bg-accent/90"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
          Abrir meu e-mail
        </a>
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-14 items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 text-base font-semibold text-foreground hover:bg-muted"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Falar pelo WhatsApp
        </a>
      </div>
      <details className="mt-6 rounded-xl border border-border bg-background p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Não abriu o e-mail? Copie a mensagem</summary>
        <pre className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">{body}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={body} label="Copiar mensagem" />
          <CopyButton text={SUPPORT_EMAIL} label="Copiar endereço" />
        </div>
      </details>
      <button type="button" onClick={onBack} className="mt-6 text-sm font-semibold text-primary underline underline-offset-2">
        Voltar e corrigir os dados
      </button>
    </section>
  )
}

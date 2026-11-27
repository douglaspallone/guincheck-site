"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, MailCheck } from "lucide-react"
import { confirmDeletionRequest, readTokenFromHash } from "@/lib/privacy/deletion"
import { PRIVACY_API_BASE_URL, SUPPORT_EMAIL } from "@/lib/institutional"

type State = "idle" | "working" | "confirmed" | "invalid" | "unavailable" | "rate_limited" | "not_configured" | "no_token"

/**
 * Confirma que o e-mail informado pertence ao titular. O código vem no fragmento (#t=...) da URL: o navegador não o
 * envia a servidores nem a logs de acesso. A confirmação só acontece no clique (POST), então "pré-visualizadores" de
 * links de e-mail, que apenas abrem a página, não confirmam nada.
 */
export function ConfirmPanel() {
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<State>("idle")
  const inFlight = useRef(false)

  useEffect(() => {
    const load = () => {
      const read = readTokenFromHash(window.location.hash)
      if (!read && !window.location.hash) {
        // Fragmento já removido por nós (ou página aberta sem código): mantém o que está na tela.
        setToken((current) => current)
        setState((current) => (current === "idle" ? "no_token" : current))
        return
      }
      setToken(read)
      setState(read ? "idle" : "no_token")
      // Remove o código da barra de endereço (histórico e compartilhamento de tela).
      if (read) window.history.replaceState(null, "", window.location.pathname)
    }
    load()
    // Abrir outro link de confirmação na mesma aba só muda o fragmento (sem recarregar a página).
    window.addEventListener("hashchange", load)
    return () => window.removeEventListener("hashchange", load)
  }, [])

  async function confirm() {
    if (!token || inFlight.current) return
    inFlight.current = true
    setState("working")
    try {
      const result = await confirmDeletionRequest(PRIVACY_API_BASE_URL, token)
      if (result.kind === "confirmed" || result.kind === "invalid_token") setToken(null)
      setState(result.kind === "invalid_token" ? "invalid" : result.kind)
    } finally {
      inFlight.current = false
    }
  }

  if (state === "confirmed") {
    return (
      <div role="status" className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
        <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">E-mail confirmado</h2>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Obrigado. Sua solicitação segue para análise da nossa equipe. A conta ainda não foi excluída: a equipe
          entrará em contato pelo e-mail informado caso precise de mais alguma informação.
        </p>
      </div>
    )
  }

  const problem =
    state === "no_token"
      ? "Este link está incompleto. Abra novamente o link que enviamos por e-mail, sem alterar o endereço."
      : state === "invalid"
        ? "Este link não é mais válido (pode ter expirado ou já ter sido usado). Se precisar, faça uma nova solicitação."
        : state === "rate_limited"
          ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos e toque no botão de novo."
          : state === "unavailable"
            ? "Não conseguimos confirmar agora. Tente de novo em instantes."
            : state === "not_configured"
              ? "A confirmação por esta página ainda não está disponível."
              : null

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
      <MailCheck className="h-10 w-10 text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-2xl font-bold text-foreground">Confirmar meu e-mail</h2>
      <p className="mt-3 text-base leading-relaxed text-foreground">
        Para sua segurança, precisamos confirmar que foi você quem pediu a exclusão da conta GuinCheck. Toque no botão abaixo para confirmar.
      </p>
      {problem && (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {problem} Dúvidas? <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </span>
        </p>
      )}
      <button
        type="button"
        onClick={confirm}
        disabled={!token || state === "working"}
        className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-lg font-bold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-72"
      >
        {state === "working" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Confirmando…
          </>
        ) : (
          "Confirmar meu e-mail"
        )}
      </button>
    </div>
  )
}

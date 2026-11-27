"use client"

import { useEffect, useRef } from "react"

// Cloudflare Turnstile (gratuito, sem cookies de rastreamento publicitário). Só é carregado se a chave pública
// estiver configurada e somente nesta página. A verificação que vale é a do servidor (siteverify); este widget
// apenas obtém o token.
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    const script = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT_SRC, async: true, defer: true })
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener("error", () => reject(new Error("turnstile")), { once: true })
    if (!existing) document.head.appendChild(script)
  })
}

export function Turnstile({
  siteKey,
  onToken,
  resetSignal,
}: {
  siteKey: string
  onToken: (token: string | null) => void
  /** Mude o valor para pedir um novo desafio (o token vale uma vez). */
  resetSignal: number
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return
        widgetRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          language: "pt-br",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current)
      widgetRef.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (resetSignal > 0 && widgetRef.current && window.turnstile) {
      onTokenRef.current(null)
      window.turnstile.reset(widgetRef.current)
    }
  }, [resetSignal])

  return <div ref={hostRef} aria-label="Verificação de segurança" />
}

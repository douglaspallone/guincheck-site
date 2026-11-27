"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { FileWarning, List, MessageCircle, Printer, ShieldCheck, Trash2, FileText, Mail } from "lucide-react"
import { Blocks } from "@/components/legal/blocks"
import { LegalIdentity } from "@/components/legal/legal-identity"
import { aliasesBySection, formatDatePt, pickDocument, shortHash } from "@/lib/legal/document"
import { fetchLiveDocument } from "@/lib/legal/live"
import type { DisplayDocument, LegalDocumentType } from "@/lib/legal/types"
import { LEGAL_API_BASE_URL, LEGAL_PATHS, SUPPORT_EMAIL } from "@/lib/institutional"
import { SUPPORT_WHATSAPP_URL } from "@/lib/links"

const TITLES: Record<LegalDocumentType, string> = { terms: "Termos de Uso", privacy: "Política de Privacidade" }
const UPDATING: Record<LegalDocumentType, string> = {
  terms: "Os Termos de Uso estão sendo atualizados e ainda não estão disponíveis nesta página.",
  privacy: "A Política de Privacidade está sendo atualizada e ainda não está disponível nesta página.",
}

type Props = {
  type: LegalDocumentType
  /** Documento resolvido no build (cópia confirmada ou legado). Também é o que vai no HTML estático. */
  initial: DisplayDocument | null
}

const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold transition-colors"

export function LegalDocumentView({ type, initial }: Props) {
  const [doc, setDoc] = useState<DisplayDocument | null>(initial)
  const [liveFailed, setLiveFailed] = useState(false)
  const checkedRef = useRef(false)

  // Atualização independente: ao abrir a página, confere se o backend publicou uma versão vigente.
  useEffect(() => {
    if (checkedRef.current) return
    checkedRef.current = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    fetchLiveDocument(LEGAL_API_BASE_URL, type, { signal: controller.signal })
      .then((live) => {
        setLiveFailed(!live)
        setDoc((current) => pickDocument(current, live, Date.now()))
      })
      .finally(() => clearTimeout(timer))
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [type])

  // Âncoras: se o conteúdo mudou depois do carregamento, o navegador não rola sozinho até o #id.
  useEffect(() => {
    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""))
      if (id) document.getElementById(id)?.scrollIntoView()
    }
    scrollToHash()
    window.addEventListener("hashchange", scrollToHash)
    return () => window.removeEventListener("hashchange", scrollToHash)
  }, [doc?.origin, doc?.hash, doc?.version])

  const title = doc?.title || TITLES[type]
  const tocRef = useRef<HTMLDetailsElement>(null)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">{title}</h1>

      {!doc ? (
        <UnavailableState type={type} />
      ) : (
        <>
          <DocumentMeta doc={doc} />

          {doc.origin === "synced" && liveFailed && (
            <div role="status" className="mt-6 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 print:hidden">
              <FileWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="text-sm leading-relaxed">
                Não foi possível conferir agora se existe uma versão mais recente. Esta página mostra a última versão
                vigente confirmada{doc.confirmedAt ? `, verificada em ${formatDatePt(doc.confirmedAt)}` : ""}.
              </p>
            </div>
          )}

          {type === "privacy" && <DeletionCallout />}

          <div className="mt-8 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
            <aside className="print:hidden">
              <details ref={tocRef} className="rounded-xl border border-border bg-background lg:hidden">
                <summary className="flex min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center gap-2 px-4 font-semibold text-foreground">
                  <List className="h-5 w-5" aria-hidden="true" />
                  Sumário
                  <span className="ml-auto text-sm font-normal text-muted-foreground">toque para abrir ou fechar</span>
                </summary>
                <Toc doc={doc} onNavigate={() => tocRef.current?.removeAttribute("open")} label="Sumário (celular)" />
              </details>
              <div className="sticky top-6 hidden max-h-[calc(100vh-3rem)] overflow-y-auto lg:block">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <List className="h-4 w-4" aria-hidden="true" />
                  Sumário
                </p>
                <Toc doc={doc} label="Sumário" />
              </div>
            </aside>

            <div className="mt-8 min-w-0 lg:mt-0">
              <div className="mb-6 flex justify-end print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className={`${buttonBase} min-h-11 border border-border bg-background text-foreground hover:bg-muted`}
                >
                  <Printer className="h-5 w-5" aria-hidden="true" />
                  Imprimir ou salvar em PDF
                </button>
              </div>

              <article aria-label={title}>
                {doc.summary && <p className="mb-8 text-lg leading-relaxed text-foreground/85">{doc.summary}</p>}
                {doc.preamble.length > 0 && (
                  <div className="mb-10">
                    <Blocks blocks={doc.preamble} />
                  </div>
                )}
                <div className="space-y-10">
                  {(() => {
                    const aliases = aliasesBySection(doc.sections.map((s) => s.id))
                    return doc.sections.map((section) => (
                      <section key={section.id} id={section.id} aria-labelledby={`gc-h-${section.id}`} className="scroll-mt-6">
                        {(aliases[section.id] ?? []).map((alias) => (
                          <span key={alias} id={alias} aria-hidden="true" className="block scroll-mt-6" />
                        ))}
                        <h2 id={`gc-h-${section.id}`} className="mb-3 text-xl font-semibold text-foreground break-after-avoid">
                          {section.title}
                        </h2>
                        <Blocks blocks={section.blocks} />
                      </section>
                    ))
                  })()}
                </div>
              </article>
            </div>
          </div>
        </>
      )}

      <div className="mt-12 space-y-6 border-t border-border pt-10">
        <RelatedLinks type={type} />
        <LegalIdentity />
      </div>
    </div>
  )
}

function DocumentMeta({ doc }: { doc: DisplayDocument }) {
  const updated = formatDatePt(doc.publishedAt ?? doc.updatedAt)
  const effective = formatDatePt(doc.effectiveAt)
  const isLegacy = doc.origin === "legacy"
  return (
    <dl className="mt-6 grid gap-x-8 gap-y-3 rounded-xl border border-border bg-muted/40 p-5 text-sm sm:grid-cols-2 print:border-0 print:p-0">
      <div>
        <dt className="font-medium text-muted-foreground">Versão vigente</dt>
        <dd className="text-base font-semibold text-foreground">
          {doc.version ?? "Sem numeração (texto anterior ao versionamento)"}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-muted-foreground">{isLegacy ? "Última atualização" : "Data de publicação"}</dt>
        <dd className="text-base font-semibold text-foreground">{updated ?? "Não informada"}</dd>
      </div>
      <div>
        <dt className="font-medium text-muted-foreground">Início da vigência</dt>
        <dd className="text-base font-semibold text-foreground">{effective ?? "Não informado nesta versão"}</dd>
      </div>
      {doc.hash && (
        <div>
          <dt className="font-medium text-muted-foreground">Código de integridade</dt>
          <dd className="font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-base text-foreground" title={doc.hash}>{shortHash(doc.hash)}…</dd>
        </div>
      )}
    </dl>
  )
}

function Toc({ doc, onNavigate, label }: { doc: DisplayDocument; onNavigate?: () => void; label: string }) {
  return (
    <nav aria-label={label} className="px-1 pb-3 lg:px-0 lg:pb-0">
      <ol className="space-y-0.5">
        {doc.sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={onNavigate}
              className="flex min-h-11 items-center rounded-md px-3 py-1 text-sm leading-snug text-foreground/85 hover:bg-muted hover:text-foreground lg:min-h-9"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function DeletionCallout() {
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <div className="flex gap-3">
        <Trash2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <p className="leading-relaxed text-foreground">
          <span className="font-semibold">Quer excluir sua conta e seus dados?</span>{" "}
          Você pode fazer a solicitação sem entrar no aplicativo.
        </p>
      </div>
      <Link
        href={LEGAL_PATHS.accountDeletion}
        className={`${buttonBase} shrink-0 bg-accent text-accent-foreground hover:bg-accent/90`}
      >
        Excluir minha conta
      </Link>
    </div>
  )
}

function RelatedLinks({ type }: { type: LegalDocumentType }) {
  const other =
    type === "privacy"
      ? { href: LEGAL_PATHS.terms, label: "Termos de Uso", Icon: FileText }
      : { href: LEGAL_PATHS.privacy, label: "Política de Privacidade", Icon: ShieldCheck }
  return (
    <nav aria-label="Outras páginas" className="flex flex-col gap-3 sm:flex-row print:hidden">
      <Link href={other.href} className={`${buttonBase} border border-border bg-background text-foreground hover:bg-muted`}>
        <other.Icon className="h-5 w-5" aria-hidden="true" />
        Ler {other.label}
      </Link>
      <Link href={LEGAL_PATHS.accountDeletion} className={`${buttonBase} border border-border bg-background text-foreground hover:bg-muted`}>
        <Trash2 className="h-5 w-5" aria-hidden="true" />
        Excluir minha conta
      </Link>
    </nav>
  )
}

/** Sem fonte confiável: não mostra texto nenhum como se fosse o documento. */
function UnavailableState({ type }: { type: LegalDocumentType }) {
  return (
    <div role="status" className="mt-8 rounded-xl border border-border bg-muted/40 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <FileWarning className="mt-1 h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">Documento em atualização</h2>
          <p className="mt-2 leading-relaxed text-foreground/85">
            {UPDATING[type]} Se precisar do texto ou tiver alguma dúvida, fale com a gente:
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a href={`mailto:${SUPPORT_EMAIL}`} className={`${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`}>
              <Mail className="h-5 w-5" aria-hidden="true" />
              {SUPPORT_EMAIL}
            </a>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonBase} border border-border bg-background text-foreground hover:bg-muted`}
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

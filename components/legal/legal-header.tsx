import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, FileText, ShieldCheck, Trash2 } from "lucide-react"
import { LEGAL_PATHS } from "@/lib/institutional"

const items = [
  { key: "terms", href: LEGAL_PATHS.terms, label: "Termos de Uso", short: "Termos", Icon: FileText },
  { key: "privacy", href: LEGAL_PATHS.privacy, label: "Política de Privacidade", short: "Privacidade", Icon: ShieldCheck },
  { key: "deletion", href: LEGAL_PATHS.accountDeletion, label: "Excluir minha conta", short: "Excluir conta", Icon: Trash2 },
] as const

export type LegalPageKey = (typeof items)[number]["key"]

/** Cabeçalho simples das páginas legais: não usa as âncoras da página inicial. */
export function LegalHeader({ current }: { current: LegalPageKey }) {
  return (
    <header className="border-b border-border bg-background print:hidden">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center" aria-label="GuinCheck — página inicial">
            <Image src="/images/logo.png" alt="GuinCheck" width={140} height={48} className="h-10 w-auto" priority />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Voltar ao início
          </Link>
        </div>
        <nav aria-label="Informações legais" className="-mx-1 flex flex-wrap gap-2 pb-4">
          {items.map(({ key, href, label, short, Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={key === current ? "page" : undefined}
              className={
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 sm:gap-2 sm:px-4 text-sm font-semibold transition-colors " +
                (key === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted")
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="sm:hidden" aria-hidden="true">{short}</span>
              <span className="sr-only sm:not-sr-only">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

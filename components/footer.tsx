import Link from "next/link"
import Image from "next/image"
import { Mail, MessageCircle, Phone } from "lucide-react"
import { SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/links"
import { LEGAL_PATHS, SUPPORT_EMAIL } from "@/lib/institutional"

const legalLinks = [
  { href: LEGAL_PATHS.terms, label: "Termos de Uso", external: false },
  { href: LEGAL_PATHS.privacy, label: "Política de Privacidade", external: false },
  { href: LEGAL_PATHS.accountDeletion, label: "Exclusão de conta", external: false },
  { href: SUPPORT_WHATSAPP_URL, label: "Contato e suporte", external: true },
]

export function Footer() {
  return (
    <footer className="bg-primary py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-3">
            <Link href="/">
              <Image
                src="/images/logo-branco.png"
                alt="GuinCheck"
                width={140}
                height={48}
                className="h-10 w-auto"
              />
            </Link>
            <p className="text-sm text-primary-foreground/70 text-center md:text-left">
              Checklist de Remoção de Veículos.
            </p>
          </div>

          <div className="flex flex-col items-center md:items-end gap-3">
            <Link
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-primary-foreground hover:text-accent transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              Suporte pelo WhatsApp
            </Link>

            <div className="flex items-center gap-2 text-sm text-primary-foreground/70">
              <Phone className="h-4 w-4" />
              {SUPPORT_PHONE_DISPLAY}
            </div>

            <Link
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-primary-foreground transition-colors"
            >
              <Mail className="h-4 w-4" />
              {SUPPORT_EMAIL}
            </Link>
          </div>
        </div>

        <nav aria-label="Informações legais" className="mt-8 pt-6 border-t border-primary-foreground/10">
          <h2 className="text-sm font-semibold text-primary-foreground text-center md:text-left">
            Informações legais
          </h2>
          <ul className="mt-2 flex flex-col items-center md:flex-row md:flex-wrap md:gap-x-6">
            {legalLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-flex min-h-11 items-center text-sm text-primary-foreground/80 hover:text-accent transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 pt-6 border-t border-primary-foreground/10 text-center">
          <p className="text-sm text-primary-foreground/50">
            © {new Date().getFullYear()} GuinCheck. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

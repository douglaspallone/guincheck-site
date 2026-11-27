import { Building2, Mail, MessageCircle, UserRound } from "lucide-react"
import { COMPANY, LGPD_CONTACT, SUPPORT_EMAIL } from "@/lib/institutional"
import { SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/links"

/**
 * Identificação e canais oficiais. Rótulos neutros de propósito: a definição jurídica dos papéis
 * (controlador/operador) será feita na redação definitiva dos documentos.
 */
export function LegalIdentity({ title = "Identificação e contato" }: { title?: string }) {
  return (
    <section aria-labelledby="gc-identidade" className="rounded-xl border border-border bg-muted/40 p-5 sm:p-6 print:border-0 print:p-0">
      <h2 id="gc-identidade" className="text-lg font-semibold text-foreground">{title}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Empresa</dt>
            <dd className="text-foreground">{COMPANY.legalName}</dd>
            <dd className="text-sm text-muted-foreground">CNPJ {COMPANY.cnpj} · {COMPANY.city}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Atendimento de questões de privacidade (LGPD)</dt>
            <dd className="text-foreground">{LGPD_CONTACT.name}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="text-sm font-medium text-muted-foreground">E-mail de suporte</dt>
            <dd><a className="font-medium text-primary underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></dd>
          </div>
        </div>
        <div className="flex gap-3">
          <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <dt className="text-sm font-medium text-muted-foreground">WhatsApp</dt>
            <dd>
              <a className="font-medium text-primary underline underline-offset-2" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </dd>
          </div>
        </div>
      </dl>
    </section>
  )
}

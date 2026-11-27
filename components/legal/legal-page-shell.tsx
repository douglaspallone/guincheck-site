import type { ReactNode } from "react"
import { Footer } from "@/components/footer"
import { WhatsAppButton } from "@/components/whatsapp-button"
import { LegalHeader, type LegalPageKey } from "@/components/legal/legal-header"

export function LegalPageShell({ current, children }: { current: LegalPageKey; children: ReactNode }) {
  return (
    <div className="min-h-screen font-sans">
      <LegalHeader current={current} />
      <main id="conteudo" className="pb-24 sm:pb-0 print:pb-0">{children}</main>
      <div className="print:hidden">
        <Footer />
        <WhatsAppButton />
      </div>
    </div>
  )
}

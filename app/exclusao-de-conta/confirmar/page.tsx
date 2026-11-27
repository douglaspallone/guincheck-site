import type { Metadata } from "next"
import { ConfirmPanel } from "@/components/account-deletion/confirm-panel"
import { LegalPageShell } from "@/components/legal/legal-page-shell"

export const metadata: Metadata = {
  title: "Confirmar solicitação | GuinCheck",
  description: "Confirme o e-mail da sua solicitação de exclusão de conta GuinCheck.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function ConfirmarPage() {
  return (
    <LegalPageShell current="deletion">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <h1 className="sr-only">Confirmar solicitação de exclusão de conta</h1>
        <ConfirmPanel />
      </div>
    </LegalPageShell>
  )
}

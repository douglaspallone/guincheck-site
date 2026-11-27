import type { Metadata } from "next"
import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { loadInitialDocument } from "@/lib/legal/load.server"

export const metadata: Metadata = {
  title: "Política de Privacidade | GuinCheck",
  description:
    "Saiba como o GuinCheck coleta, usa, armazena e protege as informações dos usuários, e como exercer seus direitos.",
  alternates: { canonical: "/privacidade" },
}

export default async function PrivacidadePage() {
  const initial = await loadInitialDocument("privacy")
  return (
    <LegalPageShell current="privacy">
      <LegalDocumentView type="privacy" initial={initial} />
    </LegalPageShell>
  )
}

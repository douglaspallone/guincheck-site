import type { Metadata } from "next"
import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { loadInitialDocument } from "@/lib/legal/load.server"

export async function generateMetadata(): Promise<Metadata> {
  const initial = await loadInitialDocument("privacy")
  return {
    title: "Política de Privacidade | GuinCheck",
    description:
      "Saiba como o GuinCheck coleta, usa, armazena e protege as informações dos usuários, e como exercer seus direitos.",
    alternates: { canonical: "/privacidade" },
    // Sem texto vigente na página (estado "em atualização"), não indexar.
    ...(initial ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function PrivacidadePage() {
  const initial = await loadInitialDocument("privacy")
  return (
    <LegalPageShell current="privacy">
      <LegalDocumentView type="privacy" initial={initial} />
    </LegalPageShell>
  )
}

import type { Metadata } from "next"
import { LegalDocumentView } from "@/components/legal/legal-document-view"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { loadInitialDocument } from "@/lib/legal/load.server"

export async function generateMetadata(): Promise<Metadata> {
  const initial = await loadInitialDocument("terms")
  return {
    title: "Termos de Uso | GuinCheck",
    description:
      "Leia os Termos de Uso do GuinCheck, com a versão vigente e as datas de publicação e de vigência.",
    alternates: { canonical: "/termos" },
    // Sem texto vigente na página (estado "em atualização"), não indexar.
    ...(initial ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function TermosPage() {
  const initial = await loadInitialDocument("terms")
  return (
    <LegalPageShell current="terms">
      <LegalDocumentView type="terms" initial={initial} />
    </LegalPageShell>
  )
}

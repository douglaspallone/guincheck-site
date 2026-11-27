import type { Metadata } from "next"
import { Smartphone, UserRound } from "lucide-react"
import { DeletionForm } from "@/components/account-deletion/deletion-form"
import { LegalIdentity } from "@/components/legal/legal-identity"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { PLAY_APP } from "@/lib/institutional"

export const metadata: Metadata = {
  title: "Excluir minha conta | GuinCheck",
  description:
    "Solicite a exclusão da sua conta GuinCheck e dos dados pessoais associados, sem precisar instalar o aplicativo nem entrar na conta.",
  alternates: { canonical: "/exclusao-de-conta" },
}

export default function ExclusaoDeContaPage() {
  return (
    <LegalPageShell current="deletion">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance sm:text-4xl">Excluir minha conta</h1>
        <p className="mt-3 text-lg leading-relaxed text-foreground/85">
          Preencha o formulário abaixo para solicitar a exclusão da sua conta GuinCheck e dos dados pessoais associados.
        </p>

        <dl className="mt-6 grid gap-4 rounded-xl border border-border bg-muted/40 p-5 text-sm sm:grid-cols-2">
          <div className="flex gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="font-medium text-muted-foreground">Aplicativo</dt>
              <dd className="text-base font-semibold text-foreground">{PLAY_APP.name}</dd>
              <dd className="break-all text-muted-foreground">{PLAY_APP.packageId}</dd>
            </div>
          </div>
          <div className="flex gap-3">
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="font-medium text-muted-foreground">Desenvolvedor na Google Play</dt>
              <dd className="text-base font-semibold text-foreground">{PLAY_APP.developer}</dd>
            </div>
          </div>
        </dl>

        <p className="mt-4 text-sm text-muted-foreground">
          Você pode fazer a solicitação mesmo que já tenha desinstalado o aplicativo ou perdido o acesso à conta.
        </p>

        <div className="mt-8">
          <DeletionForm />
        </div>

        <div className="mt-12">
          <LegalIdentity title="Precisa de ajuda?" />
        </div>
      </div>
    </LegalPageShell>
  )
}

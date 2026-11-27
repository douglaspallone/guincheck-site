// Cópia pública persistente dos documentos legais vigentes.
//
// Lê SOMENTE o endpoint público de leitura do GuinCheck (`getPublicLegalDocument`, sem credenciais) e grava
// `content/legal/synced/<tipo>.json` quando — e só quando — o documento:
//   1. tem a forma do contrato;
//   2. tem hash SHA-256 que confere com o conteúdo;
//   3. já está em vigência.
// Em qualquer outra situação (backend fora do ar, 404 "ainda não publicado", hash divergente) mantém o arquivo
// que já existe e sai com código 0, para nunca derrubar o build do site.
//
// Uso: `npm run legal:sync` (manual, antes de commitar a atualização) — também roda no `prebuild`.
// Variável opcional: NEXT_PUBLIC_LEGAL_API_BASE_URL.
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { isEffective } from "../lib/legal/document.ts"
import { fetchLiveDocument } from "../lib/legal/live.ts"

const BASE_URL = process.env.NEXT_PUBLIC_LEGAL_API_BASE_URL || "https://us-central1-checklistguincho-doug.cloudfunctions.net"
const TYPES = ["terms", "privacy"] as const

async function main() {
  const dir = path.join(process.cwd(), "content", "legal", "synced")
  await mkdir(dir, { recursive: true })
  for (const type of TYPES) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const doc = await fetchLiveDocument(BASE_URL, type, { signal: controller.signal }).finally(() => clearTimeout(timer))
    if (!doc) {
      console.log(`[legal:sync] ${type}: sem versão publicada e íntegra no backend — mantida a cópia existente.`)
      continue
    }
    if (!isEffective(doc, Date.now())) {
      console.log(`[legal:sync] ${type}: versão ${doc.version} ainda não está em vigência — ignorada.`)
      continue
    }
    const file = path.join(dir, `${type}.json`)
    await writeFile(file, JSON.stringify({ confirmedAt: new Date().toISOString(), document: doc }, null, 2) + "\n")
    console.log(`[legal:sync] ${type}: versão ${doc.version} (hash ${doc.hash.slice(0, 12)}…) gravada em content/legal/synced/${type}.json`)
  }
}

main().catch((error) => {
  console.log(`[legal:sync] falha ignorada (o build segue com as cópias existentes): ${error?.message ?? error}`)
})

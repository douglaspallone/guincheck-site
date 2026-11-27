// Leitura em tempo de build (Server Components, export estático) das fontes locais dos documentos:
// 1) `content/legal/synced/<tipo>.json` — cópia pública da última versão vigente confirmada no backend
//    (gerada por `npm run legal:sync`; hash conferido aqui de novo);
// 2) `content/legal/legacy/<tipo>.json` — texto que o site já publicava antes do versionamento.
// Nunca inventa conteúdo: sem nenhuma das duas fontes devolve null e a página mostra o estado "em atualização".
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseLegacyFile, parseSyncedFile } from "./document"
import type { DisplayDocument, LegalDocumentType } from "./types"

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "content", "legal", file), "utf8"))
  } catch {
    return null
  }
}

export async function loadInitialDocument(type: LegalDocumentType): Promise<DisplayDocument | null> {
  const synced = await parseSyncedFile(await readJson(`synced/${type}.json`), type, Date.now())
  if (synced) return synced
  return parseLegacyFile(await readJson(`legacy/${type}.json`), type)
}

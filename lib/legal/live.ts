// Leitura pública, ao vivo, do documento vigente (somente GET, sem credenciais, sem cookies).
// Qualquer falha (rede, 404 "ainda não publicado", forma inválida, hash que não confere) devolve `null`:
// a página então mantém a cópia confirmada ou o texto legado, sem apresentar conteúdo duvidoso como atual.
import { parsePublicDocument, verifyDocumentHash } from "./document.ts"
import type { LegalDocumentType, PublicDocument } from "./types.ts"

export async function fetchLiveDocument(
  baseUrl: string,
  type: LegalDocumentType,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<PublicDocument | null> {
  const doFetch = options.fetchImpl ?? fetch
  try {
    const response = await doFetch(`${baseUrl.replace(/\/+$/, "")}/getPublicLegalDocument?type=${type}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: options.signal,
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    const doc = parsePublicDocument((body as { document?: unknown } | null)?.document, type)
    if (!doc || !(await verifyDocumentHash(doc))) return null
    return doc
  } catch {
    return null
  }
}

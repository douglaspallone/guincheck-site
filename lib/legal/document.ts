// Funções PURAS (sem React, sem fs, sem fetch) do adaptador dos documentos legais.
// Só `import type` aqui: o arquivo é executado direto pelo Node nos testes e no script de sincronização.
import type { Block, DisplayDocument, Inline, LegalDocumentType, PublicDocument, PublicSection } from "./types"

export const DOCUMENT_HASH_SCHEMA = "guincheck.legal-document/1"
export const CONTENT_FORMAT = "gc-legal-text/1"
/** Vigência futura ainda não é suportada pelo backend; tolerância de relógio igual à do contrato. */
export const EFFECTIVE_AT_FUTURE_TOLERANCE_MS = 5 * 60_000

const SECTION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
const SAFE_HREF = /^(?:https:\/\/[^\s<>"'`]+|mailto:[^\s<>"'`@]+@[^\s<>"'`]+)$/
const HEX64 = /^[a-f0-9]{64}$/

type AnyRecord = Record<string, unknown>
const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"

// ---------------------------------------------------------------------------------------------------------------------
// Hash (mesmo algoritmo do servidor: JSON canônico + SHA-256)
// ---------------------------------------------------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as AnyRecord
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function computeDocumentHash(doc: PublicDocument): Promise<string> {
  return sha256Hex(
    canonicalJson({
      schema: DOCUMENT_HASH_SCHEMA,
      format: CONTENT_FORMAT,
      type: doc.type,
      version: doc.version,
      title: doc.title,
      summary: doc.summary,
      effectiveAt: new Date(doc.effectiveAt).toISOString(),
      sections: doc.sections.map((section) => ({ id: section.id, title: section.title, content: section.content })),
    }),
  )
}

export async function verifyDocumentHash(doc: PublicDocument): Promise<boolean> {
  try {
    return HEX64.test(doc.hash) && (await computeDocumentHash(doc)) === doc.hash
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Validação estrita do que chega da rede ou do disco (nada é desenhado sem passar por aqui)
// ---------------------------------------------------------------------------------------------------------------------

function parseInline(raw: unknown): Inline | null {
  if (!isRecord(raw) || !isString(raw.v)) return null
  if (raw.t === "text" || raw.t === "strong") return { t: raw.t, v: raw.v }
  if (raw.t === "link" && isString(raw.href) && SAFE_HREF.test(raw.href)) return { t: "link", v: raw.v, href: raw.href }
  return null
}

function parseInlines(raw: unknown): Inline[] | null {
  if (!Array.isArray(raw)) return null
  const out: Inline[] = []
  for (const item of raw) {
    const inline = parseInline(item)
    if (!inline) return null
    out.push(inline)
  }
  return out
}

function parseItems(raw: unknown): Inline[][] | null {
  if (!Array.isArray(raw)) return null
  const out: Inline[][] = []
  for (const item of raw) {
    const inlines = parseInlines(item)
    if (!inlines) return null
    out.push(inlines)
  }
  return out
}

export function parseBlocks(raw: unknown): Block[] | null {
  if (!Array.isArray(raw)) return null
  const out: Block[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    if (item.t === "p" || item.t === "h") {
      const c = parseInlines(item.c)
      if (!c) return null
      out.push({ t: item.t, c })
    } else if (item.t === "ul") {
      const items = parseItems(item.items)
      if (!items) return null
      out.push({ t: "ul", items })
    } else if (item.t === "ol") {
      const items = parseItems(item.items)
      if (!items || typeof item.start !== "number" || !Number.isInteger(item.start) || item.start < 0 || item.start > 999) {
        return null
      }
      out.push({ t: "ol", start: item.start, items })
    } else {
      return null
    }
  }
  return out
}

function parseSections(raw: unknown): PublicSection[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) return null
  const seen = new Set<string>()
  const out: PublicSection[] = []
  for (const item of raw) {
    if (!isRecord(item) || !isString(item.id) || !SECTION_ID.test(item.id) || seen.has(item.id)) return null
    if (!isString(item.title) || !item.title.trim() || item.title.length > 160) return null
    if (!isString(item.content) || !item.content.trim()) return null
    const blocks = parseBlocks(item.blocks)
    if (!blocks) return null
    seen.add(item.id)
    out.push({ id: item.id, title: item.title, content: item.content, blocks })
  }
  return out
}

const isIso = (value: unknown): value is string => isString(value) && Number.isFinite(Date.parse(value))

/**
 * Valida a forma do documento público. Devolve só os campos do contrato (qualquer campo extra é descartado,
 * então um backend que um dia exponha mais do que deve não vaza nada para a página).
 */
export function parsePublicDocument(raw: unknown, expectedType: LegalDocumentType): PublicDocument | null {
  if (!isRecord(raw)) return null
  if (raw.type !== expectedType) return null
  if (!isString(raw.version) || raw.version.length < 2 || raw.version.length > 64) return null
  if (!isString(raw.hash) || !HEX64.test(raw.hash)) return null
  if (!isString(raw.title) || !raw.title.trim() || raw.title.length > 160) return null
  if (!isString(raw.summary) || raw.summary.length > 1000) return null
  if (!isIso(raw.effectiveAt)) return null
  if (raw.publishedAt !== null && !isIso(raw.publishedAt)) return null
  const sections = parseSections(raw.sections)
  if (!sections) return null
  return {
    type: expectedType,
    version: raw.version,
    hash: raw.hash,
    title: raw.title,
    summary: raw.summary,
    effectiveAt: raw.effectiveAt,
    publishedAt: raw.publishedAt,
    sections,
  }
}

/** Documento ainda não vigente (vigência futura) não pode ser exibido como atual. */
export function isEffective(doc: Pick<PublicDocument, "effectiveAt">, nowMs: number): boolean {
  return Date.parse(doc.effectiveAt) <= nowMs + EFFECTIVE_AT_FUTURE_TOLERANCE_MS
}

export function toDisplayDocument(
  doc: PublicDocument,
  origin: "live" | "synced",
  confirmedAt: string | null = null,
): DisplayDocument {
  return {
    origin,
    type: doc.type,
    version: doc.version,
    hash: doc.hash,
    title: doc.title,
    summary: doc.summary,
    effectiveAt: doc.effectiveAt,
    publishedAt: doc.publishedAt,
    updatedAt: null,
    confirmedAt,
    preamble: [],
    sections: doc.sections,
  }
}

/** Valida o arquivo `content/legal/synced/<tipo>.json`: `{ confirmedAt, document }`. */
export async function parseSyncedFile(
  raw: unknown,
  expectedType: LegalDocumentType,
  nowMs: number,
): Promise<DisplayDocument | null> {
  if (!isRecord(raw) || !isIso(raw.confirmedAt)) return null
  const doc = parsePublicDocument(raw.document, expectedType)
  if (!doc || !isEffective(doc, nowMs) || !(await verifyDocumentHash(doc))) return null
  return toDisplayDocument(doc, "synced", raw.confirmedAt)
}

/** Valida o arquivo do texto que o site já publicava (sem hash, sem versão numerada). */
export function parseLegacyFile(raw: unknown, expectedType: LegalDocumentType): DisplayDocument | null {
  if (!isRecord(raw) || raw.type !== expectedType) return null
  if (!isString(raw.title) || !raw.title.trim()) return null
  if (!isString(raw.updatedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.updatedAt)) return null
  const preamble = parseBlocks(raw.preamble ?? [])
  const sections = parseSections(raw.sections)
  if (!preamble || !sections) return null
  return {
    origin: "legacy",
    type: expectedType,
    version: null,
    hash: null,
    title: raw.title,
    summary: "",
    effectiveAt: null,
    publishedAt: null,
    updatedAt: raw.updatedAt,
    confirmedAt: null,
    preamble,
    sections,
  }
}

/**
 * Decide o que exibir quando chega a leitura ao vivo:
 * - ao vivo, íntegro e vigente → sempre prevalece (é a fonte oficial);
 * - ao vivo ausente/inválido/indisponível → permanece o que já estava (cópia confirmada ou legado).
 */
export function pickDocument(
  initial: DisplayDocument | null,
  live: PublicDocument | null,
  nowMs: number,
): DisplayDocument | null {
  if (live && isEffective(live, nowMs)) return toDisplayDocument(live, "live")
  return initial
}

// ---------------------------------------------------------------------------------------------------------------------
// Âncoras
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Aliases de âncora combinados com o app (links profundos). Valem quando o documento ainda não tem uma seção com o
 * id do alias: o alias aponta para a seção equivalente. Os ids "oficiais" continuam sendo os do Ops; o ideal é
 * reservá-los lá (ver docs/contrato-documentos-legais.md) e este mapa ficar sem uso.
 */
export const ANCHOR_ALIASES: Record<string, readonly string[]> = {
  retencao: ["retencao-e-exclusao", "retencao-de-dados", "retencao-e-eliminacao"],
  "exclusao-de-dados": ["retencao-e-exclusao", "exclusao-de-dados-e-da-conta"],
  "direitos-dos-titulares": ["direitos-do-usuario", "direitos-do-titular"],
}

/** Para cada seção, os ids de alias que devem existir como âncora extra (nunca colidem com ids reais). */
export function aliasesBySection(sectionIds: readonly string[]): Record<string, string[]> {
  const real = new Set(sectionIds)
  const out: Record<string, string[]> = {}
  for (const [alias, candidates] of Object.entries(ANCHOR_ALIASES)) {
    if (real.has(alias)) continue
    const target = candidates.find((id) => real.has(id))
    if (target) (out[target] ??= []).push(alias)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------------------------------------------------

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }

/** Data longa em pt-BR no fuso de São Paulo (igual no servidor e no navegador, sem divergência de hidratação). */
export function formatDatePt(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  // Datas sem horário (AAAA-MM-DD) são tratadas ao meio-dia UTC para não "voltar um dia" no fuso do Brasil.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(ms)
  return new Intl.DateTimeFormat("pt-BR", DATE_FORMAT).format(date)
}

export const shortHash = (hash: string | null): string | null => (hash ? hash.slice(0, 12) : null)

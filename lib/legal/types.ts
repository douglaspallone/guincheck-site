// Tipos do contrato público dos documentos legais.
// Fonte da verdade: GuinCheck (backend jurídico / Ops) — `getPublicLegalDocument` devolve `{ document: PublicDocument }`.
// O site NÃO define um segundo esquema de versionamento: só desenha o que o backend publica.
// Ver docs/contrato-documentos-legais.md.

export type LegalDocumentType = "terms" | "privacy"

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; v: string }
  | { t: "link"; v: string; href: string }

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }

export type PublicSection = {
  /** Âncora estável (`#id`). Definida pelo Ops; `inteligencia-artificial` é reservada. */
  id: string
  title: string
  /** Texto-fonte (formato gc-legal-text/1). Entra no cálculo do hash. */
  content: string
  /** Árvore já interpretada pelo servidor. É o que a página desenha. */
  blocks: Block[]
}

export type PublicDocument = {
  type: LegalDocumentType
  version: string
  /** SHA-256 (hex) calculado pelo servidor sobre JSON canônico. */
  hash: string
  title: string
  summary: string
  /** Vigência (ISO). */
  effectiveAt: string
  /** Publicação (ISO) ou null. */
  publishedAt: string | null
  sections: PublicSection[]
}

/**
 * Documento exibido pelo site. `origin` diz de onde veio:
 * - `live`: leitura pública do backend nesta visita (hash conferido);
 * - `synced`: cópia pública da última versão vigente confirmada (gerada por `npm run legal:sync`, hash conferido);
 * - `legacy`: texto que o site já publicava antes do versionamento (sem versão/hash/vigência declarados).
 */
export type DisplayDocument = {
  origin: "live" | "synced" | "legacy"
  type: LegalDocumentType
  version: string | null
  hash: string | null
  title: string
  summary: string
  effectiveAt: string | null
  publishedAt: string | null
  /** Data da última atualização do texto, para o legado (ISO, só data). */
  updatedAt: string | null
  /** Quando a cópia `synced` foi confirmada no backend. */
  confirmedAt: string | null
  /** Blocos introdutórios sem título de seção (só legado). */
  preamble: Block[]
  sections: PublicSection[]
}

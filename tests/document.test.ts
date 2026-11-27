// Testes do adaptador dos documentos legais. Executar: npm test (node:test, sem dependências).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import {
  aliasesBySection,
  canonicalJson,
  formatDatePt,
  isEffective,
  parseLegacyFile,
  parsePublicDocument,
  parseSyncedFile,
  pickDocument,
  verifyDocumentHash,
} from "../lib/legal/document.ts"
import { fetchLiveDocument } from "../lib/legal/live.ts"

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"))
/** Documento gerado e assinado pelo código REAL do backend (legalDocuments.ts do GuinCheck). */
const serverDoc = () => structuredClone(read("./fixtures/server-document.json"))
const AFTER_EFFECTIVE = Date.parse("2026-12-02T00:00:00Z")
const BEFORE_EFFECTIVE = Date.parse("2026-11-27T00:00:00Z")

test("hash: o mesmo algoritmo do servidor confere o documento publicado (vetor cruzado)", async () => {
  const doc = parsePublicDocument(serverDoc(), "privacy")
  assert.ok(doc)
  assert.equal(await verifyDocumentHash(doc), true)
})

test("hash: qualquer alteração de conteúdo invalida", async () => {
  for (const mutate of [
    (d: any) => (d.title = "Outra"),
    (d: any) => (d.version = "2.1"),
    (d: any) => (d.sections[0].content += " "),
    (d: any) => (d.sections[1].id = "retencao-2"),
    (d: any) => (d.effectiveAt = "2026-12-02T03:00:00.000Z"),
  ]) {
    const raw = serverDoc()
    mutate(raw)
    const doc = parsePublicDocument(raw, "privacy")
    assert.ok(doc)
    assert.equal(await verifyDocumentHash(doc), false)
  }
})

test("canonicalJson ordena chaves e ignora undefined", () => {
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: undefined }] }), '{"a":[{"d":1}],"b":1}')
})

test("parsePublicDocument: só aceita a forma do contrato", () => {
  assert.ok(parsePublicDocument(serverDoc(), "privacy"))
  assert.equal(parsePublicDocument(serverDoc(), "terms"), null, "tipo diferente do esperado")
  const bad: Array<(d: any) => void> = [
    (d) => (d.hash = "abc"),
    (d) => (d.version = "1"),
    (d) => (d.title = " "),
    (d) => (d.effectiveAt = "ontem"),
    (d) => (d.sections = []),
    (d) => (d.sections[1].id = d.sections[0].id),
    (d) => (d.sections[0].id = "Id Inválido"),
    (d) => (d.sections[0].blocks[0].t = "script"),
    (d) => (d.sections[0].blocks[1].items[1][1].href = "javascript:alert(1)"),
    (d) => (d.sections[0].blocks[1].items[1][1].href = "http://inseguro.example"),
    (d) => (d.sections[0].blocks[0].c[0].v = 42),
  ]
  for (const mutate of bad) {
    const raw = serverDoc()
    mutate(raw)
    assert.equal(parsePublicDocument(raw, "privacy"), null)
  }
})

test("parsePublicDocument: descarta campos que não são do contrato (nada interno vaza para a página)", () => {
  const raw = serverDoc()
  raw.draft = { x: 1 }
  raw.acceptances = [{ uid: "u1" }]
  raw.updatedBy = "operador@example.com"
  const doc = parsePublicDocument(raw, "privacy") as Record<string, unknown>
  assert.deepEqual(Object.keys(doc).sort(), ["effectiveAt", "hash", "publishedAt", "sections", "summary", "title", "type", "version"])
})

test("vigência: documento com vigência futura não é exibido como atual", () => {
  const doc = parsePublicDocument(serverDoc(), "privacy")!
  assert.equal(isEffective(doc, BEFORE_EFFECTIVE), false)
  assert.equal(isEffective(doc, AFTER_EFFECTIVE), true)
})

test("pickDocument: ao vivo íntegro e vigente prevalece; falha mantém o que já havia", () => {
  const legacy = parseLegacyFile(read("../content/legal/legacy/privacy.json"), "privacy")!
  const live = parsePublicDocument(serverDoc(), "privacy")!
  assert.equal(pickDocument(legacy, live, AFTER_EFFECTIVE)?.origin, "live")
  assert.equal(pickDocument(legacy, live, AFTER_EFFECTIVE)?.version, "2.0")
  assert.equal(pickDocument(legacy, null, AFTER_EFFECTIVE), legacy, "backend indisponível: segue o legado")
  assert.equal(pickDocument(legacy, live, BEFORE_EFFECTIVE), legacy, "vigência futura: não substitui")
  assert.equal(pickDocument(null, null, AFTER_EFFECTIVE), null, "sem fonte: nada é inventado")
})

test("cópia confirmada: exige hash íntegro e vigência", async () => {
  const file = { confirmedAt: "2026-11-30T13:00:00.000Z", document: serverDoc() }
  const ok = await parseSyncedFile(file, "privacy", AFTER_EFFECTIVE)
  assert.equal(ok?.origin, "synced")
  assert.equal(ok?.confirmedAt, "2026-11-30T13:00:00.000Z")
  assert.equal(await parseSyncedFile(file, "privacy", BEFORE_EFFECTIVE), null)
  const tampered = structuredClone(file)
  tampered.document.sections[0].content = "Texto adulterado"
  assert.equal(await parseSyncedFile(tampered, "privacy", AFTER_EFFECTIVE), null)
  assert.equal(await parseSyncedFile({ document: serverDoc() }, "privacy", AFTER_EFFECTIVE), null)
  assert.equal(await parseSyncedFile(file, "terms", AFTER_EFFECTIVE), null)
})

test("legado: a /privacidade publicada hoje foi preservada (12 seções, texto original)", () => {
  const legacy = parseLegacyFile(read("../content/legal/legacy/privacy.json"), "privacy")!
  assert.equal(legacy.origin, "legacy")
  assert.equal(legacy.version, null)
  assert.equal(legacy.hash, null)
  assert.equal(legacy.effectiveAt, null, "vigência não é inventada")
  assert.equal(legacy.updatedAt, "2026-07-17")
  assert.equal(legacy.sections.length, 12)
  assert.equal(legacy.sections[0].title, "1. Dados que coletamos")
  assert.equal(legacy.sections[6].title, "7. Retenção e exclusão")
  assert.match(legacy.sections[3].content, /Não vendemos dados pessoais dos usuários\./)
  assert.equal(parseLegacyFile(read("../content/legal/legacy/privacy.json"), "terms"), null)
})

test("âncoras: aliases combinados com o app apontam para a seção equivalente e não colidem com ids reais", () => {
  const legacyIds = parseLegacyFile(read("../content/legal/legacy/privacy.json"), "privacy")!.sections.map((s) => s.id)
  const map = aliasesBySection(legacyIds)
  assert.deepEqual(map["retencao-e-exclusao"].sort(), ["exclusao-de-dados", "retencao"])
  assert.deepEqual(map["direitos-do-usuario"], ["direitos-dos-titulares"])
  // Se o Ops passar a publicar o id oficial, o alias some (o id real prevalece).
  const withOfficial = aliasesBySection([...legacyIds, "retencao"])
  assert.deepEqual(withOfficial["retencao-e-exclusao"], ["exclusao-de-dados"])
  assert.deepEqual(aliasesBySection(["inteligencia-artificial"]), {})
})

test("datas em pt-BR no fuso de São Paulo", () => {
  assert.equal(formatDatePt("2026-07-17"), "17 de julho de 2026")
  assert.equal(formatDatePt("2026-12-01T03:00:00.000Z"), "01 de dezembro de 2026")
  assert.equal(formatDatePt("2026-12-01T02:59:00.000Z"), "30 de novembro de 2026")
  assert.equal(formatDatePt(null), null)
  assert.equal(formatDatePt("lixo"), null)
})

test("leitura ao vivo: sucesso, 404, adulteração, rede e formato", async () => {
  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  let seen: RequestInit | undefined
  let url = ""
  const okFetch = (async (u: string, init: RequestInit) => {
    url = u
    seen = init
    return jsonResponse({ document: serverDoc() })
  }) as unknown as typeof fetch
  const doc = await fetchLiveDocument("https://api.example/", "privacy", { fetchImpl: okFetch })
  assert.equal(doc?.version, "2.0")
  assert.equal(url, "https://api.example/getPublicLegalDocument?type=privacy")
  assert.equal(seen?.method, "GET")
  assert.equal(seen?.credentials, "omit", "sem cookies nem credenciais")

  const notFound = (async () => jsonResponse({ error: "Documento ainda não publicado separadamente." }, 404)) as unknown as typeof fetch
  assert.equal(await fetchLiveDocument("https://api.example", "privacy", { fetchImpl: notFound }), null)

  const tampered = serverDoc()
  tampered.sections[0].content = "Outro texto"
  const tamperedFetch = (async () => jsonResponse({ document: tampered })) as unknown as typeof fetch
  assert.equal(await fetchLiveDocument("https://api.example", "privacy", { fetchImpl: tamperedFetch }), null)

  const down = (async () => {
    throw new TypeError("network")
  }) as unknown as typeof fetch
  assert.equal(await fetchLiveDocument("https://api.example", "privacy", { fetchImpl: down }), null)

  const html = (async () => new Response("<html>erro</html>", { status: 200 })) as unknown as typeof fetch
  assert.equal(await fetchLiveDocument("https://api.example", "privacy", { fetchImpl: html }), null)

  const wrongType = (async () => jsonResponse({ document: serverDoc() })) as unknown as typeof fetch
  assert.equal(await fetchLiveDocument("https://api.example", "terms", { fetchImpl: wrongType }), null)
})

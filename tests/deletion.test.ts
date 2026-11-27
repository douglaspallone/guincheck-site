// Testes do cliente da solicitação de exclusão de conta. Executar: npm test
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildDeletionMailto,
  confirmDeletionRequest,
  DELETION_REASONS,
  parseProtocol,
  readTokenFromHash,
  submitDeletionRequest,
  validateDeletionForm,
  validateEmail,
} from "../lib/privacy/deletion.ts"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const asFetch = (fn: (url: string, init: RequestInit) => Promise<Response>) => fn as unknown as typeof fetch
const payload = { email: "pessoa@example.com", reason: "price" as const, requestId: "11111111-2222-3333-4444-555555555555" }

test("e-mail: formatos válidos e inválidos", () => {
  for (const ok of ["a@b.co", "nome.sobrenome+tag@empresa.com.br", "  pessoa@example.com  "]) assert.equal(validateEmail(ok).ok, true, ok)
  for (const bad of ["", "   ", "sem-arroba", "a@b", "a@@b.com", "a b@c.com", "a@b..com", "a@b.c", "a,b@c.com", "<x>@y.com", `${"a".repeat(250)}@b.com`]) {
    assert.equal(validateEmail(bad).ok, false, bad)
  }
  assert.equal((validateEmail("  pessoa@example.com ") as { value: string }).value, "pessoa@example.com")
})

test("formulário: checkbox obrigatório e e-mail válido; motivo é opcional", () => {
  const base = { email: "pessoa@example.com", reason: "", confirmed: true }
  const ok = validateDeletionForm(base)
  assert.equal(ok.ok, true)
  assert.equal(ok.value?.reason, null, "sem motivo continua válido")

  const noCheck = validateDeletionForm({ ...base, confirmed: false })
  assert.equal(noCheck.ok, false)
  assert.ok(noCheck.errors.confirmed)

  const badEmail = validateDeletionForm({ ...base, email: "x" })
  assert.equal(badEmail.ok, false)
  assert.ok(badEmail.errors.email)

  const both = validateDeletionForm({ email: "", reason: "", confirmed: false })
  assert.ok(both.errors.email && both.errors.confirmed)

  assert.equal(validateDeletionForm({ ...base, reason: "valor-inventado" }).value?.reason, null)
  assert.equal(validateDeletionForm({ ...base, reason: "prefer_not" }).value?.reason, "prefer_not")
  assert.equal(DELETION_REASONS.length, 7)
})

test("formulário: Turnstile exigido só quando configurado", () => {
  const base = { email: "pessoa@example.com", reason: "", confirmed: true }
  assert.ok(validateDeletionForm({ ...base, requireTurnstile: true }).errors.turnstile)
  assert.equal(validateDeletionForm({ ...base, requireTurnstile: true, turnstileToken: "tok" }).ok, true)
  assert.equal(validateDeletionForm({ ...base, requireTurnstile: false }).ok, true)
})

test("mailto: mensagem pronta, sem prometer envio, com o motivo só se informado", () => {
  const url = buildDeletionMailto("suporte@guincheck.com.br", "pessoa@example.com", "price")
  assert.ok(url.startsWith("mailto:suporte@guincheck.com.br?subject="))
  const body = decodeURIComponent(url.split("&body=")[1])
  assert.match(body, /E-mail cadastrado: pessoa@example.com/)
  assert.match(body, /Motivo \(opcional\): Preço da assinatura/)
  assert.doesNotMatch(decodeURIComponent(buildDeletionMailto("s@x.com", "a@b.com", "prefer_not")), /Motivo/)
  assert.doesNotMatch(decodeURIComponent(buildDeletionMailto("s@x.com", "a@b.com", "")), /Motivo/)
})

test("envio: sem backend configurado não simula recebimento", async () => {
  let called = false
  const result = await submitDeletionRequest("", payload, { fetchImpl: asFetch(async () => ((called = true), json({ ok: true }))) })
  assert.deepEqual(result, { kind: "not_configured" })
  assert.equal(called, false)
})

test("envio: sucesso com e sem protocolo; payload mínimo, sem credenciais", async () => {
  let seenUrl = ""
  let seenInit: RequestInit | undefined
  const fetchImpl = asFetch(async (url, init) => {
    seenUrl = url
    seenInit = init
    return json({ ok: true, protocol: "PRV-20261127-ABC234" })
  })
  const result = await submitDeletionRequest("https://api.example/", { ...payload, turnstileToken: "tok", honeypot: "" }, { fetchImpl })
  assert.deepEqual(result, { kind: "received", protocol: "PRV-20261127-ABC234" })
  assert.equal(seenUrl, "https://api.example/requestSiteAccountDeletion")
  assert.equal(seenInit?.credentials, "omit")
  assert.equal(seenInit?.method, "POST")
  const body = JSON.parse(String(seenInit?.body))
  assert.deepEqual(Object.keys(body).sort(), ["confirmed", "email", "reason", "requestId", "turnstileToken", "website"])
  assert.equal(body.confirmed, true)
  assert.equal(body.website, "")

  const noProtocol = await submitDeletionRequest("https://api.example", payload, { fetchImpl: asFetch(async () => json({ ok: true })) })
  assert.deepEqual(noProtocol, { kind: "received", protocol: null })
})

test("envio: só sucesso explícito vale como recebido (200 sem ok:true, HTML, 5xx e rede = indisponível)", async () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["200 sem ok", async () => json({ message: "hm" })],
    ["200 ok:false", async () => json({ ok: false })],
    ["200 html", async () => new Response("<html></html>", { status: 200 })],
    ["500", async () => json({ error: "x" }, 500)],
    ["503", async () => json({}, 503)],
    ["rede", async () => Promise.reject(new TypeError("Failed to fetch"))],
  ]
  for (const [name, fn] of cases) {
    const result = await submitDeletionRequest("https://api.example", payload, { fetchImpl: asFetch(fn) })
    assert.deepEqual(result, { kind: "unavailable" }, name)
  }
})

test("envio: 400 → inválido (mensagem limitada), 429 → limite", async () => {
  const invalid = await submitDeletionRequest("https://api.example", payload, {
    fetchImpl: asFetch(async () => json({ error: "x".repeat(900) }, 400)),
  })
  assert.equal(invalid.kind, "invalid")
  assert.equal((invalid as { message: string }).message.length, 300)
  const limited = await submitDeletionRequest("https://api.example", payload, { fetchImpl: asFetch(async () => json({}, 429)) })
  assert.deepEqual(limited, { kind: "rate_limited" })
})

test("envio: tempo esgotado vira indisponível (e libera nova tentativa)", async () => {
  const hang = asFetch((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")))))
  const started = Date.now()
  const result = await submitDeletionRequest("https://api.example", payload, { fetchImpl: hang, timeoutMs: 40 })
  assert.deepEqual(result, { kind: "unavailable" })
  assert.ok(Date.now() - started < 1000)
})

test("protocolo: só aceita formato seguro", () => {
  assert.equal(parseProtocol("PRV-20261127-ABC234"), "PRV-20261127-ABC234")
  for (const bad of [undefined, null, 5, "", "abc", "<script>alert(1)</script>", "PRV 2026", "a".repeat(41)]) assert.equal(parseProtocol(bad), null)
})

test("confirmação de titularidade: resultados e token só no fragmento", async () => {
  let seen = ""
  assert.deepEqual(await confirmDeletionRequest("", "t", {}), { kind: "not_configured" })
  const ok = await confirmDeletionRequest("https://api.example", "tok", {
    fetchImpl: asFetch(async (url, init) => ((seen = `${url} ${init.body}`), json({ ok: true }))),
  })
  assert.deepEqual(ok, { kind: "confirmed" })
  assert.equal(seen, 'https://api.example/confirmSiteAccountDeletion {"token":"tok"}')
  assert.deepEqual(await confirmDeletionRequest("https://api.example", "tok", { fetchImpl: asFetch(async () => json({}, 400)) }), { kind: "invalid_token" })
  assert.deepEqual(await confirmDeletionRequest("https://api.example", "tok", { fetchImpl: asFetch(async () => json({}, 410)) }), { kind: "invalid_token" })
  assert.deepEqual(await confirmDeletionRequest("https://api.example", "tok", { fetchImpl: asFetch(async () => json({}, 500)) }), { kind: "unavailable" })
  assert.deepEqual(await confirmDeletionRequest("https://api.example", "tok", { fetchImpl: asFetch(async () => json({ ok: false })) }), { kind: "unavailable" })

  const token = "A".repeat(43)
  assert.equal(readTokenFromHash(`#t=${token}`), token)
  for (const bad of ["", "#", "#t=", "#t=curto", `#x=${token}`, `?t=${token}`, `#t=${token}&y=1`, "#t=<script>alert(1)</script>aaaaaaaaaaaa"]) {
    assert.equal(readTokenFromHash(bad), null, bad)
  }
})

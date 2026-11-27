// Teste de ponta a ponta (navegador real) das páginas legais e do formulário de exclusão de conta.
//
// Não faz parte do `npm test` (precisa de navegador). Pré-requisitos: Playwright instalado em algum lugar e as DUAS
// versões do site já construídas em pastas separadas:
//   - FALLBACK_DIR: build padrão (sem NEXT_PUBLIC_PRIVACY_API_BASE_URL) -> formulário usa o caminho por e-mail;
//   - API_DIR: build com NEXT_PUBLIC_PRIVACY_API_BASE_URL=https://api.test e NEXT_PUBLIC_LEGAL_API_BASE_URL=https://legal.test
//     -> toda chamada de rede é interceptada e simulada aqui (nenhum backend real é tocado, nenhuma conta real é usada).
//
// Uso: PLAYWRIGHT_MODULE=<caminho do playwright> FALLBACK_DIR=... API_DIR=... SHOTS_DIR=... node tests/e2e/smoke.mjs
import assert from "node:assert/strict"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")
const FALLBACK_DIR = process.env.FALLBACK_DIR
const API_DIR = process.env.API_DIR
const SHOTS = process.env.SHOTS_DIR
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const { computeDocumentHash } = await import(pathToFileURL(path.resolve("lib/legal/document.ts")).href)

// ---- servidor estático que imita o GitHub Pages (path -> path.html -> path/index.html -> 404.html) ----------------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain", ".gif": "image/gif", ".jpg": "image/jpeg" }
function serve(rawDir) {
  const dir = path.resolve(rawDir)
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname)
    const candidates = [pathname, `${pathname}.html`, path.join(pathname, "index.html")]
    for (const c of candidates) {
      const file = path.join(dir, c)
      if (file.startsWith(dir) && existsSync(file) && statSync(file).isFile()) {
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" })
        return res.end(readFileSync(file))
      }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
    res.end(readFileSync(path.join(dir, "404.html")))
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })))
}

// ---- documento "publicado pelo Ops" (hash calculado pelo mesmo algoritmo do servidor) -------------------------------
async function publishedDoc(type, version, extra = {}) {
  const sections = [
    { id: "inteligencia-artificial", title: "Uso de inteligência artificial", content: "Texto da seção de IA.\n\n- item um\n- item dois" },
    { id: "whatsapp", title: "WhatsApp", content: "Texto sobre o WhatsApp com [link](https://guincheck.com.br/privacidade)." },
    { id: "retencao", title: "Retenção", content: "Texto de retenção." },
    { id: "direitos-dos-titulares", title: "Direitos dos titulares", content: "Texto de direitos." },
  ]
  const doc = { type, version, title: type === "terms" ? "Termos de Uso" : "Política de Privacidade", summary: "Resumo do documento.", effectiveAt: "2026-11-01T03:00:00.000Z", sections, ...extra }
  const hash = await computeDocumentHash({ ...doc, hash: "", publishedAt: null })
  const blocks = (c) => c.split("\n\n").map((t) => t.startsWith("- ") ? { t: "ul", items: t.split("\n").map((i) => [{ t: "text", v: i.slice(2) }]) } : t.includes("[link]") ? { t: "p", c: [{ t: "text", v: "Texto sobre o WhatsApp com " }, { t: "link", v: "link", href: "https://guincheck.com.br/privacidade" }, { t: "text", v: "." }] } : { t: "p", c: [{ t: "text", v: t }] })
  return { ...doc, hash, publishedAt: "2026-11-02T12:00:00.000Z", sections: sections.map((s) => ({ ...s, blocks: blocks(s.content) })) }
}

const results = []
async function check(name, fn) {
  try {
    await fn()
    results.push([true, name])
    console.log(`  ✔ ${name}`)
  } catch (error) {
    results.push([false, name])
    console.log(`  ✘ ${name}\n      ${String(error.message).split("\n").slice(0, 4).join("\n      ")}`)
  }
}
const shot = async (page, name, full = true) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), fullPage: full, type: "jpeg", quality: 72 })

const browser = await chromium.launch()
const desktop = { viewport: { width: 1280, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" }
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo" }

async function newPage(base, opts, { live } = {}) {
  const context = await browser.newContext(opts)
  const page = await context.newPage()
  const requests = []
  page.on("request", (r) => requests.push(r.url()))
  // Backend jurídico: simulado. `live` = função que devolve o corpo (ou null para falhar a conexão).
  await page.route("https://legal.test/**", async (route) => {
    const type = new URL(route.request().url()).searchParams.get("type")
    const body = live ? await live(type) : { __status: 404 }
    if (body === null) return route.abort("failed")
    if (body.__status) return route.fulfill({ status: body.__status, contentType: "application/json", body: JSON.stringify({ error: "Documento ainda não publicado separadamente." }) })
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ document: body }) })
  })
  await page.route("https://challenges.cloudflare.com/**", (route) => route.abort())
  return { context, page, requests, base }
}

// =====================================================================================================================
const fb = await serve(FALLBACK_DIR)
const api = await serve(API_DIR)

console.log("\nRotas e publicação (modo GitHub Pages)")
await check("as três rotas respondem 200 por acesso direto, sem login (aba anônima)", async () => {
  for (const p of ["/termos", "/privacidade", "/exclusao-de-conta", "/exclusao-de-conta/confirmar"]) {
    const r = await fetch(fb.base + p)
    assert.equal(r.status, 200, p)
  }
  assert.equal((await fetch(fb.base + "/rota-que-nao-existe")).status, 404)
})
await check("variante com barra final (/termos/) leva à URL canônica e preserva a âncora", async () => {
  const { context, page } = await newPage(fb.base, desktop)
  await page.goto(`${fb.base}/privacidade/#retencao`)
  await page.waitForURL(`${fb.base}/privacidade#retencao`)
  assert.equal(await page.locator("h1").innerText(), "Política de Privacidade")
  await context.close()
})

console.log("\nPolítica de Privacidade (texto atual preservado)")
{
  const { context, page, requests } = await newPage(fb.base, desktop)
  await page.goto(`${fb.base}/privacidade`)
  await check("título, versão, atualização e vigência sem inventar dados", async () => {
    assert.equal(await page.locator("h1").innerText(), "Política de Privacidade")
    const meta = await page.locator("dl").first().innerText()
    assert.match(meta, /Sem numeração/)
    assert.match(meta, /17 de julho de 2026/)
    assert.match(meta, /Não informado nesta versão/)
  })
  await check("12 seções no sumário, conteúdo íntegro e identificação/canais presentes", async () => {
    assert.equal(await page.locator('nav[aria-label="Sumário"] li').count(), 12)
    const text = await page.locator("main").innerText()
    assert.match(text, /Não vendemos dados pessoais dos usuários\./)
    assert.match(text, /4C Solutions/)
    assert.match(text, /suporte@guincheck\.com\.br/)
    assert.match(text, /61\.654\.517\/0001-99/)
  })
  await check("acesso visível à exclusão de conta e link para os Termos", async () => {
    assert.ok(await page.locator('main a[href="/exclusao-de-conta"]').first().isVisible())
    assert.ok(await page.locator('main a[href="/termos"]').first().isVisible())
  })
  await check("âncora estável (alias) leva à seção equivalente: #retencao, #exclusao-de-dados, #direitos-dos-titulares", async () => {
    for (const [hash, title] of [["retencao", "7. Retenção e exclusão"], ["exclusao-de-dados", "7. Retenção e exclusão"], ["direitos-dos-titulares", "8. Direitos do usuário"]]) {
      await page.goto(`${fb.base}/privacidade#${hash}`)
      await page.waitForTimeout(1300)
      const top = await page.evaluate((h) => document.getElementById(h).getBoundingClientRect().top, hash)
      assert.ok(top >= -2 && top < 300, `${hash} não foi para a área visível (top=${top})`)
      assert.ok(await page.getByRole("heading", { name: title }).isVisible())
    }
  })
  await check("sem cookies, sem armazenamento local, sem analytics e sem terceiros", async () => {
    assert.deepEqual(await context.cookies(), [])
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
    const foreign = requests.filter((u) => !u.startsWith(fb.base) && !u.startsWith("data:") && !u.startsWith("blob:"))
    assert.ok(!requests.some((u) => /_vercel|insights|analytics/i.test(u)), "analytics carregado")
    assert.deepEqual(foreign.filter((u) => !u.startsWith("https://legal.test") && !u.startsWith("https://us-central1-checklistguincho-doug.cloudfunctions.net/getPublicLegalDocument?type=")), [])
  })
  await check("impressão: sumário, cabeçalho e rodapé somem; texto integral permanece", async () => {
    await page.goto(`${fb.base}/privacidade`)
    await page.emulateMedia({ media: "print" })
    assert.equal(await page.locator('nav[aria-label="Informações legais"]').first().isVisible(), false)
    assert.equal(await page.locator("header").first().isVisible(), false)
    assert.equal(await page.locator("footer").count() === 0 || await page.locator("footer").first().isVisible() === false, true)
    assert.ok((await page.locator("article").innerText()).includes("12. Contato") || (await page.locator("main").innerText()).includes("12. Contato"))
    await page.emulateMedia({ media: "screen" })
  })
  await page.goto(`${fb.base}/privacidade`)
  await shot(page, "desktop-privacidade")
  await context.close()
}

console.log("\nTermos de Uso (sem texto vigente: não inventa conteúdo)")
{
  const { context, page } = await newPage(fb.base, desktop)
  await page.goto(`${fb.base}/termos`)
  await check("estado 'em atualização' com canais de contato e sem texto fictício", async () => {
    assert.equal(await page.locator("h1").innerText(), "Termos de Uso")
    assert.ok(await page.getByText("Documento em atualização").isVisible())
    assert.ok(await page.locator('a[href="mailto:suporte@guincheck.com.br"]').first().isVisible())
    assert.equal(await page.locator("article").count(), 0)
  })
  await shot(page, "desktop-termos-sem-documento")
  await context.close()
}

console.log("\nIntegração com o backend jurídico (simulado)")
{
  const doc = await publishedDoc("terms", "3.1")
  const { context, page } = await newPage(api.base, desktop, { live: async (type) => (type === "terms" ? doc : null) })
  await page.goto(`${api.base}/termos#whatsapp`)
  await check("versão publicada aparece (versão, publicação, vigência, integridade) e a âncora leva à seção", async () => {
    await page.getByText("3.1", { exact: true }).waitFor()
    const meta = await page.locator("dl").first().innerText()
    assert.match(meta, /3\.1/)
    assert.match(meta, /02 de novembro de 2026/)
    assert.match(meta, /01 de novembro de 2026/)
    assert.match(meta, new RegExp(doc.hash.slice(0, 12)))
    assert.equal(await page.locator('nav[aria-label="Sumário"] li').count(), 4)
    await page.waitForTimeout(1300)
    const top = await page.evaluate(() => document.getElementById("whatsapp").getBoundingClientRect().top)
    assert.ok(top >= -2 && top < 300, `top=${top}`)
  })
  await shot(page, "desktop-termos-publicado")
  await context.close()
}
await check("backend com documento adulterado (hash não confere) é ignorado", async () => {
  const doc = await publishedDoc("terms", "3.1")
  doc.sections[0].content = "Conteúdo trocado"
  const { context, page } = await newPage(api.base, desktop, { live: async () => doc })
  await page.goto(`${api.base}/termos`)
  await page.waitForTimeout(600)
  assert.ok(await page.getByText("Documento em atualização").isVisible())
  await context.close()
})
await check("backend indisponível (conexão falha): privacidade segue com o texto atual, sem erro na tela", async () => {
  const { context, page } = await newPage(api.base, desktop, { live: async () => null })
  await page.goto(`${api.base}/privacidade`)
  await page.waitForTimeout(600)
  assert.equal(await page.locator('nav[aria-label="Sumário"] li').count(), 12)
  await context.close()
})
await check("backend publica nova versão da privacidade: substitui o texto atual", async () => {
  const doc = await publishedDoc("privacy", "2.0")
  const { context, page } = await newPage(api.base, desktop, { live: async (t) => (t === "privacy" ? doc : null) })
  await page.goto(`${api.base}/privacidade`)
  await page.getByText("2.0", { exact: true }).waitFor()
  assert.equal(await page.locator('nav[aria-label="Sumário"] li').count(), 4)
  assert.equal(await page.locator("#inteligencia-artificial").count(), 1)
  await context.close()
})
await check("vigência futura não é exibida como atual", async () => {
  const doc = await publishedDoc("privacy", "9.9", { effectiveAt: "2099-01-01T00:00:00.000Z" })
  const { context, page } = await newPage(api.base, desktop, { live: async () => doc })
  await page.goto(`${api.base}/privacidade`)
  await page.waitForTimeout(600)
  assert.equal(await page.getByText("9.9", { exact: true }).count(), 0)
  await context.close()
})

console.log("\nCelular (390 px)")
{
  const doc = await publishedDoc("privacy", "2.0")
  const { context, page } = await newPage(api.base, mobile, { live: async (t) => (t === "privacy" ? doc : null) })
  await page.goto(`${api.base}/privacidade`)
  await page.getByText("2.0", { exact: true }).waitFor()
  await check("sem rolagem horizontal; sumário recolhido, abre, navega e recolhe", async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    const details = page.locator("details", { hasText: "Sumário" }).first()
    assert.equal(await details.evaluate((el) => el.open), false)
    await details.locator("summary").click()
    assert.equal(await details.evaluate((el) => el.open), true)
    await details.getByRole("link", { name: "WhatsApp" }).click()
    assert.equal(await details.evaluate((el) => el.open), false)
    await page.waitForTimeout(1300)
    assert.ok((await page.evaluate(() => document.getElementById("whatsapp").getBoundingClientRect().top)) < 400)
  })
  await check("alvos de toque com pelo menos 44 px nos links principais", async () => {
    const boxes = await page.locator("header nav a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    assert.ok(boxes.length === 3 && boxes.every((h) => h >= 44), JSON.stringify(boxes))
  })
  await page.goto(`${api.base}/privacidade`)
  await page.getByText("2.0", { exact: true }).waitFor()
  await shot(page, "mobile-privacidade", false)
  await context.close()
}

console.log("\nFormulário de exclusão — sem backend aprovado (caminho por e-mail)")
{
  const { context, page, requests } = await newPage(fb.base, desktop)
  await page.goto(`${fb.base}/exclusao-de-conta`)
  await shot(page, "desktop-exclusao-formulario")
  await check("conteúdo exigido: título, descrição, app/desenvolvedor, três avisos, checkbox desmarcado, botão", async () => {
    assert.equal(await page.locator("h1").innerText(), "Excluir minha conta")
    const text = await page.locator("main").innerText()
    assert.match(text, /Preencha o formulário abaixo para solicitar a exclusão da sua conta GuinCheck e dos dados pessoais associados\./)
    assert.match(text, /com\.ncc\.checklistguincho/)
    assert.match(text, /Douglas Pallone Vasconcelos dos Santos/)
    assert.match(text, /salve os checklists e PDFs que deseja conservar/)
    assert.match(text, /verifique também o cancelamento no canal em que realizou a contratação/)
    assert.match(text, /fundamento jurídico legítimo/)
    assert.equal(await page.getByLabel("Confirmo que desejo solicitar").isChecked(), false)
    assert.ok(await page.getByRole("button", { name: "Solicitar exclusão da conta" }).isVisible())
    const reasons = await page.locator("select option").allInnerTexts()
    assert.deepEqual(reasons.slice(1), ["Não utilizo mais o aplicativo", "Encontrei outra solução", "Preço da assinatura", "Dificuldades técnicas", "Questões de privacidade", "Outro motivo", "Prefiro não informar"])
    assert.equal(await page.locator('input[name="cpf"], input[type="password"]').count(), 0, "não pede CPF nem senha")
  })
  await check("erros por campo, associados e anunciados; foco no primeiro inválido; checkbox obrigatório", async () => {
    await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
    const email = page.getByLabel(/E-mail cadastrado/)
    assert.equal(await email.getAttribute("aria-invalid"), "true")
    const describedBy = await email.getAttribute("aria-describedby")
    assert.match(await page.locator(`[id="${describedBy}"]`).innerText(), /Informe o e-mail/)
    assert.equal(await email.evaluate((el) => el === document.activeElement), true)
    await email.fill("isto-nao-e-email")
    await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
    assert.match(await page.locator(`[id="${await email.getAttribute("aria-describedby")}"]`).innerText(), /parece estar incorreto/)
    await email.fill("pessoa@example.com")
    await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
    const box = page.getByLabel("Confirmo que desejo solicitar")
    assert.equal(await box.getAttribute("aria-invalid"), "true")
    assert.match(await page.locator(`[id="${await box.getAttribute("aria-describedby")}"]`).innerText(), /Marque a caixa/)
  })
  await check("e-mail válido + caixa marcada: NÃO diz 'recebida'; pede para enviar o e-mail; nada vai à rede; URL limpa", async () => {
    await page.getByLabel("Confirmo que desejo solicitar").check()
    await page.getByLabel(/Motivo da exclusão/).selectOption("price")
    const before = requests.length
    await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
    await page.getByRole("heading", { name: "Falta enviar o e-mail" }).waitFor()
    const text = await page.locator("main").innerText()
    assert.match(text, /Sua solicitação ainda não foi enviada/)
    assert.doesNotMatch(text, /Solicitação recebida|protocolo/i)
    const href = await page.getByRole("link", { name: "Abrir meu e-mail" }).getAttribute("href")
    assert.ok(href.startsWith("mailto:suporte@guincheck.com.br?subject="))
    assert.match(decodeURIComponent(href), /pessoa@example\.com/)
    assert.equal(requests.slice(before).filter((u) => !u.startsWith("data:")).length, 0, "houve requisição de rede")
    assert.equal(new URL(page.url()).search, "")
    assert.equal(new URL(page.url()).hash, "")
  })
  await shot(page, "desktop-exclusao-envie-email")
  await check("sem cookies nem armazenamento local, sem analytics", async () => {
    assert.deepEqual(await context.cookies(), [])
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0)
    assert.ok(!requests.some((u) => /_vercel|insights|analytics/i.test(u)))
  })
  await check("navegação só por teclado: Tab segue a ordem visual: e-mail, motivo, link da Política, caixa e botão", async () => {
    await page.goto(`${fb.base}/exclusao-de-conta`)
    await page.getByLabel(/E-mail cadastrado/).focus()
    const order = []
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("Tab")
      order.push(await page.evaluate(() => document.activeElement.tagName + ":" + (document.activeElement.getAttribute("type") || "")))
    }
    assert.deepEqual(order, ["SELECT:", "A:", "INPUT:checkbox", "BUTTON:submit"])
  })
  await context.close()
}

console.log("\nFormulário de exclusão — com backend (simulado)")
async function apiPage(handler, opts = desktop) {
  const ctx = await newPage(api.base, opts)
  const calls = []
  await ctx.page.route("https://api.test/**", async (route) => {
    const req = route.request()
    calls.push({ url: req.url(), method: req.method(), body: req.postData() ? JSON.parse(req.postData()) : null, headers: req.headers() })
    return handler(route, calls)
  })
  await ctx.page.goto(`${api.base}/exclusao-de-conta`)
  return { ...ctx, calls }
}
const fillValid = async (page) => {
  await page.getByLabel(/E-mail cadastrado/).fill("  Pessoa@Example.com ")
  await page.getByLabel(/Motivo da exclusão/).selectOption("technical")
  await page.getByLabel("Confirmo que desejo solicitar").check()
}
const ok = (route, extra = {}) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, ...extra }) })
const cors = (route) => route.request().method() === "OPTIONS" && route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" } })

await check("envio válido: payload mínimo, 'Solicitação recebida', protocolo exibido e copiável, nunca 'conta excluída'", async () => {
  const { context, page, calls } = await apiPage(async (route) => (await cors(route)) || ok(route, { protocol: "PRV-20261127-K7M2QX" }))
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {})
  await fillValid(page)
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  await page.getByRole("heading", { name: "Solicitação recebida" }).waitFor()
  const post = calls.find((c) => c.method === "POST")
  assert.equal(post.url, "https://api.test/requestSiteAccountDeletion")
  assert.equal(post.body.email, "Pessoa@Example.com")
  assert.equal(post.body.reason, "technical")
  assert.equal(post.body.confirmed, true)
  assert.equal(post.body.website, "")
  assert.match(post.body.requestId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(Object.keys(post.body).sort(), ["confirmed", "email", "reason", "requestId", "website"])
  assert.equal(post.headers.cookie, undefined)
  const text = await page.locator("main").innerText()
  assert.match(text, /Recebemos sua solicitação de exclusão de conta\. Caso seja necessário confirmar sua identidade ou obter informações adicionais, nossa equipe entrará em contato pelo e-mail informado\./)
  assert.match(text, /PRV-20261127-K7M2QX/)
  assert.doesNotMatch(text, /excluída|prazo|dias úteis/i)
  assert.equal(new URL(page.url()).search, "")
  await shot(page, "desktop-exclusao-recebida")
  await context.close()
})
await check("clique duplo e Enter repetido: uma única requisição; botão em estado de carregamento", async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const { context, page, calls } = await apiPage(async (route) => {
    if (await cors(route)) return
    await gate
    return ok(route, { protocol: "PRV-20261127-AAAAAA" })
  })
  await fillValid(page)
  const button = page.getByRole("button", { name: "Solicitar exclusão da conta" })
  await button.dblclick()
  await page.keyboard.press("Enter")
  await page.getByRole("button", { name: /Enviando/ }).waitFor()
  assert.equal(await page.getByRole("button", { name: /Enviando/ }).isDisabled(), true)
  await page.waitForTimeout(250)
  release()
  await page.getByRole("heading", { name: "Solicitação recebida" }).waitFor()
  assert.equal(calls.filter((c) => c.method === "POST").length, 1)
  await context.close()
})
await check("falha 500: mensagem clara, dados mantidos, canais de suporte, nova tentativa usa o mesmo requestId", async () => {
  let n = 0
  const { context, page, calls } = await apiPage(async (route) => {
    if (await cors(route)) return
    n += 1
    return n === 1 ? route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }) : ok(route, { protocol: "PRV-20261127-BBBBBB" })
  })
  await fillValid(page)
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  const alert = page.getByRole("alert").filter({ hasText: "Não conseguimos" })
  await alert.waitFor()
  const t = await alert.innerText()
  assert.match(t, /Não conseguimos enviar sua solicitação agora/)
  assert.match(t, /suporte@guincheck\.com\.br/)
  assert.equal(await page.getByLabel(/E-mail cadastrado/).inputValue(), "Pessoa@Example.com")
  assert.equal(await page.getByLabel("Confirmo que desejo solicitar").isChecked(), true)
  await shot(page, "desktop-exclusao-erro")
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  await page.getByRole("heading", { name: "Solicitação recebida" }).waitFor()
  const posts = calls.filter((c) => c.method === "POST")
  assert.equal(posts.length, 2)
  assert.equal(posts[0].body.requestId, posts[1].body.requestId)
  await context.close()
})
await check("falha de conexão: não finge sucesso; permite tentar de novo", async () => {
  const { context, page } = await apiPage((route) => route.abort("failed"))
  await fillValid(page)
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  await page.getByRole("alert").filter({ hasText: "Não conseguimos" }).waitFor()
  assert.equal(await page.getByRole("heading", { name: "Solicitação recebida" }).count(), 0)
  assert.equal(await page.getByRole("button", { name: "Solicitar exclusão da conta" }).isEnabled(), true)
  await context.close()
})
await check("429: orienta a aguardar", async () => {
  const { context, page } = await apiPage(async (route) => (await cors(route)) || route.fulfill({ status: 429, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }))
  await fillValid(page)
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  assert.match(await page.getByRole("alert").filter({ hasText: "Muitas tentativas" }).innerText(), /Muitas tentativas/)
  await context.close()
})
await check("sucesso sem protocolo: não inventa número", async () => {
  const { context, page } = await apiPage(async (route) => (await cors(route)) || ok(route))
  await fillValid(page)
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  await page.getByRole("heading", { name: "Solicitação recebida" }).waitFor()
  assert.doesNotMatch(await page.locator("main").innerText(), /protocolo/i)
  await context.close()
})
await check("validação no cliente impede a chamada (e-mail inválido / caixa desmarcada)", async () => {
  const { context, page, calls } = await apiPage(async (route) => (await cors(route)) || ok(route))
  await page.getByLabel(/E-mail cadastrado/).fill("x")
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  await page.getByLabel(/E-mail cadastrado/).fill("pessoa@example.com")
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  assert.equal(calls.length, 0)
  await context.close()
})

console.log("\nConfirmação de titularidade (simulada)")
{
  const token = "Zx9_-" + "a".repeat(38)
  await check("link do e-mail: código no fragmento, removido da barra de endereço; confirma só no clique", async () => {
    const { context, page, calls } = await (async () => {
      const c = await newPage(api.base, desktop)
      const calls = []
      await c.page.route("https://api.test/**", async (route) => {
        calls.push({ method: route.request().method(), body: route.request().postData() })
        return (await cors(route)) || ok(route)
      })
      return { ...c, calls }
    })()
    await page.goto(`${api.base}/exclusao-de-conta/confirmar#t=${token}`)
    await page.getByRole("button", { name: "Confirmar meu e-mail" }).and(page.locator(":enabled")).waitFor()
    assert.equal(new URL(page.url()).hash, "", "código não deve ficar na URL")
    assert.equal(calls.length, 0, "abrir a página não confirma nada")
    await page.getByRole("button", { name: "Confirmar meu e-mail" }).click()
    await page.getByRole("heading", { name: "E-mail confirmado" }).waitFor()
    const post = calls.find((c) => c.method === "POST")
    assert.equal(JSON.parse(post.body).token, token)
    const text = await page.locator("main").innerText()
    assert.match(text, /A conta ainda não foi excluída/)
    await context.close()
  })
  await check("link sem código ou com código inválido: mensagem clara e botão desabilitado / erro", async () => {
    const c = await newPage(api.base, desktop)
    await c.page.goto(`${api.base}/exclusao-de-conta/confirmar`)
    await c.page.getByText(/link está incompleto/).waitFor()
    assert.equal(await c.page.getByRole("button", { name: "Confirmar meu e-mail" }).isDisabled(), true)
    await c.page.route("https://api.test/**", async (route) => (await cors(route)) || route.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" }))
    await c.page.goto(`${api.base}/exclusao-de-conta/confirmar#t=${token}`)
    await c.page.getByRole("button", { name: "Confirmar meu e-mail" }).and(c.page.locator(":enabled")).click()
    await c.page.getByText(/não é mais válido/).waitFor()
    await c.context.close()
  })
}

console.log("\nCelular — formulário")
{
  const { context, page } = await apiPage(async (route) => (await cors(route)) || ok(route, { protocol: "PRV-20261127-K7M2QX" }), mobile)
  await check("sem rolagem horizontal; botão e campos com altura de toque adequada", async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    const h = await page.getByRole("button", { name: "Solicitar exclusão da conta" }).evaluate((e) => e.getBoundingClientRect().height)
    assert.ok(h >= 48)
  })
  await shot(page, "mobile-exclusao-formulario")
  await fillValid(page)
  await page.getByRole("button", { name: "Solicitar exclusão da conta" }).click()
  await page.getByRole("heading", { name: "Solicitação recebida" }).waitFor()
  await shot(page, "mobile-exclusao-recebida", false)
  await context.close()
}

console.log("\nRodapé")
await check("home: seção 'Informações legais' com os 4 links; links existentes preservados", async () => {
  const { context, page } = await newPage(fb.base, desktop)
  await page.goto(fb.base)
  const nav = page.locator('footer nav[aria-label="Informações legais"]')
  assert.deepEqual(await nav.locator("a").allInnerTexts(), ["Termos de Uso", "Política de Privacidade", "Exclusão de conta", "Contato e suporte"])
  assert.deepEqual(await nav.locator("a").evaluateAll((a) => a.slice(0, 3).map((x) => x.getAttribute("href"))), ["/termos", "/privacidade", "/exclusao-de-conta"])
  assert.ok((await page.locator('a[href^="https://app.guincheck.com.br"]').count()) >= 1, "link do app preservado")
  assert.ok((await page.locator('a[href^="https://wa.me/5511926913999"]').count()) >= 1, "WhatsApp preservado")
  await context.close()
})

await browser.close()
fb.server.close()
api.server.close()
const failed = results.filter(([ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`)
process.exit(failed.length ? 1 : 0)

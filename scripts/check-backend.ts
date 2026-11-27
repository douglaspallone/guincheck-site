// Validação integrada do site contra um backend GuinCheck REAL de teste/homologação.
// Roda quando o backend estiver disponível; não faz parte do build nem do `npm test`.
//
//   node scripts/check-backend.ts                      -> só leitura: documentos legais, hashes, âncoras, CORS
//   node scripts/check-backend.ts --submit             -> também cria solicitações de TESTE (exige e-mails de teste)
//
// Variáveis:
//   LEGAL_BASE   base da leitura pública (padrão: NEXT_PUBLIC_LEGAL_API_BASE_URL ou o Cloud Functions do projeto)
//   PRIVACY_BASE base dos endpoints requestSiteAccountDeletion / confirmSiteAccountDeletion
//   TEST_EMAIL_EXISTS   e-mail de uma conta DE TESTE existente   (só com --submit)
//   TEST_EMAIL_UNKNOWN  e-mail que não existe no GuinCheck        (só com --submit)
//   TURNSTILE_TOKEN     token válido, se o Turnstile estiver ativo (só com --submit)
//
// Nunca use e-mails de clientes reais. O envio cria registros reais em "Solicitações de privacidade" do ambiente
// apontado: aponte apenas para homologação ou apague/encerre os registros de teste depois.
import { isEffective } from "../lib/legal/document.ts"
import { fetchLiveDocument } from "../lib/legal/live.ts"
import { confirmDeletionRequest, submitDeletionRequest } from "../lib/privacy/deletion.ts"

const LEGAL_BASE = process.env.LEGAL_BASE || process.env.NEXT_PUBLIC_LEGAL_API_BASE_URL || "https://us-central1-checklistguincho-doug.cloudfunctions.net"
const PRIVACY_BASE = process.env.PRIVACY_BASE || ""
const ANCHORS = ["inteligencia-artificial", "whatsapp", "retencao", "exclusao-de-dados", "direitos-dos-titulares"]
const SITE_ORIGIN = "https://guincheck.com.br"

let failures = 0
let warnings = 0
const ok = (msg: string) => console.log(`  ✔ ${msg}`)
const warn = (msg: string) => (warnings++, console.log(`  ! ${msg}`))
const fail = (msg: string) => (failures++, console.log(`  ✘ ${msg}`))

async function legal() {
  console.log(`\nDocumentos legais (${LEGAL_BASE})`)
  for (const type of ["terms", "privacy"] as const) {
    const doc = await fetchLiveDocument(LEGAL_BASE, type)
    if (!doc) {
      warn(`${type}: sem documento íntegro (404 "não publicado", rede ou hash divergente). O site segue com cópia/legado.`)
      continue
    }
    ok(`${type}: versão ${doc.version}, hash ${doc.hash.slice(0, 12)}… conferido, publicado ${doc.publishedAt ?? "?"}, vigência ${doc.effectiveAt}`)
    if (!isEffective(doc, Date.now())) fail(`${type}: vigência no futuro — o site não a exibirá como atual`)
    const ids = new Set(doc.sections.map((s) => s.id))
    if (type === "privacy") {
      for (const id of ANCHORS) (ids.has(id) ? ok : warn)(`âncora #${id} ${ids.has(id) ? "presente" : "AUSENTE (o site usa alias quando existir equivalente)"}`)
    }
  }
}

async function cors() {
  if (!PRIVACY_BASE) return
  console.log(`\nCORS dos endpoints públicos (${PRIVACY_BASE})`)
  for (const name of ["requestSiteAccountDeletion", "confirmSiteAccountDeletion"]) {
    for (const [origin, expected] of [[SITE_ORIGIN, true], ["https://outro-site.example", false]] as const) {
      try {
        const res = await fetch(`${PRIVACY_BASE.replace(/\/+$/, "")}/${name}`, {
          method: "OPTIONS",
          headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
        })
        const allow = res.headers.get("access-control-allow-origin")
        const allowed = allow === origin || allow === "*"
        if (expected && !allowed) fail(`${name}: origem do site NÃO permitida (allow-origin=${allow})`)
        else if (!expected && allowed) warn(`${name}: aceita origem ${origin} (CORS não é proteção contra abuso, mas convém restringir)`)
        else ok(`${name}: origem ${origin} ${allowed ? "permitida" : "bloqueada"}`)
      } catch (error) {
        fail(`${name}: sem resposta ao preflight (${(error as Error).message})`)
      }
    }
  }
}

async function submit() {
  const exists = process.env.TEST_EMAIL_EXISTS
  const unknown = process.env.TEST_EMAIL_UNKNOWN
  if (!PRIVACY_BASE || !exists || !unknown) {
    fail("--submit exige PRIVACY_BASE, TEST_EMAIL_EXISTS e TEST_EMAIL_UNKNOWN")
    return
  }
  console.log("\nSolicitação pública e proteção contra enumeração (cria registros de TESTE)")
  const turnstileToken = process.env.TURNSTILE_TOKEN
  const runs: Array<{ kind: string; protocol?: string | null; ms: number }> = []
  for (const email of [exists, unknown]) {
    const started = Date.now()
    const result = await submitDeletionRequest(PRIVACY_BASE, { email, reason: null, turnstileToken, requestId: crypto.randomUUID() })
    runs.push({ kind: result.kind, protocol: result.kind === "received" ? result.protocol : undefined, ms: Date.now() - started })
  }
  const [a, b] = runs
  if (a.kind !== "received" || b.kind !== "received") {
    fail(`resultados: com conta=${a.kind}, sem conta=${b.kind} (esperado: "received" nos dois; se o Turnstile estiver ativo, informe TURNSTILE_TOKEN)`)
    return
  }
  ok("ambos recebidos")
  a.protocol && b.protocol ? ok("ambos devolveram protocolo, com o mesmo formato") : fail(`protocolo diverge (com conta=${a.protocol}, sem conta=${b.protocol})`)
  Math.abs(a.ms - b.ms) < 1500 ? ok(`tempos próximos (${a.ms} ms x ${b.ms} ms)`) : warn(`tempos diferentes (${a.ms} ms x ${b.ms} ms): pode permitir enumeração por tempo`)

  const dup = await submitDeletionRequest(PRIVACY_BASE, { email: exists, reason: null, turnstileToken, requestId: crypto.randomUUID() })
  dup.kind === "received" ? ok("segundo pedido do mesmo e-mail também é tratado como recebido") : warn(`segundo pedido: ${dup.kind}`)

  console.log("\nConfirmação")
  const bogus = await confirmDeletionRequest(PRIVACY_BASE, "A".repeat(43))
  ;["invalid_token", "expired"].includes(bogus.kind) ? ok(`código inexistente rejeitado (${bogus.kind})`) : fail(`código inexistente retornou ${bogus.kind}`)
  console.log("  • Confirmação real, link expirado, reenvio e chegada ao Ops: manuais (ver docs/validacao-integrada.md).")
}

await legal()
await cors()
if (process.argv.includes("--submit")) await submit()
else console.log("\n(sem --submit: nenhuma solicitação foi criada)")
console.log(`\n${failures} falha(s), ${warnings} aviso(s)`)
process.exitCode = failures ? 1 : 0

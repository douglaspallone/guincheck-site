# Entrega — páginas legais, exclusão de conta e rodapé

## 1. Diagnóstico

- Site institucional: **Next.js 16 (App Router) com `output: 'export'`**, Tailwind 4 + componentes shadcn, pnpm.
- Publicação: GitHub Pages por Actions (`.github/workflows/deploy.yml`), a cada push em `main`; artefato `./out`;
  domínio `guincheck.com.br` via `public/CNAME` (não alterado). Repositório: `douglaspallone/Site_Guincheck`.
- Já existia `/privacidade` em produção (`origin/main`, commit `ce3d9df`, texto fixo no código; a `main` local estava
  10 commits atrás e não foi tocada). Não havia Termos nem exclusão de conta. O Pages serve `/rota` a partir de `rota.html`.
- Sem backend no repositório. O backend jurídico está em desenvolvimento em `guincheck-legal-docs`
  (`feat/legal-documents-backend`, ainda sem commit/deploy): já define leitura pública e solicitações de privacidade.

## 2. Arquivos

Novos: `app/termos`, `app/exclusao-de-conta` (+ `/confirmar`), `components/legal/*`, `components/account-deletion/*`,
`components/conditional-analytics.tsx`, `lib/institutional.ts`, `lib/legal/*`, `lib/privacy/deletion.ts`,
`content/legal/{legacy,synced}`, `scripts/sync-legal.ts`, `public/{termos,privacidade,exclusao-de-conta}/index.html`
(redirecionam a variante com barra final, preservando `#âncora`), `tests/*`, `docs/*`.
Alterados: `app/privacidade/page.tsx` (mesmo texto, nova estrutura), `components/footer.tsx` (Informações legais),
`app/layout.tsx` (analytics condicional, `metadataBase`), `package.json` (scripts), `tsconfig.json`
(`allowImportingTsExtensions`), `deploy.yml` (Node 22, testes, variáveis públicas).
**Home e blocos comerciais não foram modificados** (só o rodapé, que ganhou a área legal).

## 3. Estrutura das páginas

`/termos` e `/privacidade`: título, versão, data de publicação/atualização, início da vigência, código de integridade,
sumário (lateral fixo no desktop; recolhível no celular), texto integral, botão de impressão (a impressão oculta menus),
links cruzados, identificação e canais. `/privacidade` tem chamada visível para "Excluir minha conta".
`/exclusao-de-conta`: título e descrição pedidos, identificação do app (GuinCheck, `com.ncc.checklistguincho`) e do
desenvolvedor, formulário, avisos, checkbox desmarcado, botão amarelo com estado de carregamento.
Sem login, sem cookies, sem analytics (o `Analytics` global é suprimido nestas rotas), sem dados em URL.

## 4. Testes

- `npm test`: 23 testes (hash cruzado com o código real do backend, validação estrita, adulteração, vigência,
  precedência, âncoras, datas, leitura ao vivo, e-mail, formulário, rede/timeout/5xx/429, token no fragmento).
- `tests/e2e/smoke.mjs` (Chromium/Playwright, backend simulado, **sem contas reais**): 32 verificações — rotas diretas
  e variante com barra, texto legado preservado, âncoras, impressão, sem cookies/armazenamento/terceiros, backend
  indisponível/adulterado/futuro/novo, celular 390 px, teclado, erros associados, caminho por e-mail sem simular
  recebimento, envio válido, clique duplo (1 requisição), 500/rede/429 com nova tentativa, confirmação por fragmento, rodapé.
- Resultado: 23/23 e 32/32. Não cobertos (dependem de infraestrutura ainda inexistente): envio real de e-mail,
  Turnstile real, enumeração de contas, registro no Ops, iOS/Safari físico (usado Chromium; layout sem recursos
  específicos), DNS/HTTPS reais. Evidências: `docs/evidencias/*.jpg`.

## 5. Plano de publicação e rollback

1. Revisar o PR. Confirmar as pendências abaixo (principalmente 1 e 2).
2. Merge em `main` dispara o deploy (não feito aqui). Depois do deploy: abrir as 3 URLs em aba anônima.
3. Para ligar o formulário: criar as variáveis do repositório `NEXT_PUBLIC_PRIVACY_API_BASE_URL` (e, se usar,
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) e rodar o workflow (`workflow_dispatch`). Todas são públicas.
4. Quando o Ops publicar os documentos: `npm run legal:sync`, commitar `content/legal/synced/*.json` e fazer deploy.
   Até lá a leitura ao vivo já atualiza a página sozinha.
5. **Rollback:** esvaziar a variável (volta ao caminho por e-mail) + `workflow_dispatch`; ou `git revert` do merge e
   novo deploy. O Pages mantém o histórico de execuções para reimplantar o commit anterior.

## 6. Pendências (decisões/dependências)

1. **E-mail transacional**: não existe no backend; sem ele o formulário público não pode ser ativado
   (`contrato-exclusao-de-conta.md`). Pode haver custo: aguarda autorização.
2. **Endpoints `requestSiteAccountDeletion` / `confirmSiteAccountDeletion`** e selo de identidade no Ops: frente App/Ops.
3. **Backend jurídico** ainda sem commit/deploy; confirmar a URL base e as IDs reservadas (`contrato-documentos-legais.md`).
4. **Termos de Uso**: não há texto vigente publicado; `/termos` mostra "em atualização" até o Ops publicar.
   Se o app já aponta para `/termos`, a página não pode ficar assim em produção por muito tempo.
5. **Texto legado de `/privacidade`** (não alterado por restrição): cita "4C Solutions" e telefone como responsável,
   o que diverge dos dados empresariais informados; não menciona IA, WhatsApp nem Turnstile/exclusão por site.
6. **Bloco "Identificação e contato"** publica razão social, CNPJ, município e o nome do encarregado indicado (dados
   informados no pedido), com rótulos neutros. Confirmar a publicação e, depois, o papel jurídico.
7. **Play Console (não alterado):** conferir se a URL de privacidade cadastrada é `https://guincheck.com.br/privacidade`;
   cadastrar `https://guincheck.com.br/exclusao-de-conta` no campo de exclusão de conta; revisar a declaração de
   *Segurança dos dados* (exclusão disponível por URL, dados excluídos x conservados, fotos/assinaturas/PDFs) **somente
   após** o fluxo real estar ativo. Enquanto o formulário usa e-mail, a página deixa claro que o usuário precisa enviá-lo.
8. Turnstile (opcional, gratuito, exige conta Cloudflare): carrega `challenges.cloudflare.com` apenas nesta página e só
   com chave configurada; sem ele, a proteção fica no servidor (limite por hash, isca, validação).
9. Local: reinstalei `node_modules` (links do pnpm apontavam para um caminho antigo), sem mudar o lockfile.
10. A leitura ao vivo faz uma chamada pública ao Cloud Functions do projeto (o IP do visitante chega ao Google Cloud).

## 7. URLs para a Google Play

- Política de Privacidade: `https://guincheck.com.br/privacidade`
- Exclusão de conta e dados: `https://guincheck.com.br/exclusao-de-conta`
- (Termos: `https://guincheck.com.br/termos`; confirmação por e-mail: `https://guincheck.com.br/exclusao-de-conta/confirmar#t=<token>`)

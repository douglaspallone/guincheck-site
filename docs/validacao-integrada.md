# Validação integrada — estado em 27/11/2026

Resumo: **o backend ainda não está disponível para teste integrado.** Este documento separa o que já foi validado
(com o código real do backend, mas sem rede) do que depende do ambiente de homologação, e diz como executar o resto.

## Situação das dependências

| Item | Estado |
|---|---|
| `getPublicLegalDocument` | Commitado em `guincheck-legal-docs` (`feat/legal-documents-backend`); **produção ainda responde "não publicado"** (verificado por leitura real) |
| `requestSiteAccountDeletion` / `confirmSiteAccountDeletion` | **Não existem** em nenhum repositório; contrato definitivo pendente |
| E-mail transacional, Turnstile (servidor), selo de identidade no Ops | Pendentes (frente Ops/backend) |
| Emulador Firebase local | Não executável aqui (Java 1.8; os emuladores exigem 11+) |

## Já validado

| Requisito | Evidência |
|---|---|
| Hash dos documentos | Vetor gerado pelo código real do backend commitado (`tests/fixtures/server-document*.json`), reconferido no navegador; regeneração hoje deu resultado idêntico |
| Atualização independente das versões | e2e: documento publicado substitui o texto atual; vigência futura e documento adulterado são ignorados |
| Fallback na indisponibilidade | e2e: falha de rede, 404 e HTML inválido mantêm o texto atual; `synced` mostra aviso |
| Links diretos | e2e (documento do backend real com os cinco ids): `#inteligencia-artificial`, `#whatsapp`, `#retencao`, `#exclusao-de-dados`, `#direitos-dos-titulares` com carga fria e conteúdo tardio; no texto legado, `#retencao`, `#exclusao-de-dados` e `#direitos-dos-titulares` por alias |
| Solicitação pública (simulada) | e2e: payload mínimo, protocolo só com `ok: true`, 500/rede/429/400 sem sucesso falso, repetição com o mesmo `requestId`, clique duplo = 1 requisição |
| Confirmação | e2e: código no fragmento e removido da barra de endereço; confirma só no clique; expirado (410), inválido e sem código |
| Enumeração (lado do site) | O site nunca mostra texto do servidor; tela idêntica para respostas equivalentes. **A equivalência do servidor não foi testada** (não existe) |
| Caminho por e-mail | e2e: sem backend configurado nada vai à rede e a tela diz que o e-mail ainda precisa ser enviado |
| Privacidade da página | e2e: sem cookies, sem armazenamento local, sem analytics, sem terceiros (só a leitura pública) |

Totais: `npm test` 24/24; `tests/e2e/smoke.mjs` 43/43 em Chromium **e** 43/43 em WebKit.

## Safari / iOS — o que foi e o que não foi possível

- Executado: **WebKit 27.2 (Playwright)** com o perfil *iPhone 13* nas verificações de celular; todas passaram.
- Achado e corrigido nesta rodada (apareceu no WebKit): texto digitado antes de a página carregar era apagado, e um
  envio antes do carregamento seria nativo (colocaria o e-mail na URL). Agora os campos não são controlados e o botão
  fica desabilitado até a página estar pronta; há testes para os dois casos (sem JS e com carregamento lento).
- Também ajustado: marcador nativo do `<details>` (Safari) no sumário.
- Limitações: o WebKit do Playwright **não é o Safari do iPhone** (sem teclado virtual, zoom automático, barra de
  endereço dinâmica, gestos nem o motor exato do iOS). Em Safari o Tab não passa por links por padrão (só
  Option+Tab): comportamento do navegador, o teste espera isso. Falta conferir em aparelho real: foco/zoom nos
  campos (usam 16 px), impressão/PDF e a abertura do `mailto:` no app de e-mail do iOS.

## Como executar o resto quando o backend de teste existir

1. `node scripts/check-backend.ts` (só leitura): confere documentos reais, hash, vigência, âncoras e CORS.
2. `PRIVACY_BASE=… TEST_EMAIL_EXISTS=… TEST_EMAIL_UNKNOWN=… node scripts/check-backend.ts --submit`
   (**cria solicitações de teste**, só em homologação, só com e-mails de teste): equivalência de respostas, formato do
   protocolo, tempos, repetição, código inexistente. Com Turnstile ativo, informar `TURNSTILE_TOKEN`.
3. Manuais, com conta de teste: receber o e-mail; abrir o link (a página só confirma no clique); confirmar; deixar
   expirar e ver "O prazo deste link terminou"; "Pedir um novo link" e conferir que o primeiro link deixa de valer;
   ver a solicitação em Ops › Solicitações de privacidade com origem `site` e selo de identidade; tentar concluir
   como "Conta excluída" **sem** identidade confirmada e **sem** UID e confirmar que o backend bloqueia; derrubar o
   backend e ver a mensagem de indisponibilidade com o caminho por e-mail; Turnstile: bloqueio sem token.
4. Para ligar na publicação coordenada: variáveis `NEXT_PUBLIC_PRIVACY_API_BASE_URL` (e `…TURNSTILE_SITE_KEY`) e
   `npm run legal:sync` depois que o Ops publicar. **Nada disso foi feito agora** (sem merge, deploy ou Play Console).

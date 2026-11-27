# Contrato — documentos legais públicos (Ops → site)

Fonte única: o backend do GuinCheck (`guincheck-legal-docs`, `functions/src/legalDocuments*.ts`). O site **não** cria
outro esquema de versionamento: lê, valida e desenha. Referência no backend (ainda não publicado em produção, em
desenvolvimento na branch `feat/legal-documents-backend`).

## Leitura pública

`GET {LEGAL_API_BASE_URL}/getPublicLegalDocument?type=terms|privacy`
(padrão `https://us-central1-checklistguincho-doug.cloudfunctions.net`, CORS `*`, sem credenciais)

`200 { "document": PublicDocument }`, `404` enquanto nada foi publicado separadamente. `PublicDocument`
(`lib/legal/types.ts`): `type`, `version`, `hash`, `title`, `summary`, `effectiveAt`, `publishedAt`,
`sections[{ id, title, content, blocks }]`.

O site não recebe nem exibe: rascunhos, histórico, aceites, usuários, operadores, auditoria. O parser
(`parsePublicDocument`) descarta qualquer campo fora do contrato.

## Regras de exibição (`lib/legal/document.ts`)

1. Forma estrita (tipo esperado, versão, hash hex de 64, ids de seção `[a-z0-9-]`, blocos conhecidos, links só
   `https:`/`mailto:`). Texto sempre entra como nó de texto do React; nunca HTML.
2. **Hash conferido no navegador** com o mesmo algoritmo do servidor (JSON canônico + SHA-256). Verificado contra um
   vetor gerado pelo código real do backend (`tests/fixtures/server-document.json`). Não confere → ignorado.
3. Vigência futura (o backend ainda não suporta) nunca é exibida como atual.
4. Falha/404/adulteração → permanece a fonte local; nada é inventado.

## Fontes e precedência

1. **Ao vivo** (leitura pública nesta visita, íntegra e vigente);
2. **Cópia confirmada** `content/legal/synced/<tipo>.json` (`npm run legal:sync`, também no `prebuild`; só grava
   documento íntegro e vigente; mostra aviso "última versão confirmada" se o ao vivo falhar);
3. **Legado** `content/legal/legacy/privacy.json`: o texto que o site **já publicava** em `/privacidade`
   (commit `ce3d9df`), convertido em dados pelo AST do TSX, sem alteração de redação. Sem versão, hash ou vigência
   declarados (a página diz "Sem numeração" / "Não informado nesta versão").

Termos de Uso não existiam no site: sem fonte, `/termos` mostra "Documento em atualização" com os canais de contato.

## Âncoras

Os ids vêm do documento publicado. Reservado no backend: `inteligencia-artificial`. O app pediu também
`whatsapp`, `retencao`, `exclusao-de-dados` e `direitos-dos-titulares`. **Pendência para o Ops:** acrescentar esses
quatro a `RESERVED_SECTION_IDS` (mesmo mecanismo da IA), para que o editor os exija. Enquanto isso o site resolve
**aliases** (`ANCHOR_ALIASES`): `#retencao` e `#exclusao-de-dados` → "Retenção e exclusão";
`#direitos-dos-titulares` → "Direitos do usuário". Um id real igual ao alias sempre prevalece. Ids do texto legado:
`dados-coletados`, `como-usamos-os-dados`, `armazenamento-local-e-sincronizacao`, `compartilhamento-de-dados`,
`fotos-assinaturas-e-documentos`, `seguranca-dos-dados`, `retencao-e-exclusao`, `direitos-do-usuario`,
`permissoes-do-dispositivo`, `criancas-e-adolescentes`, `alteracoes-nesta-politica`, `contato`.
O texto legado **não tem** seções de IA nem WhatsApp, então `#inteligencia-artificial` e `#whatsapp` só funcionam
depois da publicação pelo Ops.

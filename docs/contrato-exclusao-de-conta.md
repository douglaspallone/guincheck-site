# Contrato — solicitação pública de exclusão de conta (site → backend GuinCheck)

Status: **proposta para o backend** (frente GuinCheck App/Ops). O site já implementa o lado cliente
(`lib/privacy/deletion.ts`, `components/account-deletion/*`) e fica **desligado** até existir endpoint
aprovado: sem `NEXT_PUBLIC_PRIVACY_API_BASE_URL` a página usa o caminho por e-mail e não simula recebimento nem protocolo.

## Por que um endpoint novo

O mecanismo de solicitações de privacidade em desenvolvimento (`guincheck-legal-docs`, branch
`feat/legal-documents-backend`: `privacyRequests.ts`, `privacyRequestsAdmin.ts`) **reaproveita-se integralmente**
(coleção `privacyRequests`, estados, protocolo `PRV-AAAAMMDD-XXXXXX`, visão do Ops). Mas `submitPrivacyRequest` exige
token do Firebase Auth e o `uid` vem do token: serve ao app, não a quem desinstalou ou perdeu o acesso.
O contrato abaixo só **adiciona a porta de entrada pública**; não cria coleção, estados nem fluxo de exclusão novos.

## Endpoints (HTTPS, `POST`, JSON, sem cookies)

### `requestSiteAccountDeletion`

Requisição:

| Campo | Tipo | Regras |
|---|---|---|
| `email` | string | obrigatório, ≤ 254, formato válido; normalizar (trim + minúsculas) |
| `reason` | string \| null | opcional; um de `no_longer_use`, `found_other`, `price`, `technical`, `privacy`, `other`, `prefer_not` |
| `confirmed` | boolean | deve ser `true` |
| `requestId` | string | UUID gerado no navegador; idempotência (mesma chave = mesma solicitação) |
| `turnstileToken` | string? | obrigatório quando o Turnstile estiver ativo; validar no servidor (`siteverify`) |
| `website` | string | isca anti-robô; se preenchida, descartar sem registrar |

Respostas:

- `200 { "ok": true, "protocol": "PRV-…" }` — **idêntica** exista ou não conta para o e-mail (sem enumeração).
  O `protocol` é gerado para toda solicitação válida, inclusive sem conta.
- `400 { "error": "…" }` — validação (mensagem genérica, sem revelar estado de conta).
- `429` — limite de requisições. Qualquer outra coisa é tratada pelo site como "indisponível" (nunca como recebida).

Comportamento no servidor:

1. Validar tudo no servidor (o cliente é conveniência). Sanitizar; rejeitar `reason` fora da lista.
2. Verificar Turnstile (segredo no Secret Manager, nunca no site).
3. Limitar taxa por **hash** de IP e por **hash** de e-mail (acrescentar `siteDeletionRequest` em `RATE_LIMITS`).
4. Resolver `uid` pelo e-mail **no servidor** (Admin SDK). Sem conta: registrar mesmo assim, com `uid: null`.
5. Criar documento em `privacyRequests` (mesmo esquema do app): `type: "deletion"`, `origin: "site"`,
   `status: "received"`, `requester: { uid|null, email, name: null }`, mais:
   `reason`, `siteRequestId` (idempotência) e `verification: { status: "pending", tokenHash, expiresAt, sentAt }`.
   Uma solicitação aberta de exclusão por e-mail: repetir devolve o protocolo existente.
6. Gerar token de confirmação (32 bytes aleatórios, base64url ≈ 43 caracteres), guardar **só o SHA-256**.
7. Enviar e-mail de confirmação **somente ao endereço informado** (ver "E-mail" abaixo), com o link
   `https://guincheck.com.br/exclusao-de-conta/confirmar#t=<token>`.
8. Logs: sem e-mail e sem IP em claro (usar hash truncado). Nunca logar o token.

### `confirmSiteAccountDeletion`

`{ "token": "<43 caracteres>" }` → `200 { "ok": true }` | `400/410` (token inválido, expirado ou já usado) | `429`.

- Compara o SHA-256 do token com `verification.tokenHash`; uso único; respeita `expiresAt`.
- Marca `verification.status = "verified"` e registra evento. **Não exclui nada.**
- O token viaja no **fragmento** (`#t=`): o navegador não o envia a servidores/logs. A página só confirma no clique
  (POST), então pré-visualizadores de link de e-mail não confirmam sozinhos.

## Proteções

- CORS: permitir apenas `https://guincheck.com.br` (e `www`, se existir). **Não** é controle de abuso; é conforto.
- Nenhuma gravação direta do cliente em Firestore (regras já negam por padrão `privacyRequests`).
- Proteção contra enumeração: resposta, tempo e protocolo equivalentes com e sem conta; e-mail só com conta
  **ou** e-mail neutro para ambos os casos (decisão do responsável).
- Protocolo não permite consulta: não existe endpoint público de consulta por protocolo.

## Ops (integração administrativa)

Aparece na mesma lista "Solicitações de privacidade", com `origin: "site"`. Pontos para a frente Ops:

- Exibir o selo **identidade confirmada / não confirmada** (`verification.status`).
- Bloquear a conclusão como "Conta excluída" enquanto `verification.status !== "verified"` e o `uid` for nulo.
- A exclusão em si continua exclusivamente pelo ciclo de vida de contas existente (lápide em `deletedAccounts`).
- Aviso de conclusão ao solicitante: `publicNote` + e-mail (mesma infraestrutura abaixo).

## E-mail (decisão pendente — não implementada)

O backend atual **não possui infraestrutura de envio** (nenhuma biblioteca de e-mail em `functions/package.json`).
Opções, a decidir pelo responsável (podem implicar custo/conta): extensão Firebase *Trigger Email* com provedor SMTP,
provedor transacional (Resend, SendGrid…) ou Google Workspace/SMTP do `suporte@guincheck.com.br`. Sem isso, a etapa 7
não existe e o endpoint não deve ser ativado. Prazo de validade do token e de atendimento: **a definir**
(o site não promete prazos).

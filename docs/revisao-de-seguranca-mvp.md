# Revisão de segurança do MVP (T47)

Revisão do código que está na `dev` em 12/11/2026, feita para a tarefa T47. Cada achado tem
gravidade, situação e o que fazer. Os achados de risco alto que dependem só de código foram
corrigidos no mesmo PR; os demais ficam com responsável e prazo.

## O que foi conferido

| Item | Resultado |
|---|---|
| `exigirPerfil` em toda rota administrativa | **OK.** As 7 rotas de `/api/admin/*` passam por `sessaoAdmin` (sessão 401, depois perfil ADMIN 403, depois corpo e banco). Há teste da fábrica de handlers provando 401 e 403. `/api/recomendacao` exige CLIENTE; `/api/conta/altura` e `/termos` exigem CLIENTE; `/me` e `/senha` exigem sessão |
| Sessão | **OK.** `exigirSessao` valida a assinatura, confere no banco se a conta está ativa e usa o perfil do banco, não o do token |
| Nenhuma resposta traz hash ou campo interno | **OK.** `senha_hash` só é lido para login e troca de senha e nunca sai em resposta. `/me` e as listas usam colunas explícitas (`COLUNAS_CONTA`, `SELECT_BICICLETA`), sem `SELECT *` |
| Erros 500 | **OK.** Mensagem genérica; o detalhe vai só para o log do servidor |
| Limites de tentativas | **OK** em login, cadastro, troca de senha e recomendação |
| CORS | **OK.** Não há CORS: app e API são da mesma origem e nenhuma regra libera `Access-Control-Allow-Origin`. Um teste garante que ninguém libera por engano |
| Headers de segurança | **Achado 1, corrigido neste PR** |
| RLS testada com o papel do app | **Achado 2, pendente** |
| Webhook do Mercado Pago | **Não revisado:** a rota ainda não existe na `dev` (ver "Fora desta revisão") |

## Achados

| # | Gravidade | Achado | Situação |
|---|---|---|---|
| 1 | Média | O app não mandava nenhum header de segurança: podia ser colocado em iframe (clickjacking), sem `nosniff`, sem política de referrer, e as respostas da API não tinham `Cache-Control` garantido | **Corrigido.** `next.config.ts` passa a enviar `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy` e `Strict-Transport-Security`, e `no-store` em `/api/*`. Testado em `src/shared/http/cabecalhos-seguranca.test.ts` |
| 2 | Alta | O pool do app (`src/shared/db/pool.ts`) usa `query()` direto com o papel da `DATABASE_URL`. Se a `DATABASE_URL` for a do dono do banco (e não a do `app_login`), a RLS não protege nada, porque o dono a ignora. Os testes de banco provam as políticas com `app_backend`, mas nenhum teste prova qual papel o app realmente usa em produção | **Pendente, depende do tech lead.** Conferir no Neon `dev` e no `production` que a `DATABASE_URL` da Vercel usa o `app_login`. É o mesmo passo do pedido T53 (migrations em produção), por isso não foi feito aqui. Depois que as rotas de reserva usarem `comSessao`, repetir o teste de RLS com o `app_login` |
| 3 | Média | O token de sessão fica no `localStorage`: um XSS roubaria a sessão | **Aceito no MVP** (já registrado no código como "ticket de hardening"). Mitigações atuais: React escapa o texto, os documentos legais são mostrados sem HTML cru, e o `frame-ancestors` agora está fechado. Evolução: cookie `HttpOnly` |
| 4 | Baixa | Cadastro responde 409 para e-mail ou CPF já cadastrado, o que revela se a pessoa tem conta | **Aceito no MVP** (decisão em aberto no achado 8 do relatório do William) |
| 5 | Baixa | Sem CSP completa (`script-src`), só `frame-ancestors` | **Evolução.** O Next precisa de nonce nos scripts para uma CSP estrita; fica para depois do MVP |

## Fora desta revisão

- **Webhook do Mercado Pago (rota 18) e pagamentos:** não existem na `dev`. Quando o PR chegar, conferir:
  assinatura `x-signature` com `MP_WEBHOOK_SECRET` (401 se faltar ou errar), comparação em tempo
  constante, limite de tamanho do corpo (413), consulta do pagamento na API do Mercado Pago em vez de
  confiar no corpo, idempotência por `mp_payment_id`, e nenhum dado do pagamento nos logs.
- **Rotas de reservas (PR #45) e de operação (retirada e devolução):** o PR #45 ainda está aberto e as
  rotas de operação e `GET /api/admin/reservas` não existem. Conferir `exigirPerfil` (CLIENTE nas
  reservas; OPERADOR e ADMIN na operação), o 404 para reserva de outro cliente e o valor calculado só
  no servidor.
- **Banco de produção:** nada foi executado em `production`.

# Revisão de segurança do MVP (T47)

Revisão do código que estava na `dev` em 12/11/2026, feita para a tarefa T47 (atualizada em 28/11/2026, no fim do arquivo). Cada achado tem
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
| Webhook da Stripe | **Revisado depois**, ver "Atualização de 28/11/2026" |

## Achados

| # | Gravidade | Achado | Situação |
|---|---|---|---|
| 1 | Média | O app não mandava nenhum header de segurança: podia ser colocado em iframe (clickjacking), sem `nosniff`, sem política de referrer, e as respostas da API não tinham `Cache-Control` garantido | **Corrigido.** `next.config.ts` passa a enviar `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy` e `Strict-Transport-Security`, e `no-store` em `/api/*`. Testado em `src/shared/http/cabecalhos-seguranca.test.ts` |
| 2 | Alta | O pool do app (`src/shared/db/pool.ts`) usa `query()` direto com o papel da `DATABASE_URL`. Se a `DATABASE_URL` for a do dono do banco (e não a do `app_login`), a RLS não protege nada, porque o dono a ignora. Os testes de banco provam as políticas com `app_backend`, mas nenhum teste prova qual papel o app realmente usa em produção | **Pendente, depende do tech lead.** Conferir no Neon `dev` e no `production` que a `DATABASE_URL` da Vercel usa o `app_login`. É o mesmo passo do pedido T53 (migrations em produção), por isso não foi feito aqui. Depois que as rotas de reserva usarem `comSessao`, repetir o teste de RLS com o `app_login` |
| 3 | Média | O token de sessão fica no `localStorage`: um XSS roubaria a sessão | **Aceito no MVP** (já registrado no código como "ticket de hardening"). Mitigações atuais: React escapa o texto, os documentos legais são mostrados sem HTML cru, e o `frame-ancestors` agora está fechado. Evolução: cookie `HttpOnly` |
| 4 | Baixa | Cadastro responde 409 para e-mail ou CPF já cadastrado, o que revela se a pessoa tem conta | **Aceito no MVP** (decisão em aberto no achado 8 do relatório do William) |
| 5 | Baixa | Sem CSP completa (`script-src`), só `frame-ancestors` | **Evolução.** O Next precisa de nonce nos scripts para uma CSP estrita; fica para depois do MVP |

## Fora desta revisão

- **Banco de produção:** nada foi executado em `production`.

## Atualização de 28/11/2026

As rotas que estavam fora desta revisão (reservas, pagamentos com webhook, operação e painel) já estão na
`dev`. O que foi conferido, em um PostgreSQL descartável com o papel `app_login` (sem `BYPASSRLS`), pelos
`route.ts` reais e por um teste de estresse contra o servidor de produção local:

| Item | Resultado |
|---|---|
| Webhook da Stripe (rota 18) | **OK.** Assinatura inválida: 401; corpo acima do limite: 413; 20 avisos assinados simultâneos do mesmo pagamento: 1 confirmado e 19 ignorados (idempotência pelo id do PaymentIntent, guardado em `mp_payment_id`); pagamento que chega depois de a reserva cair é estornado |
| Reservas, pagamentos e operação | **OK.** Sessão 401, perfil 403, reserva de outro cliente 404 (ler, pagar, cancelar e ver o status); o valor sai só do servidor |
| RLS com o papel do app (achado 2) | **OK nos testes** (`isolamento_rls`, 12 casos, e o fluxo completo com `app_login`). **Continua pendente:** conferir que a `DATABASE_URL` da Vercel e a do Neon `production` usam o `app_login` (issue #23) |
| Tokens forjados | **OK.** Token vazio, lixo, `alg none`, perfil trocado no corpo e assinatura de outro corpo: sempre 401 |
| Força bruta | **OK.** O login bloqueia a partir da 11ª tentativa errada (429 com `Retry-After`); depois o dono entra de outro IP |
| Entradas maliciosas | **OK.** 26 corpos e ids quebrados: nunca 500 |
| Corridas | **OK.** 9 reservas ao mesmo tempo para 1 bicicleta livre: 1 criada e 8 recusadas com 409; 25 pedidos de Pix ao mesmo tempo na mesma reserva: 1 só pagamento |

**Ponto de atenção novo:** fora da Vercel, o limite de login por IP confia no `X-Forwarded-For` enviado pelo
cliente; trocando o cabeçalho, o atacante escapa do limite por IP. Na Vercel o IP vem de outro cabeçalho e o
limite por e-mail (100 em 15 minutos) segura o ataque. Não há ação no MVP.

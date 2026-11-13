# Módulo reservas (rotas 12 a 15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/reservas`, `GET /api/reservas`, `GET /api/reservas/{id}` e `POST /api/reservas/{id}/cancelar` do cliente, como no contrato.

**Architecture:** casos de uso em `src/modules/reservas/application` com dependências injetadas (testáveis sem banco); repositório em `infrastructure` usando `comSessao`; handlers em `http`; rotas finas em `src/app/api/reservas`. As consultas que a RLS bloqueia para o cliente (unidade livre, tipo e ponto da reserva) passam por uma função e uma view `SECURITY DEFINER`/dono, na migration 0010.

**Tech Stack:** Next.js route handlers, TypeScript, `pg`, `node --test`, PostgreSQL (exclusion constraint da 0006).

**Spec:** `docs/contrato-api-mvp.md` (rotas 12 a 15), `docs/plano-de-testes.md` (CT-RES-01 a 17), `docs/estrategia-de-commits.md`.

## Global Constraints

- Dinheiro em centavos inteiros; valor calculado só no servidor por `calcularValorAluguel`.
- Período: ISO 8601 com fuso, início não no passado (tolerância 5 min), 1 h a 7 dias (`validarBusca`).
- Reserva pendente segura a bicicleta por 15 minutos; `expiraEm = criado_em + 15 min`, só enquanto `PENDENTE_PAGAMENTO`, senão `null`.
- 404 para reserva inexistente **ou de outro cliente**, com a mesma resposta.
- Rotas só `CLIENTE`: 401 sem sessão, 403 para equipe. 20 reservas por hora por usuário (429).
- O código da unidade (`bicicleta.codigo`) nunca aparece para o cliente.
- Commits: `tipo(escopo): resumo`, sem `Co-Authored-By`, um assunto por commit, PR para `dev`. Migration já aplicada não é editada.

## Review Focus

- Dois clientes disputam a última unidade (409 para um): coberto no teste de banco (duas conexões).
- Pendente vencida que ninguém listou não bloqueia nova reserva (CT-RES-17): `expirar_reservas_vencidas()` antes de reservar.
- Erro 23P01 abortaria a transação: cada tentativa usa SAVEPOINT.
- `tipoId` que não é UUID não pode virar erro 500 do Postgres: validar como 400.
- Corpo com `valor` ou `bicicletaId` extras: ignorados.

---

### Task 1: Migration 0010 (função de escolha da unidade e view das reservas)

**Files:** Create `db/migrations/0010_reserva_unidade_e_leitura.sql`; Create `db/tests/blackbox/criar_reserva.test.mjs`; Modify `db/package.json` (script), `.github/workflows/ci.yml` (rodar o teste), `docs/plano-de-testes.md`.

**Interfaces — Produces:**
- `escolher_unidade_para_reserva(p_tipo_id uuid, p_inicio timestamptz, p_fim timestamptz, p_excluir uuid[]) RETURNS TABLE (bicicleta_id uuid, ponto_id uuid)`: unidade `DISPONIVEL`, tipo e ponto ativos, sem reserva ativa sobreposta (vendo todas as reservas), fora de `p_excluir`, `ORDER BY codigo LIMIT 1 FOR UPDATE OF b SKIP LOCKED`.
- view `reserva_detalhada` (security_barrier): `id, codigo, status, tipo_id, tipo_nome, ponto_id, ponto_nome, ponto_endereco, inicio, fim, valor_aluguel_centavos, valor_caucao_centavos, criado_em, pagamento_status, pagamento_metodo`, filtrada por `sessao_perfil()`/`sessao_usuario_id()` como a política de `reserva`.

- [ ] Escrever o teste de banco (falha: função inexistente): unidade livre é escolhida; ocupada/manutenção/tipo inativo/`p_excluir` são ignoradas; com `app_backend` + CLIENTE a função enxerga reservas de outros; duas conexões chamando juntas recebem unidades diferentes (SKIP LOCKED); a view mostra só as reservas do próprio cliente e nunca expõe o código da bicicleta.
- [ ] Rodar: `node db/tests/blackbox/criar_reserva.test.mjs` → FAIL.
- [ ] Implementar a migration (up e down), `GRANT EXECUTE`/`SELECT` a `app_backend`, `REVOKE ... FROM PUBLIC`.
- [ ] Rodar `migrar:simular` e o teste → PASS. Commit `feat(db): função de escolha da unidade e view das reservas do cliente (0010)`.

### Task 2: Domínio

**Files:** Create `src/modules/reservas/domain/reserva.ts`, `reserva.test.ts`; mover `recomendacao/domain/periodo.ts` (+ teste) para `src/shared/dominio/periodo.ts` (commit `refactor` separado) para o módulo reservas não importar `recomendacao` (evita ciclo, e a regra de período do contrato é uma só).

**Interfaces — Produces:**
- `STATUS_RESERVA`, `type StatusReserva`, `ehStatusReserva(v: unknown): v is StatusReserva`
- `PRAZO_PAGAMENTO_MS = 15 * 60_000`, `calcularExpiraEm(status: StatusReserva, criadaEm: Date): Date | null`
- `podeCancelar(status: StatusReserva): boolean` (só `PENDENTE_PAGAMENTO` e `CONFIRMADA`)
- `validarNovaReserva(corpo: unknown, agora: Date): { dados: { tipoId: string; inicio: Date; fim: Date } } | { erros: Record<string, string> }`
- `gerarCodigoReserva(): string` no formato `BIC-` + 6 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.

- [ ] Testes: expiraEm só pendente; podeCancelar por status; validação (corpo não objeto, `tipoId` não UUID, período passado/curto/longo/sem fuso, campos extras ignorados); código com formato e sem repetição em 1000 gerações.
- [ ] Implementar; rodar `npm test`; commit.

### Task 3: Casos de uso

**Files:** Create `application/criar-reserva.ts`, `listar-reservas.ts`, `buscar-reserva.ts`, `cancelar-reserva.ts` e os `.test.ts`; `domain/erros.ts`.

**Interfaces:**
- Consumes: `calcularValorAluguel`, `validarNovaReserva`, `gerarCodigoReserva`, erros de `shared/http/errors`.
- Produces: tipo `ReservaDTO` (objeto `reserva` do contrato) e `criarCriarReserva(deps)`:
  `deps = { transacao: <T>(sessao, fn: (op: OperacoesCriacao) => Promise<T>) => Promise<T>, agora: () => Date, gerarCodigo: () => string }`;
  `OperacoesCriacao = { expirarVencidas(); buscarTipo(id) → TipoReservavel | null; escolherUnidade(tipoId, inicio, fim, excluir: string[]) → {bicicletaId, pontoId} | null; inserir(dados) → ReservaDTO }` e `inserir` lança `SobreposicaoDePeriodo` (23P01) ou `CodigoRepetido` (23505).
  Equivalentes simples para listar (`status?` validado, 400 se inválido), buscar (404) e cancelar (404 / 409).

- [ ] Testes (fakes): 201 com valor e caução congelados do tipo; tipo inexistente/inativo 404; sem unidade 409; 23P01 na 1ª unidade tenta a 2ª; 23P01 em todas 409; 23505 gera novo código; valor/bicicletaId do corpo ignorados; filtro de status inválido 400; cancelar 409 em EM_ANDAMENTO/CONCLUIDA/CANCELADA/EXPIRADA e 404 em inexistente.
- [ ] Implementar; commit.

### Task 4: Repositório, handlers e rotas

**Files:** Create `infrastructure/repositorio-reservas.ts`, `http/handlers.ts`, `src/app/api/reservas/route.ts`, `[id]/route.ts`, `[id]/cancelar/route.ts`; Modify `reservas/index.ts`.

- [ ] Repositório com `comSessao`: `expirar_reservas_vencidas()` primeiro (criar, listar, buscar, cancelar); `SAVEPOINT` por tentativa de `INSERT`; leitura pela view `reserva_detalhada`; cancelar com `SELECT ... FOR UPDATE` e `UPDATE ... cancelada_em = now()`.
- [ ] Handlers: `exigirPerfil(await exigirSessao(request), "CLIENTE")`, limite 20/h por usuário só em `POST`, corpo ≤ 16 KiB, `Cache-Control: no-store`; `201` / `200`.
- [ ] Teste de integração com banco descartável (Docker): fluxo completo e corrida de dois clientes pela última unidade.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`; commit.

### Task 5: Documentação

- [ ] `docs/plano-de-testes.md` (CT-RES-xx com o status novo) e `docs/contrato-api-mvp.md` (campo `expiraEm` derivado) na mesma PR.

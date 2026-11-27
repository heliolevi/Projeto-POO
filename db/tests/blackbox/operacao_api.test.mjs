// Integração do módulo operacao (rotas 26 e 27): os casos de uso e o repositório REAIS
// (src/modules/operacao) contra o PostgreSQL, com o papel do app (SET ROLE app_backend + perfil
// OPERADOR) e a segurança por linha ligada. Só o HTTP fica de fora.
//
// node tests/blackbox/operacao_api.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarOperador, criarReserva } from '../fixtures.mjs';
import {
  criarRegistrarDevolucao,
  criarRegistrarRetirada,
} from '../../../src/modules/operacao/application/registrar-movimentacao.ts';
import { operacoesNoBanco } from '../../../src/modules/operacao/infrastructure/repositorio-operacao.ts';
import { Reserva } from '../../../src/modules/reservas/domain/reserva-entidade.ts';

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const nomeErro = (erro) => erro?.constructor?.name;
const corpo = {
  checklist: {
    itens: [
      { nome: 'freios', ok: true },
      { nome: 'pneus', ok: true },
      { nome: 'luzes', ok: false },
    ],
    observacoes: 'farol traseiro fraco',
  },
};

await rodarSuite('blackbox/operacao_api', async (executor, client) => {
  const { teste, assert } = executor;
  const ctx = await criarFixtures(client);
  const operadorId = await criarOperador(client);
  const sessaoOperador = { perfil: 'OPERADOR', usuarioId: operadorId };
  const sessaoCliente = { perfil: 'CLIENTE', usuarioId: ctx.clienteAId };

  async function transacao(sessao, fn) {
    await client.query('SET ROLE app_backend');
    await client.query('SAVEPOINT caso_de_uso');
    try {
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [sessao.perfil, sessao.usuarioId],
      );
      const resultado = await fn(operacoesNoBanco(client));
      await client.query('RELEASE SAVEPOINT caso_de_uso');
      return resultado;
    } catch (erro) {
      await client.query('ROLLBACK TO SAVEPOINT caso_de_uso');
      throw erro;
    } finally {
      await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
      await client.query('RESET ROLE');
    }
  }

  let relogio = new Date();
  const deps = { transacao, agora: () => relogio, montarReserva: (linha) => new Reserva(linha) };
  const retirar = criarRegistrarRetirada(deps);
  const devolver = criarRegistrarDevolucao(deps);

  // reserva confirmada que começa daqui a `emMinutos` (e dura 4 h)
  const reservaConfirmada = (emMinutos) => {
    const inicio = new Date(Date.now() + emMinutos * MIN);
    return criarReserva(client, ctx, {
      status: 'CONFIRMADA',
      inicio: inicio.toISOString(),
      fim: new Date(inicio.getTime() + 4 * HORA).toISOString(),
    });
  };
  const statusDe = async (id) => (await client.query('SELECT status FROM reserva WHERE id = $1', [id])).rows[0].status;
  const movimentacoes = async (id) =>
    (await client.query('SELECT tipo, operador_id, checklist, observacoes FROM movimentacao WHERE reserva_id = $1 ORDER BY data_hora, tipo DESC', [id])).rows;

  const esperarRecusa = async (fn, nome) => {
    try {
      await fn();
    } catch (erro) {
      assert(nomeErro(erro) === nome, `esperava ${nome}, veio ${nomeErro(erro)}: ${erro.message}`);
      return;
    }
    throw new Error(`esperava ${nome}, mas foi aceito`);
  };

  await teste('retirada e devolução: CONFIRMADA -> EM_ANDAMENTO -> CONCLUIDA, com o checklist gravado', async () => {
    relogio = new Date();
    const id = await reservaConfirmada(10);
    const r = await retirar(sessaoOperador, id, corpo);
    assert(r.status === 'EM_ANDAMENTO', `retirada: ${r.status}`);
    assert(r.bicicleta?.codigo === 'BIC-TESTE-RESERVA', 'devolve a unidade para a equipe');
    assert((await statusDe(id)) === 'EM_ANDAMENTO', 'banco em andamento');

    const d = await devolver(sessaoOperador, id, corpo);
    assert(d.status === 'CONCLUIDA', `devolução: ${d.status}`);
    assert((await statusDe(id)) === 'CONCLUIDA', 'banco concluída');

    const movs = await movimentacoes(id);
    assert(movs.length === 2, `duas movimentações, veio ${movs.length}`);
    assert(movs.every((m) => m.operador_id === operadorId), 'operador gravado');
    assert(Array.isArray(movs[0].checklist) && movs[0].checklist.length === 3, 'checklist como lista');
    assert(movs[0].observacoes === 'farol traseiro fraco', 'observações gravadas');
  });

  await teste('retirada cedo demais é 400 e não grava nada', async () => {
    relogio = new Date();
    const id = await reservaConfirmada(120);
    await esperarRecusa(() => retirar(sessaoOperador, id, corpo), 'ValidationError');
    assert((await statusDe(id)) === 'CONFIRMADA', 'continua confirmada');
    assert((await movimentacoes(id)).length === 0, 'sem movimentação');
  });

  await teste('retirada repetida e devolução sem retirada são 409', async () => {
    relogio = new Date();
    const id = await reservaConfirmada(5);
    await esperarRecusa(() => devolver(sessaoOperador, id, corpo), 'ConflictError');
    await retirar(sessaoOperador, id, corpo);
    await esperarRecusa(() => retirar(sessaoOperador, id, corpo), 'ConflictError');
    assert((await movimentacoes(id)).length === 1, 'uma retirada só');
  });

  await teste('reserva inexistente é 404', async () => {
    await esperarRecusa(
      () => retirar(sessaoOperador, '00000000-0000-4000-8000-000000000000', corpo),
      'NotFoundError',
    );
  });

  await teste('com a sessão de cliente, a RLS não deixa registrar retirada (nem a própria)', async () => {
    relogio = new Date();
    const id = await reservaConfirmada(5);
    // a regra de perfil é da rota (403); aqui se confere que o banco também barra
    try {
      await retirar(sessaoCliente, id, corpo);
      throw new Error('aceitou');
    } catch (erro) {
      assert(erro.message !== 'aceitou', 'o cliente registrou a própria retirada');
    }
    assert((await statusDe(id)) === 'CONFIRMADA', 'continua confirmada');
    assert((await movimentacoes(id)).length === 0, 'sem movimentação');
  });
});

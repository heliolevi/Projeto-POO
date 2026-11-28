// Integração do módulo operacao (rotas 26 e 27): os casos de uso e o repositório REAIS
// (src/modules/operacao) contra o PostgreSQL, com o papel do app (SET ROLE app_backend + perfil
// OPERADOR) e a segurança por linha ligada. Só o HTTP fica de fora.
//
// node tests/blackbox/operacao_api.test.mjs

import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarOperador, criarReserva } from '../fixtures.mjs';
import { OperacaoService } from '../../../src/modules/operacao/application/operacao-service.ts';
import { Bicicleta } from '../../../src/modules/catalogo/domain/bicicleta.ts';
import { OperacoesNoBanco } from '../../../src/modules/operacao/infrastructure/repositorio-operacao.ts';
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
      const resultado = await fn(new OperacoesNoBanco(client));
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
  const servico = new OperacaoService({
    transacao,
    agora: () => relogio,
    montarReserva: (linha) => new Reserva(linha),
    montarBicicleta: (linha) => new Bicicleta(linha),
  });
  const retirar = (sessao, id, c) => servico.registrarRetirada(sessao, id, async () => c);
  const devolver = (sessao, id, c) => servico.registrarDevolucao(sessao, id, async () => c);

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
    (await client.query('SELECT tipo, operador_id, checklist, observacoes FROM movimentacao WHERE reserva_id = $1 ORDER BY tipo', [id])).rows;

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
    for (const tipo of ['RETIRADA', 'DEVOLUCAO']) {
      const m = movs.find((x) => x.tipo === tipo);
      assert(m, `movimentação de ${tipo}`);
      assert(Array.isArray(m.checklist) && m.checklist.length === 3, `checklist como lista (${tipo})`);
      assert(m.observacoes === 'farol traseiro fraco', `observações gravadas (${tipo})`);
    }
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
      // a RLS de bicicleta (só a equipe) esconde a unidade do cliente, então a retirada para antes
      assert(nomeErro(erro) === 'MovimentacaoInvalida', `esperava a unidade escondida pela RLS, veio ${erro.code ?? nomeErro(erro)}: ${erro.message}`);
    }
    assert((await statusDe(id)) === 'CONFIRMADA', 'continua confirmada');
    assert((await movimentacoes(id)).length === 0, 'sem movimentação');
  });

  await teste('com a sessão de cliente, a RLS de movimentacao recusa a devolução (42501)', async () => {
    relogio = new Date();
    const id = await criarReserva(client, ctx, {
      status: 'EM_ANDAMENTO',
      inicio: new Date(Date.now() - HORA).toISOString(),
      fim: new Date(Date.now() + HORA).toISOString(),
    });
    try {
      await devolver(sessaoCliente, id, corpo);
      throw new Error('aceitou');
    } catch (erro) {
      assert(erro.message !== 'aceitou', 'o cliente registrou a própria devolução');
      assert(erro.code === '42501', `esperava a recusa da RLS (42501), veio ${erro.code ?? nomeErro(erro)}: ${erro.message}`);
    }
    assert((await statusDe(id)) === 'EM_ANDAMENTO', 'continua em andamento');
    assert((await movimentacoes(id)).length === 0, 'sem movimentação');
  });

  await teste('a bicicleta em manutenção não sai: 409 e nada é gravado', async () => {
    relogio = new Date();
    const id = await reservaConfirmada(5);
    const { rows: [r] } = await client.query('SELECT bicicleta_id FROM reserva WHERE id = $1', [id]);
    await client.query("UPDATE bicicleta SET status = 'MANUTENCAO' WHERE id = $1", [r.bicicleta_id]);
    await esperarRecusa(() => retirar(sessaoOperador, id, corpo), 'MovimentacaoInvalida');
    assert((await statusDe(id)) === 'CONFIRMADA', 'continua confirmada');
    assert((await movimentacoes(id)).length === 0, 'sem movimentação');
  });

  await teste('a bicicleta que ainda não voltou da reserva anterior não sai: 409', async () => {
    relogio = new Date();
    // a anterior foi retirada e está atrasada (o fim já passou); a seguinte começa agora
    const anterior = await criarReserva(client, ctx, {
      status: 'EM_ANDAMENTO',
      inicio: new Date(Date.now() - 5 * HORA).toISOString(),
      fim: new Date(Date.now() - 20 * MIN).toISOString(),
    });
    const seguinte = await criarReserva(client, ctx, {
      status: 'CONFIRMADA',
      inicio: new Date(Date.now() - 20 * MIN).toISOString(),
      fim: new Date(Date.now() + 2 * HORA).toISOString(),
    });
    await esperarRecusa(() => retirar(sessaoOperador, seguinte, corpo), 'MovimentacaoInvalida');
    assert((await statusDe(seguinte)) === 'CONFIRMADA', 'a seguinte continua confirmada');
    // devolvida a anterior, a seguinte sai normalmente
    await devolver(sessaoOperador, anterior, corpo);
    const r = await retirar(sessaoOperador, seguinte, corpo);
    assert(r.status === 'EM_ANDAMENTO', `a seguinte sai depois da devolução: ${r.status}`);
  });
});

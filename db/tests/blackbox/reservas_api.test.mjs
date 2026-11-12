// Integração do módulo reservas (rotas 12 a 15): os casos de uso e o repositório REAIS
// (src/modules/reservas) contra o PostgreSQL, com o papel do app (SET ROLE app_backend + perfil
// CLIENTE) e a segurança por linha ligada. Só o HTTP fica de fora (handlers e rotas).
//
// Importa os arquivos .ts direto (o Node tira os tipos sozinho a partir da versão 22.18).
//
// node tests/blackbox/reservas_api.test.mjs

import pg from 'pg';
import { rodarSuite } from '../suporte.mjs';
import { criarFixtures, criarReserva } from '../fixtures.mjs';
import { criarCriarReserva } from '../../../src/modules/reservas/application/criar-reserva.ts';
import { criarBuscarReserva, criarListarReservas } from '../../../src/modules/reservas/application/consultar-reservas.ts';
import { criarCancelarReserva } from '../../../src/modules/reservas/application/cancelar-reserva.ts';
import { operacoesNoBanco } from '../../../src/modules/reservas/infrastructure/repositorio-reservas.ts';
import { calcularValorAluguel } from '../../../src/modules/reservas/domain/preco.ts';
import { gerarCodigoReserva } from '../../../src/modules/reservas/domain/reserva.ts';
import { comSessaoEm } from '../../../src/shared/db/sessao.ts';

const HORA = 60 * 60 * 1000;
// reservas no futuro (a validação recusa início no passado), em horários fixos de amanhã+
const base = new Date(Date.now() + 3 * 24 * HORA);
base.setUTCMinutes(0, 0, 0);
const periodo = (deslocaHoras, duracaoHoras = 4) => ({
  inicio: new Date(base.getTime() + deslocaHoras * HORA).toISOString(),
  fim: new Date(base.getTime() + (deslocaHoras + duracaoHoras) * HORA).toISOString(),
});

const nomeErro = (erro) => erro?.constructor?.name;

// ---------------------------------------------------------------------------------------------
// Parte 1: tudo na transação única da suíte (savepoints), como as outras suítes de banco.
// ---------------------------------------------------------------------------------------------
await rodarSuite('blackbox/reservas_api', async (executor, client) => {
  const { teste, assert, comSavepoint } = executor;
  const ctx = await criarFixtures(client);
  const { rows: [b2] } = await client.query(
    `INSERT INTO bicicleta (tipo_id, ponto_id, codigo) VALUES ($1, $2, 'BIC-TESTE-RESERVA-2') RETURNING id`,
    [ctx.tipoId, ctx.pontoId],
  );
  await client.query(`UPDATE tipo_bicicleta SET valor_caucao_centavos = 15000 WHERE id = $1`, [ctx.tipoId]);

  const sessaoA = { perfil: 'CLIENTE', usuarioId: ctx.clienteAId };
  const sessaoB = { perfil: 'CLIENTE', usuarioId: ctx.clienteBId };

  // Imita o comSessao do app sobre a transação da suíte: papel do app, sessão declarada e um
  // savepoint, para um caso de uso que falha (404, 409...) não estragar a transação da suíte.
  async function transacao(sessao, fn, ajustar = (op) => op) {
    await client.query('SET ROLE app_backend');
    await client.query('SAVEPOINT caso_de_uso');
    try {
      await client.query(
        "SELECT set_config('app.perfil', $1, true), set_config('app.usuario_id', $2, true)",
        [sessao.perfil, sessao.usuarioId],
      );
      const resultado = await fn(ajustar(operacoesNoBanco(client)));
      await client.query('RELEASE SAVEPOINT caso_de_uso');
      return resultado;
    } catch (erro) {
      await client.query('ROLLBACK TO SAVEPOINT caso_de_uso');
      throw erro;
    } finally {
      await client.query('RESET ROLE');
    }
  }

  const montar = (ajustar, gerarCodigo = gerarCodigoReserva) => {
    const t = (s, fn) => transacao(s, fn, ajustar);
    return {
      criar: criarCriarReserva({ transacao: t, agora: () => new Date(), gerarCodigo, calcularValorAluguel }),
      listar: criarListarReservas({ transacao: t }),
      buscar: criarBuscarReserva({ transacao: t }),
      cancelar: criarCancelarReserva({ transacao: t }),
    };
  };
  const { criar, listar, buscar, cancelar } = montar();

  const corpo = (deslocaHoras = 0, duracaoHoras = 4) => ({ tipoId: ctx.tipoId, ...periodo(deslocaHoras, duracaoHoras) });
  const rejeitaCom = async (promessa, classe) => {
    try {
      await promessa;
    } catch (erro) {
      assert(nomeErro(erro) === classe, `esperava ${classe}, veio ${nomeErro(erro)}: ${erro.message}`);
      return erro;
    }
    throw new Error(`esperava ${classe}, mas deu certo`);
  };
  const statusNoBanco = async (id) => (await client.query('SELECT status FROM reserva WHERE id = $1', [id])).rows[0]?.status;

  await teste('CT-RES-01: cria PENDENTE_PAGAMENTO com valor e caução congelados, prazo de 15 min e código único', () =>
    comSavepoint(async () => {
      const antes = Date.now();
      const r = await criar(sessaoA, corpo());
      assert(r.status === 'PENDENTE_PAGAMENTO', `status ${r.status}`);
      assert(/^BIC-[23456789A-HJKMNP-Z]{6}$/.test(r.codigo), `código ${r.codigo}`);
      assert(r.valorAluguelCentavos === 4000, `4 h x R$ 10,00 = 4000, veio ${r.valorAluguelCentavos}`);
      assert(r.valorCaucaoCentavos === 15000, 'caução do tipo');
      assert(r.tipo.id === ctx.tipoId && r.tipo.nome === 'Tipo teste-reserva', 'tipo');
      assert(r.ponto.id === ctx.pontoId && r.ponto.endereco === 'Rua Teste, 1, Centro', `ponto ${JSON.stringify(r.ponto)}`);
      const prazo = new Date(r.expiraEm).getTime() - new Date(r.criadaEm).getTime();
      assert(prazo === 15 * 60 * 1000, `prazo de ${prazo / 60000} min`);
      assert(Math.abs(new Date(r.criadaEm).getTime() - antes) < 60_000, 'criadaEm é agora');
      assert(!JSON.stringify(r).match(/bicicleta|BIC-TESTE/i), 'o objeto não pode revelar a unidade');
      const { rows: [linha] } = await client.query(
        `SELECT cliente_id, periodo, status, valor_aluguel_centavos, valor_caucao_centavos FROM reserva WHERE id = $1`, [r.id]);
      assert(linha.cliente_id === ctx.clienteAId, 'a reserva é do cliente da sessão');
      assert(linha.status === 'PENDENTE_PAGAMENTO' && linha.valor_aluguel_centavos === 4000 && linha.valor_caucao_centavos === 15000, 'gravada como devolvida');
    }));

  await teste('o valor é do servidor: mudar o preço do tipo depois não altera a reserva já feita', () =>
    comSavepoint(async () => {
      const r = await criar(sessaoA, { ...corpo(), valorAluguelCentavos: 1, valorCaucaoCentavos: 0 });
      assert(r.valorAluguelCentavos === 4000 && r.valorCaucaoCentavos === 15000, 'valores do corpo ignorados');
      await client.query('UPDATE tipo_bicicleta SET preco_hora_centavos = 9999, valor_caucao_centavos = 1 WHERE id = $1', [ctx.tipoId]);
      const lida = await buscar(sessaoA, r.id);
      assert(lida.valorAluguelCentavos === 4000 && lida.valorCaucaoCentavos === 15000, 'valores congelados na reserva');
    }));

  await teste('CT-RES-04: duas reservas no mesmo período recebem unidades diferentes; a terceira dá 409 (CT-RES-02)', () =>
    comSavepoint(async () => {
      const r1 = await criar(sessaoA, corpo());
      const r2 = await criar(sessaoB, corpo());
      const { rows } = await client.query('SELECT DISTINCT bicicleta_id FROM reserva WHERE id IN ($1, $2)', [r1.id, r2.id]);
      assert(rows.length === 2, 'as duas reservas não podem estar na mesma unidade');
      await rejeitaCom(criar(sessaoA, corpo()), 'ConflictError');
      const { rows: [n] } = await client.query(`SELECT count(*)::int AS n FROM reserva WHERE cliente_id IN ($1, $2) AND status = 'PENDENTE_PAGAMENTO'`, [ctx.clienteAId, ctx.clienteBId]);
      assert(n.n === 2, 'o 409 não pode deixar reserva gravada');
    }));

  await teste('períodos que só se encostam cabem na mesma unidade', () =>
    comSavepoint(async () => {
      await client.query(`UPDATE bicicleta SET status = 'MANUTENCAO' WHERE id = $1`, [b2.id]);
      await criar(sessaoA, corpo(0, 4));
      await criar(sessaoB, corpo(4, 4)); // começa quando a outra termina
      await rejeitaCom(criar(sessaoB, corpo(3, 2)), 'ConflictError'); // esse sobrepõe
    }));

  await teste('CT-RES-07: unidade em MANUTENCAO, BLOQUEADA ou BAIXADA não é reservada', () =>
    comSavepoint(async () => {
      for (const status of ['MANUTENCAO', 'BLOQUEADA', 'BAIXADA']) {
        await client.query(`UPDATE bicicleta SET status = $1 WHERE tipo_id = $2`, [status, ctx.tipoId]);
        await rejeitaCom(criar(sessaoA, corpo()), 'ConflictError');
      }
    }));

  await teste('CT-RES-05: tipo inexistente e tipo inativo dão 404', () =>
    comSavepoint(async () => {
      await rejeitaCom(criar(sessaoA, { ...corpo(), tipoId: '00000000-0000-4000-8000-000000000000' }), 'NotFoundError');
      await client.query('UPDATE tipo_bicicleta SET ativo = false WHERE id = $1', [ctx.tipoId]);
      await rejeitaCom(criar(sessaoA, corpo()), 'NotFoundError');
    }));

  await teste('CT-RES-06: período inválido dá 400 sem tocar o banco', () =>
    comSavepoint(async () => {
      await rejeitaCom(criar(sessaoA, { tipoId: ctx.tipoId, inicio: '2020-01-01T10:00:00Z', fim: '2020-01-01T14:00:00Z' }), 'ValidationError');
      await rejeitaCom(criar(sessaoA, { tipoId: 'x', inicio: 'ontem', fim: 'amanhã' }), 'ValidationError');
      await rejeitaCom(criar(sessaoA, corpo(0, 8 * 24)), 'ValidationError');
    }));

  await teste('CT-RES-17: pendente vencida que ninguém listou não bloqueia a nova reserva, e vira EXPIRADA', () =>
    comSavepoint(async () => {
      await client.query(`UPDATE bicicleta SET status = 'MANUTENCAO' WHERE id = $1`, [b2.id]);
      const velha = await criar(sessaoB, corpo());
      await rejeitaCom(criar(sessaoA, corpo()), 'ConflictError'); // ainda dentro do prazo
      await client.query(`UPDATE reserva SET criado_em = now() - interval '16 minutes' WHERE id = $1`, [velha.id]);
      const nova = await criar(sessaoA, corpo());
      assert(nova.status === 'PENDENTE_PAGAMENTO', 'a nova reserva foi aceita');
      assert((await statusNoBanco(velha.id)) === 'EXPIRADA', 'a vencida virou EXPIRADA');
    }));

  await teste('CT-RES-09: lista só as reservas do cliente, da mais recente para a mais antiga, e expira as vencidas', () =>
    comSavepoint(async () => {
      const primeira = await criar(sessaoA, corpo(0));
      const segunda = await criar(sessaoA, corpo(24));
      const deB = await criar(sessaoB, corpo(0));
      await client.query(`UPDATE reserva SET criado_em = now() - interval '30 minutes' WHERE id = $1`, [primeira.id]);
      await client.query(`UPDATE reserva SET criado_em = now() - interval '20 minutes' WHERE id = $1`, [segunda.id]);
      const lista = await listar(sessaoA, {});
      assert(lista.length === 2 && lista.every((r) => r.id !== deB.id), 'só as reservas do A');
      assert(lista[0].id === segunda.id && lista[1].id === primeira.id, 'da mais recente para a mais antiga');
      assert(lista.every((r) => r.status === 'EXPIRADA' && r.expiraEm === null), 'as duas venceram e foram expiradas antes de listar');
      assert((await listar(sessaoB, {})).length === 1, 'o B vê só a dele');
    }));

  await teste('CT-RES-10: filtro por status; valor inválido dá 400', () =>
    comSavepoint(async () => {
      const pendente = await criar(sessaoA, corpo(0));
      const cancelada = await criar(sessaoA, corpo(24));
      await cancelar(sessaoA, cancelada.id);
      assert((await listar(sessaoA, { status: 'CANCELADA' })).map((r) => r.id).join() === cancelada.id, 'filtro CANCELADA');
      assert((await listar(sessaoA, { status: 'PENDENTE_PAGAMENTO' })).map((r) => r.id).join() === pendente.id, 'filtro PENDENTE_PAGAMENTO');
      assert((await listar(sessaoA, { status: 'CONCLUIDA' })).length === 0, 'filtro sem resultado');
      await rejeitaCom(listar(sessaoA, { status: 'pendente' }), 'ValidationError');
    }));

  await teste('CT-RES-11: reserva de outro cliente e id inexistente dão o mesmo 404; id que não é UUID também', () =>
    comSavepoint(async () => {
      const deB = await criar(sessaoB, corpo());
      const e1 = await rejeitaCom(buscar(sessaoA, deB.id), 'NotFoundError');
      const e2 = await rejeitaCom(buscar(sessaoA, '00000000-0000-4000-8000-000000000000'), 'NotFoundError');
      const e3 = await rejeitaCom(buscar(sessaoA, 'abc'), 'NotFoundError');
      assert(e1.message === e2.message && e2.message === e3.message, 'a mensagem não pode dizer qual dos casos é');
      await rejeitaCom(cancelar(sessaoA, deB.id), 'NotFoundError');
      assert((await statusNoBanco(deB.id)) === 'PENDENTE_PAGAMENTO', 'a reserva do B não foi cancelada pelo A');
    }));

  await teste('CT-RES-12: buscar traz o pagamento (status e método) ou null', () =>
    comSavepoint(async () => {
      const r = await criar(sessaoA, corpo());
      assert((await buscar(sessaoA, r.id)).pagamento === null, 'sem cobrança');
      await client.query(`INSERT INTO pagamento (reserva_id, metodo, valor_centavos, status) VALUES ($1, 'PIX', 4000, 'PENDENTE')`, [r.id]);
      const lida = await buscar(sessaoA, r.id);
      assert(lida.pagamento?.status === 'PENDENTE' && lida.pagamento?.metodo === 'PIX', JSON.stringify(lida.pagamento));
      assert(lida.id === r.id && lida.codigo === r.codigo, 'os dados da reserva vêm junto');
    }));

  await teste('CT-RES-13: cancelar pendente e confirmada libera a unidade na hora', () =>
    comSavepoint(async () => {
      await client.query(`UPDATE bicicleta SET status = 'MANUTENCAO' WHERE id = $1`, [b2.id]);
      const r = await criar(sessaoA, corpo());
      await rejeitaCom(criar(sessaoB, corpo()), 'ConflictError');
      const c = await cancelar(sessaoA, r.id);
      assert(c.status === 'CANCELADA' && c.expiraEm === null, 'cancelada, sem prazo');
      const { rows: [linha] } = await client.query('SELECT cancelada_em FROM reserva WHERE id = $1', [r.id]);
      assert(linha.cancelada_em, 'cancelada_em gravada');
      const outra = await criar(sessaoB, corpo()); // a unidade voltou
      await client.query(`UPDATE reserva SET status = 'CONFIRMADA' WHERE id = $1`, [outra.id]);
      assert((await cancelar(sessaoB, outra.id)).status === 'CANCELADA', 'confirmada também cancela');
    }));

  await teste('CT-RES-14: cancelar reserva retirada, concluída, cancelada ou expirada dá 409 e não muda nada', () =>
    comSavepoint(async () => {
      let hora = 0;
      for (const status of ['EM_ANDAMENTO', 'CONCLUIDA', 'EXPIRADA', 'NAO_RETIRADA', 'CANCELADA']) {
        const id = await criarReserva(client, ctx, {
          clienteId: ctx.clienteAId, status, canceladaEm: status === 'CANCELADA' ? new Date().toISOString() : null,
          bicicletaId: hora % 2 ? b2.id : ctx.bicicletaId,
          inicio: periodo(100 + hora * 10).inicio, fim: periodo(100 + hora * 10).fim,
        });
        hora++;
        await rejeitaCom(cancelar(sessaoA, id), 'ConflictError');
        assert((await statusNoBanco(id)) === status, `${status} não pode mudar`);
      }
    }));

  await teste('cancelar pendente já vencida dá 409 (ela virou EXPIRADA antes)', () =>
    comSavepoint(async () => {
      const r = await criar(sessaoA, corpo());
      await client.query(`UPDATE reserva SET criado_em = now() - interval '20 minutes' WHERE id = $1`, [r.id]);
      await rejeitaCom(cancelar(sessaoA, r.id), 'ConflictError');
    }));

  await teste('CT-RES-08: depois de 15 minutos a pendente é EXPIRADA ao buscar, e a unidade fica livre', () =>
    comSavepoint(async () => {
      await client.query(`UPDATE bicicleta SET status = 'MANUTENCAO' WHERE id = $1`, [b2.id]);
      const r = await criar(sessaoA, corpo());
      await client.query(`UPDATE reserva SET criado_em = now() - interval '15 minutes' WHERE id = $1`, [r.id]);
      const lida = await buscar(sessaoA, r.id);
      assert(lida.status === 'EXPIRADA' && lida.expiraEm === null, `status ${lida.status}`);
      await criar(sessaoB, corpo());
    }));

  await teste('23P01 de verdade: a escolha oferece uma unidade ocupada, o banco recusa e a transação segue com outra', () =>
    comSavepoint(async () => {
      // a unidade 1 (a primeira por código) está ocupada pelo cliente B
      await criarReserva(client, ctx, { clienteId: ctx.clienteBId, bicicletaId: ctx.bicicletaId, status: 'CONFIRMADA', ...periodo(0) });
      let oferecidas = 0;
      const ajustar = (op) => ({
        ...op,
        // simula a corrida: a 1ª oferta é a unidade ocupada (como se a outra reserva tivesse
        // sido gravada entre a escolha e o INSERT); as seguintes são as reais
        async escolherUnidade(tipoId, inicio, fim, excluir) {
          if (oferecidas++ === 0) return { bicicletaId: ctx.bicicletaId, pontoId: ctx.pontoId };
          return op.escolherUnidade(tipoId, inicio, fim, excluir);
        },
      });
      const r = await montar(ajustar).criar(sessaoA, corpo());
      const { rows: [linha] } = await client.query('SELECT bicicleta_id FROM reserva WHERE id = $1', [r.id]);
      assert(linha.bicicleta_id === b2.id, 'ficou com a outra unidade');
      assert(oferecidas === 2, `esperava 2 ofertas, houve ${oferecidas}`);
    }));

  await teste('23P01 em todas as unidades: 409 e nenhuma reserva nova', () =>
    comSavepoint(async () => {
      await criarReserva(client, ctx, { clienteId: ctx.clienteBId, bicicletaId: ctx.bicicletaId, status: 'CONFIRMADA', ...periodo(0) });
      await criarReserva(client, ctx, { clienteId: ctx.clienteBId, bicicletaId: b2.id, status: 'CONFIRMADA', ...periodo(0) });
      const ofertas = [ctx.bicicletaId, b2.id];
      const ajustar = (op) => ({
        ...op,
        async escolherUnidade(tipoId, inicio, fim, excluir) {
          const id = ofertas.find((o) => !excluir.includes(o));
          return id ? { bicicletaId: id, pontoId: ctx.pontoId } : null;
        },
      });
      await rejeitaCom(montar(ajustar).criar(sessaoA, corpo()), 'ConflictError');
      const { rows: [n] } = await client.query('SELECT count(*)::int AS n FROM reserva WHERE cliente_id = $1', [ctx.clienteAId]);
      assert(n.n === 0, 'nenhuma reserva do A');
    }));

  await teste('23505 de verdade: código repetido sorteia outro e grava', () =>
    comSavepoint(async () => {
      const existente = await criarReserva(client, ctx, { clienteId: ctx.clienteBId, bicicletaId: b2.id, codigo: 'BIC-REPETE', ...periodo(0) });
      assert(existente, 'preparação');
      const codigos = ['BIC-REPETE', 'BIC-NOVO22'];
      const r = await montar(undefined, () => codigos.shift()).criar(sessaoA, corpo());
      assert(r.codigo === 'BIC-NOVO22', `código ${r.codigo}`);
    }));

  await teste('RLS: a equipe não passa pelas rotas do cliente e o visitante não lê reservas', () =>
    comSavepoint(async () => {
      const r = await criar(sessaoA, corpo());
      await client.query('SET ROLE app_backend');
      try {
        await client.query("SELECT set_config('app.perfil', '', true), set_config('app.usuario_id', '', true)");
        const { rowCount } = await client.query('SELECT 1 FROM reserva_detalhada WHERE id = $1', [r.id]);
        assert(rowCount === 0, 'visitante não vê reserva');
        const { rowCount: direto } = await client.query('SELECT 1 FROM reserva WHERE id = $1', [r.id]);
        assert(direto === 0, 'nem pela tabela');
      } finally {
        await client.query('RESET ROLE');
      }
    }));
});

// ---------------------------------------------------------------------------------------------
// Parte 2: concorrência de verdade. Conexões separadas, dados COMMITADOS (a transação única da
// suíte não prova nada sobre corrida) e apagados no final, com o comSessaoEm real do app.
// ---------------------------------------------------------------------------------------------
await rodarSuiteConcorrencia();

async function rodarSuiteConcorrencia() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const sufixo = Math.random().toString(36).slice(2, 8);
  const ids = { usuarios: [], tipoId: null, pontoId: null };
  let falhas = 0;
  const conexoes = [];

  const verificar = (condicao, mensagem) => {
    if (!condicao) throw new Error(mensagem);
  };
  async function caso(nome, fn) {
    try {
      await fn();
      console.log(`  OK  ${nome}`);
    } catch (erro) {
      falhas++;
      console.log(`FALHA ${nome}\n      ${erro.message}`);
    }
  }

  // uma conexão por requisição, como o pool do app: papel app_backend, transação do comSessaoEm
  const conectar = async () => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query('SET ROLE app_backend');
    c.release = () => { c.end().catch(() => {}); };
    conexoes.push(c);
    return c;
  };
  const transacao = (sessao, fn) => comSessaoEm(conectar, sessao, (c) => fn(operacoesNoBanco(c)));
  const criar = criarCriarReserva({ transacao, agora: () => new Date(), gerarCodigo: gerarCodigoReserva, calcularValorAluguel });

  try {
    console.log('\nconcorrência (conexões reais):');
    ({ rows: [{ id: ids.pontoId }] } = await admin.query(
      `INSERT INTO ponto (nome, logradouro, numero, bairro, cep, cidade, uf, ativo)
       VALUES ($1, 'Rua Corrida', '1', 'Centro', '65000000', 'São Luís', 'MA', true) RETURNING id`, [`Ponto api ${sufixo}`]));
    ({ rows: [{ id: ids.tipoId }] } = await admin.query(
      `INSERT INTO tipo_bicicleta (nome, atividades, altura_min_cm, altura_max_cm, preco_hora_centavos, preco_dia_centavos, valor_caucao_centavos)
       VALUES ($1, ARRAY['URBANO']::atividade[], 150, 190, 1000, 5000, 15000) RETURNING id`, [`Tipo api ${sufixo}`]));
    for (let i = 0; i < 6; i++) {
      const { rows: [u] } = await admin.query(
        `INSERT INTO usuario (perfil, nome, email, senha_hash, cpf, aceite_termos_em, versao_termos)
         VALUES ('CLIENTE', $1, $2, 'hash', $3, now(), 'v1') RETURNING id`,
        [`Cliente ${i}`, `api-${sufixo}-${i}@bikeilha.test`, String(Math.floor(Math.random() * 1e11)).padStart(11, '0')]);
      ids.usuarios.push(u.id);
    }
    const sessoes = ids.usuarios.map((usuarioId) => ({ perfil: 'CLIENTE', usuarioId }));
    const adicionarUnidades = async (n) => {
      for (let i = 0; i < n; i++) {
        await admin.query(`INSERT INTO bicicleta (tipo_id, ponto_id, codigo) VALUES ($1, $2, $3)`, [ids.tipoId, ids.pontoId, `API-${sufixo}-${i}`]);
      }
    };
    const apagarReservas = () => admin.query('DELETE FROM reserva WHERE cliente_id = ANY($1::uuid[])', [ids.usuarios]);
    const pedido = { tipoId: ids.tipoId, ...periodo(10) };

    await caso('CT-RES-03: dois clientes disputam a última unidade ao mesmo tempo: um 201, o outro 409', async () => {
      await adicionarUnidades(1);
      for (let rodada = 0; rodada < 15; rodada++) {
        const resultados = await Promise.allSettled([criar(sessoes[0], pedido), criar(sessoes[1], pedido)]);
        const ok = resultados.filter((r) => r.status === 'fulfilled');
        const falha = resultados.filter((r) => r.status === 'rejected');
        verificar(ok.length === 1 && falha.length === 1, `rodada ${rodada}: ${ok.length} aceitas e ${falha.length} recusadas`);
        verificar(nomeErro(falha[0].reason) === 'ConflictError', `a recusada deu ${nomeErro(falha[0].reason)}: ${falha[0].reason.message}`);
        await apagarReservas();
      }
    });

    // recomeça com 3 unidades (as reservas já foram apagadas no fim de cada rodada)
    await admin.query(`DELETE FROM bicicleta WHERE tipo_id = $1`, [ids.tipoId]);
    await adicionarUnidades(3);
    await caso('6 clientes disputam 3 unidades: exatamente 3 reservas, em unidades diferentes, e 3 recebem 409', async () => {
      for (let rodada = 0; rodada < 10; rodada++) {
        const resultados = await Promise.allSettled(sessoes.map((s) => criar(s, pedido)));
        const ok = resultados.filter((r) => r.status === 'fulfilled');
        const falha = resultados.filter((r) => r.status === 'rejected');
        const naoEsperadas = falha.filter((r) => nomeErro(r.reason) !== 'ConflictError');
        verificar(naoEsperadas.length === 0, `erro que não é 409: ${nomeErro(naoEsperadas[0]?.reason)} ${naoEsperadas[0]?.reason.message}`);
        verificar(ok.length === 3 && falha.length === 3, `rodada ${rodada}: ${ok.length} aceitas e ${falha.length} recusadas`);
        const { rows } = await admin.query(
          `SELECT count(DISTINCT bicicleta_id)::int AS unidades FROM reserva WHERE cliente_id = ANY($1::uuid[])`, [ids.usuarios]);
        verificar(rows[0].unidades === 3, `unidades diferentes: ${rows[0].unidades}`);
        await apagarReservas();
      }
    });
  } finally {
    await Promise.all(conexoes.map((c) => c.end().catch(() => {})));
    await admin.query('DELETE FROM reserva WHERE cliente_id = ANY($1::uuid[])', [ids.usuarios]).catch(() => {});
    await admin.query('DELETE FROM bicicleta WHERE tipo_id = $1', [ids.tipoId]).catch(() => {});
    await admin.query('DELETE FROM tipo_bicicleta WHERE id = $1', [ids.tipoId]).catch(() => {});
    await admin.query('DELETE FROM usuario WHERE id = ANY($1::uuid[])', [ids.usuarios]).catch(() => {});
    await admin.query('DELETE FROM ponto WHERE id = $1', [ids.pontoId]).catch(() => {});
    await admin.end();
  }
  if (falhas > 0) process.exitCode = 1;
}

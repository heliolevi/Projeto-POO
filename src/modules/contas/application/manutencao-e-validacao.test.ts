import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { Ambiente } from "../../../shared/config/ambiente.ts";
import { UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import { PoliticaDeSenha } from "../../../shared/dominio/politica-de-senha.ts";
import { VERSAO_TERMOS_ATUAL } from "../domain/usuario.ts";
import { ValidadorDeConta } from "../domain/validador-de-conta.ts";
import { ServicoDeToken, DURACAO_SESSAO_SEGUNDOS } from "../infrastructure/token.ts";
import { EmissorDeSessao } from "./emissor-de-sessao.ts";
import { ManutencaoDaConta } from "./manutencao-da-conta.ts";

const ID = "3f2b8c1e-5d4a-4b6f-9c7e-1a2b3c4d5e6f";
const SEGREDO = "segredo-do-teste-com-mais-de-32-caracteres-ok";

// ---------------------------------------------------------------- ServicoDeToken com ambiente e relógio injetados
const ambiente = new Ambiente({ SESSION_SECRET: SEGREDO });
const servicoEm = (segundos: () => number) => new ServicoDeToken({ ambiente, agoraEmSegundos: segundos });

test("o token vale até o segundo em que expira, e não um segundo a mais (relógio controlado)", () => {
  let agora = 1_800_000_000;
  const servico = servicoEm(() => agora);
  const { token, expiraEm } = servico.emitir({ id: ID, perfil: "CLIENTE" });
  assert.equal(expiraEm.getTime(), (1_800_000_000 + DURACAO_SESSAO_SEGUNDOS) * 1000);
  agora = 1_800_000_000 + DURACAO_SESSAO_SEGUNDOS - 1;
  assert.equal(servico.verificar(token)?.sub, ID, "um segundo antes");
  agora = 1_800_000_000 + DURACAO_SESSAO_SEGUNDOS;
  assert.equal(servico.verificar(token), null, "no segundo exato já expirou");
});

test("trocar o segredo invalida os tokens que já existem", () => {
  const velho = new ServicoDeToken({ ambiente: new Ambiente({ SESSION_SECRET: SEGREDO }) });
  const novo = new ServicoDeToken({ ambiente: new Ambiente({ SESSION_SECRET: "outro-segredo-com-mais-de-32-caracteres-ok" }) });
  assert.equal(novo.verificar(velho.emitir({ id: ID, perfil: "ADMIN" }).token), null);
});

test("sem SESSION_SECRET (ou com valor de exemplo/curto) o serviço recusa emitir e verificar", () => {
  for (const variaveis of [{}, { SESSION_SECRET: "" }, { SESSION_SECRET: "curto" }]) {
    const servico = new ServicoDeToken({ ambiente: new Ambiente(variaveis) });
    assert.throws(() => servico.emitir({ id: ID, perfil: "CLIENTE" }));
    assert.throws(() => servico.verificar("a.b.c"));
  }
});

test("token sem exp, com alg diferente ou com o corpo adulterado é recusado", () => {
  const servico = servicoEm(() => 1_800_000_000);
  const b64 = (d: string | Buffer) => Buffer.from(d).toString("base64url");
  const montar = (cab: object, corpo: object) => {
    const c = `${b64(JSON.stringify(cab))}.${b64(JSON.stringify(corpo))}`;
    return `${c}.${b64(createHmac("sha256", SEGREDO).update(c).digest())}`;
  };
  assert.equal(servico.verificar(montar({ alg: "HS256" }, { sub: ID, perfil: "CLIENTE" })), null, "sem exp");
  assert.equal(servico.verificar(montar({ alg: "none" }, { sub: ID, perfil: "CLIENTE", exp: 1_800_000_999 })), null, "alg none");
  assert.ok(servico.verificar(montar({ alg: "HS256" }, { sub: ID, perfil: "CLIENTE", exp: 1_800_000_999 })));
  const bom = servico.emitir({ id: ID, perfil: "CLIENTE" }).token.split(".");
  assert.equal(servico.verificar(`${bom[0]}.${b64(JSON.stringify({ sub: ID, perfil: "ADMIN", exp: 9_999_999_999 }))}.${bom[2]}`), null, "perfil trocado");
});

test("estresse: 2 mil tokens emitidos e verificados, e lixo de qualquer forma nunca lança", () => {
  const servico = servicoEm(() => 1_800_000_000);
  for (let i = 0; i < 2000; i++) assert.equal(servico.verificar(servico.emitir({ id: ID, perfil: "CLIENTE" }).token)?.sub, ID);
  for (const lixo of ["", ".", "..", "a.b", "a.b.c.d", "a.b.c", "💥.💥.💥", "a".repeat(100_000), "%.%.%", "eyJ.eyJ.eyJ"]) assert.equal(servico.verificar(lixo), null);
});

// ---------------------------------------------------------------- EmissorDeSessao
test("EmissorDeSessao monta { token, tipo, expiraEm, usuario } com a data em ISO", () => {
  const emissor = new EmissorDeSessao({ emitir: () => ({ token: "tk", expiraEm: new Date("2026-11-28T12:00:00.000Z") }) });
  const usuario = { id: ID, perfil: "CLIENTE" as const, nome: "Maria", email: "m@x.com" };
  assert.deepEqual(emissor.emitir(usuario), { token: "tk", tipo: "Bearer", expiraEm: "2026-11-28T12:00:00.000Z", usuario });
});

// ---------------------------------------------------------------- ManutencaoDaConta (as rotas além da troca de senha)
function manutencao() {
  const chamadas: string[] = [];
  const m = new ManutencaoDaConta({
    limite: { async exigirDentroDoLimite() {}, async limpar() {} },
    validador: new ValidadorDeConta(),
    senhas: { async verificar() { return true; }, async gerarHash(s) { return s; } },
    usuarios: {
      async buscarSenhaHashPorId() { return "h"; },
      async atualizarSenha() {},
      async atualizarAltura(id, altura) { chamadas.push(`altura:${id}:${altura}`); },
      async registrarAceiteDeTermos(id, versao) { chamadas.push(`termos:${id}:${versao}`); },
      async desativar(id) { chamadas.push(`desativar:${id}`); },
    },
  });
  return { m, chamadas };
}

test("atualizarAltura grava a altura válida da conta do token", async () => {
  const { m, chamadas } = manutencao();
  await m.atualizarAltura(ID, { alturaCm: 172 });
  assert.deepEqual(chamadas, [`altura:${ID}:172`]);
});

test("altura inválida (fora de 100 a 250, quebrada ou texto) é 400 e não grava", async () => {
  const { m, chamadas } = manutencao();
  for (const alturaCm of [99, 251, 172.5, "172", null, undefined, NaN, Infinity, {}, []]) {
    await assert.rejects(m.atualizarAltura(ID, { alturaCm }), ValidationError, String(alturaCm));
  }
  assert.deepEqual(chamadas, []);
});

test("as bordas da altura (100 e 250) passam", async () => {
  const { m, chamadas } = manutencao();
  await m.atualizarAltura(ID, { alturaCm: 100 });
  await m.atualizarAltura(ID, { alturaCm: 250 });
  assert.equal(chamadas.length, 2);
});

test("aceitarTermos só aceita a versão vigente", async () => {
  const { m, chamadas } = manutencao();
  await m.aceitarTermos(ID, { versao: VERSAO_TERMOS_ATUAL });
  assert.deepEqual(chamadas, [`termos:${ID}:${VERSAO_TERMOS_ATUAL}`]);
  for (const versao of ["2020-01", "", " ", "x".repeat(40), null, 7, undefined]) {
    await assert.rejects(m.aceitarTermos(ID, { versao }), ValidationError, String(versao));
  }
  assert.equal(chamadas.length, 1);
});

test("desativar chama o repositório com o id da sessão", async () => {
  const { m, chamadas } = manutencao();
  await m.desativar(ID);
  assert.deepEqual(chamadas, [`desativar:${ID}`]);
});

test("senha atual de conta que sumiu é 401 (e não 500)", async () => {
  const m = new ManutencaoDaConta({
    limite: { async exigirDentroDoLimite() {}, async limpar() {} },
    validador: new ValidadorDeConta(),
    senhas: { async verificar() { return true; }, async gerarHash(s) { return s; } },
    usuarios: { async buscarSenhaHashPorId() { return null; }, async atualizarSenha() {}, async atualizarAltura() {}, async registrarAceiteDeTermos() {}, async desativar() {} },
  });
  await assert.rejects(m.alterarSenha(ID, { senhaAtual: "antiga-123", novaSenha: "nova-12345" }), UnauthorizedError);
});

// ---------------------------------------------------------------- ValidadorDeConta com relógio e política injetados
const BASE = { nome: "Maria da Silva", email: "m@x.com", senha: "senha1234", cpf: "52998224725", aceiteTermos: true };

test("a data de nascimento no futuro é recusada, relativo ao relógio injetado (não ao de hoje)", () => {
  const validador = new ValidadorDeConta({ agora: () => new Date("2026-06-15T12:00:00Z") });
  assert.ok("dados" in validador.cadastro({ ...BASE, dataNascimento: "2026-06-15" }), "hoje vale");
  assert.ok("erros" in validador.cadastro({ ...BASE, dataNascimento: "2026-06-16" }), "amanhã não");
  assert.ok("erros" in validador.cadastro({ ...BASE, dataNascimento: "1899-12-31" }), "antes de 1900 não");
  assert.ok("dados" in validador.cadastro({ ...BASE, dataNascimento: "1900-01-01" }), "1900 vale");
  assert.ok("erros" in validador.cadastro({ ...BASE, dataNascimento: "2026-02-30" }), "dia que não existe");
  assert.ok("erros" in validador.cadastro({ ...BASE, dataNascimento: "15/06/1990" }));
});

test("a política de senha é injetável: com mínimo de 12, uma senha de 10 não serve", () => {
  const rigoroso = new ValidadorDeConta({ politica: new PoliticaDeSenha(12, 64) });
  const padrao = new ValidadorDeConta();
  assert.ok("dados" in padrao.cadastro(BASE));
  const r = rigoroso.cadastro(BASE);
  assert.ok("erros" in r && /12 a 64/.test(r.erros.senha));
});

test("a senha precisa de letra E número; a nova senha tem de ser diferente da atual (com a mesma normalização do hash)", () => {
  const v = new ValidadorDeConta();
  assert.ok("erros" in v.cadastro({ ...BASE, senha: "somenteletras" }));
  assert.ok("erros" in v.cadastro({ ...BASE, senha: "12345678" }));
  assert.ok("erros" in v.alterarSenha({ senhaAtual: "mesma1234", novaSenha: "mesma1234" }));
  assert.ok("erros" in v.alterarSenha({ senhaAtual: "ｍesma1234", novaSenha: "mesma1234" }), "forma larga do m é a mesma senha depois do NFKC");
});

test("o perfil do ciclista recusa campo desconhecido e corpo vazio, e a mensagem não vira eco de um corpo enorme", () => {
  const v = new ValidadorDeConta();
  assert.ok("erros" in v.perfilCiclista({}));
  assert.ok("erros" in v.perfilCiclista({ id: "x", alturaCm: 170 }));
  assert.ok("erros" in v.perfilCiclista([]));
  assert.ok("erros" in v.perfilCiclista(null));
  const muitos = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`campo${i}${"x".repeat(100)}`, 1]));
  const r = v.perfilCiclista(muitos);
  assert.ok("erros" in r && r.erros.corpo.length < 400, "a mensagem lista poucos nomes, e curtos");
  assert.ok("dados" in v.perfilCiclista({ alturaCm: null, experiencia: null, atividade: null }), "tudo null apaga de propósito");
});

test("o ValidadorDeConta é encapsulado: nenhum campo visível", () => {
  assert.deepEqual(Object.keys(new ValidadorDeConta()), []);
});

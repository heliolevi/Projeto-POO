import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { UnauthorizedError, ValidationError } from "../../../shared/http/errors.ts";
import { Admin, PERMISSOES_DO_ADMIN } from "./admin.ts";
import { Cliente, PERMISSOES_DO_CLIENTE } from "./cliente.ts";
import { criarUsuario } from "./fabrica-usuario.ts";
import { Operador, PERMISSOES_DO_OPERADOR } from "./operador.ts";
import { PERMISSOES, SenhaAtualIncorreta, Usuario, type ServicoDeSenha } from "./usuario-base.ts";

// Serviço de senha de mentira: o "hash" é o texto com um prefixo.
const servico: ServicoDeSenha = {
  verificar: async (senha, hash) => hash === `hash:${senha}`,
  gerarHash: async (senha) => `hash:${senha}`,
};

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Maria Silva",
  email: "maria@exemplo.com",
  senhaHash: "hash:Senha123",
  ativo: true,
};

describe("Usuario (classe abstrata)", () => {
  test("só existem os três perfis, um por subclasse", () => {
    const perfis = [new Cliente(base), new Operador(base), new Admin(base)].map((u) => u.perfil);
    assert.deepEqual(perfis, ["CLIENTE", "OPERADOR", "ADMIN"]);
  });

  test("toda subclasse é um Usuario (herança)", () => {
    for (const u of [new Cliente(base), new Operador(base), new Admin(base)]) {
      assert.ok(u instanceof Usuario);
    }
    assert.ok(new Admin(base) instanceof Admin);
    assert.ok(!(new Admin(base) instanceof Cliente));
  });

  test("valida os dados mínimos na criação", () => {
    assert.throws(() => new Cliente({ ...base, id: "" }), RangeError);
    assert.throws(() => new Cliente({ ...base, nome: "   " }), RangeError);
    assert.throws(() => new Cliente({ ...base, email: "sem-arroba" }), RangeError);
  });

  test("expõe os dados por leitura e paraPublico não vaza o hash", () => {
    const u = new Cliente(base);
    assert.equal(u.id, base.id);
    assert.equal(u.nome, "Maria Silva");
    assert.equal(u.email, "maria@exemplo.com");
    assert.equal(u.ativo, true);
    assert.deepEqual(u.paraPublico(), {
      id: base.id,
      perfil: "CLIENTE",
      nome: "Maria Silva",
      email: "maria@exemplo.com",
    });
    assert.ok(!JSON.stringify(u.paraPublico()).includes("hash"));
  });

  test("encapsulamento: os campos privados não aparecem no objeto nem no JSON", () => {
    const u = new Cliente(base);
    assert.deepEqual(Object.keys(u), []);
    assert.equal(JSON.stringify(u), "{}");
  });

  test("autenticar: senha certa em conta ativa autentica", async () => {
    assert.equal(await new Cliente(base).autenticar("Senha123", servico), true);
  });

  test("autenticar: senha errada não autentica", async () => {
    assert.equal(await new Cliente(base).autenticar("outra", servico), false);
  });

  test("autenticar: conta inativa nunca autentica, mas a senha é conferida mesmo assim", async () => {
    let chamadas = 0;
    const contando: ServicoDeSenha = {
      ...servico,
      verificar: async (s, h) => {
        chamadas++;
        return servico.verificar(s, h);
      },
    };
    const u = new Cliente({ ...base, ativo: false });
    assert.equal(await u.autenticar("Senha123", contando), false);
    assert.equal(chamadas, 1);
  });

  test("alterarSenha: com a atual certa troca e devolve o novo hash", async () => {
    const u = new Cliente(base);
    const novo = await u.alterarSenha("Senha123", "NovaSenha9", servico);
    assert.equal(novo, "hash:NovaSenha9");
    assert.equal(u.hashParaPersistir(), "hash:NovaSenha9");
    assert.equal(await u.autenticar("NovaSenha9", servico), true);
    assert.equal(await u.autenticar("Senha123", servico), false);
  });

  test("alterarSenha: com a atual errada lança SenhaAtualIncorreta (401) e não troca", async () => {
    const u = new Cliente(base);
    await assert.rejects(
      () => u.alterarSenha("errada", "NovaSenha9", servico),
      (erro) => {
        assert.ok(erro instanceof SenhaAtualIncorreta);
        assert.ok(erro instanceof UnauthorizedError);
        assert.equal((erro as UnauthorizedError).status, 401);
        return true;
      },
    );
    assert.equal(u.hashParaPersistir(), "hash:Senha123");
  });

  test("desativar inativa a conta e é idempotente", () => {
    const u = new Operador(base);
    u.desativar();
    assert.equal(u.ativo, false);
    u.desativar();
    assert.equal(u.ativo, false);
  });
});

describe("polimorfismo: permissoes() de cada perfil", () => {
  test("cada subclasse devolve a sua lista", () => {
    assert.deepEqual(new Cliente(base).permissoes(), PERMISSOES_DO_CLIENTE);
    assert.deepEqual(new Operador(base).permissoes(), PERMISSOES_DO_OPERADOR);
    assert.deepEqual(new Admin(base).permissoes(), PERMISSOES_DO_ADMIN);
  });

  test("o mesmo código decide o acesso sem olhar o perfil", () => {
    const pode = (u: Usuario) => u.temPermissao("operacao:registrar-retirada");
    assert.equal(pode(new Cliente(base)), false);
    assert.equal(pode(new Operador(base)), true);
    assert.equal(pode(new Admin(base)), true);
  });

  test("só o cliente reserva; só o admin gere o catálogo e consulta a auditoria", () => {
    assert.ok(new Cliente(base).temPermissao("reserva:criar"));
    assert.ok(!new Operador(base).temPermissao("reserva:criar"));
    assert.ok(!new Admin(base).temPermissao("reserva:criar"));
    for (const p of ["catalogo:gerir", "auditoria:consultar", "empresa:editar", "ocorrencia:resolver"] as const) {
      assert.ok(new Admin(base).temPermissao(p), p);
      assert.ok(!new Operador(base).temPermissao(p), p);
      assert.ok(!new Cliente(base).temPermissao(p), p);
    }
  });

  test("o admin tem tudo o que o operador tem", () => {
    for (const p of PERMISSOES_DO_OPERADOR) assert.ok(new Admin(base).temPermissao(p), p);
  });

  test("toda permissão usada pelos perfis existe na lista geral", () => {
    for (const p of [...PERMISSOES_DO_CLIENTE, ...PERMISSOES_DO_OPERADOR, ...PERMISSOES_DO_ADMIN]) {
      assert.ok((PERMISSOES as readonly string[]).includes(p), p);
    }
  });
});

describe("Cliente", () => {
  test("começa sem dados de ciclista e sem aceite dos termos", () => {
    const c = new Cliente(base);
    assert.deepEqual(c.ciclista, { alturaCm: null, experiencia: null, atividade: null });
    assert.equal(c.aceiteTermosEm, null);
    assert.equal(c.temAceiteDosTermos("2026-11"), false);
  });

  test("atualizarPerfilCiclista grava os dados válidos", () => {
    const c = new Cliente(base);
    c.atualizarPerfilCiclista({ alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" });
    assert.deepEqual(c.ciclista, { alturaCm: 172, experiencia: "INICIANTE", atividade: "PASSEIO" });
  });

  test("atualizarPerfilCiclista: o que não vem fica, null apaga", () => {
    const c = new Cliente({
      ...base,
      ciclista: { alturaCm: 172, experiencia: "AVANCADO", atividade: "TRILHA" },
    });
    c.atualizarPerfilCiclista({ alturaCm: 180 });
    assert.deepEqual(c.ciclista, { alturaCm: 180, experiencia: "AVANCADO", atividade: "TRILHA" });
    c.atualizarPerfilCiclista({ atividade: null });
    assert.equal(c.ciclista.atividade, null);
    assert.equal(c.ciclista.alturaCm, 180);
  });

  test("atualizarPerfilCiclista: um dado inválido recusa tudo (ValidationError) e não grava nada", () => {
    const c = new Cliente({ ...base, ciclista: { alturaCm: 170, experiencia: null, atividade: null } });
    assert.throws(
      () => c.atualizarPerfilCiclista({ alturaCm: 99, experiencia: "INICIANTE" }),
      (erro) => {
        assert.ok(erro instanceof ValidationError);
        assert.deepEqual(Object.keys((erro as ValidationError).details as object), ["alturaCm"]);
        return true;
      },
    );
    assert.deepEqual(c.ciclista, { alturaCm: 170, experiencia: null, atividade: null });
    for (const ruim of [{ alturaCm: 251 }, { alturaCm: 170.5 }, { experiencia: "MESTRE" }, { atividade: "VOO" }]) {
      assert.throws(() => c.atualizarPerfilCiclista(ruim as never), ValidationError, JSON.stringify(ruim));
    }
  });

  test("encapsulamento: alterar a cópia de ciclista não muda o cliente", () => {
    const c = new Cliente(base);
    c.ciclista.alturaCm = 300;
    assert.equal(c.ciclista.alturaCm, null);
  });

  test("aceitarTermos registra a data e a versão; aceite de versão antiga não vale para a nova", () => {
    const c = new Cliente(base);
    const agora = new Date("2026-11-13T12:00:00Z");
    c.aceitarTermos("2026-11", agora);
    assert.equal(c.aceiteTermosEm?.getTime(), agora.getTime());
    assert.ok(c.temAceiteDosTermos("2026-11"));
    assert.ok(!c.temAceiteDosTermos("2027-01"));
    assert.throws(() => c.aceitarTermos("  ", agora), RangeError);
  });

  test("a data do aceite devolvida é cópia", () => {
    const c = new Cliente(base);
    c.aceitarTermos("2026-11", new Date("2026-11-13T12:00:00Z"));
    c.aceiteTermosEm?.setUTCFullYear(1999);
    assert.equal(c.aceiteTermosEm?.getUTCFullYear(), 2026);
  });

  test("paraConta junta os dados públicos e o perfil de ciclista", () => {
    const c = new Cliente({ ...base, ciclista: { alturaCm: 172, experiencia: null, atividade: null } });
    assert.deepEqual(c.paraConta(), {
      id: base.id,
      perfil: "CLIENTE",
      nome: "Maria Silva",
      email: "maria@exemplo.com",
      ciclista: { alturaCm: 172, experiencia: null, atividade: null },
    });
  });

  test("guarda cpf e data de nascimento", () => {
    const c = new Cliente({ ...base, cpf: "52998224725", dataNascimento: "1990-05-10" });
    assert.equal(c.cpf, "52998224725");
    assert.equal(c.dataNascimento, "1990-05-10");
  });
});

describe("Operador", () => {
  test("sem ponto atua em qualquer ponto; com ponto, só nele", () => {
    assert.ok(new Operador(base).podeAtuarNoPonto("ponto-a"));
    const o = new Operador({ ...base, pontoId: "ponto-a" });
    assert.equal(o.pontoId, "ponto-a");
    assert.ok(o.podeAtuarNoPonto("ponto-a"));
    assert.ok(!o.podeAtuarNoPonto("ponto-b"));
  });
});

describe("criarUsuario (fábrica)", () => {
  test("devolve a subclasse certa para cada perfil", () => {
    assert.ok(criarUsuario({ ...base, perfil: "CLIENTE" }) instanceof Cliente);
    assert.ok(criarUsuario({ ...base, perfil: "OPERADOR" }) instanceof Operador);
    assert.ok(criarUsuario({ ...base, perfil: "ADMIN" }) instanceof Admin);
  });

  test("repassa os dados específicos de cada perfil", () => {
    const c = criarUsuario({ ...base, perfil: "CLIENTE", ciclista: { alturaCm: 170 } }) as Cliente;
    assert.equal(c.ciclista.alturaCm, 170);
    const o = criarUsuario({ ...base, perfil: "OPERADOR", pontoId: "p1" }) as Operador;
    assert.equal(o.pontoId, "p1");
  });

  test("um perfil desconhecido não vira objeto", () => {
    assert.throws(() => criarUsuario({ ...base, perfil: "GERENTE_LOCADORA" as never }), RangeError);
  });
});

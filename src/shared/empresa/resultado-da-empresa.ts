import type { EmpresaDaLocadora } from "./empresa-da-locadora";
import type { OpcaoDePonto, PontoDeRetirada } from "./ponto-de-retirada";

// O que a busca de GET /api/empresa pode devolver. Cada situação é uma subclasse que sabe responder
// sozinha às duas perguntas das telas (qual é o ponto principal? quais pontos o admin pode escolher?),
// então a tela pergunta ao objeto em vez de decidir por `if` em cada lugar.
export abstract class ResultadoDaEmpresa {
  /** Só para a tela escolher o que desenhar (carregada, sem cadastro ou fora do ar). */
  abstract readonly tipo: "pronto" | "semCadastro" | "erro";

  /** O ponto de retirada que a tela mostra, ou null. */
  abstract pontoPrincipal(): PontoDeRetirada | null;

  /** Os pontos que o admin pode escolher ao cadastrar uma bicicleta. */
  abstract opcoesDePonto(doEstoque: readonly OpcaoDePonto[]): OpcaoDePonto[];
}

/** A API respondeu com os dados da locadora. Vale só o que ela mandou: pontos ativos, sem o estoque. */
export class EmpresaCarregada extends ResultadoDaEmpresa {
  readonly tipo = "pronto" as const;
  readonly #empresa: EmpresaDaLocadora;

  constructor(empresa: EmpresaDaLocadora) {
    super();
    this.#empresa = empresa;
  }

  get empresa(): EmpresaDaLocadora {
    return this.#empresa;
  }

  pontoPrincipal(): PontoDeRetirada | null {
    return this.#empresa.pontoPrincipal();
  }

  opcoesDePonto(): OpcaoDePonto[] {
    return this.#empresa.pontos.map((ponto) => ponto.opcao());
  }
}

/** A API respondeu 404: a locadora ainda não foi cadastrada no banco. */
export class EmpresaSemCadastro extends ResultadoDaEmpresa {
  readonly tipo = "semCadastro" as const;

  pontoPrincipal(): null {
    return null;
  }

  opcoesDePonto(): OpcaoDePonto[] {
    return [];
  }
}

/** Rede caída, erro do servidor, corpo ilegível ou demora demais. O admin ainda pode usar os pontos do estoque. */
export class EmpresaIndisponivel extends ResultadoDaEmpresa {
  readonly tipo = "erro" as const;

  pontoPrincipal(): null {
    return null;
  }

  opcoesDePonto(doEstoque: readonly OpcaoDePonto[]): OpcaoDePonto[] {
    return doEstoque.map((ponto) => ({ id: ponto.id, nome: ponto.nome }));
  }
}

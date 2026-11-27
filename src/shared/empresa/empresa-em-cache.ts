import { BuscadorDeEmpresa } from "./buscador-de-empresa";
import { EmpresaCarregada, type ResultadoDaEmpresa } from "./resultado-da-empresa";

/** De onde vêm os dados da locadora (o BuscadorDeEmpresa de verdade, ou um de mentira nos testes). */
export interface FonteDaEmpresa {
  buscar(): Promise<ResultadoDaEmpresa>;
}

// Guarda a resposta de GET /api/empresa pela visita: as telas que precisam da locadora (início,
// busca, resumo da reserva, painel) dividem uma busca só em vez de repetir uma a cada tela. Só o que
// deu certo fica guardado; locadora sem cadastro e falha são buscadas de novo na próxima vez, para um
// erro passageiro não grudar até a pessoa recarregar a página. Telas que chegam enquanto a busca está
// em andamento esperam a mesma resposta.
export class EmpresaEmCache {
  /** O cache do app. */
  static readonly padrao = new EmpresaEmCache(new BuscadorDeEmpresa());

  readonly #fonte: FonteDaEmpresa;
  #busca: Promise<ResultadoDaEmpresa> | null = null;

  constructor(fonte: FonteDaEmpresa) {
    this.#fonte = fonte;
  }

  obter(): Promise<ResultadoDaEmpresa> {
    if (this.#busca) return this.#busca;
    const busca: Promise<ResultadoDaEmpresa> = this.#fonte.buscar().then(
      (resultado) => {
        if (!(resultado instanceof EmpresaCarregada)) this.#esquecer(busca);
        return resultado;
      },
      (erro) => {
        this.#esquecer(busca);
        throw erro;
      },
    );
    this.#busca = busca;
    return busca;
  }

  /** Esquece o que guardou: a próxima chamada busca de novo (o "tentar de novo" da tela). */
  invalidar(): void {
    this.#busca = null;
  }

  // Só esquece a busca que falhou se ela ainda for a guardada: uma resposta antiga, de antes de um
  // invalidar, não pode apagar a busca nova.
  #esquecer(busca: Promise<ResultadoDaEmpresa>): void {
    if (this.#busca === busca) this.#busca = null;
  }
}

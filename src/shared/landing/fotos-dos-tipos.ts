import { FotosDasBicicletas, type FotoBicicleta } from "./fotos.ts";

// Mapa tipoId -> atividades, vindo do catálogo público. Com ele, a mesma bicicleta mostra a mesma
// foto na busca, nas reservas e na tela inicial. Sem o mapa (ainda carregando, ou catálogo fora do
// ar), cai na escolha estável pelo id.
export type AtividadesPorTipo = ReadonlyMap<string, readonly string[]>;

// Monta o mapa do catálogo e escolhe a foto por ele. Só tem métodos estáticos, então não se cria
// instância.
export class FotosDosTipos {
  private constructor() {
    throw new Error("FotosDosTipos só tem métodos estáticos.");
  }

  static doTipo(mapa: AtividadesPorTipo | null, tipoId: string): FotoBicicleta {
    const atividades = mapa?.get(tipoId);
    return atividades ? FotosDasBicicletas.doTipo(atividades) : FotosDasBicicletas.porId(tipoId);
  }

  static montarMapa(tipos: readonly { id: string; atividades: readonly string[] }[]): AtividadesPorTipo {
    return new Map(tipos.map((tipo) => [tipo.id, tipo.atividades]));
  }
}

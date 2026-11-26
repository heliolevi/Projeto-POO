import { fotoDoTipo, fotoPorId, type FotoBicicleta } from "./fotos.ts";

// Mapa tipoId -> atividades, vindo do catálogo público. Com ele, a mesma bicicleta mostra a mesma
// foto na busca, nas reservas e na tela inicial. Sem o mapa (ainda carregando, ou catálogo fora do
// ar), cai na escolha estável pelo id.
export type AtividadesPorTipo = ReadonlyMap<string, readonly string[]>;

export function fotoDoTipoPorId(mapa: AtividadesPorTipo | null, tipoId: string): FotoBicicleta {
  const atividades = mapa?.get(tipoId);
  return atividades ? fotoDoTipo(atividades) : fotoPorId(tipoId);
}

export function montarMapa(
  tipos: { id: string; atividades: readonly string[] }[],
): AtividadesPorTipo {
  return new Map(tipos.map((tipo) => [tipo.id, tipo.atividades]));
}

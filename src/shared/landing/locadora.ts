// O que a página fala da locadora e que não vem da API: o nome da marca e a regra de documento na
// retirada (a rota GET /api/empresa não devolve documentos exigidos). Endereço, telefone, e-mail e
// horários vêm de GET /api/empresa (src/shared/empresa); não repita esses dados aqui, porque a cópia
// envelhece e passa a divergir do banco. Os dados do seed (db/seeds/dev.sql) são fictícios.

export const LOCADORA = {
  nome: "Bike Ilha Club",
  documentosNaRetirada: "Documento de identidade com foto e CPF",
} as const;

export const PASSOS = [
  {
    titulo: "Conte sobre você",
    texto: "Informe sua altura, sua experiência e o tipo de passeio. Leva menos de um minuto.",
  },
  {
    titulo: "Escolha a bicicleta indicada",
    texto: "Veja só o que está livre no dia e na hora que você quer, da mais indicada para a menos.",
  },
  {
    titulo: "Reserve e pague com Pix",
    texto: "A bicicleta fica separada para você enquanto você paga. Depois é só retirar no ponto.",
  },
] as const;

// Tipo de bicicleta como GET /api/catalogo/tipos devolve (contrato, rota 10).
export type TipoPublico = {
  id: string;
  nome: string;
  descricao: string | null;
  atividades: string[];
  alturaMinCm: number;
  alturaMaxCm: number;
  nivelRecomendado: string;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  valorCaucaoCentavos: number;
};

// Ordem, preço de entrada e faixa de altura dos tipos mostrados na página pública. Só tem
// métodos estáticos, então não se cria instância.
export class TiposDaVitrine {
  private constructor() {
    throw new Error("TiposDaVitrine só tem métodos estáticos.");
  }

  /** Do mais barato ao mais caro pela diária; empate em ordem alfabética. */
  static ordenarPorPreco(tipos: readonly TipoPublico[]): TipoPublico[] {
    return [...tipos].sort(
      (a, b) => a.precoDiaCentavos - b.precoDiaCentavos || a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }

  /** Menor preço por hora entre os tipos (para "a partir de"), ou `null` se não houver tipos. */
  static menorPrecoPorHora(tipos: readonly TipoPublico[]): number | null {
    if (tipos.length === 0) return null;
    return Math.min(...tipos.map((t) => t.precoHoraCentavos));
  }

  static faixaDeAltura(tipo: Pick<TipoPublico, "alturaMinCm" | "alturaMaxCm">): string {
    return `Para quem tem de ${tipo.alturaMinCm} a ${tipo.alturaMaxCm} cm`;
  }
}

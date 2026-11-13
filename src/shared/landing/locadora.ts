// Dados da locadora que a página inicial mostra. A fonte é o seed (db/seeds/dev.sql), descrito em
// docs/dados-da-locadora.md; se divergirem, vale o seed e este arquivo é ajustado. Todos os dados
// são fictícios (decisão do tech lead de 10/11/2026) e devem ser trocados quando houver locadora real.
// Quando a rota GET /api/empresa existir, esta página passa a ler dela.

export const LOCADORA = {
  nome: "Bike Ilha Club",
  telefone: "(98) 90000-0000",
  email: "contato@bikeilha.test",
  ponto: {
    nome: "Ponto Litorânea",
    endereco: "Avenida Litorânea, 100, Calhau, São Luís (MA)",
  },
  horarios: [
    { dias: "Segunda a sexta", horario: "08:00 às 18:00" },
    { dias: "Sábado", horario: "08:00 às 16:00" },
    { dias: "Domingo", horario: "08:00 às 14:00" },
  ],
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

/** Do mais barato ao mais caro pela diária; empate em ordem alfabética. */
export function ordenarPorPreco(tipos: TipoPublico[]): TipoPublico[] {
  return [...tipos].sort(
    (a, b) => a.precoDiaCentavos - b.precoDiaCentavos || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Menor preço por hora entre os tipos (para "a partir de"), ou `null` se não houver tipos. */
export function menorPrecoPorHora(tipos: TipoPublico[]): number | null {
  if (tipos.length === 0) return null;
  return Math.min(...tipos.map((t) => t.precoHoraCentavos));
}

export function faixaDeAltura(tipo: Pick<TipoPublico, "alturaMinCm" | "alturaMaxCm">): string {
  return `Para quem tem de ${tipo.alturaMinCm} a ${tipo.alturaMaxCm} cm`;
}

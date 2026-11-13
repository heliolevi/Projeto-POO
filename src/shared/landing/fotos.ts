// Fotos das bicicletas do app. Arquivos em public/bicicletas, todos CC0 (domínio público):
// ver docs/creditos-das-imagens.md.
export type FotoBicicleta = { src: string; alt: string; largura: number; altura: number };

export const FOTO_PASSEIO: FotoBicicleta = {
  src: "/bicicletas/passeio.jpg",
  alt: "Bicicleta de passeio azul com cesta de vime, parada na grama de um parque",
  largura: 1100,
  altura: 733,
};

export const FOTO_TRILHA: FotoBicicleta = {
  src: "/bicicletas/trilha.jpg",
  alt: "Mountain bike preta e laranja com pneus de trilha, parada em terreno de terra e grama",
  largura: 1100,
  altura: 825,
};

export const FOTO_URBANA: FotoBicicleta = {
  src: "/bicicletas/urbana.jpg",
  alt: "Bicicleta urbana preta com alforje, encostada em uma grade coberta de folhagem",
  largura: 1100,
  altura: 733,
};

export const FOTO_TURISMO: FotoBicicleta = {
  src: "/bicicletas/turismo.jpg",
  alt: "Bicicleta amarela apoiada em uma grade, entre muros antigos e plantas verdes",
  largura: 1100,
  altura: 698,
};

export const TODAS_AS_FOTOS: readonly FotoBicicleta[] = [
  FOTO_PASSEIO,
  FOTO_TRILHA,
  FOTO_URBANA,
  FOTO_TURISMO,
];

// Escolhe a foto pela atividade do tipo. Trilha e esporte pesam mais: quem faz trilha precisa
// ver a mountain bike. Sem atividade conhecida, cai na bicicleta de passeio.
export function fotoDoTipo(atividades: readonly string[]): FotoBicicleta {
  if (atividades.includes("TRILHA") || atividades.includes("ESPORTE")) return FOTO_TRILHA;
  if (atividades.includes("URBANO")) return FOTO_URBANA;
  if (atividades.includes("TURISMO")) return FOTO_TURISMO;
  return FOTO_PASSEIO;
}

// Telas que só conhecem o id do tipo (reservas, resultado da busca) usam sempre a mesma foto para
// o mesmo id: a escolha vem de uma soma dos caracteres, sem sorteio, então não muda a cada visita.
export function fotoPorId(id: string): FotoBicicleta {
  let soma = 0;
  for (const letra of id) soma += letra.charCodeAt(0);
  return TODAS_AS_FOTOS[soma % TODAS_AS_FOTOS.length];
}

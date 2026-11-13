// Fotos das bicicletas da página inicial. Arquivos em public/bicicletas, ambos CC0 (domínio
// público): ver docs/creditos-das-imagens.md.
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

// Tipos de trilha ou esporte mostram a mountain bike; os demais, a bicicleta de passeio.
export function fotoDoTipo(atividades: readonly string[]): FotoBicicleta {
  return atividades.includes("TRILHA") || atividades.includes("ESPORTE") ? FOTO_TRILHA : FOTO_PASSEIO;
}

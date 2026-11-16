import type { Atividade, Experiencia } from "./ciclista.ts";

// Textos que o cliente lê para cada valor das enumerações do perfil de ciclista.
export const ROTULO_EXPERIENCIA: Record<Experiencia, string> = {
  INICIANTE: "Iniciante",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

export const ROTULO_ATIVIDADE: Record<Atividade, string> = {
  PASSEIO: "Passeio",
  URBANO: "Deslocamento urbano",
  TRILHA: "Trilha",
  ESPORTE: "Esporte",
  TURISMO: "Turismo",
};

// Uma frase curta para cada opção, mostrada nos cartões de escolha do perfil e da busca. Diz o
// que a pessoa vai fazer, para ela se reconhecer na opção sem precisar adivinhar o termo.
export const DESCRICAO_EXPERIENCIA: Record<Experiencia, string> = {
  INICIANTE: "Pedalo pouco ou estou voltando agora.",
  INTERMEDIARIO: "Pedalo com frequência em rua e ciclovia.",
  AVANCADO: "Encaro subida, trilha e distância longa.",
};

export const DESCRICAO_ATIVIDADE: Record<Atividade, string> = {
  PASSEIO: "Orla e praças, sem pressa.",
  URBANO: "Ir e voltar pela cidade.",
  TRILHA: "Terra, areia e subida.",
  ESPORTE: "Ritmo, treino e distância.",
  TURISMO: "Centro histórico e pontos turísticos.",
};

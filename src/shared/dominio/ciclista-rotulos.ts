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

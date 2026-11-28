import type { Atividade, Experiencia } from "./ciclista.ts";

const ROTULO_EXPERIENCIA: Readonly<Record<Experiencia, string>> = {
  INICIANTE: "Iniciante",
  INTERMEDIARIO: "Intermediário",
  AVANCADO: "Avançado",
};

const ROTULO_ATIVIDADE: Readonly<Record<Atividade, string>> = {
  PASSEIO: "Passeio",
  URBANO: "Deslocamento urbano",
  TRILHA: "Trilha",
  ESPORTE: "Esporte",
  TURISMO: "Turismo",
};

// Uma frase curta para cada opção, mostrada nos cartões de escolha do perfil e da busca. Diz o
// que a pessoa vai fazer, para ela se reconhecer na opção sem precisar adivinhar o termo.
const DESCRICAO_EXPERIENCIA: Readonly<Record<Experiencia, string>> = {
  INICIANTE: "Pedalo pouco ou estou voltando agora.",
  INTERMEDIARIO: "Pedalo com frequência em rua e ciclovia.",
  AVANCADO: "Encaro subida, trilha e distância longa.",
};

const DESCRICAO_ATIVIDADE: Readonly<Record<Atividade, string>> = {
  PASSEIO: "Orla e praças, sem pressa.",
  URBANO: "Ir e voltar pela cidade.",
  TRILHA: "Terra, areia e subida.",
  ESPORTE: "Ritmo, treino e distância.",
  TURISMO: "Centro histórico e pontos turísticos.",
};

// Os textos que o cliente lê para cada valor das enumerações do perfil de ciclista.
// Só tem métodos estáticos (não guarda estado), então não se cria instância.
export class RotulosDoCiclista {
  private constructor() {
    throw new Error("RotulosDoCiclista só tem métodos estáticos.");
  }

  static experiencia(valor: Experiencia): string {
    return ROTULO_EXPERIENCIA[valor];
  }

  static atividade(valor: Atividade): string {
    return ROTULO_ATIVIDADE[valor];
  }

  static descricaoDaExperiencia(valor: Experiencia): string {
    return DESCRICAO_EXPERIENCIA[valor];
  }

  static descricaoDaAtividade(valor: Atividade): string {
    return DESCRICAO_ATIVIDADE[valor];
  }
}

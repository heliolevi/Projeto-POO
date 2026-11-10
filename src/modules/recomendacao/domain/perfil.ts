// Enumerações do banco (migration 0004), usadas pela recomendação.
export const EXPERIENCIAS = ["INICIANTE", "INTERMEDIARIO", "AVANCADO"] as const;
export type Experiencia = (typeof EXPERIENCIAS)[number];

export const ATIVIDADES = ["PASSEIO", "URBANO", "TRILHA", "ESPORTE", "TURISMO"] as const;
export type Atividade = (typeof ATIVIDADES)[number];

// Os dados do cliente que a recomendação usa, e só estes (minimização da LGPD).
// Qualquer um pode faltar: o cliente não é obrigado a preencher o perfil de ciclista.
export type PerfilCiclista = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  // atividade pretendida nesta busca (a da query ou, se ausente, a preferida do perfil)
  atividade: Atividade | null;
};

export function ehExperiencia(valor: unknown): valor is Experiencia {
  return typeof valor === "string" && (EXPERIENCIAS as readonly string[]).includes(valor);
}

export function ehAtividade(valor: unknown): valor is Atividade {
  return typeof valor === "string" && (ATIVIDADES as readonly string[]).includes(valor);
}

// Textos usados nos motivos devolvidos ao cliente.
export const NOME_ATIVIDADE: Record<Atividade, string> = {
  PASSEIO: "passeio",
  URBANO: "uso urbano",
  TRILHA: "trilha",
  ESPORTE: "esporte",
  TURISMO: "turismo",
};

export const NOME_EXPERIENCIA: Record<Experiencia, string> = {
  INICIANTE: "iniciante",
  INTERMEDIARIO: "intermediário",
  AVANCADO: "avançado",
};

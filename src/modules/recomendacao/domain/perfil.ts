// As enumerações vêm de shared (contas e catalogo usam as mesmas listas).
import {
  ATIVIDADES,
  EXPERIENCIAS,
  ehAtividade,
  ehExperiencia,
  type Atividade,
  type Experiencia,
} from "../../../shared/dominio/ciclista.ts";
export { ATIVIDADES, EXPERIENCIAS, ehAtividade, ehExperiencia, type Atividade, type Experiencia };

// Os dados do cliente que a recomendação usa, e só estes (minimização da LGPD).
// Qualquer um pode faltar: o cliente não é obrigado a preencher o perfil de ciclista.
export type PerfilCiclista = {
  alturaCm: number | null;
  experiencia: Experiencia | null;
  // atividade pretendida nesta busca (a da query ou, se ausente, a preferida do perfil)
  atividade: Atividade | null;
};

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

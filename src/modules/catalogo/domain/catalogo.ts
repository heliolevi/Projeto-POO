import type { Atividade, Experiencia } from "../../../shared/dominio/ciclista.ts";
import type { Horario } from "./ponto.ts";
import type { StatusBicicleta } from "./validador-do-catalogo.ts";

// Como a API devolve um tipo de bicicleta (docs/contrato-api-mvp.md, rotas 10 e 19 a 21).
export type TipoAdmin = {
  id: string;
  nome: string;
  descricao: string | null;
  atividades: Atividade[];
  alturaMinCm: number;
  alturaMaxCm: number;
  nivelRecomendado: Experiencia;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  valorCaucaoCentavos: number;
  ativo: boolean;
};

// O catálogo público não mostra `ativo`: só os tipos ativos aparecem nele.
export type TipoPublico = Omit<TipoAdmin, "ativo">;

// Como a API devolve uma unidade da frota (rotas 22 a 24). Só a equipe vê estes dados.
export type BicicletaAdmin = {
  id: string;
  codigo: string;
  tipo: { id: string; nome: string };
  ponto: { id: string; nome: string };
  numeroSerie: string | null;
  tamanhoQuadro: string | null;
  // STATUS_BICICLETA mais ALUGADA, que existe no banco mas a API não cria
  status: StatusBicicleta | "ALUGADA";
  observacoes: string | null;
};

// Ponto de retirada como a API mostra ao público (docs/contrato-api-mvp.md, rota 9). Tem que bater
// com PontoDaEmpresa (src/shared/reservas/nova-reserva.ts), que a tela de reserva usa.
export type PontoPublico = {
  id: string;
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  telefone: string | null;
  horarios: Horario[];
};

// Como a API devolve a locadora ao público (docs/contrato-api-mvp.md, rota 9). Os dados da
// locadora vêm da view empresa_publica: sem CNPJ, razão social nem conta de recebimento.
export type EmpresaPublica = {
  nomeFantasia: string;
  telefone: string | null;
  email: string;
  pontos: PontoPublico[];
};

// O que o repositório entrega: o ponto ainda traz "ativo", para o caso de uso filtrar de novo
// (a RLS e o WHERE já filtram; aqui é a última barreira antes da resposta).
export type EmpresaDoRepositorio = Omit<EmpresaPublica, "pontos"> & {
  pontos: (PontoPublico & { ativo: boolean })[];
};

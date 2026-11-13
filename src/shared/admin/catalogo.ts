// Tipos e conversões do painel do catálogo (GET/POST/PUT /api/admin/tipos e
// GET/POST/PATCH /api/admin/bicicletas). Espelham src/modules/catalogo/domain, sem importar o
// módulo do servidor para dentro do navegador.
export const ATIVIDADES = ["PASSEIO", "URBANO", "TRILHA", "ESPORTE", "TURISMO"] as const;
export type Atividade = (typeof ATIVIDADES)[number];

export const STATUS_EDITAVEIS = ["DISPONIVEL", "MANUTENCAO", "BLOQUEADA", "BAIXADA"] as const;
export type StatusBicicleta = (typeof STATUS_EDITAVEIS)[number] | "ALUGADA";

export const ROTULO_STATUS: Record<StatusBicicleta, string> = {
  DISPONIVEL: "Disponível",
  MANUTENCAO: "Manutenção",
  BLOQUEADA: "Bloqueada",
  BAIXADA: "Baixada",
  ALUGADA: "Alugada",
};

export const ROTULO_ATIVIDADE: Record<Atividade, string> = {
  PASSEIO: "Passeio",
  URBANO: "Urbano",
  TRILHA: "Trilha",
  ESPORTE: "Esporte",
  TURISMO: "Turismo",
};

export type TipoAdmin = {
  id: string;
  nome: string;
  descricao: string | null;
  atividades: Atividade[];
  alturaMinCm: number;
  alturaMaxCm: number;
  nivelRecomendado: string;
  precoHoraCentavos: number;
  precoDiaCentavos: number;
  valorCaucaoCentavos: number;
  ativo: boolean;
};

export type BicicletaAdmin = {
  id: string;
  codigo: string;
  tipo: { id: string; nome: string };
  ponto: { id: string; nome: string };
  numeroSerie: string | null;
  tamanhoQuadro: string | null;
  status: StatusBicicleta;
  observacoes: string | null;
};

// "40", "40,5" ou "40,50" (reais) viram centavos. Texto inválido vira null.
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

// Pontos de retirada distintos que aparecem nas bicicletas (a locadora é única).
export function pontosDasBicicletas(bicicletas: BicicletaAdmin[]): { id: string; nome: string }[] {
  const vistos = new Map<string, string>();
  for (const b of bicicletas) if (!vistos.has(b.ponto.id)) vistos.set(b.ponto.id, b.ponto.nome);
  return [...vistos].map(([id, nome]) => ({ id, nome }));
}

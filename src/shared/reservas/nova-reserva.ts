// Dados que a tela de resumo recebe da busca pela URL. O valor do aluguel nunca viaja na URL:
// a tela busca de novo na recomendação e o servidor recalcula o preço ao criar a reserva.
export type PedidoDeReserva = { tipoId: string; inicio: string; fim: string };

const CAMINHO = "/app/reservas/nova";

export function linkDaReserva(pedido: PedidoDeReserva): string {
  const parametros = new URLSearchParams({
    tipoId: pedido.tipoId,
    inicio: pedido.inicio,
    fim: pedido.fim,
  });
  return `${CAMINHO}?${parametros.toString()}`;
}

// ISO 8601 completo e com fuso (Z ou ±hh:mm), como a API espera. Data solta ou número não valem.
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function instanteValido(valor: string): boolean {
  return ISO_COM_FUSO.test(valor) && !Number.isNaN(new Date(valor).getTime());
}

/** Primeiro motivo de campo devolvido pela API (`details`), ou a mensagem geral se não houver. */
export function motivoDoErro(erro: { message: string; details?: Record<string, string> }): string {
  const primeiro = erro.details ? Object.values(erro.details).find(Boolean) : undefined;
  return primeiro ?? erro.message;
}

/** Lê e confere o pedido da URL. `null` se faltar algo ou o período não fizer sentido. */
export function lerPedidoDaReserva(parametros: { get(nome: string): string | null }): PedidoDeReserva | null {
  const tipoId = parametros.get("tipoId")?.trim();
  const inicio = parametros.get("inicio")?.trim();
  const fim = parametros.get("fim")?.trim();
  if (!tipoId || !inicio || !fim) return null;
  if (!instanteValido(inicio) || !instanteValido(fim)) return null;
  if (new Date(fim).getTime() <= new Date(inicio).getTime()) return null;
  return { tipoId, inicio, fim };
}

// Ponto de retirada de GET /api/empresa (contrato, rota 9).
export type PontoDaEmpresa = {
  id: string;
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
};

export type Empresa = { nomeFantasia: string; pontos: PontoDaEmpresa[] };

export function enderecoDoPonto(ponto: PontoDaEmpresa): string {
  const rua = [ponto.logradouro, ponto.numero].filter(Boolean).join(", ");
  const complemento = ponto.complemento ? ` (${ponto.complemento})` : "";
  return `${rua}${complemento}, ${ponto.bairro}, ${ponto.cidade}/${ponto.uf}`;
}

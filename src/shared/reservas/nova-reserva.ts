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

function instanteValido(valor: string): boolean {
  return !Number.isNaN(new Date(valor).getTime());
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

// Dados que a tela de resumo recebe da busca pela URL. O valor do aluguel nunca viaja na URL:
// a tela busca de novo na recomendação e o servidor recalcula o preço ao criar a reserva.
export type PedidoDeReserva = { tipoId: string; inicio: string; fim: string };

const CAMINHO = "/app/reservas/nova";

// ISO 8601 completo e com fuso (Z ou ±hh:mm), como a API espera. Data solta ou número não valem.
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// O pedido de reserva que viaja da busca para a tela de resumo pela URL. Só tem métodos estáticos
// (não guarda estado), então não se cria instância.
export class PedidoNaUrl {
  private constructor() {
    throw new Error("PedidoNaUrl só tem métodos estáticos.");
  }

  static link(pedido: PedidoDeReserva): string {
    const parametros = new URLSearchParams({
      tipoId: pedido.tipoId,
      inicio: pedido.inicio,
      fim: pedido.fim,
    });
    return `${CAMINHO}?${parametros.toString()}`;
  }

  /** Lê e confere o pedido da URL. `null` se faltar algo ou o período não fizer sentido. */
  static ler(parametros: { get(nome: string): string | null }): PedidoDeReserva | null {
    const tipoId = parametros.get("tipoId")?.trim();
    const inicio = parametros.get("inicio")?.trim();
    const fim = parametros.get("fim")?.trim();
    if (!tipoId || !inicio || !fim) return null;
    if (!PedidoNaUrl.#instanteValido(inicio) || !PedidoNaUrl.#instanteValido(fim)) return null;
    if (new Date(fim).getTime() <= new Date(inicio).getTime()) return null;
    return { tipoId, inicio, fim };
  }

  static #instanteValido(valor: string): boolean {
    return ISO_COM_FUSO.test(valor) && !Number.isNaN(new Date(valor).getTime());
  }
}

// O texto de erro que a tela de resumo mostra. Só tem método estático, então não se cria instância.
export class MotivoDoErro {
  private constructor() {
    throw new Error("MotivoDoErro só tem métodos estáticos.");
  }

  /** Primeiro motivo de campo devolvido pela API (`details`), ou a mensagem geral se não houver. */
  static de(erro: { message: string; details?: Record<string, string> }): string {
    const primeiro = erro.details ? Object.values(erro.details).find(Boolean) : undefined;
    return primeiro ?? erro.message;
  }
}

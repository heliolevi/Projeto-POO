import { Uuid } from "../../../shared/dominio/uuid.ts";
import { ValidadorDePeriodo, type ErrosPorCampo } from "../../../shared/dominio/validador-de-periodo.ts";

export type NovaReserva = { tipoId: string; inicio: Date; fim: Date };

// Valida o corpo de POST /api/reservas. Só lê tipoId, inicio e fim: o valor e a unidade são do
// servidor, e qualquer campo a mais (valor, bicicletaId, clienteId) é ignorado. O período segue
// as mesmas regras da recomendação (docs/contrato-api-mvp.md, rota 12): quem as aplica é o
// ValidadorDePeriodo, que entra pelo construtor.
export class ValidadorDeNovaReserva {
  /** O do app. */
  static readonly padrao = new ValidadorDeNovaReserva(new ValidadorDePeriodo());

  readonly #periodos: Pick<ValidadorDePeriodo, "validar">;

  constructor(periodos: Pick<ValidadorDePeriodo, "validar">) {
    this.#periodos = periodos;
  }

  /** `agora` entra de fora: o domínio não lê o relógio. */
  validar(corpo: unknown, agora: Date): { dados: NovaReserva } | { erros: ErrosPorCampo } {
    const objeto =
      typeof corpo === "object" && corpo !== null && !Array.isArray(corpo)
        ? (corpo as Record<string, unknown>)
        : {};

    const erros: ErrosPorCampo = {};
    const tipoId = objeto.tipoId;
    if (!Uuid.ehValido(tipoId)) {
      erros.tipoId = "Informe o tipoId da bicicleta (um UUID).";
    }

    const periodo = this.#periodos.validar({ inicio: objeto.inicio, fim: objeto.fim }, agora);
    if ("erros" in periodo) Object.assign(erros, periodo.erros);

    if (Object.keys(erros).length > 0 || "erros" in periodo) return { erros };
    return { dados: { tipoId: tipoId as string, inicio: periodo.dados.inicio, fim: periodo.dados.fim } };
  }
}

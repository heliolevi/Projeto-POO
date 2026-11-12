import { ConflictError, NotFoundError, ValidationError } from "../../../shared/http/errors.ts";
import { CodigoRepetido, SobreposicaoDePeriodo } from "../domain/erros.ts";
import { validarNovaReserva } from "../domain/reserva.ts";
import type { Periodo, Precos } from "../domain/preco.ts";
import type { SessaoCliente, Transacao } from "./portas.ts";
import { montarReserva, type Reserva } from "./reserva-dto.ts";

// Teto de tentativas de gravar numa mesma requisição. Cada recusa por sobreposição descarta uma
// unidade, então o laço termina sozinho quando as unidades do tipo acabam; o teto só protege
// contra um banco que responda sempre a mesma coisa.
const MAX_TENTATIVAS = 50;
// Com 31^6 códigos possíveis, uma colisão já é rara; várias seguidas indicam outro problema.
const MAX_CODIGOS_REPETIDOS = 5;

export type DependenciasCriarReserva = {
  transacao: Transacao;
  agora: () => Date;
  gerarCodigo: () => string;
  // a regra de preço é a mesma da recomendação (src/modules/reservas/domain/preco.ts)
  calcularValorAluguel: (periodo: Periodo, precos: Precos) => number;
};

// POST /api/reservas (rota 12): reserva um TIPO de bicicleta num período. O sistema escolhe a
// unidade, tudo dentro de uma transação:
//   1. expira as pendentes vencidas (senão uma pendente que ninguém listou ainda seguraria a
//      unidade, porque a exclusion constraint só a libera quando o status muda);
//   2. confere o tipo e calcula o valor no servidor, e congela valor e caução na reserva;
//   3. escolhe uma unidade livre (FOR UPDATE SKIP LOCKED) e grava PENDENTE_PAGAMENTO;
//   4. se o banco recusar por sobreposição (23P01: outra reserva chegou à mesma unidade entre a
//      escolha e a gravação), tenta outra unidade; se não houver, 409.
export function criarCriarReserva(deps: DependenciasCriarReserva) {
  return async function criarReserva(sessao: SessaoCliente, corpo: unknown): Promise<Reserva> {
    // valida antes de abrir a transação: um pedido inválido não toca o banco
    const validado = validarNovaReserva(corpo, deps.agora());
    if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
    const { tipoId, inicio, fim } = validado.dados;

    return deps.transacao(sessao, async (op) => {
      await op.expirarVencidas();

      const tipo = await op.buscarTipo(tipoId);
      if (!tipo) throw new NotFoundError("Tipo de bicicleta não encontrado.");
      const valorAluguelCentavos = deps.calcularValorAluguel({ inicio, fim }, tipo);

      const jaTentadas: string[] = [];
      let codigo = deps.gerarCodigo();
      let codigosRepetidos = 0;
      for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
        const unidade = await op.escolherUnidade(tipoId, inicio, fim, jaTentadas);
        if (!unidade) break;
        try {
          const linha = await op.inserir({
            codigo,
            clienteId: sessao.usuarioId,
            bicicletaId: unidade.bicicletaId,
            pontoId: unidade.pontoId,
            inicio,
            fim,
            valorAluguelCentavos,
            valorCaucaoCentavos: tipo.valorCaucaoCentavos,
          });
          return montarReserva(linha);
        } catch (erro) {
          if (erro instanceof SobreposicaoDePeriodo) {
            jaTentadas.push(unidade.bicicletaId);
            continue;
          }
          if (erro instanceof CodigoRepetido && ++codigosRepetidos < MAX_CODIGOS_REPETIDOS) {
            codigo = deps.gerarCodigo();
            continue; // a mesma unidade, com outro código
          }
          throw erro;
        }
      }
      throw new ConflictError(
        "Não há bicicleta livre desse tipo no período escolhido. Tente outro horário.",
      );
    });
  };
}

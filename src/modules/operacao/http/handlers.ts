import { Bicicleta } from "@/modules/catalogo";
import { exigirPerfil, exigirSessao } from "@/modules/contas";
import { Reserva } from "@/modules/reservas";
import { lerJson } from "@/shared/http/json";
import { errorResponse, ok } from "@/shared/http/response";
import { OperacaoService } from "../application/operacao-service";
import { emTransacao } from "../infrastructure/repositorio-operacao";

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const operacao = new OperacaoService({
  transacao: emTransacao,
  agora: () => new Date(),
  montarReserva: (linha) => new Reserva(linha),
  montarBicicleta: (linha) => new Bicicleta(linha),
});

// As rotas de operação são da equipe: 401 sem sessão válida, 403 para o cliente.
async function sessaoDaEquipe(request: Request) {
  return exigirPerfil(await exigirSessao(request), "OPERADOR", "ADMIN");
}

// POST /api/operacao/reservas/{id}/retirada (rota 26). O corpo só é lido depois de conferir o id.
export async function postRetirada(request: Request, id: string) {
  try {
    const sessao = await sessaoDaEquipe(request);
    return ok(await operacao.registrarRetirada(sessao, id, () => lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// POST /api/operacao/reservas/{id}/devolucao (rota 27). O contrato devolve a reserva; a unidade vem
// junto, como na retirada, para o painel não precisar de outra consulta.
export async function postDevolucao(request: Request, id: string) {
  try {
    const sessao = await sessaoDaEquipe(request);
    return ok(await operacao.registrarDevolucao(sessao, id, () => lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

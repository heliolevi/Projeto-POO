import { exigirPerfil, exigirSessao } from "@/modules/contas";
import { Reserva } from "@/modules/reservas";
import { lerJson } from "@/shared/http/json";
import { errorResponse, ok } from "@/shared/http/response";
import { criarRegistrarDevolucao, criarRegistrarRetirada } from "../application/registrar-movimentacao";
import { emTransacao } from "../infrastructure/repositorio-operacao";

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const deps = { transacao: emTransacao, agora: () => new Date(), montarReserva: (linha: ConstructorParameters<typeof Reserva>[0]) => new Reserva(linha) };
const registrarRetirada = criarRegistrarRetirada(deps);
const registrarDevolucao = criarRegistrarDevolucao(deps);

// As rotas de operação são da equipe: 401 sem sessão válida, 403 para o cliente.
async function sessaoDaEquipe(request: Request) {
  return exigirPerfil(await exigirSessao(request), "OPERADOR", "ADMIN");
}

// POST /api/operacao/reservas/{id}/retirada (rota 26)
export async function postRetirada(request: Request, id: string) {
  try {
    const sessao = await sessaoDaEquipe(request);
    return ok(await registrarRetirada(sessao, id, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// POST /api/operacao/reservas/{id}/devolucao (rota 27). O contrato devolve a reserva; a unidade vem
// junto, como na retirada, para o painel não precisar de outra consulta.
export async function postDevolucao(request: Request, id: string) {
  try {
    const sessao = await sessaoDaEquipe(request);
    return ok(await registrarDevolucao(sessao, id, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

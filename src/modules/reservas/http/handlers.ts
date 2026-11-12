import { exigirPerfil, exigirSessao } from "@/modules/contas";
import { exigirDentroDoLimite } from "@/shared/db/limite-tentativas";
import { query } from "@/shared/db/pool";
import { lerJson } from "@/shared/http/json";
import { created, errorResponse, ok } from "@/shared/http/response";
import { criarCancelarReserva } from "../application/cancelar-reserva";
import { criarBuscarReserva, criarListarReservas } from "../application/consultar-reservas";
import { criarCriarReserva } from "../application/criar-reserva";
import { calcularValorAluguel } from "../domain/preco";
import { gerarCodigoReserva } from "../domain/reserva";
import { emTransacao } from "../infrastructure/repositorio-reservas";

// 20 reservas por hora por usuário (contrato, rota 12). Por usuário, e não por IP, porque várias
// pessoas atrás do mesmo NAT dividem o IP.
const LIMITE_RESERVAS_POR_USUARIO = { max: 20, janelaSegundos: 60 * 60 };

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// Os casos de uso não guardam estado (a sessão chega a cada chamada), então são criados uma vez.
const criarReserva = criarCriarReserva({
  transacao: emTransacao,
  agora: () => new Date(),
  gerarCodigo: gerarCodigoReserva,
  calcularValorAluguel,
});
const listarReservas = criarListarReservas({ transacao: emTransacao });
const buscarReserva = criarBuscarReserva({ transacao: emTransacao });
const cancelarReserva = criarCancelarReserva({ transacao: emTransacao });

// Todas as rotas de reserva são do CLIENTE: 401 sem sessão válida, 403 para a equipe.
async function sessaoDoCliente(request: Request) {
  return exigirPerfil(await exigirSessao(request), "CLIENTE");
}

// POST /api/reservas (rota 12)
export async function postReservas(request: Request) {
  try {
    const sessao = await sessaoDoCliente(request);
    await exigirDentroDoLimite(
      query,
      `reservas:usuario:${sessao.usuarioId}`,
      LIMITE_RESERVAS_POR_USUARIO,
    );
    return created(await criarReserva(sessao, await lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// GET /api/reservas (rota 13), com ?status= opcional
export async function getReservas(request: Request) {
  try {
    const sessao = await sessaoDoCliente(request);
    const status = new URL(request.url).searchParams.get("status");
    return ok(await listarReservas(sessao, { status }), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// GET /api/reservas/{id} (rota 14)
export async function getReserva(request: Request, id: string) {
  try {
    const sessao = await sessaoDoCliente(request);
    return ok(await buscarReserva(sessao, id), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

// POST /api/reservas/{id}/cancelar (rota 15). O corpo (`{}`) não é lido: não tem nada a validar.
export async function postCancelarReserva(request: Request, id: string) {
  try {
    const sessao = await sessaoDoCliente(request);
    return ok(await cancelarReserva(sessao, id), SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

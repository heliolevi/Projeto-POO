import { PerfisPermitidos, sessoes } from "@/modules/contas";
import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { LeitorDeCorpo } from "@/shared/http/leitor-de-corpo";
import { Resposta } from "@/shared/http/resposta";
import { ReservaService } from "../application/reserva-service";
import { CalculadoraDeAluguel } from "../../../shared/dominio/preco-aluguel";
import { gerarCodigoReserva } from "../domain/reserva";
import { emTransacao } from "../infrastructure/repositorio-reservas";

// 20 reservas por hora por usuário (contrato, rota 12). Por usuário, e não por IP, porque várias
// pessoas atrás do mesmo NAT dividem o IP.
const LIMITE_RESERVAS_POR_USUARIO = { max: 20, janelaSegundos: 60 * 60 };

const limite = new LimiteDeTentativas(BancoDeDados.padrao);
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const leitor = new LeitorDeCorpo();
const soCliente = new PerfisPermitidos("CLIENTE");

// O serviço não guarda estado (a sessão chega a cada chamada), então é criado uma vez.
const reservas = new ReservaService({
  transacao: emTransacao,
  agora: () => new Date(),
  gerarCodigo: gerarCodigoReserva,
  calcularValorAluguel: (periodo, precos) => CalculadoraDeAluguel.padrao.calcularValorAluguel(periodo, precos),
});

// Todas as rotas de reserva são do CLIENTE: 401 sem sessão válida, 403 para a equipe.
async function sessaoDoCliente(request: Request) {
  return soCliente.exigir(await sessoes.exigir(request));
}

// POST /api/reservas (rota 12)
export async function postReservas(request: Request) {
  try {
    const sessao = await sessaoDoCliente(request);
    await limite.exigirDentroDoLimite(`reservas:usuario:${sessao.usuarioId}`,
      LIMITE_RESERVAS_POR_USUARIO,
    );
    return Resposta.criada(await reservas.criarReserva(sessao, await leitor.lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// GET /api/reservas (rota 13), com ?status= opcional
export async function getReservas(request: Request) {
  try {
    const sessao = await sessaoDoCliente(request);
    const status = new URL(request.url).searchParams.get("status");
    return Resposta.ok(await reservas.listarReservas(sessao, { status }), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// GET /api/reservas/{id} (rota 14)
export async function getReserva(request: Request, id: string) {
  try {
    const sessao = await sessaoDoCliente(request);
    return Resposta.ok(await reservas.buscarReserva(sessao, id), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// POST /api/reservas/{id}/cancelar (rota 15). O corpo (`{}`) não é lido: não tem nada a validar.
export async function postCancelarReserva(request: Request, id: string) {
  try {
    const sessao = await sessaoDoCliente(request);
    return Resposta.ok(await reservas.cancelarReserva(sessao, id), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

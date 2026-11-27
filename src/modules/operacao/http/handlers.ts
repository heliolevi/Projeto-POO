import { Bicicleta } from "@/modules/catalogo";
import { exigirSessao, PerfisPermitidos } from "@/modules/contas";
import { Reserva } from "@/modules/reservas";
import { LeitorDeCorpo } from "@/shared/http/leitor-de-corpo";
import { Resposta } from "@/shared/http/resposta";
import { OperacaoService } from "../application/operacao-service";
import { emTransacao } from "../infrastructure/repositorio-operacao";

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const leitor = new LeitorDeCorpo();
const soEquipe = new PerfisPermitidos("OPERADOR", "ADMIN");

const operacao = new OperacaoService({
  transacao: emTransacao,
  agora: () => new Date(),
  montarReserva: (linha) => new Reserva(linha),
  montarBicicleta: (linha) => new Bicicleta(linha),
});

// As rotas de operação são da equipe: 401 sem sessão válida, 403 para o cliente.
async function sessaoDaEquipe(request: Request) {
  return soEquipe.exigir(await exigirSessao(request));
}

// POST /api/operacao/reservas/{id}/retirada (rota 26). O corpo só é lido depois de conferir o id.
export async function postRetirada(request: Request, id: string) {
  try {
    const sessao = await sessaoDaEquipe(request);
    return Resposta.ok(await operacao.registrarRetirada(sessao, id, () => leitor.lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

// POST /api/operacao/reservas/{id}/devolucao (rota 27). O contrato devolve a reserva; a unidade vem
// junto, como na retirada, para o painel não precisar de outra consulta.
export async function postDevolucao(request: Request, id: string) {
  try {
    const sessao = await sessaoDaEquipe(request);
    return Resposta.ok(await operacao.registrarDevolucao(sessao, id, () => leitor.lerJson(request)), SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

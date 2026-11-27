import { Bicicleta } from "@/modules/catalogo";
import { sessoes } from "@/modules/contas";
import { Reserva } from "@/modules/reservas";
import { OperacaoService } from "../application/operacao-service";
import { RepositorioDeOperacao } from "../infrastructure/repositorio-operacao";
import { ControladorDeOperacao } from "./controlador-de-operacao";

// A ligação do módulo: o controlador com a sessão real do módulo contas e o serviço sobre o
// repositório do app. Criado uma vez só: nada aqui guarda estado entre requisições.
const repositorio = RepositorioDeOperacao.padrao;
const controlador = new ControladorDeOperacao({
  exigirSessao: (request) => sessoes.exigir(request),
  operacao: new OperacaoService({
    transacao: (sessao, fn) => repositorio.emTransacao(sessao, fn),
    agora: () => new Date(),
    montarReserva: (linha) => new Reserva(linha),
    montarBicicleta: (linha) => new Bicicleta(linha),
  }),
});

// Os pontos de entrada das rotas (o Next exige funções exportadas em route.ts); só chamam o controlador.
export const postRetirada = (request: Request, id: string) => controlador.retirada(request, id);
export const postDevolucao = (request: Request, id: string) => controlador.devolucao(request, id);

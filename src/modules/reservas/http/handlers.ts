import { sessoes } from "@/modules/contas";
import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { CalculadoraDeAluguel } from "@/shared/dominio/preco-aluguel";
import { LeitorDeCorpo } from "@/shared/http/leitor-de-corpo";
import { ReservaService } from "../application/reserva-service";
import { GeradorDeCodigoDeReserva } from "../domain/gerador-de-codigo";
import { RepositorioDeReservas } from "../infrastructure/repositorio-reservas";
import { ControladorDeReservas } from "./controlador-de-reservas";

const leitor = new LeitorDeCorpo();

// A ligação do módulo: o controlador com a sessão real do módulo contas, o limite no banco e o
// serviço com o repositório do PostgreSQL, o relógio, o gerador de código e a regra de preço.
// Criado uma vez só: nada aqui guarda estado (a sessão chega a cada chamada).
const controlador = new ControladorDeReservas({
  exigirSessao: (request) => sessoes.exigir(request),
  limite: new LimiteDeTentativas(BancoDeDados.padrao),
  lerJson: (request) => leitor.lerJson(request),
  reservas: new ReservaService({
    executor: RepositorioDeReservas.padrao,
    agora: () => new Date(),
    geradorDeCodigo: GeradorDeCodigoDeReserva.padrao,
    calculadora: CalculadoraDeAluguel.padrao,
  }),
});

// O Next exige estas funções exportadas nos route.ts; cada uma só chama o controlador.

// POST /api/reservas (rota 12)
export const postReservas = (request: Request) => controlador.criar(request);

// GET /api/reservas (rota 13), com ?status= opcional
export const getReservas = (request: Request) => controlador.listar(request);

// GET /api/reservas/{id} (rota 14)
export const getReserva = (request: Request, id: string) => controlador.detalhar(request, id);

// POST /api/reservas/{id}/cancelar (rota 15)
export const postCancelarReserva = (request: Request, id: string) => controlador.cancelar(request, id);

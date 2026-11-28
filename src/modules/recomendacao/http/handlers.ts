import { perfilDoCiclista, sessoes } from "@/modules/contas";
import { CalculadoraDeAluguel } from "@/modules/reservas";
import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { BuscaDeRecomendacoes } from "../application/busca-de-recomendacoes";
import { RepositorioDeDisponibilidade } from "../infrastructure/repositorio-disponibilidade";
import { ControladorDeRecomendacao } from "./controlador-de-recomendacao";

// A ligação do módulo: o controlador com a sessão real do módulo contas, o limite no banco, o perfil do
// ciclista, a disponibilidade no PostgreSQL e a regra de preço (a mesma da reserva). Criado uma vez só:
// nada aqui guarda estado, e a sessão do cliente chega a cada busca.
const controlador = new ControladorDeRecomendacao({
  exigirSessao: (request) => sessoes.exigir(request),
  limite: new LimiteDeTentativas(BancoDeDados.padrao),
  busca: new BuscaDeRecomendacoes({
    perfis: perfilDoCiclista,
    disponibilidade: RepositorioDeDisponibilidade.padrao,
    preco: CalculadoraDeAluguel.padrao,
    agora: () => new Date(),
  }),
});

// GET /api/recomendacao (rota 11); só chama o controlador (o Next exige a função exportada em route.ts).
export const getRecomendacao = (request: Request) => controlador.recomendar(request);

import { exigirPerfil, exigirSessao, perfilCiclista } from "@/modules/contas";
import { calcularValorAluguel, horasCobradas } from "@/modules/reservas";
import { exigirDentroDoLimite } from "@/shared/db/limite-tentativas";
import { query } from "@/shared/db/pool";
import { ipDoCliente } from "@/shared/http/corpo";
import { errorResponse, ok } from "@/shared/http/response";
import { criarBuscarRecomendacoes } from "../application/buscar-recomendacoes";
import { buscarTiposComUnidadesLivres } from "../infrastructure/repositorio-disponibilidade";

// Cada busca faz uma consulta com várias subconsultas: 60 por minuto por IP (contrato, rota 11).
const LIMITE_BUSCAS_POR_IP = { max: 60, janelaSegundos: 60 };

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// GET /api/recomendacao (rota 11): só CLIENTE (sessão 401, perfil 403, depois o limite 429).
export async function getRecomendacao(request: Request) {
  try {
    const sessao = exigirPerfil(await exigirSessao(request), "CLIENTE");
    await exigirDentroDoLimite(
      query,
      `recomendacao:ip:${ipDoCliente(request.headers).slice(0, 64)}`,
      LIMITE_BUSCAS_POR_IP,
    );

    const buscar = criarBuscarRecomendacoes({
      buscarPerfil: (usuarioId) => perfilCiclista.consultarPerfilCiclista(usuarioId),
      // a mesma sessão do cliente vai para o comSessao, então as políticas de RLS valem
      buscarTipos: (inicio, fim) => buscarTiposComUnidadesLivres(sessao, inicio, fim),
      calcularValorAluguel,
      horasCobradas,
      agora: () => new Date(),
    });

    const { searchParams } = new URL(request.url);
    const resposta = await buscar(sessao.usuarioId, {
      inicio: searchParams.get("inicio"),
      fim: searchParams.get("fim"),
      atividade: searchParams.get("atividade"),
    });
    return ok(resposta, SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

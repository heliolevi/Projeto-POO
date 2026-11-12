import { exigirPerfil, exigirSessao, perfilCiclista } from "@/modules/contas";
import { calcularValorAluguel, horasCobradas } from "@/modules/reservas";
import { exigirDentroDoLimite } from "@/shared/db/limite-tentativas";
import { query } from "@/shared/db/pool";
import { ipDoCliente } from "@/shared/http/corpo";
import { errorResponse, ok } from "@/shared/http/response";
import { criarBuscarRecomendacoes } from "../application/buscar-recomendacoes";
import { buscarTiposComUnidadesLivres } from "../infrastructure/repositorio-disponibilidade";

// Cada busca faz uma consulta com várias subconsultas. O limite de 60 por minuto vale por
// USUÁRIO: atrás de um mesmo NAT (um Wi-Fi da loja, uma operadora) várias pessoas dividem o IP, e
// uma delas não deve travar as outras. O limite por IP é bem mais folgado e só barra quem abre
// muitas contas para fugir do limite por usuário.
const LIMITE_BUSCAS_POR_USUARIO = { max: 60, janelaSegundos: 60 };
const LIMITE_BUSCAS_POR_IP = { max: 300, janelaSegundos: 60 };

const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

// Criado uma vez só: não guarda estado, e a sessão do cliente chega a cada busca.
const buscar = criarBuscarRecomendacoes({
  buscarPerfil: (usuarioId) => perfilCiclista.consultarPerfilCiclista(usuarioId),
  buscarTipos: buscarTiposComUnidadesLivres,
  calcularValorAluguel,
  horasCobradas,
  agora: () => new Date(),
});

// GET /api/recomendacao (rota 11): só CLIENTE (sessão 401, perfil 403, depois os limites 429).
export async function getRecomendacao(request: Request) {
  try {
    const sessao = exigirPerfil(await exigirSessao(request), "CLIENTE");
    await exigirDentroDoLimite(query, `recomendacao:usuario:${sessao.usuarioId}`, LIMITE_BUSCAS_POR_USUARIO);
    await exigirDentroDoLimite(
      query,
      `recomendacao:ip:${ipDoCliente(request.headers).slice(0, 64)}`,
      LIMITE_BUSCAS_POR_IP,
    );

    const { searchParams } = new URL(request.url);
    const resposta = await buscar(sessao, {
      inicio: searchParams.get("inicio"),
      fim: searchParams.get("fim"),
      atividade: searchParams.get("atividade"),
    });
    return ok(resposta, SEM_CACHE);
  } catch (erro) {
    return errorResponse(erro);
  }
}

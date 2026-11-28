import { PerfisPermitidos, perfilDoCiclista, sessoes } from "@/modules/contas";
import { calcularValorAluguel, horasCobradas } from "@/modules/reservas";
import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { ClienteDaRequisicao } from "@/shared/http/cliente-da-requisicao";
import { Resposta } from "@/shared/http/resposta";
import { criarBuscarRecomendacoes } from "../application/buscar-recomendacoes";
import { buscarTiposComUnidadesLivres } from "../infrastructure/repositorio-disponibilidade";

// Cada busca faz uma consulta com várias subconsultas. O limite de 60 por minuto vale por
// USUÁRIO: atrás de um mesmo NAT (um Wi-Fi da loja, uma operadora) várias pessoas dividem o IP, e
// uma delas não deve travar as outras. O limite por IP é bem mais folgado e só barra quem abre
// muitas contas para fugir do limite por usuário.
const LIMITE_BUSCAS_POR_USUARIO = { max: 60, janelaSegundos: 60 };
const LIMITE_BUSCAS_POR_IP = { max: 300, janelaSegundos: 60 };

const limite = new LimiteDeTentativas(BancoDeDados.padrao);
const SEM_CACHE = { headers: { "Cache-Control": "no-store" } };

const soCliente = new PerfisPermitidos("CLIENTE");

// Criado uma vez só: não guarda estado, e a sessão do cliente chega a cada busca.
const buscar = criarBuscarRecomendacoes({
  buscarPerfil: (usuarioId) => perfilDoCiclista.consultar(usuarioId),
  buscarTipos: buscarTiposComUnidadesLivres,
  calcularValorAluguel,
  horasCobradas,
  agora: () => new Date(),
});

// GET /api/recomendacao (rota 11): só CLIENTE (sessão 401, perfil 403, depois os limites 429).
export async function getRecomendacao(request: Request) {
  try {
    const sessao = soCliente.exigir(await sessoes.exigir(request));
    await limite.exigirDentroDoLimite(`recomendacao:usuario:${sessao.usuarioId}`, LIMITE_BUSCAS_POR_USUARIO);
    await limite.exigirDentroDoLimite(`recomendacao:ip:${new ClienteDaRequisicao(request.headers).ip.slice(0, 64)}`,
      LIMITE_BUSCAS_POR_IP,
    );

    const { searchParams } = new URL(request.url);
    const resposta = await buscar(sessao, {
      inicio: searchParams.get("inicio"),
      fim: searchParams.get("fim"),
      atividade: searchParams.get("atividade"),
    });
    return Resposta.ok(resposta, SEM_CACHE);
  } catch (erro) {
    return Resposta.deErro(erro);
  }
}

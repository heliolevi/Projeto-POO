import { exigirSessao } from "@/modules/contas";
import { PainelDeReservas } from "../application/painel-de-reservas";
import { RepositorioDoPainel } from "../infrastructure/repositorio-do-painel";
import { ControladorDoPainel } from "./controlador-do-painel";

// A ligação do painel: o controlador com o exigirSessao REAL do módulo contas e o banco do app.
// Criado uma vez só; nada aqui guarda estado entre as requisições (a sessão chega a cada uma).
const controlador = new ControladorDoPainel({
  exigirSessao,
  painel: new PainelDeReservas(new RepositorioDoPainel()),
});

// GET /api/admin/reservas (rota 25)
export function getPainelDeReservas(request: Request): Promise<Response> {
  return controlador.listar(request);
}

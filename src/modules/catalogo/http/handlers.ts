import { exigirSessao } from "@/modules/contas";
import { criarCatalogo } from "../application/catalogo";
import { repositorioCatalogo } from "../infrastructure/repositorio-catalogo";
import { criarHandlersCatalogo } from "./fabrica-handlers";

// Liga a fábrica (fabrica-handlers.ts, onde estão as regras de 401 e 403 e que tem teste) ao módulo
// contas e ao banco. As rotas em src/app/api só repassam para estes handlers.
const handlers = criarHandlersCatalogo({
  exigirSessao,
  catalogo: criarCatalogo(repositorioCatalogo),
});

export const {
  getTiposPublicos,
  getAdminTipos,
  postAdminTipos,
  putAdminTipo,
  getAdminBicicletas,
  postAdminBicicletas,
  patchAdminBicicleta,
} = handlers;

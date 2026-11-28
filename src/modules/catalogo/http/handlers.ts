import { sessoes } from "@/modules/contas";
import { ServicoDoCatalogo } from "../application/servico-do-catalogo";
import { RepositorioDoCatalogo } from "../infrastructure/repositorio-catalogo";
import { ControladorDoCatalogo } from "./controlador-do-catalogo";

// Liga o controlador (onde estão as regras de 401 e 403 e que tem teste) ao módulo contas e ao banco. As
// rotas em src/app/api só repassam para estes pontos de entrada.
const controlador = new ControladorDoCatalogo({
  exigirSessao: (request) => sessoes.exigir(request),
  catalogo: new ServicoDoCatalogo(RepositorioDoCatalogo.padrao),
});

// Os pontos de entrada das rotas (o Next exige funções exportadas em route.ts); só chamam o controlador.
export const getEmpresaPublica = () => controlador.empresaPublica();
export const getTiposPublicos = () => controlador.tiposPublicos();
export const getAdminTipos = (request: Request) => controlador.tiposAdmin(request);
export const postAdminTipos = (request: Request) => controlador.criarTipo(request);
export const putAdminTipo = (request: Request, id: string) => controlador.atualizarTipo(request, id);
export const getAdminBicicletas = (request: Request) => controlador.bicicletasAdmin(request);
export const postAdminBicicletas = (request: Request) => controlador.criarBicicleta(request);
export const patchAdminBicicleta = (request: Request, id: string) => controlador.atualizarBicicleta(request, id);

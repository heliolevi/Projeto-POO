// Dados públicos da locadora (GET /api/empresa) como objetos. As telas importam daqui.
export { BuscadorDeEmpresa, type Fetcher, type OpcoesDoBuscador } from "./buscador-de-empresa";
export { EmpresaEmCache, type FonteDaEmpresa } from "./empresa-em-cache";
export { EmpresaDaLocadora, type DadosDaEmpresa, type EmpresaDto } from "./empresa-da-locadora";
export { GradeDeHorarios, type LinhaDeHorario } from "./grade-de-horarios";
export { HorarioDoDia, type HorarioDoPonto } from "./horario-do-dia";
export { LeitorDeObjeto } from "./leitor-de-objeto";
export { PontoDeRetirada, type DadosDoPonto, type OpcaoDePonto, type PontoDto } from "./ponto-de-retirada";
export { Telefone } from "./telefone";
export {
  EmpresaCarregada,
  EmpresaIndisponivel,
  EmpresaSemCadastro,
  ResultadoDaEmpresa,
} from "./resultado-da-empresa";

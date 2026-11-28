import { BancoDeDados } from "@/shared/db/banco-de-dados";
import { LimiteDeTentativas } from "@/shared/db/limite-tentativas";
import { LeitorDeCorpo } from "@/shared/http/leitor-de-corpo";
import { Autenticador } from "../application/autenticador";
import { CadastroDeCliente } from "../application/cadastro-de-cliente";
import { EmissorDeSessao } from "../application/emissor-de-sessao";
import { ManutencaoDaConta } from "../application/manutencao-da-conta";
import { PerfilDoCiclista } from "../application/perfil-do-ciclista";
import { ValidadorDeConta } from "../domain/validador-de-conta";
import { RepositorioDeUsuarios } from "../infrastructure/repositorio-usuarios";
import { ScryptDeSenha } from "../infrastructure/senha";
import { ServicoDeToken } from "../infrastructure/token";
import { ControladorDeContas } from "./controlador-de-contas";
import { sessoes } from "./sessao";

// A ligação do módulo: as classes com as peças de verdade (banco, scrypt, token). Cada uma é criada uma
// vez só; nenhuma guarda estado entre as requisições (a sessão chega a cada uma).
const validador = new ValidadorDeConta();
const limite = new LimiteDeTentativas(BancoDeDados.padrao);
const usuarios = RepositorioDeUsuarios.padrao;
const senhas = ScryptDeSenha.padrao;
const emissor = new EmissorDeSessao(ServicoDeToken.padrao);

// Exportado para outros módulos (a recomendação lê o perfil do ciclista) pelo index.ts.
export const perfilDoCiclista = new PerfilDoCiclista({ usuarios, validador });

const controlador = new ControladorDeContas({
  sessoes,
  cadastro: new CadastroDeCliente({ limite, validador, senhas, usuarios, sessoes: emissor }),
  autenticador: new Autenticador({ limite, validador, senhas, usuarios, sessoes: emissor }),
  perfil: perfilDoCiclista,
  manutencao: new ManutencaoDaConta({ limite, validador, senhas, usuarios }),
  leitor: new LeitorDeCorpo(),
});

// Os pontos de entrada das rotas (o Next exige funções exportadas em route.ts); só chamam o controlador.
export const postCadastro = (request: Request) => controlador.cadastro(request);
export const postLogin = (request: Request) => controlador.login(request);
export const postAlterarSenha = (request: Request) => controlador.alterarSenha(request);
export const postDesativar = (request: Request) => controlador.desativar(request);
export const postAtualizarAltura = (request: Request) => controlador.atualizarAltura(request);
export const postAceitarTermos = (request: Request) => controlador.aceitarTermos(request);
export const getMe = (request: Request) => controlador.me(request);
export const putPerfilCiclista = (request: Request) => controlador.atualizarPerfilCiclista(request);

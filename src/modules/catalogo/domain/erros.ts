// Falhas que o repositório reconhece no banco e que o caso de uso converte em resposta HTTP.
// Ficam no domínio para a aplicação e a infraestrutura (e os testes) usarem as mesmas classes.
export class NomeDeTipoJaExiste extends Error {}
export class CodigoDeBicicletaJaExiste extends Error {}
export class TipoInexistente extends Error {}
export class PontoInexistente extends Error {}
export class PontoInativo extends Error {}

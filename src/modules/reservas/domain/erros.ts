// Falhas do banco que o repositório reconhece e que o caso de uso trata. Ficam no domínio para a
// aplicação, a infraestrutura e os testes usarem as mesmas classes.

// 23P01: a exclusion constraint reserva_sem_sobreposicao recusou (outra reserva ativa ocupa a
// mesma unidade no período).
export class SobreposicaoDePeriodo extends Error {}

// 23505 em reserva_codigo_unico: o código sorteado já existe.
export class CodigoRepetido extends Error {}

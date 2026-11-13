// A regra de preço do aluguel mora em src/shared/dominio/preco-aluguel.ts, para o catálogo
// (TipoBicicleta.calcularPreco), a recomendação e a reserva usarem exatamente a mesma conta sem um
// módulo depender do outro. Este arquivo mantém o endereço antigo.
export {
  calcularValorAluguel,
  horasCobradas,
  type PeriodoCobravel as Periodo,
  type Precos,
} from "../../../shared/dominio/preco-aluguel.ts";

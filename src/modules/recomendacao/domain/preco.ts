// Regra de preço do aluguel, usada pela recomendação e, depois, pela criação da reserva
// (o contrato da API manda as duas usarem a mesma regra, e o valor é sempre calculado no
// servidor).
//
// Regra assumida, a confirmar com a locadora:
// - o período é cobrado em horas, arredondando para cima (4h10 conta como 5 horas);
// - cada bloco completo de 24 horas custa o preço por dia;
// - as horas que sobram custam o preço por hora, mas nunca mais que um dia.
// Assim, alugar por hora nunca fica mais caro do que alugar pelo dia.

const MS_POR_HORA = 60 * 60 * 1000;

export type Precos = { precoHoraCentavos: number; precoDiaCentavos: number };

export function horasCobradas(inicio: Date, fim: Date): number {
  return Math.ceil((fim.getTime() - inicio.getTime()) / MS_POR_HORA);
}

export function valorAluguelCentavos(precos: Precos, horas: number): number {
  if (!Number.isInteger(horas) || horas < 1) {
    throw new RangeError("O período cobrado precisa ser de ao menos 1 hora inteira.");
  }
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return dias * precos.precoDiaCentavos + Math.min(resto * precos.precoHoraCentavos, precos.precoDiaCentavos);
}

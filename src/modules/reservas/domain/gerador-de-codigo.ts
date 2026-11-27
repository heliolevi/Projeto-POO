import { randomBytes } from "node:crypto";

// Sem 0, O, 1, I e L, que se confundem quando o cliente lê o código em voz alta no balcão.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO_CODIGO = 6;
// Maior múltiplo de 31 abaixo de 256: bytes a partir daqui são descartados, senão os primeiros
// caracteres do alfabeto sairiam mais que os últimos.
const LIMITE_BYTE = 256 - (256 % ALFABETO.length);

// Código curto e único da reserva (coluna reserva.codigo, UNIQUE): "BIC-7K2F9Q". A unicidade é do
// banco: quem grava repete com outro código se der 23505. A fonte de bytes aleatórios entra pelo
// construtor, para os testes controlarem o sorteio.
export class GeradorDeCodigoDeReserva {
  /** O do app (bytes do crypto do Node). */
  static readonly padrao = new GeradorDeCodigoDeReserva((n) => randomBytes(n));

  readonly #aleatorio: (n: number) => Uint8Array;

  constructor(aleatorio: (n: number) => Uint8Array) {
    this.#aleatorio = aleatorio;
  }

  gerar(): string {
    let codigo = "";
    while (codigo.length < TAMANHO_CODIGO) {
      for (const byte of this.#aleatorio(TAMANHO_CODIGO * 2)) {
        if (byte >= LIMITE_BYTE) continue;
        codigo += ALFABETO[byte % ALFABETO.length];
        if (codigo.length === TAMANHO_CODIGO) break;
      }
    }
    return `BIC-${codigo}`;
  }
}

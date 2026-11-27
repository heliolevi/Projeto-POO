// Objeto de valor: o "Pix copia e cola" (BR Code), o texto que o aplicativo do banco lê no QR code.
//
// O formato é o do Banco Central (Manual de Padrões para Iniciação do Pix), em cima do EMV QRCPS:
// uma sequência de campos ID (2 dígitos) + TAMANHO (2 dígitos) + VALOR. Um código só é aceito pelos
// bancos se:
// - começa pelo campo 00 com o valor "01" (versão do formato);
// - tem um campo de conta (26 a 51) cujo subcampo 00 é "br.gov.bcb.pix";
// - usa a moeda 986 (real, campo 53) e o país BR (campo 58);
// - termina pelo campo 63 com o CRC16 (CCITT-FALSE) de tudo o que vem antes, incluindo o "6304".
//
// A Stripe em modo de teste devolve um texto que NÃO segue esse formato (de propósito: nenhum banco
// pode pagar um Pix de teste). A classe não recusa esse texto, porque ele é o que existe no teste;
// ela só diz, por pagavelEmBanco, se o código é de verdade. Quem decide o que fazer é quem usa: a
// Stripe em produção recusa um código que não é pagável, e a tela avisa quando é de teste.
//
// Imutável: o texto e a conclusão são calculados uma vez, no construtor, e não mudam.

export type CampoPix = { id: string; valor: string };

const GUI_DO_PIX = "br.gov.bcb.pix";
const MOEDA_REAL = "986";

export class CodigoPix {
  readonly #texto: string;
  readonly #pagavelEmBanco: boolean;

  private constructor(texto: string) {
    this.#texto = texto;
    this.#pagavelEmBanco = CodigoPix.#ehBrCodeValido(texto);
  }

  // Fábrica: o único jeito de criar. Texto vazio não é código nenhum.
  static de(texto: string): CodigoPix {
    if (typeof texto !== "string" || texto.trim() === "") {
      throw new RangeError("O código Pix não pode ser vazio.");
    }
    return new CodigoPix(texto.trim());
  }

  get texto(): string {
    return this.#texto;
  }

  // true quando o código segue o BR Code e o CRC confere: qualquer banco consegue ler e pagar.
  get pagavelEmBanco(): boolean {
    return this.#pagavelEmBanco;
  }

  toString(): string {
    return this.#texto;
  }

  igual(outro: CodigoPix): boolean {
    return outro.#texto === this.#texto;
  }

  // CRC16-CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos: o
  // cálculo que o Banco Central pede no campo 63.
  static crc16(texto: string): string {
    let crc = 0xffff;
    for (const byte of new TextEncoder().encode(texto)) {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }

  // Lê os campos ID+TAMANHO+VALOR. Devolve null se o texto não fecha nesse formato (um tamanho que
  // passa do fim, um ID que não é número...).
  //
  // O tamanho de um campo com acento (o nome ou a cidade do recebedor, como "Florianópolis") pode vir
  // contado em caracteres ou em bytes UTF-8, conforme quem gerou o código; o CRC é sempre sobre os
  // bytes. Para um texto só com ASCII as duas contagens são iguais. Com acento, vale a que fechar:
  // recusar um código de verdade por causa disso faria todo Pix de produção virar 502.
  static campos(texto: string): CampoPix[] | null {
    return CodigoPix.#lerCampos(Array.from(texto)) ?? CodigoPix.#lerCamposEmBytes(texto);
  }

  // Tamanho contado em caracteres (code points).
  static #lerCampos(caracteres: string[]): CampoPix[] | null {
    const campos: CampoPix[] = [];
    let i = 0;
    while (i < caracteres.length) {
      const id = caracteres.slice(i, i + 2).join("");
      const tamanhoTexto = caracteres.slice(i + 2, i + 4).join("");
      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamanhoTexto)) return null;
      const tamanho = Number(tamanhoTexto);
      const valor = caracteres.slice(i + 4, i + 4 + tamanho);
      if (valor.length !== tamanho) return null;
      campos.push({ id, valor: valor.join("") });
      i += 4 + tamanho;
    }
    return campos;
  }

  // Tamanho contado em bytes UTF-8.
  static #lerCamposEmBytes(texto: string): CampoPix[] | null {
    const bytes = new TextEncoder().encode(texto);
    if (bytes.length === texto.length) return null; // só ASCII: a leitura por caractere já decidiu
    const decodificar = new TextDecoder("utf-8", { fatal: true });
    const ascii = (de: number, ate: number) => String.fromCharCode(...bytes.subarray(de, ate));
    const campos: CampoPix[] = [];
    let i = 0;
    while (i < bytes.length) {
      const id = ascii(i, i + 2);
      const tamanhoTexto = ascii(i + 2, i + 4);
      if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(tamanhoTexto)) return null;
      const tamanho = Number(tamanhoTexto);
      if (i + 4 + tamanho > bytes.length) return null;
      let valor: string;
      try {
        valor = decodificar.decode(bytes.subarray(i + 4, i + 4 + tamanho));
      } catch {
        return null; // o tamanho cortou um caractere no meio
      }
      campos.push({ id, valor });
      i += 4 + tamanho;
    }
    return campos;
  }

  static #ehBrCodeValido(texto: string): boolean {
    // o CRC tem que ser o último campo: "6304" + 4 dígitos hexadecimais
    if (!/6304[0-9A-Fa-f]{4}$/.test(texto)) return false;
    const crcInformado = texto.slice(-4).toUpperCase();
    if (CodigoPix.crc16(texto.slice(0, -4)) !== crcInformado) return false;

    const campos = CodigoPix.campos(texto);
    if (!campos || campos.length === 0) return false;
    if (campos[0].id !== "00" || campos[0].valor !== "01") return false;
    if (campos[campos.length - 1].id !== "63") return false;

    const valorDe = (id: string) => campos.find((c) => c.id === id)?.valor;
    if (valorDe("53") !== MOEDA_REAL || valorDe("58") !== "BR") return false;

    // conta Pix: algum campo de 26 a 51 com o subcampo 00 = br.gov.bcb.pix
    return campos.some((c) => {
      const n = Number(c.id);
      if (n < 26 || n > 51) return false;
      const sub = CodigoPix.campos(c.valor);
      return sub?.some((s) => s.id === "00" && s.valor.toLowerCase() === GUI_DO_PIX) ?? false;
    });
  }
}

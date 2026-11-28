import QRCode from "qrcode";
import type { GeradorDeQrCode } from "../application/portas.ts";

type GeradorDeDataUrl = (texto: string, opcoes: { errorCorrectionLevel: "M"; margin: number; width: number }) => Promise<string>;

// Imagem PNG do QR code do "copia e cola", em base64 sem o prefixo data: (a tela monta a URL com
// imagemDoQrCode). O texto é o "copia e cola" que a Stripe devolve ao criar o Pix. O gerador de data
// URL entra pelo construtor: o do app é o da biblioteca `qrcode`, e os testes passam um de mentira.
export class QrCodePng implements GeradorDeQrCode {
  static readonly #PREFIXO = "data:image/png;base64,";

  /** O do app. */
  static readonly padrao = new QrCodePng((texto, opcoes) => QRCode.toDataURL(texto, opcoes));

  readonly #gerar: GeradorDeDataUrl;

  constructor(gerarDataUrl: GeradorDeDataUrl) {
    this.#gerar = gerarDataUrl;
  }

  async gerarBase64(texto: string): Promise<string> {
    const url = await this.#gerar(texto, { errorCorrectionLevel: "M", margin: 1, width: 280 });
    return url.startsWith(QrCodePng.#PREFIXO) ? url.slice(QrCodePng.#PREFIXO.length) : url;
  }
}

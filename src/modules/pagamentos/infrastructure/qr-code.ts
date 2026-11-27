import QRCode from "qrcode";

const PREFIXO = "data:image/png;base64,";

// Imagem PNG do QR code do "copia e cola", em base64 sem o prefixo data: (a tela monta a URL com
// imagemDoQrCode). No MVP o texto é o do Pix simulado; com o Mercado Pago, o QR vem pronto dele.
export async function gerarQrCodeBase64(texto: string): Promise<string> {
  const url = await QRCode.toDataURL(texto, { errorCorrectionLevel: "M", margin: 1, width: 280 });
  return url.startsWith(PREFIXO) ? url.slice(PREFIXO.length) : url;
}

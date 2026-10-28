import { PayloadTooLargeError } from "./errors.ts";

// Lê o corpo da requisição como texto, recusando o que passar de maxBytes. A leitura para
// assim que o limite estoura, sem carregar o corpo inteiro na memória.
export async function lerTextoLimitado(request: Request, maxBytes: number): Promise<string> {
  const declarado = Number(request.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) throw new PayloadTooLargeError();
  if (!request.body) return "";

  const leitor = request.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await leitor.cancel();
      throw new PayloadTooLargeError();
    }
    pedacos.push(value);
  }

  const inteiro = new Uint8Array(total);
  let posicao = 0;
  for (const pedaco of pedacos) {
    inteiro.set(pedaco, posicao);
    posicao += pedaco.byteLength;
  }
  return new TextDecoder().decode(inteiro);
}

// IP de quem fez a requisição. Na Vercel, x-vercel-forwarded-for é definido pela própria
// plataforma e não pode ser forjado pelo cliente; os outros cabeçalhos são só o plano B.
export function ipDoCliente(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const encaminhado = headers.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "desconhecido";
}

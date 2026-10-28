import { timingSafeEqual } from "node:crypto";

// Segredos curtos são fáceis de adivinhar; abaixo disso a rota protegida fica desligada.
export const TAMANHO_MINIMO_SEGREDO = 16;

// Confere o header "Authorization: Bearer <segredo>" com o segredo esperado, em tempo
// constante. Devolve false se o segredo não estiver configurado ou for curto demais.
export function bearerConfere(authorization: string | null, esperado: string | undefined): boolean {
  if (!esperado || esperado.length < TAMANHO_MINIMO_SEGREDO) return false;
  const encontrado = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!encontrado) return false;
  const recebido = Buffer.from(encontrado[1]);
  const certo = Buffer.from(esperado);
  return recebido.length === certo.length && timingSafeEqual(recebido, certo);
}

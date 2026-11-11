import { lerTextoLimitado } from "./corpo.ts";
import { ValidationError } from "./errors.ts";

// Corpos de formulário e de cadastro são pequenos; passar disso é abuso (413).
export const LIMITE_CORPO_PADRAO_BYTES = 16 * 1024;

// Lê o corpo da requisição como JSON. Corpo grande demais é 413 e JSON quebrado é 400.
export async function lerJson(
  request: Request,
  maxBytes: number = LIMITE_CORPO_PADRAO_BYTES,
): Promise<unknown> {
  const texto = await lerTextoLimitado(request, maxBytes);
  try {
    return JSON.parse(texto);
  } catch {
    throw new ValidationError("O corpo da requisição precisa ser um JSON válido.");
  }
}

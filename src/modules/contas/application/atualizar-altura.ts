import { ValidationError } from "@/shared/http/errors";
import { validarAltura } from "../domain/validacao";
import { atualizarAltura as salvarAltura } from "../infrastructure/repositorio-usuarios";

export async function atualizarAltura(usuarioId: string, entrada: unknown): Promise<void> {
  const validado = validarAltura(entrada);
  if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
  await salvarAltura(usuarioId, validado.dados);
}

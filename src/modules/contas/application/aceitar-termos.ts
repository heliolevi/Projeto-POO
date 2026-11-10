import { ValidationError } from "@/shared/http/errors";
import { VERSAO_TERMOS_ATUAL } from "../domain/usuario";
import { validarAceiteTermos } from "../domain/validacao";
import { registrarAceiteTermos } from "../infrastructure/repositorio-usuarios";

export async function aceitarTermos(usuarioId: string, entrada: unknown): Promise<void> {
  const validado = validarAceiteTermos(entrada, VERSAO_TERMOS_ATUAL);
  if ("erros" in validado) throw new ValidationError("Dados inválidos.", validado.erros);
  await registrarAceiteTermos(usuarioId, validado.dados);
}

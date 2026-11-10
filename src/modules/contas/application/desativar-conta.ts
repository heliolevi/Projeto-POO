import { desativarUsuario } from "../infrastructure/repositorio-usuarios";

export async function desativarConta(usuarioId: string): Promise<void> {
  await desativarUsuario(usuarioId);
}

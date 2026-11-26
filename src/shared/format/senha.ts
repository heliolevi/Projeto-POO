// Requisitos da senha no cadastro, os mesmos que a API confere (src/modules/contas/domain/
// validacao.ts): de 8 a 128 caracteres, com ao menos uma letra (A a Z, sem acento) e um número.
// A tela mostra cada um sendo cumprido enquanto a pessoa digita.
export type RequisitoDaSenha = { id: "tamanho" | "letra" | "numero"; texto: string; ok: boolean };

export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

export function requisitosDaSenha(senha: string): RequisitoDaSenha[] {
  return [
    {
      id: "tamanho",
      texto: `${SENHA_MIN} caracteres ou mais`,
      ok: senha.length >= SENHA_MIN && senha.length <= SENHA_MAX,
    },
    { id: "letra", texto: "Uma letra", ok: /[A-Za-z]/.test(senha) },
    { id: "numero", texto: "Um número", ok: /\d/.test(senha) },
  ];
}

export function senhaAceita(senha: string): boolean {
  return requisitosDaSenha(senha).every((r) => r.ok);
}

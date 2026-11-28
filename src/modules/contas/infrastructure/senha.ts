import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt (nativo do Node): custo de CPU e de memória contra força bruta.
// Formato guardado: scrypt$N$r$p$salt$hash (base64), então os parâmetros podem mudar depois.
const N = 2 ** 15;
const R = 8;
const P = 1;
const TAMANHO = 64;
const MAXMEM = 128 * N * R * 2;

function derivar(senha: string, salt: Buffer, n: number, r: number, p: number, tamanho: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      senha.normalize("NFKC"),
      salt,
      tamanho,
      { N: n, r, p, maxmem: MAXMEM },
      (erro, chave) => (erro ? reject(erro) : resolve(chave)),
    );
  });
}

// Gera e confere o hash das senhas com scrypt. Implementa o contrato que o domínio conhece
// (ServicoDeSenha: o domínio não importa scrypt) e o que o login precisa a mais: um hash para gastar
// o mesmo tempo quando o e-mail não existe.
export class ScryptDeSenha {
  /** O do app. */
  static readonly padrao = new ScryptDeSenha();

  /** Os parâmetros em uso. Os testes conferem que HASH_FALSO foi gerado com os mesmos. */
  static readonly PARAMETROS = { N, R, P } as const;

  /**
   * Hash de uma senha aleatória que foi descartada. Serve para gastar o mesmo tempo quando o
   * e-mail não existe: verificar roda o scrypt inteiro contra ele e sempre falha.
   * Fica fixo no código (e não gerado na primeira chamada) para que nenhuma requisição pague
   * o custo extra de gerá-lo, o que deixaria o primeiro login com e-mail inexistente mais lento
   * e revelaria quais e-mails têm conta. Se N, R ou P mudarem, gere outro (o teste avisa).
   */
  static readonly HASH_FALSO =
    "scrypt$32768$8$1$o7uvnFd/h97dWvQlAmmKJw==$JXF7DvliBDUCLmHTsiMB7wQQv/WnK67TUx+pDTTpKKEpY3pTEOAMpPtjQiQy5LnAZJld9AAt4q2Q6NuuScrUbg==";

  async gerarHash(senha: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await derivar(senha, salt, N, R, P, TAMANHO);
    return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
  }

  async verificar(senha: string, armazenado: string): Promise<boolean> {
    const [algoritmo, n, r, p, salt, hash] = armazenado.split("$");
    if (algoritmo !== "scrypt" || !salt || !hash) return false;
    const esperado = Buffer.from(hash, "base64");
    const obtido = await derivar(senha, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p), esperado.length);
    return timingSafeEqual(esperado, obtido);
  }

  hashParaTempoConstante(): Promise<string> {
    return Promise.resolve(ScryptDeSenha.HASH_FALSO);
  }
}

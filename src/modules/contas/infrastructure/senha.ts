import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt (nativo do Node): custo de CPU e de memória contra força bruta.
// Formato guardado: scrypt$N$r$p$salt$hash (base64), então os parâmetros podem mudar depois.
const N = 2 ** 15;
const R = 8;
const P = 1;
const TAMANHO = 64;
// Os parâmetros em uso. Os testes conferem que HASH_FALSO foi gerado com os mesmos.
export const PARAMETROS_SCRYPT = { N, R, P } as const;
const MAXMEM = 128 * N * R * 2;

function derivar(
  senha: string,
  salt: Buffer,
  n: number,
  r: number,
  p: number,
  tamanho: number,
): Promise<Buffer> {
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

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derivar(senha, salt, N, R, P, TAMANHO);
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const [algoritmo, n, r, p, salt, hash] = armazenado.split("$");
  if (algoritmo !== "scrypt" || !salt || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const obtido = await derivar(
    senha,
    Buffer.from(salt, "base64"),
    Number(n),
    Number(r),
    Number(p),
    esperado.length,
  );
  return timingSafeEqual(esperado, obtido);
}

// Hash de uma senha aleatória que foi descartada. Serve para gastar o mesmo tempo quando o
// e-mail não existe: verificarSenha roda o scrypt inteiro contra ele e sempre falha.
// Fica fixo no código (e não gerado na primeira chamada) para que nenhuma requisição pague
// o custo extra de gerá-lo, o que deixaria o primeiro login com e-mail inexistente mais lento
// e revelaria quais e-mails têm conta. Se N, R ou P mudarem, gere outro (o teste avisa).
export const HASH_FALSO =
  "scrypt$32768$8$1$o7uvnFd/h97dWvQlAmmKJw==$JXF7DvliBDUCLmHTsiMB7wQQv/WnK67TUx+pDTTpKKEpY3pTEOAMpPtjQiQy5LnAZJld9AAt4q2Q6NuuScrUbg==";

export function hashParaTempoConstante(): Promise<string> {
  return Promise.resolve(HASH_FALSO);
}

// Adaptador para o contrato que o domínio conhece (ServicoDeSenha): o domínio não importa scrypt.
export const servicoDeSenha = { verificar: verificarSenha, gerarHash: gerarHashSenha };

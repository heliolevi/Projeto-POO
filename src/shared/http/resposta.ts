import { AppError } from "./errors.ts";

// Monta as respostas da API no formato do contrato: sucesso `{ data }` e erro
// `{ error: { code, message, details? } }`. Não tem estado, então a classe só oferece as fábricas;
// não há como criar uma instância.
export class Resposta {
  private constructor() {
    throw new TypeError("Resposta só tem fábricas estáticas; não se cria instância.");
  }

  static ok<T>(data: T, init?: ResponseInit): Response {
    return Response.json({ data }, { ...init, status: 200 });
  }

  static criada<T>(data: T, init?: ResponseInit): Response {
    return Response.json({ data }, { ...init, status: 201 });
  }

  static semConteudo(): Response {
    return new Response(null, { status: 204 });
  }

  // Erro conhecido (AppError) vira a resposta com o status certo; qualquer outro vira 500 genérico,
  // sem vazar detalhe.
  static deErro(erro: unknown): Response {
    if (erro instanceof AppError) {
      return Response.json(
        {
          error: {
            code: erro.code,
            message: erro.message,
            ...(erro.details ? { details: erro.details } : {}),
          },
        },
        { status: erro.status, headers: erro.headers },
      );
    }
    console.error(erro);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } },
      { status: 500 },
    );
  }
}

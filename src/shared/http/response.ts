import { AppError } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, { ...init, status: 200 });
}

export function created<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, { ...init, status: 201 });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status, headers: error.headers },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } },
    { status: 500 },
  );
}

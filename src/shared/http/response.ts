import { AppError } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T, init?: ResponseInit) {
  return Response.json({ data }, { status: 201, ...init });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } },
    { status: 500 },
  );
}

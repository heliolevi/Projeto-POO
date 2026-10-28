// Os campos são declarados de forma explícita (e não como "readonly" nos parâmetros do
// construtor) para que o Node consiga rodar estes arquivos direto nos testes.
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
    headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.headers = headers;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string>) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autenticado") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Corpo da requisição grande demais.") {
    super("PAYLOAD_TOO_LARGE", message, 413);
  }
}

export class TooManyRequestsError extends AppError {
  readonly retryAfterSegundos: number;

  constructor(retryAfterSegundos: number) {
    super(
      "TOO_MANY_REQUESTS",
      "Muitas tentativas. Aguarde um pouco e tente novamente.",
      429,
      undefined,
      { "Retry-After": String(retryAfterSegundos) },
    );
    this.retryAfterSegundos = retryAfterSegundos;
  }
}

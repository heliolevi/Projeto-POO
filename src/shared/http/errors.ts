export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
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

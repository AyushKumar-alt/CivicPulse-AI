export class ConflictError extends Error {
  public readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  public readonly statusCode = 400;
  public readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class TransitionNotAllowedError extends Error {
  public readonly statusCode = 422;
  public readonly rejectionReason: string;
  constructor(message: string, rejectionReason: string) {
    super(message);
    this.name = "TransitionNotAllowedError";
    this.rejectionReason = rejectionReason;
  }
}

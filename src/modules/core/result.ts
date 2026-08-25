/**
 * Generic Result Monad for domain and application operations.
 * Supports explicit success/failure handling without throwing exceptions.
 */
export type Result<T, E = Error> = SuccessResult<T> | FailureResult<E>;

export class SuccessResult<T> {
  readonly isSuccess = true as const;
  readonly isFailure = false as const;
  constructor(readonly value: T) {}
}

export class FailureResult<E> {
  readonly isSuccess = false as const;
  readonly isFailure = true as const;
  constructor(readonly error: E) {}
}

export function ok<T>(value: T): SuccessResult<T> {
  return new SuccessResult(value);
}

export function err<E>(error: E): FailureResult<E> {
  return new FailureResult(error);
}

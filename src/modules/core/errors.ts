/**
 * DomainError Hierarchy for CivicPulse AI Core.
 */

export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code = "DOMAIN_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, readonly field?: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class UnresolvedRoutingError extends DomainError {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message, "UNRESOLVED_ROUTING_ERROR");
  }
}

export class ConfigurationError extends DomainError {
  constructor(message: string, readonly configKey?: string) {
    super(message, "CONFIGURATION_ERROR");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string, readonly requiredScope?: string) {
    super(message, "UNAUTHORIZED_ERROR");
  }
}

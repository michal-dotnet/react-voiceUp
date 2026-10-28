/**
 * Stable, machine-readable error codes. Clients should rely on `code`, not on `message`.
 */
export const ErrorCodes = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INVALID_STATE: 'INVALID_STATE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ISSUE_MERGED: 'ISSUE_MERGED',
  LIMIT_REACHED: 'LIMIT_REACHED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** An error that is safe to show to the client: its message and details are returned as-is. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Shorthands for the errors used throughout the services. */
export const errors = {
  unauthorized: (message = 'Authentication is required.') =>
    new AppError(401, ErrorCodes.UNAUTHORIZED, message),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new AppError(403, ErrorCodes.FORBIDDEN, message),
  notFound: (what = 'Resource') => new AppError(404, ErrorCodes.NOT_FOUND, `${what} not found.`),
  conflict: (code: ErrorCode, message: string, details?: unknown) =>
    new AppError(409, code, message, details),
  badRequest: (message: string, details?: unknown) =>
    new AppError(400, ErrorCodes.BAD_REQUEST, message, details),
};

/** Shape of every error response body: `{ error: { code, message, details? } }`. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

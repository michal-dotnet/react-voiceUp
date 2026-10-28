import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCodes, type ErrorBody } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { prismaErrorCode } from '../lib/prisma.js';
import multer from 'multer';

/** Forwards unmatched requests to the error handler as a 404. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, ErrorCodes.NOT_FOUND, 'Route not found.'));
};

/** Errors raised by Express/body-parser carry an HTTP status and a type. */
function isHttpError(error: unknown): error is { status: number; type?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  );
}

function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Request validation failed.', details);
  }

  const prismaCode = prismaErrorCode(error);
  if (prismaCode === 'P2002') {
    return new AppError(409, ErrorCodes.CONFLICT, 'A record with these values already exists.');
  }
  if (prismaCode === 'P2025') {
    return new AppError(404, ErrorCodes.NOT_FOUND, 'Resource not found.');
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, ErrorCodes.PAYLOAD_TOO_LARGE, 'The file is too large.');
    }
    return new AppError(400, ErrorCodes.BAD_REQUEST, 'Invalid file upload.', {
      reason: error.code,
    });
  }

  if (isHttpError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new AppError(400, ErrorCodes.INVALID_JSON, 'Request body is not valid JSON.');
    }
    if (error.type === 'entity.too.large') {
      return new AppError(413, ErrorCodes.PAYLOAD_TOO_LARGE, 'Request body is too large.');
    }
    return new AppError(
      error.status,
      ErrorCodes.BAD_REQUEST,
      'The request could not be processed.',
    );
  }

  return null;
}

/**
 * Centralized error handler. Known errors are translated into the standard error body.
 * Anything unexpected becomes a generic 500: details are logged, never sent to the client.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const appError = toAppError(error);

    if (appError) {
      const body: ErrorBody = {
        error: {
          code: appError.code,
          message: appError.message,
          ...(appError.details !== undefined && { details: appError.details }),
        },
      };
      res.status(appError.status).json(body);
      return;
    }

    logger.error('Unhandled error', {
      method: req.method,
      path: req.path,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const body: ErrorBody = {
      error: { code: ErrorCodes.INTERNAL_ERROR, message: 'An unexpected error occurred.' },
    };
    res.status(500).json(body);
  };
}

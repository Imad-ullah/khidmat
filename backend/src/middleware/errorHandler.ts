import type { ErrorRequestHandler } from 'express';
import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { captureException } from '../config/sentry';
import { AppError } from '../utils/appError';
import { errorResponse } from '../utils/response';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const appError = error instanceof AppError ? error : undefined;
  const statusCode = appError?.statusCode ?? 500;
  const errorCode = appError?.errorCode ?? 'INTERNAL_SERVER_ERROR';
  const message = appError?.message ?? 'Something went wrong';
  const details = appError?.details ?? (isProduction ? undefined : { stack: error instanceof Error ? error.stack : undefined });

  logger.error(message, {
    errorCode,
    statusCode,
    details,
  });
  captureException(error);

  errorResponse(response, statusCode, message, errorCode, details);
};

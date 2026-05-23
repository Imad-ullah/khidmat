import type { RequestHandler } from 'express';
import { AppError } from '../utils/appError';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(`Route not found: ${request.method} ${request.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};

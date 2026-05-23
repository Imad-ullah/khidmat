import type { Role } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/appError';

export const authorize = (...roles: Role[]): RequestHandler => {
  return (request, _response, next): void => {
    if (request.user === undefined) {
      next(new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED'));
      return;
    }

    if (!roles.includes(request.user.role)) {
      next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
      return;
    }

    next();
  };
};

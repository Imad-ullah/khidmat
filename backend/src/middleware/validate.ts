import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';
import { AppError } from '../utils/appError';

type RequestSchemas = {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
};

const formatZodError = (error: ZodError): Array<{ path: string; message: string }> => {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
};

export const validate = (schemas: RequestSchemas): RequestHandler => {
  return (request: Request, _response: Response, next: NextFunction): void => {
    try {
      if (schemas.body !== undefined) {
        request.body = schemas.body.parse(request.body);
      }

      if (schemas.params !== undefined) {
        request.params = schemas.params.parse(request.params) as typeof request.params;
      }

      if (schemas.query !== undefined) {
        request.query = schemas.query.parse(request.query) as typeof request.query;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('Validation failed', 422, 'VALIDATION_ERROR', formatZodError(error)));
        return;
      }

      next(error);
    }
  };
};

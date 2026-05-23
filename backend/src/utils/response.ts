import type { Response } from 'express';

type ApiError = {
  code: string;
  details?: unknown;
};

type ApiResponse<TData> = {
  success: boolean;
  message: string;
  data: TData | null;
  error: ApiError | null;
};

export const successResponse = <TData>(
  response: Response,
  statusCode: number,
  message: string,
  data: TData,
): void => {
  const payload: ApiResponse<TData> = {
    success: true,
    message,
    data,
    error: null,
  };

  response.status(statusCode).json(payload);
};

export const errorResponse = (
  response: Response,
  statusCode: number,
  message: string,
  code: string,
  details?: unknown,
): void => {
  const payload: ApiResponse<null> = {
    success: false,
    message,
    data: null,
    error: {
      code,
      details,
    },
  };

  response.status(statusCode).json(payload);
};

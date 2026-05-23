import type { Request, Response } from 'express';
import { AppError } from '../../utils/appError';
import { successResponse } from '../../utils/response';
import type { CreateReviewInput, ProviderReviewsQuery } from './review.schema';
import { reviewService } from './review.service';

export const reviewController = {
  create: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await reviewService.create(request.user, request.body as CreateReviewInput);
    successResponse(response, 201, 'Review submitted', result);
  },

  listForProvider: async (request: Request, response: Response): Promise<void> => {
    const result = await reviewService.listForProvider(request.params.id, request.query as unknown as ProviderReviewsQuery);
    successResponse(response, 200, 'Provider reviews retrieved', result);
  },
};

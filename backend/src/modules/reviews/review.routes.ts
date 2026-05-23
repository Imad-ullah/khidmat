import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { createReviewSchema, providerReviewsParamsSchema, providerReviewsQuerySchema } from './review.schema';
import { reviewController } from './review.controller';

export const reviewRouter = Router();
export const providerReviewRouter = Router();

reviewRouter.post('/', authenticate, authorize(Role.CUSTOMER), validate({ body: createReviewSchema }), asyncWrapper(reviewController.create));

providerReviewRouter.get(
  '/:id/reviews',
  validate({ params: providerReviewsParamsSchema, query: providerReviewsQuerySchema }),
  asyncWrapper(reviewController.listForProvider),
);

import { z } from 'zod';

export const createReviewSchema = z.object({
  bookingId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const providerReviewsParamsSchema = z.object({
  id: z.string().cuid(),
});

export const providerReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ProviderReviewsQuery = z.infer<typeof providerReviewsQuerySchema>;

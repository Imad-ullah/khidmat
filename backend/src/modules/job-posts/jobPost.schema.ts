import { z } from 'zod';

export const jobPostIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const selectApplicationParamsSchema = z.object({
  id: z.string().min(1),
  applicationId: z.string().min(1),
});

export const createJobPostSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(2500),
  budgetMin: z.coerce.number().int().min(0),
  budgetMax: z.coerce.number().int().min(0),
  photoUrls: z.array(z.string().trim().url()).max(5).default([]),
}).refine((value) => value.budgetMax >= value.budgetMin, {
  path: ['budgetMax'],
  message: 'Maximum budget must be greater than or equal to minimum budget',
});

export const listJobPostsQuerySchema = z.object({
  category: z.string().trim().optional(),
  city: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const applyJobPostSchema = z.object({
  quote: z.coerce.number().int().min(0),
  message: z.string().trim().min(5).max(1000),
});

export type CreateJobPostInput = z.infer<typeof createJobPostSchema>;
export type ListJobPostsQuery = z.infer<typeof listJobPostsQuerySchema>;
export type ApplyJobPostInput = z.infer<typeof applyJobPostSchema>;

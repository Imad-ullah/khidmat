import { DisputeResolution } from '@prisma/client';
import { z } from 'zod';

export const createDisputeSchema = z.object({
  bookingId: z.string().cuid(),
  reason: z.string().trim().min(10).max(1000),
});

export const disputeIdParamsSchema = z.object({
  id: z.string().cuid(),
});

export const adminDisputeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']).optional(),
});

export const resolveDisputeSchema = z.object({
  resolution: z.nativeEnum(DisputeResolution),
  resolutionNote: z.string().trim().min(5).max(1000),
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
export type AdminDisputeListQuery = z.infer<typeof adminDisputeListQuerySchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

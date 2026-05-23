import { z } from 'zod';

export const bookingIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const createBookingSchema = z.object({
  providerId: z.string().min(1),
  categoryId: z.string().min(1),
  description: z.string().trim().min(10).max(2000),
  scheduledAt: z.string().datetime().optional(),
  totalAmount: z.coerce.number().int().min(0).optional(),
});

export const completeBookingSchema = z.object({
  proofPhotoUrls: z.array(z.string().trim().url()).min(1),
  totalAmount: z.coerce.number().int().min(0).optional(),
});

export const cancelBookingSchema = z.object({
  cancellationReason: z.string().trim().min(3).max(500),
});

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CompleteBookingInput = z.infer<typeof completeBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;

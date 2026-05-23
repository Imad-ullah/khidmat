import { AccountStatus, BookingStatus } from '@prisma/client';
import { z } from 'zod';

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const adminBookingListQuerySchema = adminListQuerySchema.extend({
  status: z.nativeEnum(BookingStatus).optional(),
});

export const adminUserListQuerySchema = adminListQuerySchema.extend({
  role: z.enum(['CUSTOMER', 'PROVIDER', 'ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.nativeEnum(AccountStatus).optional(),
});

export const adminIdParamsSchema = z.object({
  id: z.string().cuid(),
});

export const updateUserStatusSchema = z.object({
  status: z.nativeEnum(AccountStatus),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  iconUrl: z.string().trim().url().optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminBookingListQuery = z.infer<typeof adminBookingListQuerySchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

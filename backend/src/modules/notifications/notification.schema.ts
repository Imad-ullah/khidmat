import { z } from 'zod';

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

export const notificationIdParamsSchema = z.object({
  id: z.string().cuid(),
});

export const deviceTokenSchema = z.object({
  token: z.string().trim().min(10).max(500),
  platform: z.string().trim().max(40).optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type DeviceTokenInput = z.infer<typeof deviceTokenSchema>;

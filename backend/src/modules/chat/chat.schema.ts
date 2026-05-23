import { MessageType } from '@prisma/client';
import { z } from 'zod';

export const chatBookingParamsSchema = z.object({
  bookingId: z.string().cuid(),
});

export const chatMessagesQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export const sendMessageSchema = z.object({
  type: z.nativeEnum(MessageType).default(MessageType.TEXT),
  body: z.string().trim().min(1).max(2000).optional(),
  imageUrl: z.string().url().optional(),
}).superRefine((value, context) => {
  if (value.type === MessageType.TEXT && value.body === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'Body is required for text messages',
    });
  }

  if (value.type === MessageType.IMAGE && value.imageUrl === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageUrl'],
      message: 'Image URL is required for image messages',
    });
  }
});

export type ChatBookingParams = z.infer<typeof chatBookingParamsSchema>;
export type ChatMessagesQuery = z.infer<typeof chatMessagesQuerySchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

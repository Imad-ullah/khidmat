import type { Request, Response } from 'express';
import { AppError } from '../../utils/appError';
import { successResponse } from '../../utils/response';
import type { DeviceTokenInput, NotificationListQuery } from './notification.schema';
import { notificationService } from './notification.service';

export const notificationController = {
  listOwn: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await notificationService.listOwn(request.user.id, request.query as unknown as NotificationListQuery);
    successResponse(response, 200, 'Notifications retrieved', result);
  },

  unreadCount: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await notificationService.unreadCount(request.user.id);
    successResponse(response, 200, 'Unread count retrieved', result);
  },

  markRead: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await notificationService.markRead(request.user.id, request.params.id);
    successResponse(response, 200, 'Notification marked as read', result);
  },

  upsertDeviceToken: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await notificationService.upsertDeviceToken(request.user.id, request.body as DeviceTokenInput);
    successResponse(response, 200, 'Device token saved', result);
  },
};

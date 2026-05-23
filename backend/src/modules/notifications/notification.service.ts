import { AccountStatus, NotificationEvent, Prisma, Role } from '@prisma/client';
import { firebaseMessaging } from '../../config/firebase';
import { logger } from '../../config/logger';
import { notificationQueue } from '../../jobs/queues';
import { prisma } from '../../prisma/client';
import { getPagination } from '../../utils/pagination';
import type { DeviceTokenInput, NotificationListQuery } from './notification.schema';

type NotificationChannel = 'FCM' | 'IN_APP' | 'SMS';

export type NotificationPayload = {
  userId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
  channels: NotificationChannel[];
};

const eventChannels: Record<NotificationEvent, NotificationChannel[]> = {
  [NotificationEvent.BOOKING_REQUEST_RECEIVED]: ['FCM', 'IN_APP'],
  [NotificationEvent.BOOKING_CONFIRMED]: ['FCM', 'IN_APP'],
  [NotificationEvent.BOOKING_CANCELLED]: ['FCM', 'IN_APP', 'SMS'],
  [NotificationEvent.PROVIDER_APPLIED_TO_JOB]: ['FCM', 'IN_APP'],
  [NotificationEvent.JOB_APPLICATION_ACCEPTED]: ['FCM', 'IN_APP', 'SMS'],
  [NotificationEvent.JOB_MARKED_COMPLETE]: ['FCM', 'IN_APP'],
  [NotificationEvent.REVIEW_SUBMITTED]: ['IN_APP'],
  [NotificationEvent.DISPUTE_FILED]: ['IN_APP'],
  [NotificationEvent.ACCOUNT_VERIFIED]: ['FCM', 'SMS'],
  [NotificationEvent.ACCOUNT_REJECTED]: ['FCM', 'SMS'],
  [NotificationEvent.KHIDMAT_BADGE_AWARDED]: ['FCM', 'IN_APP'],
};

export const createNotificationPayload = (input: Omit<NotificationPayload, 'channels'>): NotificationPayload => ({
  ...input,
  channels: eventChannels[input.event],
});

const sendFcm = async (payload: NotificationPayload): Promise<void> => {
  if (!payload.channels.includes('FCM')) {
    return;
  }

  const tokens = await prisma.deviceToken.findMany({
    where: { userId: payload.userId },
    select: { token: true },
  });

  if (tokens.length === 0) {
    return;
  }

  try {
    await firebaseMessaging().sendEachForMulticast({
      tokens: tokens.map((token) => token.token),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: Object.fromEntries(
        Object.entries((payload.data as Record<string, unknown> | undefined) ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    });
  } catch (error) {
    logger.warn('FCM notification delivery failed', { error });
  }
};

const sendSms = async (payload: NotificationPayload): Promise<void> => {
  if (!payload.channels.includes('SMS')) {
    return;
  }

  logger.info('SMS notification queued for external provider', {
    userId: payload.userId,
    event: payload.event,
  });
};

export const processNotificationJob = async (payload: NotificationPayload): Promise<void> => {
  if (payload.channels.includes('IN_APP')) {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        event: payload.event,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? Prisma.JsonNull,
      },
    });
  }

  await sendFcm(payload);
  await sendSms(payload);
};

export const dispatchNotification = async (payload: NotificationPayload): Promise<void> => {
  if (process.env.NODE_ENV === 'test') {
    await processNotificationJob(payload);
    return;
  }

  try {
    await notificationQueue.add('dispatch-notification', payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  } catch (error) {
    logger.warn('Notification queue unavailable; dispatching with local fallback', { error });
    await processNotificationJob(payload);
  }
};

export const dispatchNotifications = async (payloads: NotificationPayload[]): Promise<void> => {
  await Promise.all(payloads.map((payload) => dispatchNotification(payload)));
};

export const notificationService = {
  listOwn: async (userId: string, query: NotificationListQuery) => {
    const pagination = getPagination(query);
    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        isRead: query.unreadOnly === true ? false : undefined,
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      notifications: notifications.map((notification) => ({
        id: notification.id,
        event: notification.event,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        isRead: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      })),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  unreadCount: async (userId: string): Promise<{ unreadCount: number }> => {
    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount };
  },

  markRead: async (userId: string, notificationId: string): Promise<{ id: string; isRead: boolean }> => {
    const notification = await prisma.notification.findFirstOrThrow({
      where: { id: notificationId, userId },
    });

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
    });

    return {
      id: updated.id,
      isRead: updated.isRead,
    };
  },

  upsertDeviceToken: async (userId: string, input: DeviceTokenInput): Promise<{ token: string; platform: string | null }> => {
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token: input.token },
      update: {
        userId,
        platform: input.platform,
      },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
      },
    });

    return {
      token: deviceToken.token,
      platform: deviceToken.platform,
    };
  },

  adminUserIds: async (): Promise<string[]> => {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.SUPER_ADMIN] },
        status: { notIn: [AccountStatus.DELETED, AccountStatus.SUSPENDED] },
      },
      select: { id: true },
    });

    return admins.map((admin) => admin.id);
  },
};

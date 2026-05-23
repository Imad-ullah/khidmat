import { AccountStatus, BookingStatus, DisputeStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

export const expirePendingBookings = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(now);
  cutoff.setUTCMinutes(cutoff.getUTCMinutes() - 30);

  const result = await prisma.booking.updateMany({
    where: {
      bookingType: 'DIRECT',
      status: BookingStatus.PENDING_CONFIRMATION,
      createdAt: { lte: cutoff },
      deletedAt: null,
    },
    data: {
      status: BookingStatus.EXPIRED,
    },
  });

  return result.count;
};

export const expireOpenJobPosts = async (now = new Date()): Promise<number> => {
  const expiredJobPosts = await prisma.jobPost.findMany({
    where: {
      expiresAt: { lte: now },
      booking: {
        status: BookingStatus.PENDING_CONFIRMATION,
        deletedAt: null,
      },
    },
    select: {
      bookingId: true,
    },
  });

  if (expiredJobPosts.length === 0) {
    return 0;
  }

  const result = await prisma.booking.updateMany({
    where: {
      id: { in: expiredJobPosts.map((jobPost) => jobPost.bookingId) },
    },
    data: {
      status: BookingStatus.EXPIRED,
    },
  });

  return result.count;
};

export const closeCompletedBookings = async (now = new Date()): Promise<number> => {
  const cutoff = new Date(now);
  cutoff.setUTCHours(cutoff.getUTCHours() - 24);

  const result = await prisma.booking.updateMany({
    where: {
      status: BookingStatus.COMPLETED,
      completedAt: { lte: cutoff },
      deletedAt: null,
    },
    data: {
      status: BookingStatus.CLOSED,
      closedAt: now,
    },
  });

  return result.count;
};

export const autoSuspendProvidersWithOpenDisputes = async (): Promise<number> => {
  const disputedProviders = await prisma.dispute.groupBy({
    by: ['providerId'],
    where: {
      providerId: { not: null },
      status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
    },
    _count: {
      providerId: true,
    },
    having: {
      providerId: {
        _count: {
          gte: 3,
        },
      },
    },
  });

  const providerIds = disputedProviders
    .map((provider) => provider.providerId)
    .filter((providerId): providerId is string => providerId !== null);

  if (providerIds.length === 0) {
    return 0;
  }

  const result = await prisma.user.updateMany({
    where: {
      provider: {
        id: { in: providerIds },
      },
      status: { not: AccountStatus.SUSPENDED },
    },
    data: {
      status: AccountStatus.SUSPENDED,
    },
  });

  return result.count;
};

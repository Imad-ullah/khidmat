import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { CreateReviewInput } from './review.schema';

const reviewInclude = {
  customer: true,
  provider: true,
  booking: true,
} satisfies Prisma.ReviewInclude;

export type ReviewWithRelations = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

export const reviewRepository = {
  findCustomerByUserId: async (userId: string) => {
    return prisma.customer.findUnique({ where: { userId } });
  },

  findBookingForReview: async (bookingId: string) => {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        provider: true,
      },
    });
  },

  findByBookingId: async (bookingId: string): Promise<ReviewWithRelations | null> => {
    return prisma.review.findUnique({
      where: { bookingId },
      include: reviewInclude,
    });
  },

  create: async (customerId: string, providerId: string, input: CreateReviewInput): Promise<ReviewWithRelations> => {
    return prisma.review.create({
      data: {
        bookingId: input.bookingId,
        customerId,
        providerId,
        rating: input.rating,
        comment: input.comment,
      },
      include: reviewInclude,
    });
  },

  listForProvider: async (providerId: string, pagination: { skip: number; limit: number }): Promise<ReviewWithRelations[]> => {
    return prisma.review.findMany({
      where: {
        providerId,
        isRemoved: false,
      },
      include: reviewInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });
  },

  recalculateProviderRating: async (providerId: string): Promise<void> => {
    const aggregate = await prisma.review.aggregate({
      where: {
        providerId,
        isRemoved: false,
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.provider.update({
      where: { id: providerId },
      data: {
        averageRating: aggregate._avg.rating ?? 0,
        totalReviews: aggregate._count.rating,
      },
    });
  },

  closedStatuses: [BookingStatus.CLOSED] as BookingStatus[],
};

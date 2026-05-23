import { NotificationEvent, Role } from '@prisma/client';
import { AppError } from '../../utils/appError';
import { getPagination } from '../../utils/pagination';
import { createNotificationPayload, dispatchNotification } from '../notifications/notification.service';
import type { CreateReviewInput, ProviderReviewsQuery } from './review.schema';
import { reviewRepository, type ReviewWithRelations } from './review.repository';

type PublicReview = {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

const toPublicReview = (review: ReviewWithRelations): PublicReview => ({
  id: review.id,
  bookingId: review.bookingId,
  customerId: review.customerId,
  providerId: review.providerId,
  rating: review.rating,
  comment: review.comment,
  createdAt: review.createdAt.toISOString(),
});

export const reviewService = {
  create: async (user: { id: string; role: Role }, input: CreateReviewInput): Promise<PublicReview> => {
    if (user.role !== Role.CUSTOMER) {
      throw new AppError('Customer role is required', 403, 'CUSTOMER_ROLE_REQUIRED');
    }

    const customer = await reviewRepository.findCustomerByUserId(user.id);
    const booking = await reviewRepository.findBookingForReview(input.bookingId);

    if (customer === null || booking === null || booking.customerId !== customer.id || booking.providerId === null || booking.provider === null) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    if (!reviewRepository.closedStatuses.includes(booking.status)) {
      throw new AppError('Reviews require a closed booking', 409, 'BOOKING_NOT_CLOSED');
    }

    if ((await reviewRepository.findByBookingId(input.bookingId)) !== null) {
      throw new AppError('Booking already has a review', 409, 'REVIEW_ALREADY_EXISTS');
    }

    const review = await reviewRepository.create(customer.id, booking.providerId, input);
    await reviewRepository.recalculateProviderRating(booking.providerId);
    await dispatchNotification(createNotificationPayload({
      userId: booking.provider.userId,
      event: NotificationEvent.REVIEW_SUBMITTED,
      title: 'New review received',
      body: `You received a ${review.rating}-star review.`,
      data: { reviewId: review.id, bookingId: booking.id },
    }));

    return toPublicReview(review);
  },

  listForProvider: async (providerId: string, query: ProviderReviewsQuery): Promise<{ reviews: PublicReview[]; page: number; limit: number }> => {
    const pagination = getPagination(query);
    const reviews = await reviewRepository.listForProvider(providerId, pagination);

    return {
      reviews: reviews.map(toPublicReview),
      page: pagination.page,
      limit: pagination.limit,
    };
  },
};

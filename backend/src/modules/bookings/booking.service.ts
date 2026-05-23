import { BookingStatus, NotificationEvent, Role } from '@prisma/client';
import { AppError } from '../../utils/appError';
import { getPagination } from '../../utils/pagination';
import { prisma } from '../../prisma/client';
import { createNotificationPayload, dispatchNotification, dispatchNotifications } from '../notifications/notification.service';
import type { CancelBookingInput, CompleteBookingInput, CreateBookingInput, ListBookingsQuery } from './booking.schema';
import { bookingRepository, type BookingWithRelations } from './booking.repository';

type PublicBooking = {
  id: string;
  customerId: string;
  providerId: string | null;
  categoryId: string;
  categoryName: string;
  bookingType: string;
  status: BookingStatus;
  description: string;
  scheduledAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  totalAmount: number | null;
  paymentStatus: string;
  paymentMethod: string | null;
  proofPhotoUrls: string[];
  cancellationReason: string | null;
};

const toPublicBooking = (booking: BookingWithRelations): PublicBooking => ({
  id: booking.id,
  customerId: booking.customerId,
  providerId: booking.providerId,
  categoryId: booking.categoryId,
  categoryName: booking.category.name,
  bookingType: booking.bookingType,
  status: booking.status,
  description: booking.description,
  scheduledAt: booking.scheduledAt?.toISOString() ?? null,
  completedAt: booking.completedAt?.toISOString() ?? null,
  closedAt: booking.closedAt?.toISOString() ?? null,
  totalAmount: booking.totalAmount,
  paymentStatus: booking.paymentStatus,
  paymentMethod: booking.paymentMethod,
  proofPhotoUrls: booking.proofPhotoUrls,
  cancellationReason: booking.cancellationReason,
});

const getCustomerOrThrow = async (userId: string) => {
  const customer = await bookingRepository.findCustomerByUserId(userId);
  if (customer === null) {
    throw new AppError('Customer profile not found', 404, 'CUSTOMER_NOT_FOUND');
  }
  return customer;
};

const getProviderOrThrow = async (userId: string) => {
  const provider = await bookingRepository.findProviderByUserId(userId);
  if (provider === null) {
    throw new AppError('Provider profile not found', 404, 'PROVIDER_NOT_FOUND');
  }
  return provider;
};

const assertBookingParticipant = (booking: BookingWithRelations, user: { id: string; role: Role }, providerId?: string, customerId?: string): void => {
  if (user.role === Role.CUSTOMER && booking.customerId === customerId) {
    return;
  }

  if (user.role === Role.PROVIDER && booking.providerId === providerId) {
    return;
  }

  throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
};

export const bookingService = {
  createDirect: async (user: { id: string; role: Role }, input: CreateBookingInput): Promise<PublicBooking> => {
    if (user.role !== Role.CUSTOMER) {
      throw new AppError('Customer role is required', 403, 'CUSTOMER_ROLE_REQUIRED');
    }

    const customer = await getCustomerOrThrow(user.id);
    const providerProfile = await bookingRepository.findProviderByUserId(user.id);
    if (providerProfile?.id === input.providerId) {
      throw new AppError('Provider cannot book themselves', 409, 'PROVIDER_CANNOT_BOOK_SELF');
    }

    const activeCount = await bookingRepository.countActiveCustomerBookings(customer.id);
    if (activeCount >= 3) {
      throw new AppError('Customer cannot have more than 3 active bookings', 409, 'ACTIVE_BOOKING_LIMIT_REACHED');
    }

    // Ensure provider/category pair exists and provider is verified via provider service table.
    const providerService = await prisma.providerService.findFirst({
      where: {
        providerId: input.providerId,
        categoryId: input.categoryId,
        provider: { verificationStatus: 'VERIFIED', deletedAt: null },
      },
    });
    if (providerService === null) {
      throw new AppError('Provider service not found', 404, 'PROVIDER_SERVICE_NOT_FOUND');
    }

    const booking = await bookingRepository.createDirect(customer.id, input);
    if (booking.provider?.userId !== undefined) {
      await dispatchNotification(createNotificationPayload({
        userId: booking.provider.userId,
        event: NotificationEvent.BOOKING_REQUEST_RECEIVED,
        title: 'New booking request',
        body: 'A customer requested your service.',
        data: { bookingId: booking.id },
      }));
    }

    return toPublicBooking(booking);
  },

  listOwn: async (user: { id: string; role: Role }, query: ListBookingsQuery): Promise<{ bookings: PublicBooking[]; page: number; limit: number }> => {
    const pagination = getPagination(query);
    const customer = user.role === Role.CUSTOMER ? await bookingRepository.findCustomerByUserId(user.id) : null;
    const provider = user.role === Role.PROVIDER ? await bookingRepository.findProviderByUserId(user.id) : null;

    const bookings = await bookingRepository.listForCustomerOrProvider({
      customerId: customer?.id,
      providerId: provider?.id,
      skip: pagination.skip,
      limit: pagination.limit,
    });

    return {
      bookings: bookings.map(toPublicBooking),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  getById: async (user: { id: string; role: Role }, bookingId: string): Promise<PublicBooking> => {
    const booking = await bookingRepository.findById(bookingId);
    if (booking === null) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const customer = user.role === Role.CUSTOMER ? await bookingRepository.findCustomerByUserId(user.id) : null;
    const provider = user.role === Role.PROVIDER ? await bookingRepository.findProviderByUserId(user.id) : null;
    assertBookingParticipant(booking, user, provider?.id, customer?.id);

    return toPublicBooking(booking);
  },

  confirm: async (userId: string, bookingId: string): Promise<PublicBooking> => {
    const provider = await getProviderOrThrow(userId);
    const booking = await bookingRepository.findById(bookingId);
    if (booking === null || booking.providerId !== provider.id) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status !== BookingStatus.PENDING_CONFIRMATION) {
      throw new AppError('Booking cannot be confirmed from current status', 409, 'INVALID_BOOKING_STATUS');
    }
    const confirmed = await bookingRepository.confirmWithChatRoom(bookingId);
    await dispatchNotification(createNotificationPayload({
      userId: confirmed.customer.userId,
      event: NotificationEvent.BOOKING_CONFIRMED,
      title: 'Booking confirmed',
      body: 'Your provider confirmed the booking.',
      data: { bookingId: confirmed.id },
    }));

    return toPublicBooking(confirmed);
  },

  start: async (userId: string, bookingId: string): Promise<PublicBooking> => {
    const provider = await getProviderOrThrow(userId);
    const booking = await bookingRepository.findById(bookingId);
    if (booking === null || booking.providerId !== provider.id) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new AppError('Booking cannot be started from current status', 409, 'INVALID_BOOKING_STATUS');
    }
    return toPublicBooking(await bookingRepository.updateStatus(bookingId, BookingStatus.IN_PROGRESS));
  },

  complete: async (userId: string, bookingId: string, input: CompleteBookingInput): Promise<PublicBooking> => {
    const provider = await getProviderOrThrow(userId);
    const booking = await bookingRepository.findById(bookingId);
    if (booking === null || booking.providerId !== provider.id) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }
    if (booking.status !== BookingStatus.IN_PROGRESS) {
      throw new AppError('Booking cannot be completed from current status', 409, 'INVALID_BOOKING_STATUS');
    }
    const completed = await bookingRepository.complete(bookingId, input);
    await dispatchNotification(createNotificationPayload({
      userId: completed.customer.userId,
      event: NotificationEvent.JOB_MARKED_COMPLETE,
      title: 'Job marked complete',
      body: 'Your provider marked the job complete.',
      data: { bookingId: completed.id },
    }));

    return toPublicBooking(completed);
  },

  cancel: async (user: { id: string; role: Role }, bookingId: string, input: CancelBookingInput): Promise<PublicBooking> => {
    const booking = await bookingRepository.findById(bookingId);
    if (booking === null) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const customer = user.role === Role.CUSTOMER ? await bookingRepository.findCustomerByUserId(user.id) : null;
    const provider = user.role === Role.PROVIDER ? await bookingRepository.findProviderByUserId(user.id) : null;
    assertBookingParticipant(booking, user, provider?.id, customer?.id);

    const terminalStatuses: BookingStatus[] = [BookingStatus.COMPLETED, BookingStatus.CLOSED, BookingStatus.CANCELLED, BookingStatus.EXPIRED];
    if (terminalStatuses.includes(booking.status)) {
      throw new AppError('Booking cannot be cancelled from current status', 409, 'INVALID_BOOKING_STATUS');
    }

    const cancelled = await bookingRepository.cancel(bookingId, input);
    await dispatchNotifications([
      createNotificationPayload({
        userId: cancelled.customer.userId,
        event: NotificationEvent.BOOKING_CANCELLED,
        title: 'Booking cancelled',
        body: 'A booking was cancelled.',
        data: { bookingId: cancelled.id },
      }),
      ...(cancelled.provider?.userId === undefined
        ? []
        : [
            createNotificationPayload({
              userId: cancelled.provider.userId,
              event: NotificationEvent.BOOKING_CANCELLED,
              title: 'Booking cancelled',
              body: 'A booking was cancelled.',
              data: { bookingId: cancelled.id },
            }),
          ]),
    ]);

    return toPublicBooking(cancelled);
  },
};

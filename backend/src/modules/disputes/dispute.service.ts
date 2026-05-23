import { BookingStatus, DisputeStatus, NotificationEvent, Role } from '@prisma/client';
import { AppError } from '../../utils/appError';
import { getPagination } from '../../utils/pagination';
import { createNotificationPayload, dispatchNotifications, notificationService } from '../notifications/notification.service';
import type { AdminDisputeListQuery, CreateDisputeInput, ResolveDisputeInput } from './dispute.schema';
import { disputeRepository, type DisputeWithRelations } from './dispute.repository';

type PublicDispute = {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string | null;
  status: DisputeStatus;
  reason: string;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

const toPublicDispute = (dispute: DisputeWithRelations): PublicDispute => ({
  id: dispute.id,
  bookingId: dispute.bookingId,
  customerId: dispute.customerId,
  providerId: dispute.providerId,
  status: dispute.status,
  reason: dispute.reason,
  resolution: dispute.resolution,
  resolutionNote: dispute.resolutionNote,
  resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
  createdAt: dispute.createdAt.toISOString(),
});

const assertWithinDisputeWindow = (completedAt: Date | null, closedAt: Date | null): void => {
  const basisDate = closedAt ?? completedAt;
  if (basisDate === null) {
    throw new AppError('Disputes require a completed booking', 409, 'BOOKING_NOT_COMPLETED');
  }

  const hoursSinceCompletion = Date.now() - basisDate.getTime();
  if (hoursSinceCompletion > 24 * 60 * 60 * 1000) {
    throw new AppError('Dispute window has expired', 409, 'DISPUTE_WINDOW_EXPIRED');
  }
};

export const disputeService = {
  create: async (user: { id: string; role: Role }, input: CreateDisputeInput): Promise<PublicDispute> => {
    if (user.role !== Role.CUSTOMER) {
      throw new AppError('Customer role is required', 403, 'CUSTOMER_ROLE_REQUIRED');
    }

    const customer = await disputeRepository.findCustomerByUserId(user.id);
    const booking = await disputeRepository.findBookingForDispute(input.bookingId);

    if (customer === null || booking === null || booking.customerId !== customer.id) {
      throw new AppError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    const disputableStatuses: BookingStatus[] = [BookingStatus.COMPLETED, BookingStatus.CLOSED];
    if (!disputableStatuses.includes(booking.status)) {
      throw new AppError('Disputes require a completed booking', 409, 'BOOKING_NOT_COMPLETED');
    }

    assertWithinDisputeWindow(booking.completedAt, booking.closedAt);
    const dispute = await disputeRepository.create(customer.id, booking.providerId, input);

    const adminIds = await notificationService.adminUserIds();
    await dispatchNotifications(adminIds.map((adminId) => createNotificationPayload({
      userId: adminId,
      event: NotificationEvent.DISPUTE_FILED,
      title: 'New dispute filed',
      body: 'A customer filed a dispute for a booking.',
      data: { disputeId: dispute.id, bookingId: booking.id },
    })));

    return toPublicDispute(dispute);
  },

  listAdmin: async (query: AdminDisputeListQuery): Promise<{ disputes: PublicDispute[]; page: number; limit: number }> => {
    const pagination = getPagination(query);
    const disputes = await disputeRepository.listAdmin({ status: query.status }, pagination);

    return {
      disputes: disputes.map(toPublicDispute),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  resolve: async (adminId: string, disputeId: string, input: ResolveDisputeInput): Promise<PublicDispute> => {
    const dispute = await disputeRepository.findById(disputeId);
    if (dispute === null) {
      throw new AppError('Dispute not found', 404, 'DISPUTE_NOT_FOUND');
    }

    if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.CLOSED) {
      throw new AppError('Dispute is already resolved', 409, 'DISPUTE_ALREADY_RESOLVED');
    }

    return toPublicDispute(await disputeRepository.resolve(disputeId, adminId, input));
  },
};

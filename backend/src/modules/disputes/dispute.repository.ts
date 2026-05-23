import { DisputeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { CreateDisputeInput, ResolveDisputeInput } from './dispute.schema';

const disputeInclude = {
  booking: true,
  customer: {
    include: { user: { select: { id: true, phone: true } } },
  },
  provider: {
    include: { user: { select: { id: true, phone: true } } },
  },
} satisfies Prisma.DisputeInclude;

export type DisputeWithRelations = Prisma.DisputeGetPayload<{ include: typeof disputeInclude }>;

export const disputeRepository = {
  findCustomerByUserId: async (userId: string) => {
    return prisma.customer.findUnique({ where: { userId } });
  },

  findBookingForDispute: async (bookingId: string) => {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        provider: true,
      },
    });
  },

  create: async (customerId: string, providerId: string | null, input: CreateDisputeInput): Promise<DisputeWithRelations> => {
    return prisma.dispute.create({
      data: {
        bookingId: input.bookingId,
        customerId,
        providerId,
        reason: input.reason,
      },
      include: disputeInclude,
    });
  },

  listAdmin: async (query: { status?: DisputeStatus }, pagination: { skip: number; limit: number }): Promise<DisputeWithRelations[]> => {
    return prisma.dispute.findMany({
      where: {
        status: query.status,
      },
      include: disputeInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });
  },

  findById: async (id: string): Promise<DisputeWithRelations | null> => {
    return prisma.dispute.findUnique({
      where: { id },
      include: disputeInclude,
    });
  },

  resolve: async (id: string, adminId: string, input: ResolveDisputeInput): Promise<DisputeWithRelations> => {
    return prisma.$transaction(async (transaction) => {
      const dispute = await transaction.dispute.update({
        where: { id },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution: input.resolution,
          resolutionNote: input.resolutionNote,
          resolvedAt: new Date(),
        },
        include: disputeInclude,
      });

      await transaction.auditLog.create({
        data: {
          adminId,
          action: 'DISPUTE_RESOLVED',
          targetId: id,
          metadata: {
            resolution: input.resolution,
            resolutionNote: input.resolutionNote,
          },
        },
      });

      return dispute;
    });
  },
};

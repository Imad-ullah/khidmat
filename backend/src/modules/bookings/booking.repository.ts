import { BookingStatus, BookingType, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { CancelBookingInput, CompleteBookingInput, CreateBookingInput } from './booking.schema';

const bookingInclude = {
  customer: {
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          role: true,
          status: true,
        },
      },
    },
  },
  provider: {
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          role: true,
          status: true,
        },
      },
    },
  },
  category: true,
  jobPost: true,
  applications: true,
} satisfies Prisma.BookingInclude;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export const activeBookingStatuses: BookingStatus[] = [
  BookingStatus.PENDING_CONFIRMATION,
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
];

export const bookingRepository = {
  findCustomerByUserId: async (userId: string) => {
    return prisma.customer.findUnique({ where: { userId } });
  },

  findProviderByUserId: async (userId: string) => {
    return prisma.provider.findUnique({ where: { userId } });
  },

  countActiveCustomerBookings: async (customerId: string): Promise<number> => {
    return prisma.booking.count({
      where: {
        customerId,
        status: { in: activeBookingStatuses },
        deletedAt: null,
      },
    });
  },

  createDirect: async (customerId: string, input: CreateBookingInput): Promise<BookingWithRelations> => {
    return prisma.booking.create({
      data: {
        customerId,
        providerId: input.providerId,
        categoryId: input.categoryId,
        bookingType: BookingType.DIRECT,
        status: BookingStatus.PENDING_CONFIRMATION,
        description: input.description,
        scheduledAt: input.scheduledAt === undefined ? undefined : new Date(input.scheduledAt),
        totalAmount: input.totalAmount,
        paymentStatus: PaymentStatus.UNPAID,
        proofPhotoUrls: [],
      },
      include: bookingInclude,
    });
  },

  findById: async (id: string): Promise<BookingWithRelations | null> => {
    return prisma.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
  },

  listForCustomerOrProvider: async (input: { customerId?: string; providerId?: string; skip: number; limit: number }): Promise<BookingWithRelations[]> => {
    return prisma.booking.findMany({
      where: {
        deletedAt: null,
        OR: [{ customerId: input.customerId }, { providerId: input.providerId }].filter((clause) => Object.values(clause)[0] !== undefined),
      },
      include: bookingInclude,
      skip: input.skip,
      take: input.limit,
      orderBy: { createdAt: 'desc' },
    });
  },

  updateStatus: async (id: string, status: BookingStatus): Promise<BookingWithRelations> => {
    return prisma.booking.update({
      where: { id },
      data: { status },
      include: bookingInclude,
    });
  },

  confirmWithChatRoom: async (id: string): Promise<BookingWithRelations> => {
    return prisma.$transaction(async (transaction) => {
      await transaction.booking.update({
        where: { id },
        data: { status: BookingStatus.CONFIRMED },
      });

      await transaction.chatRoom.upsert({
        where: { bookingId: id },
        update: {},
        create: { bookingId: id },
      });

      return transaction.booking.findUniqueOrThrow({
        where: { id },
        include: bookingInclude,
      });
    });
  },

  complete: async (id: string, input: CompleteBookingInput): Promise<BookingWithRelations> => {
    return prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
        proofPhotoUrls: input.proofPhotoUrls,
        totalAmount: input.totalAmount,
      },
      include: bookingInclude,
    });
  },

  cancel: async (id: string, input: CancelBookingInput): Promise<BookingWithRelations> => {
    return prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: input.cancellationReason,
      },
      include: bookingInclude,
    });
  },
};

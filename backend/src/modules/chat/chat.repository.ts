import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { SendMessageInput } from './chat.schema';

const chatEnabledStatuses: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
];

const chatRoomInclude = {
  booking: {
    include: {
      customer: true,
      provider: true,
    },
  },
} satisfies Prisma.ChatRoomInclude;

const messageInclude = {
  sender: {
    select: {
      id: true,
      phone: true,
      role: true,
    },
  },
} satisfies Prisma.MessageInclude;

export type ChatRoomWithBooking = Prisma.ChatRoomGetPayload<{ include: typeof chatRoomInclude }>;
export type ChatMessageWithSender = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export const chatRepository = {
  findRoomByBookingId: async (bookingId: string): Promise<ChatRoomWithBooking | null> => {
    return prisma.chatRoom.findUnique({
      where: { bookingId },
      include: chatRoomInclude,
    });
  },

  ensureConfirmedRoom: async (bookingId: string): Promise<ChatRoomWithBooking | null> => {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        provider: true,
      },
    });

    if (booking === null || booking.providerId === null || !chatEnabledStatuses.includes(booking.status)) {
      return null;
    }

    return prisma.chatRoom.upsert({
      where: { bookingId },
      update: {},
      create: { bookingId },
      include: chatRoomInclude,
    });
  },

  listMessages: async (input: { chatRoomId: string; cursor?: string; limit: number }): Promise<ChatMessageWithSender[]> => {
    return prisma.message.findMany({
      where: { chatRoomId: input.chatRoomId },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      ...(input.cursor === undefined
        ? {}
        : {
            cursor: { id: input.cursor },
            skip: 1,
          }),
    });
  },

  createMessage: async (chatRoomId: string, senderId: string, input: SendMessageInput): Promise<ChatMessageWithSender> => {
    return prisma.message.create({
      data: {
        chatRoomId,
        senderId,
        type: input.type,
        body: input.body,
        imageUrl: input.imageUrl,
      },
      include: messageInclude,
    });
  },
};

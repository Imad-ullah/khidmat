import { Role } from '@prisma/client';
import { AppError } from '../../utils/appError';
import type { ChatMessagesQuery, SendMessageInput } from './chat.schema';
import { chatRepository, type ChatMessageWithSender, type ChatRoomWithBooking } from './chat.repository';

type PublicMessage = {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderRole: Role;
  type: string;
  body: string | null;
  imageUrl: string | null;
  createdAt: string;
};

const toPublicMessage = (message: ChatMessageWithSender): PublicMessage => ({
  id: message.id,
  chatRoomId: message.chatRoomId,
  senderId: message.senderId,
  senderRole: message.sender.role,
  type: message.type,
  body: message.body,
  imageUrl: message.imageUrl,
  createdAt: message.createdAt.toISOString(),
});

const assertParticipant = (room: ChatRoomWithBooking, user: { id: string; role: Role }): void => {
  if (user.role === Role.CUSTOMER && room.booking.customer.userId === user.id) {
    return;
  }

  if (user.role === Role.PROVIDER && room.booking.provider?.userId === user.id) {
    return;
  }

  if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
    return;
  }

  throw new AppError('Chat room not found', 404, 'CHAT_ROOM_NOT_FOUND');
};

const getRoomOrThrow = async (bookingId: string, user: { id: string; role: Role }): Promise<ChatRoomWithBooking> => {
  const room = await chatRepository.ensureConfirmedRoom(bookingId);
  if (room === null) {
    throw new AppError('Chat room not found or booking is not confirmed', 404, 'CHAT_ROOM_NOT_FOUND');
  }

  assertParticipant(room, user);
  return room;
};

export const chatService = {
  getRoomForUser: async (bookingId: string, user: { id: string; role: Role }): Promise<ChatRoomWithBooking> => {
    return getRoomOrThrow(bookingId, user);
  },

  listMessages: async (
    bookingId: string,
    user: { id: string; role: Role },
    query: ChatMessagesQuery,
  ): Promise<{ messages: PublicMessage[]; nextCursor: string | null }> => {
    const room = await getRoomOrThrow(bookingId, user);
    const messages = await chatRepository.listMessages({
      chatRoomId: room.id,
      cursor: query.cursor,
      limit: query.limit,
    });

    return {
      messages: messages.map(toPublicMessage),
      nextCursor: messages.length === query.limit ? messages[messages.length - 1]?.id ?? null : null,
    };
  },

  sendMessage: async (bookingId: string, user: { id: string; role: Role }, input: SendMessageInput): Promise<PublicMessage> => {
    const room = await getRoomOrThrow(bookingId, user);
    return toPublicMessage(await chatRepository.createMessage(room.id, user.id, input));
  },
};

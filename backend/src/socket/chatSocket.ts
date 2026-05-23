import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server, type Socket } from 'socket.io';
import { AccountStatus } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../prisma/client';
import { chatService } from '../modules/chat/chat.service';
import { sendMessageSchema } from '../modules/chat/chat.schema';

type SocketUser = {
  id: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | 'SUPER_ADMIN';
  status: AccountStatus;
};

type AuthenticatedSocket = Socket & {
  user?: SocketUser;
};

type AccessTokenPayload = jwt.JwtPayload & {
  sub: string;
};

const parseAccessToken = (token: string): AccessTokenPayload => {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Invalid socket token');
  }

  return payload as AccessTokenPayload;
};

export const createChatSocketServer = (server: HttpServer): Server => {
  const io = new Server(server, {
    cors: {
      origin: env.frontendOrigin,
      credentials: true,
    },
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const rawToken = socket.handshake.auth.token ?? socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (typeof rawToken !== 'string' || rawToken.trim() === '') {
        next(new Error('Authentication required'));
        return;
      }

      const payload = parseAccessToken(rawToken);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      });

      if (user === null || user.status === AccountStatus.DELETED || user.status === AccountStatus.SUSPENDED) {
        next(new Error('Invalid user'));
        return;
      }

      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    socket.on('join_room', async ({ bookingId }: { bookingId?: string }, ack?: (payload: unknown) => void) => {
      try {
        if (socket.user === undefined || bookingId === undefined) {
          throw new Error('Invalid room join request');
        }

        await chatService.getRoomForUser(bookingId, socket.user);
        await socket.join(`booking:${bookingId}`);
        ack?.({ success: true });
      } catch (error) {
        ack?.({ success: false, message: error instanceof Error ? error.message : 'Unable to join room' });
      }
    });

    socket.on('send_message', async (payload: { bookingId?: string }, ack?: (payload: unknown) => void) => {
      try {
        if (socket.user === undefined || payload.bookingId === undefined) {
          throw new Error('Invalid message request');
        }

        const input = sendMessageSchema.parse(payload);
        const message = await chatService.sendMessage(payload.bookingId, socket.user, input);
        io.to(`booking:${payload.bookingId}`).emit('message_received', message);
        ack?.({ success: true, data: message });
      } catch (error) {
        ack?.({ success: false, message: error instanceof Error ? error.message : 'Unable to send message' });
      }
    });

    socket.on('typing', ({ bookingId }: { bookingId?: string }) => {
      if (bookingId !== undefined) {
        socket.to(`booking:${bookingId}`).emit('typing', { bookingId, userId: socket.user?.id });
      }
    });

    socket.on('stop_typing', ({ bookingId }: { bookingId?: string }) => {
      if (bookingId !== undefined) {
        socket.to(`booking:${bookingId}`).emit('stop_typing', { bookingId, userId: socket.user?.id });
      }
    });
  });

  logger.info('Socket.IO chat server initialized');
  return io;
};

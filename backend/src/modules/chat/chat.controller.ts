import { MessageType } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/appError';
import { successResponse } from '../../utils/response';
import { uploadFileToS3 } from '../../utils/s3Upload';
import type { ChatMessagesQuery, SendMessageInput } from './chat.schema';
import { chatService } from './chat.service';

export const chatController = {
  listMessages: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await chatService.listMessages(request.params.bookingId, request.user, request.query as unknown as ChatMessagesQuery);
    successResponse(response, 200, 'Chat messages retrieved', result);
  },

  sendMessage: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await chatService.sendMessage(request.params.bookingId, request.user, request.body as SendMessageInput);
    successResponse(response, 201, 'Message sent', result);
  },

  uploadImage: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const file = request.file;
    if (file === undefined) {
      throw new AppError('Image file is required', 422, 'IMAGE_FILE_REQUIRED');
    }

    const imageUrl = await uploadFileToS3({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      folder: `chat/${request.params.bookingId}`,
      isPrivate: false,
    });

    const result = await chatService.sendMessage(request.params.bookingId, request.user, {
      type: MessageType.IMAGE,
      imageUrl,
    });
    successResponse(response, 201, 'Image message sent', result);
  },
};

import { Role } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { chatController } from './chat.controller';
import { chatBookingParamsSchema, chatMessagesQuerySchema, sendMessageSchema } from './chat.schema';

export const chatRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

chatRouter.use(authenticate);
chatRouter.use(authorize(Role.CUSTOMER, Role.PROVIDER, Role.ADMIN, Role.SUPER_ADMIN));

chatRouter.get(
  '/:bookingId/messages',
  validate({ params: chatBookingParamsSchema, query: chatMessagesQuerySchema }),
  asyncWrapper(chatController.listMessages),
);

chatRouter.post(
  '/:bookingId/messages',
  validate({ params: chatBookingParamsSchema, body: sendMessageSchema }),
  asyncWrapper(chatController.sendMessage),
);

chatRouter.post(
  '/:bookingId/images',
  upload.single('image'),
  validate({ params: chatBookingParamsSchema }),
  asyncWrapper(chatController.uploadImage),
);

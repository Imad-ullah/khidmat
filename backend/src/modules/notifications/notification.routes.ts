import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { notificationController } from './notification.controller';
import { deviceTokenSchema, notificationIdParamsSchema, notificationListQuerySchema } from './notification.schema';

export const notificationRouter = Router();

notificationRouter.use(authenticate);
notificationRouter.get('/', validate({ query: notificationListQuerySchema }), asyncWrapper(notificationController.listOwn));
notificationRouter.get('/unread-count', asyncWrapper(notificationController.unreadCount));
notificationRouter.post('/device-tokens', validate({ body: deviceTokenSchema }), asyncWrapper(notificationController.upsertDeviceToken));
notificationRouter.patch('/:id/read', validate({ params: notificationIdParamsSchema }), asyncWrapper(notificationController.markRead));

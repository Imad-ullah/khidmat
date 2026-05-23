import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { adminController } from './admin.controller';
import {
  adminBookingListQuerySchema,
  adminIdParamsSchema,
  adminListQuerySchema,
  adminUserListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  updateUserStatusSchema,
} from './admin.schema';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(authorize(Role.ADMIN, Role.SUPER_ADMIN));

adminRouter.get('/dashboard', asyncWrapper(adminController.dashboard));
adminRouter.get('/bookings', validate({ query: adminBookingListQuerySchema }), asyncWrapper(adminController.listBookings));
adminRouter.get('/users', validate({ query: adminUserListQuerySchema }), asyncWrapper(adminController.listUsers));
adminRouter.patch('/users/:id/status', validate({ params: adminIdParamsSchema, body: updateUserStatusSchema }), asyncWrapper(adminController.updateUserStatus));
adminRouter.get('/categories', validate({ query: adminListQuerySchema }), asyncWrapper(adminController.listCategories));
adminRouter.post('/categories', validate({ body: createCategorySchema }), asyncWrapper(adminController.createCategory));
adminRouter.patch('/categories/:id', validate({ params: adminIdParamsSchema, body: updateCategorySchema }), asyncWrapper(adminController.updateCategory));
adminRouter.get('/audit-logs', validate({ query: adminListQuerySchema }), asyncWrapper(adminController.listAuditLogs));

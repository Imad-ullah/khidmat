import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { adminDisputeListQuerySchema, createDisputeSchema, disputeIdParamsSchema, resolveDisputeSchema } from './dispute.schema';
import { disputeController } from './dispute.controller';

export const disputeRouter = Router();
export const adminDisputeRouter = Router();

disputeRouter.post('/', authenticate, authorize(Role.CUSTOMER), validate({ body: createDisputeSchema }), asyncWrapper(disputeController.create));

adminDisputeRouter.get('/disputes', authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), validate({ query: adminDisputeListQuerySchema }), asyncWrapper(disputeController.listAdmin));
adminDisputeRouter.patch('/disputes/:id/resolve', authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), validate({ params: disputeIdParamsSchema, body: resolveDisputeSchema }), asyncWrapper(disputeController.resolve));

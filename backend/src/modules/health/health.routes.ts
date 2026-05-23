import { Router } from 'express';
import { pingRedis } from '../../config/redis';
import { checkDatabaseConnection } from '../../prisma/client';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { successResponse } from '../../utils/response';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncWrapper(async (_request, response) => {
    const [dbStatus, redisStatus] = await Promise.all([checkDatabaseConnection(), pingRedis()]);

    successResponse(response, 200, 'KhidmatApp API is healthy', {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dbStatus,
      redisStatus,
    });
  }),
);

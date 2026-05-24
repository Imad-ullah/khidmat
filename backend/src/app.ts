import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env, isProduction } from './config/env';
import { stream } from './config/logger';
import { initSentry } from './config/sentry';
import { errorHandler } from './middleware/errorHandler';
import { globalRateLimiter } from './middleware/rateLimiter';
import { notFoundHandler } from './middleware/notFoundHandler';
import { authRouter } from './modules/auth/auth.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { bookingRouter } from './modules/bookings/booking.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { adminDisputeRouter, disputeRouter } from './modules/disputes/dispute.routes';
import { healthRouter } from './modules/health/health.routes';
import { jobPostRouter } from './modules/job-posts/jobPost.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { adminProviderRouter, providerRouter } from './modules/providers/provider.routes';
import { providerReviewRouter, reviewRouter } from './modules/reviews/review.routes';
import { AppError } from './utils/appError';

export const createApp = (): Express => {
  initSentry();

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json());
  app.use(morgan(isProduction ? 'combined' : 'dev', { stream }));
  app.use(globalRateLimiter);

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/bookings', bookingRouter);
  app.use('/api/v1/chat', chatRouter);
  app.use('/api/v1/disputes', disputeRouter);
  app.use('/api/v1/job-posts', jobPostRouter);
  app.use('/api/v1/notifications', notificationRouter);
  app.use('/api/v1/providers', providerRouter);
  app.use('/api/v1/providers', providerReviewRouter);
  app.use('/api/v1/reviews', reviewRouter);
  app.use('/api/v1/admin', adminProviderRouter);
  app.use('/api/v1/admin', adminDisputeRouter);
  app.get('/api/v1/sentry-test', (request, _response, next) => {
    if (env.sentryTestToken === undefined || request.header('x-sentry-test-token') !== env.sentryTestToken) {
      next(new AppError('Not found', 404, 'NOT_FOUND'));
      return;
    }

    next(new Error('KhidmatApp Sentry production smoke test'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

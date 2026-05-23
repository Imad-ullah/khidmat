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
import { healthRouter } from './modules/health/health.routes';

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

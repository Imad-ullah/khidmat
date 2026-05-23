import * as Sentry from '@sentry/node';
import { env, isProduction } from './env';

export const initSentry = (): void => {
  if (env.sentryDsn === undefined || env.sentryDsn.trim() === '') {
    return;
  }

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    enabled: isProduction,
  });
};

export const captureException = (error: unknown): void => {
  if (isProduction) {
    Sentry.captureException(error);
  }
};

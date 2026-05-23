import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  awsRegion: process.env.AWS_REGION ?? 'ap-south-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sentryDsn: process.env.SENTRY_DSN,
};

export const isProduction = env.nodeEnv === 'production';

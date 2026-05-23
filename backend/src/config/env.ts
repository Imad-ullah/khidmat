import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '4000', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'development_access_secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'development_refresh_secret',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  bcryptSaltRounds: Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? process.env.FCM_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? process.env.FCM_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY ?? process.env.FCM_PRIVATE_KEY,
  awsRegion: process.env.AWS_REGION ?? 'ap-south-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sentryDsn: process.env.SENTRY_DSN,
};

export const isProduction = env.nodeEnv === 'production';

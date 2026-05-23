import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

export const pingRedis = async (): Promise<'connected' | 'unavailable'> => {
  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }

    await redis.ping();
    return 'connected';
  } catch {
    return 'unavailable';
  }
};

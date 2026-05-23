import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

export const pingRedis = async (): Promise<'connected' | 'unavailable'> => {
  try {
    await Promise.race([
      (async () => {
        if (redis.status === 'wait') {
          await redis.connect();
        }

        await redis.ping();
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis ping timed out')), 1000);
      }),
    ]);
    return 'connected';
  } catch {
    return 'unavailable';
  }
};

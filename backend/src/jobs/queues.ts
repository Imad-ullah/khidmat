import { Queue } from 'bullmq';
import { env } from '../config/env';

const createQueue = (name: string): Queue => {
  if (env.nodeEnv === 'test') {
    return {
      add: async () => undefined,
      close: async () => undefined,
    } as unknown as Queue;
  }

  const redisUrl = new URL(env.redisUrl);
  const connection = {
    host: redisUrl.hostname,
    port: Number.parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    maxRetriesPerRequest: null,
  };

  return new Queue(name, {
    connection,
  });
};

export const notificationQueue = createQueue('notifications');
export const systemJobsQueue = createQueue('system-jobs');

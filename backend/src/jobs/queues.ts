import { Queue } from 'bullmq';
import { env } from '../config/env';

const redisUrl = new URL(env.redisUrl);
const connection = {
  host: redisUrl.hostname,
  port: Number.parseInt(redisUrl.port || '6379', 10),
  password: redisUrl.password || undefined,
  maxRetriesPerRequest: null,
};

export const notificationQueue = new Queue('notifications', {
  connection,
});

export const systemJobsQueue = new Queue('system-jobs', {
  connection,
});

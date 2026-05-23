import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { createChatSocketServer } from './socket/chatSocket';

const app = createApp();
const server = createServer(app);
createChatSocketServer(server);

server.listen(env.port, () => {
  logger.info('KhidmatApp API server started', {
    port: env.port,
    nodeEnv: env.nodeEnv,
  });
});

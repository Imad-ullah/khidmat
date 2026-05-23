import winston from 'winston';
import { isProduction } from './env';

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

export const stream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

import rateLimit from 'express-rate-limit';
import { errorResponse } from '../utils/response';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response): void => {
    errorResponse(response, 429, 'Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED');
  },
});

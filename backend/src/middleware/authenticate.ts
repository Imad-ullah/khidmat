import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AccountStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/appError';

type AccessTokenPayload = {
  sub: string;
  role: string;
  status: string;
};

const isAccessTokenPayload = (payload: string | jwt.JwtPayload): payload is jwt.JwtPayload & AccessTokenPayload => {
  return typeof payload !== 'string' && typeof payload.sub === 'string';
};

export const authenticate: RequestHandler = async (request, _response, next) => {
  try {
    const header = request.headers.authorization;

    if (header === undefined || !header.startsWith('Bearer ')) {
      next(new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED'));
      return;
    }

    const token = header.slice('Bearer '.length);
    const payload = jwt.verify(token, env.jwtAccessSecret);

    if (!isAccessTokenPayload(payload)) {
      next(new AppError('Invalid access token', 401, 'INVALID_ACCESS_TOKEN'));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });

    if (user === null || user.status === AccountStatus.DELETED) {
      next(new AppError('Invalid access token', 401, 'INVALID_ACCESS_TOKEN'));
      return;
    }

    if (user.status === AccountStatus.SUSPENDED) {
      next(new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED'));
      return;
    }

    request.user = user;
    next();
  } catch {
    next(new AppError('Invalid or expired access token', 401, 'INVALID_ACCESS_TOKEN'));
  }
};

import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AccountStatus, Role } from '@prisma/client';
import { env } from '../../config/env';
import { firebaseAuth } from '../../config/firebase';
import { redis } from '../../config/redis';
import { AppError } from '../../utils/appError';
import type { LoginInput, LogoutInput, RefreshInput, RegisterInput, SendOtpInput, VerifyOtpInput } from './auth.schema';
import { authRepository, type AuthUser } from './auth.repository';

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type PublicUser = {
  id: string;
  phone: string;
  email: string | null;
  role: Role;
  status: AccountStatus;
};

type AuthResult = {
  user: PublicUser;
  tokens: AuthTokens;
};

const toPublicUser = (user: AuthUser): PublicUser => ({
  id: user.id,
  phone: user.phone,
  email: user.email,
  role: user.role,
  status: user.status,
});

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const createAccessToken = (user: AuthUser): string => {
  return jwt.sign(
    {
      role: user.role,
      status: user.status,
    },
    env.jwtAccessSecret,
    {
      subject: user.id,
      expiresIn: env.jwtAccessExpiresIn,
      jwtid: randomUUID(),
    },
  );
};

const createRefreshToken = (user: AuthUser): string => {
  return jwt.sign(
    {
      role: user.role,
    },
    env.jwtRefreshSecret,
    {
      subject: user.id,
      expiresIn: env.jwtRefreshExpiresIn,
      jwtid: randomUUID(),
    },
  );
};

const issueTokens = async (user: AuthUser): Promise<AuthTokens> => {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  await authRepository.storeRefreshToken({
    token: refreshToken,
    userId: user.id,
    expiresAt: addDays(new Date(), 7),
  });

  return {
    accessToken,
    refreshToken,
  };
};

const assertOtpAttemptAllowed = async (phone: string): Promise<void> => {
  if (env.nodeEnv === 'test' || env.nodeEnv === 'development') {
    return;
  }

  try {
    const key = `otp:attempts:${phone}`;
    const attempts = await redis.incr(key);

    if (attempts === 1) {
      await redis.expire(key, 10 * 60);
    }

    if (attempts > 3) {
      throw new AppError('Too many OTP verification attempts', 429, 'OTP_ATTEMPTS_EXCEEDED');
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
  }
};

const verifyOtpCode = async (input: VerifyOtpInput): Promise<void> => {
  await assertOtpAttemptAllowed(input.phone);

  if (input.firebaseIdToken !== undefined) {
    const decodedToken = await firebaseAuth().verifyIdToken(input.firebaseIdToken);
    const firebasePhoneNumber = decodedToken.phone_number;

    if (firebasePhoneNumber !== input.phone) {
      throw new AppError('Firebase token phone number does not match request phone', 401, 'PHONE_TOKEN_MISMATCH');
    }

    return;
  }

  if (env.nodeEnv !== 'production') {
    if (input.code !== '123456') {
      throw new AppError('Invalid OTP code', 401, 'INVALID_OTP');
    }

    return;
  }

  throw new AppError('Firebase ID token is required in production', 422, 'FIREBASE_TOKEN_REQUIRED');
};

const ensureActiveForLogin = (user: AuthUser): void => {
  if (user.status === AccountStatus.SUSPENDED) {
    throw new AppError('Account is suspended', 403, 'ACCOUNT_SUSPENDED');
  }

  if (user.status === AccountStatus.DELETED) {
    throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }
};

export const authService = {
  sendOtp: async (input: SendOtpInput): Promise<{ phone: string; devOtp?: string }> => {
    return {
      phone: input.phone,
      devOtp: env.nodeEnv === 'production' ? undefined : '123456',
    };
  },

  verifyOtp: async (input: VerifyOtpInput): Promise<AuthResult> => {
    await verifyOtpCode(input);

    const user = (await authRepository.findUserByPhone(input.phone)) ?? (await authRepository.createPendingCustomerUser(input.phone));
    ensureActiveForLogin(user);
    const tokens = await issueTokens(user);

    return {
      user: toPublicUser(user),
      tokens,
    };
  },

  register: async (input: RegisterInput): Promise<AuthResult> => {
    const passwordHash = input.password === undefined ? undefined : await bcrypt.hash(input.password, env.bcryptSaltRounds);
    const status = input.role === Role.CUSTOMER ? AccountStatus.ACTIVE : AccountStatus.PENDING_VERIFICATION;

    const user = await authRepository.completeRegistration({
      phone: input.phone,
      email: input.email,
      passwordHash,
      role: input.role,
      status,
      fullName: input.fullName,
      displayName: input.displayName,
      city: input.city,
      address: input.address,
    });
    const tokens = await issueTokens(user);

    return {
      user: toPublicUser(user),
      tokens,
    };
  },

  login: async (input: LoginInput): Promise<AuthResult> => {
    const user = input.phone !== undefined
      ? await authRepository.findUserByPhone(input.phone)
      : await authRepository.findUserByEmail(input.email ?? '');

    if (user === null || user.passwordHash === null || user.passwordHash === undefined) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new AppError('Admin login is required for this endpoint', 403, 'ADMIN_LOGIN_REQUIRED');
    }

    ensureActiveForLogin(user);

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const tokens = await issueTokens(user);

    return {
      user: toPublicUser(user),
      tokens,
    };
  },

  refresh: async (input: RefreshInput): Promise<AuthResult> => {
    try {
      jwt.verify(input.refreshToken, env.jwtRefreshSecret);
    } catch {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    const storedToken = await authRepository.findRefreshToken(input.refreshToken);

    if (storedToken === null || storedToken.revokedAt !== null || storedToken.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }

    ensureActiveForLogin(storedToken.user);

    await authRepository.revokeRefreshToken(input.refreshToken);
    const tokens = await issueTokens(storedToken.user);

    return {
      user: toPublicUser(storedToken.user),
      tokens,
    };
  },

  logout: async (input: LogoutInput): Promise<{ revoked: true }> => {
    await authRepository.revokeRefreshToken(input.refreshToken);
    return { revoked: true };
  },
};

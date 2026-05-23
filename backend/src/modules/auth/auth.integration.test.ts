import bcrypt from 'bcrypt';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AccountStatus, Role } from '@prisma/client';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { authorize } from '../../middleware/authorize';
import { authenticate } from '../../middleware/authenticate';
import { errorHandler } from '../../middleware/errorHandler';
import { prisma } from '../../prisma/client';

type AuthResponseBody = {
  success: boolean;
  data: {
    user: {
      id: string;
      phone: string;
      role: Role;
      status: AccountStatus;
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
  };
  error: null | {
    code: string;
  };
};

const app = createApp();

const clearAuthData = async (): Promise<void> => {
  await prisma.notification.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.user.deleteMany();
};

beforeEach(async () => {
  await clearAuthData();
});

afterAll(async () => {
  await clearAuthData();
  await prisma.$disconnect();
});

describe('auth module', () => {
  it('returns a development OTP without sending paid SMS', async () => {
    const response = await request(app).post('/api/v1/auth/otp/send').send({
      phone: '+923001234567',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        phone: '+923001234567',
        devOtp: '123456',
      },
    });
  });

  it('verifies OTP and issues access and refresh tokens for a new user', async () => {
    const response = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001234567',
      code: '123456',
    });
    const body = response.body as AuthResponseBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.phone).toBe('+923001234567');
    expect(body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(body.data.tokens.refreshToken).toEqual(expect.any(String));
  });

  it('rejects malformed OTP requests with a 422 envelope', async () => {
    const response = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '0300',
      code: '12',
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid development OTP code', async () => {
    const response = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001234572',
      code: '000000',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_OTP');
  });

  it('registers a customer and creates the customer profile', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      phone: '+923001234573',
      password: 'customerpass123',
      role: Role.CUSTOMER,
      fullName: 'Test Customer',
      city: 'Mardan',
      address: 'Canal Road',
    });
    const body = response.body as AuthResponseBody;

    expect(response.status).toBe(201);
    expect(body.data.user.status).toBe(AccountStatus.ACTIVE);

    const customer = await prisma.customer.findFirst({
      where: {
        user: {
          phone: '+923001234573',
        },
      },
    });

    expect(customer?.fullName).toBe('Test Customer');
  });

  it('registers a provider in pending verification state', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      phone: '+923001234574',
      password: 'providerpass123',
      role: Role.PROVIDER,
      displayName: 'Test Ustaad',
      city: 'Mardan',
    });
    const body = response.body as AuthResponseBody;

    expect(response.status).toBe(201);
    expect(body.data.user.status).toBe(AccountStatus.PENDING_VERIFICATION);

    const provider = await prisma.provider.findFirst({
      where: {
        user: {
          phone: '+923001234574',
        },
      },
    });

    expect(provider?.displayName).toBe('Test Ustaad');
  });

  it('rotates refresh tokens and rejects the old token', async () => {
    const verifyResponse = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001234568',
      code: '123456',
    });
    const verifyBody = verifyResponse.body as AuthResponseBody;

    const refreshResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: verifyBody.data.tokens.refreshToken,
    });
    const refreshBody = refreshResponse.body as AuthResponseBody;

    expect(refreshResponse.status).toBe(200);
    expect(refreshBody.data.tokens.refreshToken).not.toBe(verifyBody.data.tokens.refreshToken);

    const reusedResponse = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken: verifyBody.data.tokens.refreshToken,
    });

    expect(reusedResponse.status).toBe(401);
    expect(reusedResponse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a JWT signed with the wrong secret', async () => {
    const user = await prisma.user.create({
      data: {
        phone: '+923001234569',
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      },
    });
    const wrongToken = jwt.sign({ role: Role.CUSTOMER, status: AccountStatus.ACTIVE }, 'wrong_secret', {
      subject: user.id,
      expiresIn: '15m',
    });

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${wrongToken}`)
      .send({ refreshToken: 'a'.repeat(32) });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('logs out by revoking the supplied refresh token', async () => {
    const verifyResponse = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001234575',
      code: '123456',
    });
    const verifyBody = verifyResponse.body as AuthResponseBody;

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${verifyBody.data.tokens.accessToken}`)
      .send({ refreshToken: verifyBody.data.tokens.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.data.revoked).toBe(true);

    const storedToken = await prisma.refreshToken.findUnique({
      where: {
        token: verifyBody.data.tokens.refreshToken,
      },
    });

    expect(storedToken?.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects users without an allowed role before protected handlers run', async () => {
    const protectedApp = express();
    protectedApp.use(express.json());
    protectedApp.get('/admin-only', authenticate, authorize(Role.ADMIN), (_request, response) => {
      response.status(200).json({ ok: true });
    });
    protectedApp.use(errorHandler);

    const verifyResponse = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001234570',
      code: '123456',
    });
    const verifyBody = verifyResponse.body as AuthResponseBody;

    const response = await request(protectedApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${verifyBody.data.tokens.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows active admins to login with phone and password', async () => {
    const passwordHash = await bcrypt.hash('adminpass123', env.bcryptSaltRounds);
    await prisma.user.create({
      data: {
        phone: '+923001234571',
        email: 'admin@khidmatapp.test',
        passwordHash,
        role: Role.ADMIN,
        status: AccountStatus.ACTIVE,
      },
    });

    const response = await request(app).post('/api/v1/auth/login').send({
      phone: '+923001234571',
      password: 'adminpass123',
    });
    const body = response.body as AuthResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.user.role).toBe(Role.ADMIN);
    expect(body.data.tokens.accessToken).toEqual(expect.any(String));
  });

  it('rejects non-admin users on the admin password login endpoint', async () => {
    const passwordHash = await bcrypt.hash('customerpass123', env.bcryptSaltRounds);
    await prisma.user.create({
      data: {
        phone: '+923001234576',
        passwordHash,
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
      },
    });

    const response = await request(app).post('/api/v1/auth/login').send({
      phone: '+923001234576',
      password: 'customerpass123',
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ADMIN_LOGIN_REQUIRED');
  });

  it('rejects suspended users during OTP login', async () => {
    await prisma.user.create({
      data: {
        phone: '+923001234577',
        role: Role.CUSTOMER,
        status: AccountStatus.SUSPENDED,
      },
    });

    const response = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001234577',
      code: '123456',
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

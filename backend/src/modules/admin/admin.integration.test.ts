import bcrypt from 'bcrypt';
import request from 'supertest';
import { AccountStatus, BookingStatus, Role, VerificationStatus } from '@prisma/client';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { prisma } from '../../prisma/client';

type AuthResponseBody = {
  data: {
    tokens: {
      accessToken: string;
    };
  };
};

const app = createApp();

const clearData = async (): Promise<void> => {
  await prisma.notification.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.review.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobPost.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.providerService.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
};

const createAdminToken = async (): Promise<string> => {
  const passwordHash = await bcrypt.hash('adminpass123', env.bcryptSaltRounds);
  await prisma.user.create({
    data: {
      phone: '+923001110001',
      email: 'admin@khidmatapp.test',
      passwordHash,
      role: Role.ADMIN,
      status: AccountStatus.ACTIVE,
    },
  });

  const response = await request(app).post('/api/v1/auth/login').send({
    email: 'admin@khidmatapp.test',
    password: 'adminpass123',
  });
  const body = response.body as AuthResponseBody;
  return body.data.tokens.accessToken;
};

const seedOperationalData = async () => {
  const category = await prisma.serviceCategory.create({
    data: {
      name: 'Electrician',
      slug: 'electrician',
    },
  });
  const customerUser = await prisma.user.create({
    data: {
      phone: '+923001110002',
      role: Role.CUSTOMER,
      status: AccountStatus.ACTIVE,
      customer: { create: { fullName: 'Admin Customer', city: 'Mardan' } },
    },
    include: { customer: true },
  });
  const providerUser = await prisma.user.create({
    data: {
      phone: '+923001110003',
      role: Role.PROVIDER,
      status: AccountStatus.ACTIVE,
      provider: {
        create: {
          displayName: 'Admin Provider',
          city: 'Mardan',
          verificationStatus: VerificationStatus.PENDING_ADMIN_REVIEW,
        },
      },
    },
    include: { provider: true },
  });

  await prisma.booking.create({
    data: {
      customerId: customerUser.customer?.id ?? '',
      providerId: providerUser.provider?.id,
      categoryId: category.id,
      bookingType: 'DIRECT',
      status: BookingStatus.CONFIRMED,
      description: 'Admin visible booking',
      proofPhotoUrls: [],
    },
  });

  return { category, customerUser, providerUser };
};

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('admin module', () => {
  it('supports email login and core admin management endpoints', async () => {
    const token = await createAdminToken();
    const { category, customerUser, providerUser } = await seedOperationalData();

    const dashboard = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${token}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.kpis.users).toBeGreaterThanOrEqual(3);
    expect(dashboard.body.data.kpis.providersPending).toBe(1);

    const bookings = await request(app).get('/api/v1/admin/bookings').set('Authorization', `Bearer ${token}`);
    expect(bookings.status).toBe(200);
    expect(bookings.body.data.bookings).toHaveLength(1);

    const users = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    expect(users.status).toBe(200);
    expect(users.body.data.users.length).toBeGreaterThanOrEqual(3);

    await request(app)
      .patch(`/api/v1/admin/users/${customerUser.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: AccountStatus.SUSPENDED })
      .expect(200);

    const categories = await request(app).get('/api/v1/admin/categories').set('Authorization', `Bearer ${token}`);
    expect(categories.status).toBe(200);
    expect(categories.body.data.categories[0].id).toBe(category.id);

    await request(app)
      .patch(`/api/v1/admin/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);

    await request(app).patch(`/api/v1/admin/providers/${providerUser.provider?.id}/verify`).set('Authorization', `Bearer ${token}`).send({}).expect(200);

    const auditLogs = await request(app).get('/api/v1/admin/audit-logs').set('Authorization', `Bearer ${token}`);
    expect(auditLogs.status).toBe(200);
    expect(auditLogs.body.data.auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('blocks non-admin users from admin endpoints', async () => {
    await prisma.user.create({
      data: {
        phone: '+923001110004',
        role: Role.CUSTOMER,
        status: AccountStatus.ACTIVE,
        customer: { create: { fullName: 'Blocked Customer', city: 'Mardan' } },
      },
    });

    const verifyResponse = await request(app).post('/api/v1/auth/otp/verify').send({
      phone: '+923001110004',
      code: '123456',
    });
    const body = verifyResponse.body as AuthResponseBody;

    await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${body.data.tokens.accessToken}`).expect(403);
  });
});

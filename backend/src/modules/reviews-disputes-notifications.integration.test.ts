import bcrypt from 'bcrypt';
import request from 'supertest';
import { AccountStatus, BookingStatus, DisputeStatus, NotificationEvent, Role, VerificationStatus } from '@prisma/client';
import { createApp } from '../app';
import { env } from '../config/env';
import { autoSuspendProvidersWithOpenDisputes } from '../jobs/systemJobs';
import { prisma } from '../prisma/client';

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

const createCategory = async () => {
  return prisma.serviceCategory.create({
    data: {
      name: 'Electrician',
      slug: `electrician-${Date.now()}`,
    },
  });
};

const registerCustomer = async (phone: string): Promise<{ token: string; customerId: string; userId: string }> => {
  const response = await request(app).post('/api/v1/auth/register').send({
    phone,
    password: 'customerpass123',
    role: Role.CUSTOMER,
    fullName: 'Review Customer',
    city: 'Mardan',
  });
  const body = response.body as AuthResponseBody;
  const user = await prisma.user.findUniqueOrThrow({ where: { phone }, include: { customer: true } });

  return {
    token: body.data.tokens.accessToken,
    customerId: user.customer?.id ?? '',
    userId: user.id,
  };
};

const registerVerifiedProvider = async (phone: string, categoryId: string): Promise<{ token: string; providerId: string; userId: string }> => {
  const response = await request(app).post('/api/v1/auth/register').send({
    phone,
    password: 'providerpass123',
    role: Role.PROVIDER,
    displayName: 'Review Ustaad',
    city: 'Mardan',
  });
  const body = response.body as AuthResponseBody;
  const user = await prisma.user.findUniqueOrThrow({ where: { phone }, include: { provider: true } });
  const providerId = user.provider?.id ?? '';

  await prisma.provider.update({
    where: { id: providerId },
    data: {
      verificationStatus: VerificationStatus.VERIFIED,
      isAvailable: true,
      user: {
        update: {
          status: AccountStatus.ACTIVE,
        },
      },
    },
  });

  await prisma.providerService.create({
    data: {
      providerId,
      categoryId,
      priceRangeMin: 500,
      priceRangeMax: 2000,
      description: 'Electrical work',
    },
  });

  return {
    token: body.data.tokens.accessToken,
    providerId,
    userId: user.id,
  };
};

const createAdmin = async (): Promise<{ token: string; userId: string }> => {
  const passwordHash = await bcrypt.hash('adminpass123', env.bcryptSaltRounds);
  const user = await prisma.user.create({
    data: {
      phone: '+923009990001',
      passwordHash,
      role: Role.ADMIN,
      status: AccountStatus.ACTIVE,
    },
  });

  const response = await request(app).post('/api/v1/auth/login').send({
    phone: user.phone,
    password: 'adminpass123',
  });
  const body = response.body as AuthResponseBody;

  return {
    token: body.data.tokens.accessToken,
    userId: user.id,
  };
};

const createBooking = async (status: BookingStatus, closedAt = new Date()) => {
  const category = await createCategory();
  const customer = await registerCustomer('+923009990002');
  const provider = await registerVerifiedProvider('+923009990003', category.id);

  const booking = await prisma.booking.create({
    data: {
      customerId: customer.customerId,
      providerId: provider.providerId,
      categoryId: category.id,
      bookingType: 'DIRECT',
      status,
      description: 'Completed booking',
      completedAt: closedAt,
      closedAt: status === BookingStatus.CLOSED ? closedAt : null,
      proofPhotoUrls: ['https://example.com/proof.jpg'],
    },
  });

  return {
    booking,
    customer,
    provider,
    category,
  };
};

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('reviews, disputes, and notifications', () => {
  it('creates one review per closed booking and recalculates provider rating', async () => {
    const { booking, customer, provider } = await createBooking(BookingStatus.CLOSED);

    const response = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bookingId: booking.id,
        rating: 5,
        comment: 'Excellent work',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.rating).toBe(5);

    const duplicateResponse = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bookingId: booking.id,
        rating: 4,
      });

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.error.code).toBe('REVIEW_ALREADY_EXISTS');

    await expect(prisma.provider.findUniqueOrThrow({ where: { id: provider.providerId } })).resolves.toMatchObject({
      averageRating: 5,
      totalReviews: 1,
    });
  });

  it('files disputes only within 24 hours and notifies admins', async () => {
    const admin = await createAdmin();
    const { booking, customer } = await createBooking(BookingStatus.COMPLETED);

    const response = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bookingId: booking.id,
        reason: 'The provider did not finish the agreed work.',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe(DisputeStatus.OPEN);

    await expect(prisma.notification.findFirst({ where: { userId: admin.userId, event: NotificationEvent.DISPUTE_FILED } })).resolves.toMatchObject({
      title: 'New dispute filed',
    });
  });

  it('rejects disputes after the 24 hour filing window', async () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const { booking, customer } = await createBooking(BookingStatus.COMPLETED, oldDate);

    const response = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bookingId: booking.id,
        reason: 'This complaint is too late for the dispute window.',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DISPUTE_WINDOW_EXPIRED');
  });

  it('lets admins list and resolve disputes with an audit log', async () => {
    const admin = await createAdmin();
    const { booking, customer } = await createBooking(BookingStatus.COMPLETED);

    const createResponse = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bookingId: booking.id,
        reason: 'The job quality needs admin review.',
      });

    const disputeId = createResponse.body.data.id as string;

    const listResponse = await request(app).get('/api/v1/admin/disputes').set('Authorization', `Bearer ${admin.token}`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.disputes).toHaveLength(1);

    const resolveResponse = await request(app)
      .patch(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        resolution: 'NO_ACTION',
        resolutionNote: 'Reviewed evidence and no action is required.',
      });

    expect(resolveResponse.status).toBe(200);
    expect(resolveResponse.body.data.status).toBe(DisputeStatus.RESOLVED);
    await expect(prisma.auditLog.findFirst({ where: { adminId: admin.userId, action: 'DISPUTE_RESOLVED' } })).resolves.toBeTruthy();
  });

  it('stores notifications, unread counts, read state, and device tokens', async () => {
    const { booking, customer, provider } = await createBooking(BookingStatus.CLOSED);

    await request(app)
      .post('/api/v1/notifications/device-tokens')
      .set('Authorization', `Bearer ${provider.token}`)
      .send({
        token: 'provider-device-token-12345',
        platform: 'android',
      })
      .expect(200);

    await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        bookingId: booking.id,
        rating: 4,
      })
      .expect(201);

    const unreadResponse = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${provider.token}`);
    expect(unreadResponse.body.data.unreadCount).toBe(1);

    const listResponse = await request(app).get('/api/v1/notifications').set('Authorization', `Bearer ${provider.token}`);
    const notificationId = listResponse.body.data.notifications[0].id as string;

    await request(app).patch(`/api/v1/notifications/${notificationId}/read`).set('Authorization', `Bearer ${provider.token}`).expect(200);
    const finalUnreadResponse = await request(app).get('/api/v1/notifications/unread-count').set('Authorization', `Bearer ${provider.token}`);
    expect(finalUnreadResponse.body.data.unreadCount).toBe(0);
  });

  it('auto-suspends providers with three open disputes', async () => {
    const category = await createCategory();
    const provider = await registerVerifiedProvider('+923009990004', category.id);
    const customer = await registerCustomer('+923009990005');

    for (let index = 0; index < 3; index += 1) {
      const booking = await prisma.booking.create({
        data: {
          customerId: customer.customerId,
          providerId: provider.providerId,
          categoryId: category.id,
          bookingType: 'DIRECT',
          status: BookingStatus.COMPLETED,
          description: `Disputed booking ${index}`,
          completedAt: new Date(),
          proofPhotoUrls: [],
        },
      });

      await prisma.dispute.create({
        data: {
          bookingId: booking.id,
          customerId: customer.customerId,
          providerId: provider.providerId,
          reason: `Open dispute ${index}`,
        },
      });
    }

    expect(await autoSuspendProvidersWithOpenDisputes()).toBe(1);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: provider.userId } })).resolves.toMatchObject({
      status: AccountStatus.SUSPENDED,
    });
  });
});

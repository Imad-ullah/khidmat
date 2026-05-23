import request from 'supertest';
import { AccountStatus, BookingStatus, Role, VerificationStatus } from '@prisma/client';
import { createApp } from '../../app';
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
    fullName: 'Chat Customer',
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
    displayName: 'Chat Ustaad',
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

const createConfirmedBooking = async () => {
  const category = await createCategory();
  const customer = await registerCustomer('+923008880001');
  const provider = await registerVerifiedProvider('+923008880002', category.id);

  const createResponse = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.token}`)
    .send({
      providerId: provider.providerId,
      categoryId: category.id,
      description: 'Need switch repair',
    });

  const bookingId = createResponse.body.data.id as string;
  await request(app).patch(`/api/v1/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${provider.token}`).expect(200);

  return {
    bookingId,
    customer,
    provider,
  };
};

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('chat module', () => {
  it('creates a chat room when a provider confirms a booking', async () => {
    const { bookingId } = await createConfirmedBooking();

    await expect(prisma.chatRoom.findUnique({ where: { bookingId } })).resolves.toMatchObject({
      bookingId,
    });
  });

  it('persists and paginates booking-scoped messages', async () => {
    const { bookingId, customer, provider } = await createConfirmedBooking();

    const sendResponse = await request(app)
      .post(`/api/v1/chat/${bookingId}/messages`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        type: 'TEXT',
        body: 'Assalam o alaikum, when can you arrive?',
      });

    expect(sendResponse.status).toBe(201);
    expect(sendResponse.body.data.senderId).toBe(customer.userId);

    const providerListResponse = await request(app)
      .get(`/api/v1/chat/${bookingId}/messages?limit=50`)
      .set('Authorization', `Bearer ${provider.token}`);

    expect(providerListResponse.status).toBe(200);
    expect(providerListResponse.body.data.messages).toHaveLength(1);
    expect(providerListResponse.body.data.messages[0]).toMatchObject({
      body: 'Assalam o alaikum, when can you arrive?',
      senderId: customer.userId,
    });
  });

  it('blocks non-participants from chat messages', async () => {
    const { bookingId } = await createConfirmedBooking();
    const outsider = await registerCustomer('+923008880003');

    const response = await request(app)
      .get(`/api/v1/chat/${bookingId}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CHAT_ROOM_NOT_FOUND');
  });

  it('does not allow chat before booking confirmation', async () => {
    const category = await createCategory();
    const customer = await registerCustomer('+923008880004');
    const provider = await registerVerifiedProvider('+923008880005', category.id);

    const booking = await prisma.booking.create({
      data: {
        customerId: customer.customerId,
        providerId: provider.providerId,
        categoryId: category.id,
        bookingType: 'DIRECT',
        status: BookingStatus.PENDING_CONFIRMATION,
        description: 'Not confirmed yet',
        proofPhotoUrls: [],
      },
    });

    const response = await request(app)
      .post(`/api/v1/chat/${booking.id}/messages`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        type: 'TEXT',
        body: 'Hello?',
      });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CHAT_ROOM_NOT_FOUND');
  });
});

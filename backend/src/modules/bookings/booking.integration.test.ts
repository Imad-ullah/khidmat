import request from 'supertest';
import { AccountStatus, BookingStatus, Role, VerificationStatus } from '@prisma/client';
import { createApp } from '../../app';
import { closeCompletedBookings, expireOpenJobPosts, expirePendingBookings } from '../../jobs/systemJobs';
import { prisma } from '../../prisma/client';

type AuthResponseBody = {
  data: {
    tokens: {
      accessToken: string;
    };
  };
};

type BookingResponseBody = {
  data: {
    id: string;
    customerId: string;
    providerId: string | null;
    categoryId: string;
    status: BookingStatus;
    proofPhotoUrls: string[];
  };
};

type JobPostResponseBody = {
  data: {
    id: string;
    bookingId: string;
    status: BookingStatus;
    applications: Array<{
      id: string;
      providerId: string;
      quote: number;
      status: string;
    }>;
  };
};

const app = createApp();

const clearData = async (): Promise<void> => {
  await prisma.notification.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobPost.deleteMany();
  await prisma.chatRoom.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.providerService.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
};

const registerCustomer = async (phone: string): Promise<{ token: string; customerId: string; userId: string }> => {
  const response = await request(app).post('/api/v1/auth/register').send({
    phone,
    password: 'customerpass123',
    role: Role.CUSTOMER,
    fullName: 'Booking Customer',
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
    displayName: 'Booking Ustaad',
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

const createCategory = async () => {
  return prisma.serviceCategory.create({
    data: {
      name: 'Electrician',
      slug: 'electrician',
    },
  });
};

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('booking and job post modules', () => {
  it('runs the direct booking lifecycle from create to complete', async () => {
    const category = await createCategory();
    const customer = await registerCustomer('+923007770001');
    const provider = await registerVerifiedProvider('+923007770002', category.id);

    const createResponse = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        providerId: provider.providerId,
        categoryId: category.id,
        description: 'Need fan wiring repaired',
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        totalAmount: 1200,
      });
    const created = createResponse.body as BookingResponseBody;

    expect(createResponse.status).toBe(201);
    expect(created.data.status).toBe(BookingStatus.PENDING_CONFIRMATION);

    const confirmResponse = await request(app).patch(`/api/v1/bookings/${created.data.id}/confirm`).set('Authorization', `Bearer ${provider.token}`);
    expect(confirmResponse.status).toBe(200);
    expect((confirmResponse.body as BookingResponseBody).data.status).toBe(BookingStatus.CONFIRMED);

    const startResponse = await request(app).patch(`/api/v1/bookings/${created.data.id}/start`).set('Authorization', `Bearer ${provider.token}`);
    expect(startResponse.status).toBe(200);
    expect((startResponse.body as BookingResponseBody).data.status).toBe(BookingStatus.IN_PROGRESS);

    const completeResponse = await request(app)
      .patch(`/api/v1/bookings/${created.data.id}/complete`)
      .set('Authorization', `Bearer ${provider.token}`)
      .send({
        proofPhotoUrls: ['https://example.com/proof.jpg'],
        totalAmount: 1200,
      });
    expect(completeResponse.status).toBe(200);
    expect((completeResponse.body as BookingResponseBody).data.status).toBe(BookingStatus.COMPLETED);
  });

  it('enforces customer active booking limit', async () => {
    const category = await createCategory();
    const customer = await registerCustomer('+923007770003');
    const provider = await registerVerifiedProvider('+923007770004', category.id);

    for (let index = 0; index < 3; index += 1) {
      await prisma.booking.create({
        data: {
          customerId: customer.customerId,
          providerId: provider.providerId,
          categoryId: category.id,
          bookingType: 'DIRECT',
          status: BookingStatus.CONFIRMED,
          description: `Existing active booking ${index}`,
          proofPhotoUrls: [],
        },
      });
    }

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        providerId: provider.providerId,
        categoryId: category.id,
        description: 'Need another job booked',
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ACTIVE_BOOKING_LIMIT_REACHED');
  });

  it('allows customers or providers to cancel active bookings', async () => {
    const category = await createCategory();
    const customer = await registerCustomer('+923007770005');
    const provider = await registerVerifiedProvider('+923007770006', category.id);
    const booking = await prisma.booking.create({
      data: {
        customerId: customer.customerId,
        providerId: provider.providerId,
        categoryId: category.id,
        bookingType: 'DIRECT',
        status: BookingStatus.PENDING_CONFIRMATION,
        description: 'Cancel this booking',
        proofPhotoUrls: [],
      },
    });

    const response = await request(app)
      .patch(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        cancellationReason: 'Plans changed',
      });
    const body = response.body as BookingResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.status).toBe(BookingStatus.CANCELLED);
  });

  it('supports job post creation, provider application, and customer selection', async () => {
    const category = await createCategory();
    const customer = await registerCustomer('+923007770007');
    const provider = await registerVerifiedProvider('+923007770008', category.id);

    const createResponse = await request(app)
      .post('/api/v1/job-posts')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        categoryId: category.id,
        title: 'Repair AC wiring',
        description: 'AC wiring needs inspection and repair',
        budgetMin: 1000,
        budgetMax: 3000,
        photoUrls: ['https://example.com/job.jpg'],
      });
    const created = createResponse.body as JobPostResponseBody;

    expect(createResponse.status).toBe(201);
    expect(created.data.status).toBe(BookingStatus.PENDING_CONFIRMATION);

    const listResponse = await request(app).get('/api/v1/job-posts').set('Authorization', `Bearer ${provider.token}`);
    expect(listResponse.status).toBe(200);

    const applyResponse = await request(app)
      .post(`/api/v1/job-posts/${created.data.id}/apply`)
      .set('Authorization', `Bearer ${provider.token}`)
      .send({
        quote: 1800,
        message: 'I can inspect and repair today',
      });

    expect(applyResponse.status).toBe(201);
    const applicationId = applyResponse.body.data.id as string;

    const selectResponse = await request(app)
      .patch(`/api/v1/job-posts/${created.data.id}/select/${applicationId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    const selected = selectResponse.body as JobPostResponseBody;

    expect(selectResponse.status).toBe(200);
    expect(selected.data.status).toBe(BookingStatus.IN_PROGRESS);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.data.bookingId } });
    expect(booking.providerId).toBe(provider.providerId);
    expect(booking.totalAmount).toBe(1800);
  });

  it('expires pending direct bookings, open job posts, and closes completed bookings', async () => {
    const category = await createCategory();
    const customer = await registerCustomer('+923007770009');
    const provider = await registerVerifiedProvider('+923007770010', category.id);
    const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const directBooking = await prisma.booking.create({
      data: {
        customerId: customer.customerId,
        providerId: provider.providerId,
        categoryId: category.id,
        bookingType: 'DIRECT',
        status: BookingStatus.PENDING_CONFIRMATION,
        description: 'Old pending booking',
        createdAt: oldDate,
        proofPhotoUrls: [],
      },
    });

    const jobPost = await prisma.jobPost.create({
      data: {
        title: 'Expired job post',
        budgetMin: 100,
        budgetMax: 200,
        photoUrls: [],
        expiresAt: oldDate,
        booking: {
          create: {
            customerId: customer.customerId,
            categoryId: category.id,
            bookingType: 'JOB_POST',
            status: BookingStatus.PENDING_CONFIRMATION,
            description: 'Expired job post description',
            proofPhotoUrls: [],
          },
        },
      },
    });

    const completedBooking = await prisma.booking.create({
      data: {
        customerId: customer.customerId,
        providerId: provider.providerId,
        categoryId: category.id,
        bookingType: 'DIRECT',
        status: BookingStatus.COMPLETED,
        description: 'Completed long ago',
        completedAt: oldDate,
        proofPhotoUrls: ['https://example.com/proof.jpg'],
      },
    });

    expect(await expirePendingBookings()).toBe(1);
    expect(await expireOpenJobPosts()).toBe(1);
    expect(await closeCompletedBookings()).toBe(1);

    await expect(prisma.booking.findUniqueOrThrow({ where: { id: directBooking.id } })).resolves.toMatchObject({ status: BookingStatus.EXPIRED });
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: jobPost.bookingId } })).resolves.toMatchObject({ status: BookingStatus.EXPIRED });
    await expect(prisma.booking.findUniqueOrThrow({ where: { id: completedBooking.id } })).resolves.toMatchObject({ status: BookingStatus.CLOSED });
  });
});

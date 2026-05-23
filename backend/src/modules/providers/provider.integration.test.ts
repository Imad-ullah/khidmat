import bcrypt from 'bcrypt';
import request from 'supertest';
import { AccountStatus, Role, VerificationStatus } from '@prisma/client';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { prisma } from '../../prisma/client';

type AuthResponseBody = {
  data: {
    user: {
      id: string;
      role: Role;
      status: AccountStatus;
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
    };
  };
};

type ProviderResponseBody = {
  data: {
    id: string;
    userId: string;
    displayName: string;
    verificationStatus: VerificationStatus;
    onboardingStep: number;
    isAvailable: boolean;
    services: Array<{
      categoryId: string;
      priceRangeMin: number;
      priceRangeMax: number;
    }>;
  };
};

type ProviderListResponseBody = {
  data: {
    providers: Array<ProviderResponseBody['data']>;
    page: number;
    limit: number;
  };
};

const app = createApp();

const clearProviderData = async (): Promise<void> => {
  await prisma.notification.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.providerService.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.user.deleteMany();
};

const createCategory = async (): Promise<{ id: string; slug: string }> => {
  return prisma.serviceCategory.create({
    data: {
      name: 'Electrician',
      slug: 'electrician',
    },
    select: {
      id: true,
      slug: true,
    },
  });
};

const registerProvider = async (phone = '+923009990001'): Promise<AuthResponseBody> => {
  const response = await request(app).post('/api/v1/auth/register').send({
    phone,
    password: 'providerpass123',
    role: Role.PROVIDER,
    displayName: 'Test Ustaad',
    city: 'Mardan',
  });

  return response.body as AuthResponseBody;
};

const createAdminToken = async (): Promise<string> => {
  const passwordHash = await bcrypt.hash('adminpass123', env.bcryptSaltRounds);
  await prisma.user.create({
    data: {
      phone: '+923009990099',
      email: 'admin.providers@khidmatapp.test',
      passwordHash,
      role: Role.ADMIN,
      status: AccountStatus.ACTIVE,
    },
  });

  const response = await request(app).post('/api/v1/auth/login').send({
    phone: '+923009990099',
    password: 'adminpass123',
  });
  const body = response.body as AuthResponseBody;

  return body.data.tokens.accessToken;
};

const completeOnboarding = async (accessToken: string, categoryId: string): Promise<ProviderResponseBody['data']> => {
  await request(app)
    .post('/api/v1/providers/onboard/step/1')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      displayName: 'Mardan Electric Ustaad',
      bio: 'Reliable electrical repairs',
      city: 'Mardan',
      address: 'Mall Road',
    })
    .expect(200);

  await request(app)
    .post('/api/v1/providers/onboard/step/2')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      services: [
        {
          categoryId,
          priceRangeMin: 500,
          priceRangeMax: 2500,
          description: 'Home wiring and repair',
        },
      ],
    })
    .expect(200);

  await request(app)
    .post('/api/v1/providers/onboard/step/3')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      cnicNumber: '1234512345671',
      cnicFrontUrl: 'https://example.com/cnic-front.jpg',
      cnicBackUrl: 'https://example.com/cnic-back.jpg',
    })
    .expect(200);

  const submitResponse = await request(app)
    .post('/api/v1/providers/onboard/step/4')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({})
    .expect(200);
  const submitBody = submitResponse.body as ProviderResponseBody;

  return submitBody.data;
};

beforeEach(async () => {
  await clearProviderData();
});

afterAll(async () => {
  await clearProviderData();
  await prisma.$disconnect();
});

describe('provider module', () => {
  it('completes provider onboarding and submits for admin review', async () => {
    const category = await createCategory();
    const auth = await registerProvider();
    const provider = await completeOnboarding(auth.data.tokens.accessToken, category.id);

    expect(provider.displayName).toBe('Mardan Electric Ustaad');
    expect(provider.onboardingStep).toBe(4);
    expect(provider.verificationStatus).toBe(VerificationStatus.PENDING_ADMIN_REVIEW);
    expect(provider.services).toHaveLength(1);
  });

  it('prevents onboarding steps from being completed out of order', async () => {
    const category = await createCategory();
    const auth = await registerProvider('+923009990002');

    const response = await request(app)
      .post('/api/v1/providers/onboard/step/2')
      .set('Authorization', `Bearer ${auth.data.tokens.accessToken}`)
      .send({
        services: [
          {
            categoryId: category.id,
            priceRangeMin: 100,
            priceRangeMax: 200,
          },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ONBOARDING_STEP_OUT_OF_ORDER');
  });

  it('lets admins list and verify pending providers', async () => {
    const category = await createCategory();
    const auth = await registerProvider('+923009990003');
    const provider = await completeOnboarding(auth.data.tokens.accessToken, category.id);
    const adminToken = await createAdminToken();

    const pendingResponse = await request(app)
      .get('/api/v1/admin/providers/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    const pendingBody = pendingResponse.body as ProviderListResponseBody;

    expect(pendingResponse.status).toBe(200);
    expect(pendingBody.data.providers).toHaveLength(1);

    const verifyResponse = await request(app)
      .patch(`/api/v1/admin/providers/${provider.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const verifyBody = verifyResponse.body as ProviderResponseBody;

    expect(verifyResponse.status).toBe(200);
    expect(verifyBody.data.verificationStatus).toBe(VerificationStatus.VERIFIED);

    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: provider.userId,
      },
    });
    expect(user.status).toBe(AccountStatus.ACTIVE);

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'PROVIDER_VERIFIED',
        targetId: provider.id,
      },
    });
    expect(auditLog).not.toBeNull();
  });

  it('lets admins reject pending providers with a reason', async () => {
    const category = await createCategory();
    const auth = await registerProvider('+923009990004');
    const provider = await completeOnboarding(auth.data.tokens.accessToken, category.id);
    const adminToken = await createAdminToken();

    const response = await request(app)
      .patch(`/api/v1/admin/providers/${provider.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rejectionReason: 'CNIC image is not readable',
      });
    const body = response.body as ProviderResponseBody & { data: { rejectionReason: string } };

    expect(response.status).toBe(200);
    expect(body.data.verificationStatus).toBe(VerificationStatus.REJECTED);
    expect(body.data.rejectionReason).toBe('CNIC image is not readable');
  });

  it('lists verified providers publicly and exposes public profiles', async () => {
    const category = await createCategory();
    const auth = await registerProvider('+923009990005');
    const provider = await completeOnboarding(auth.data.tokens.accessToken, category.id);
    const adminToken = await createAdminToken();

    await request(app).patch(`/api/v1/admin/providers/${provider.id}/verify`).set('Authorization', `Bearer ${adminToken}`).send({}).expect(200);

    const listResponse = await request(app).get('/api/v1/providers').query({ category: category.slug, city: 'Mardan' });
    const listBody = listResponse.body as ProviderListResponseBody;

    expect(listResponse.status).toBe(200);
    expect(listBody.data.providers).toHaveLength(1);
    expect(listBody.data.providers[0]?.id).toBe(provider.id);

    const profileResponse = await request(app).get(`/api/v1/providers/${provider.id}`);
    const profileBody = profileResponse.body as ProviderResponseBody;

    expect(profileResponse.status).toBe(200);
    expect(profileBody.data.displayName).toBe('Mardan Electric Ustaad');
  });

  it('allows verified providers to toggle availability', async () => {
    const category = await createCategory();
    const auth = await registerProvider('+923009990006');
    const provider = await completeOnboarding(auth.data.tokens.accessToken, category.id);
    const adminToken = await createAdminToken();

    await request(app).patch(`/api/v1/admin/providers/${provider.id}/verify`).set('Authorization', `Bearer ${adminToken}`).send({}).expect(200);

    const response = await request(app)
      .patch('/api/v1/providers/availability')
      .set('Authorization', `Bearer ${auth.data.tokens.accessToken}`)
      .send({
        isAvailable: true,
      });
    const body = response.body as ProviderResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.isAvailable).toBe(true);
  });

  it('blocks non-admin users from admin provider endpoints', async () => {
    const auth = await registerProvider('+923009990007');

    const response = await request(app)
      .get('/api/v1/admin/providers/pending')
      .set('Authorization', `Bearer ${auth.data.tokens.accessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

import { AccountStatus, Prisma, VerificationStatus } from '@prisma/client';
import { prisma } from '../../prisma/client';
import type { ProviderListQuery, OnboardStepOneInput, OnboardStepTwoInput, OnboardStepThreeInput, AvailabilityInput } from './provider.schema';

const providerInclude = {
  user: {
    select: {
      id: true,
      phone: true,
      email: true,
      status: true,
    },
  },
  services: {
    include: {
      category: true,
    },
  },
} satisfies Prisma.ProviderInclude;

export type ProviderWithRelations = Prisma.ProviderGetPayload<{ include: typeof providerInclude }>;

export const providerRepository = {
  findByUserId: async (userId: string): Promise<ProviderWithRelations | null> => {
    return prisma.provider.findUnique({
      where: { userId },
      include: providerInclude,
    });
  },

  findById: async (id: string): Promise<ProviderWithRelations | null> => {
    return prisma.provider.findUnique({
      where: { id },
      include: providerInclude,
    });
  },

  updateStepOne: async (providerId: string, input: OnboardStepOneInput): Promise<ProviderWithRelations> => {
    return prisma.provider.update({
      where: { id: providerId },
      data: {
        displayName: input.displayName,
        bio: input.bio,
        profilePhotoUrl: input.profilePhotoUrl,
        city: input.city,
        address: input.address,
        onboardingStep: 2,
      },
      include: providerInclude,
    });
  },

  updateStepTwo: async (providerId: string, input: OnboardStepTwoInput): Promise<ProviderWithRelations> => {
    return prisma.$transaction(async (transaction) => {
      await transaction.providerService.deleteMany({
        where: { providerId },
      });

      await transaction.providerService.createMany({
        data: input.services.map((service) => ({
          providerId,
          categoryId: service.categoryId,
          priceRangeMin: service.priceRangeMin,
          priceRangeMax: service.priceRangeMax,
          description: service.description,
        })),
      });

      return transaction.provider.update({
        where: { id: providerId },
        data: {
          onboardingStep: 3,
        },
        include: providerInclude,
      });
    });
  },

  updateStepThree: async (providerId: string, input: OnboardStepThreeInput): Promise<ProviderWithRelations> => {
    return prisma.provider.update({
      where: { id: providerId },
      data: {
        cnicNumber: input.cnicNumber,
        cnicFrontUrl: input.cnicFrontUrl,
        cnicBackUrl: input.cnicBackUrl,
        onboardingStep: 4,
      },
      include: providerInclude,
    });
  },

  submitForReview: async (providerId: string): Promise<ProviderWithRelations> => {
    return prisma.provider.update({
      where: { id: providerId },
      data: {
        verificationStatus: VerificationStatus.PENDING_ADMIN_REVIEW,
        onboardingStep: 4,
      },
      include: providerInclude,
    });
  },

  updateAvailability: async (providerId: string, input: AvailabilityInput): Promise<ProviderWithRelations> => {
    return prisma.provider.update({
      where: { id: providerId },
      data: {
        isAvailable: input.isAvailable,
      },
      include: providerInclude,
    });
  },

  listVerified: async (query: ProviderListQuery, pagination: { skip: number; limit: number }): Promise<ProviderWithRelations[]> => {
    return prisma.provider.findMany({
      where: {
        deletedAt: null,
        verificationStatus: VerificationStatus.VERIFIED,
        city: query.city,
        hasKhidmatBadge: query.badge,
        services: query.category === undefined
          ? undefined
          : {
              some: {
                category: {
                  OR: [{ id: query.category }, { slug: query.category }],
                },
              },
            },
      },
      include: providerInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: [{ hasKhidmatBadge: 'desc' }, { averageRating: 'desc' }, { createdAt: 'desc' }],
    });
  },

  listPending: async (pagination: { skip: number; limit: number }): Promise<ProviderWithRelations[]> => {
    return prisma.provider.findMany({
      where: {
        deletedAt: null,
        verificationStatus: VerificationStatus.PENDING_ADMIN_REVIEW,
      },
      include: providerInclude,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { updatedAt: 'asc' },
    });
  },

  verify: async (providerId: string, adminId: string): Promise<ProviderWithRelations> => {
    return prisma.$transaction(async (transaction) => {
      const provider = await transaction.provider.update({
        where: { id: providerId },
        data: {
          verificationStatus: VerificationStatus.VERIFIED,
          rejectionReason: null,
          user: {
            update: {
              status: AccountStatus.ACTIVE,
            },
          },
        },
        include: providerInclude,
      });

      await transaction.auditLog.create({
        data: {
          adminId,
          action: 'PROVIDER_VERIFIED',
          targetId: providerId,
        },
      });

      return provider;
    });
  },

  reject: async (providerId: string, adminId: string, rejectionReason: string): Promise<ProviderWithRelations> => {
    return prisma.$transaction(async (transaction) => {
      const provider = await transaction.provider.update({
        where: { id: providerId },
        data: {
          verificationStatus: VerificationStatus.REJECTED,
          rejectionReason,
        },
        include: providerInclude,
      });

      await transaction.auditLog.create({
        data: {
          adminId,
          action: 'PROVIDER_REJECTED',
          targetId: providerId,
          metadata: { rejectionReason },
        },
      });

      return provider;
    });
  },
};

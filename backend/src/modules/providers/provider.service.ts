import { NotificationEvent, Role, VerificationStatus } from '@prisma/client';
import { AppError } from '../../utils/appError';
import { getPagination } from '../../utils/pagination';
import { createNotificationPayload, dispatchNotification } from '../notifications/notification.service';
import type { AvailabilityInput, OnboardStepOneInput, OnboardStepThreeInput, OnboardStepTwoInput, ProviderListQuery, RejectProviderInput } from './provider.schema';
import { providerRepository, type ProviderWithRelations } from './provider.repository';

type PublicProvider = {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  city: string;
  address: string | null;
  verificationStatus: VerificationStatus;
  rejectionReason: string | null;
  onboardingStep: number;
  isAvailable: boolean;
  hasKhidmatBadge: boolean;
  averageRating: number;
  totalReviews: number;
  completedJobs: number;
  services: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    categorySlug: string;
    priceRangeMin: number;
    priceRangeMax: number;
    description: string | null;
  }>;
};

const toPublicProvider = (provider: ProviderWithRelations): PublicProvider => ({
  id: provider.id,
  userId: provider.userId,
  displayName: provider.displayName,
  bio: provider.bio,
  profilePhotoUrl: provider.profilePhotoUrl,
  city: provider.city,
  address: provider.address,
  verificationStatus: provider.verificationStatus,
  rejectionReason: provider.rejectionReason,
  onboardingStep: provider.onboardingStep,
  isAvailable: provider.isAvailable,
  hasKhidmatBadge: provider.hasKhidmatBadge,
  averageRating: provider.averageRating,
  totalReviews: provider.totalReviews,
  completedJobs: provider.completedJobs,
  services: provider.services.map((service) => ({
    id: service.id,
    categoryId: service.categoryId,
    categoryName: service.category.name,
    categorySlug: service.category.slug,
    priceRangeMin: service.priceRangeMin,
    priceRangeMax: service.priceRangeMax,
    description: service.description,
  })),
});

const requireProvider = async (userId: string): Promise<ProviderWithRelations> => {
  const provider = await providerRepository.findByUserId(userId);

  if (provider === null) {
    throw new AppError('Provider profile not found', 404, 'PROVIDER_NOT_FOUND');
  }

  return provider;
};

const ensureStep = (requestedStep: number, provider: ProviderWithRelations): void => {
  if (requestedStep > provider.onboardingStep) {
    throw new AppError('Previous onboarding step must be completed first', 409, 'ONBOARDING_STEP_OUT_OF_ORDER');
  }
};

export const providerService = {
  onboard: async (user: { id: string; role: Role }, step: number, body: unknown): Promise<PublicProvider> => {
    if (user.role !== Role.PROVIDER) {
      throw new AppError('Provider role is required', 403, 'PROVIDER_ROLE_REQUIRED');
    }

    const provider = await requireProvider(user.id);
    ensureStep(step, provider);

    if (step === 1) {
      return toPublicProvider(await providerRepository.updateStepOne(provider.id, body as OnboardStepOneInput));
    }

    if (step === 2) {
      return toPublicProvider(await providerRepository.updateStepTwo(provider.id, body as OnboardStepTwoInput));
    }

    if (step === 3) {
      return toPublicProvider(await providerRepository.updateStepThree(provider.id, body as OnboardStepThreeInput));
    }

    return toPublicProvider(await providerRepository.submitForReview(provider.id));
  },

  listVerified: async (query: ProviderListQuery): Promise<{ providers: PublicProvider[]; page: number; limit: number }> => {
    const pagination = getPagination(query);
    const providers = await providerRepository.listVerified(query, pagination);

    return {
      providers: providers.map(toPublicProvider),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  getPublicProfile: async (providerId: string): Promise<PublicProvider> => {
    const provider = await providerRepository.findById(providerId);

    if (provider === null || provider.verificationStatus !== VerificationStatus.VERIFIED || provider.deletedAt !== null) {
      throw new AppError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    }

    return toPublicProvider(provider);
  },

  getOwnProfile: async (userId: string): Promise<PublicProvider> => {
    return toPublicProvider(await requireProvider(userId));
  },

  updateAvailability: async (userId: string, input: AvailabilityInput): Promise<PublicProvider> => {
    const provider = await requireProvider(userId);

    if (provider.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new AppError('Only verified providers can change availability', 403, 'PROVIDER_NOT_VERIFIED');
    }

    return toPublicProvider(await providerRepository.updateAvailability(provider.id, input));
  },

  listPending: async (query: { page?: number; limit?: number }): Promise<{ providers: PublicProvider[]; page: number; limit: number }> => {
    const pagination = getPagination(query);
    const providers = await providerRepository.listPending(pagination);

    return {
      providers: providers.map(toPublicProvider),
      page: pagination.page,
      limit: pagination.limit,
    };
  },

  verify: async (providerId: string, adminId: string): Promise<PublicProvider> => {
    const provider = await providerRepository.findById(providerId);

    if (provider === null) {
      throw new AppError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    }

    if (provider.verificationStatus !== VerificationStatus.PENDING_ADMIN_REVIEW) {
      throw new AppError('Provider is not pending admin review', 409, 'PROVIDER_NOT_PENDING_REVIEW');
    }

    const verified = await providerRepository.verify(providerId, adminId);
    await dispatchNotification(createNotificationPayload({
      userId: verified.userId,
      event: NotificationEvent.ACCOUNT_VERIFIED,
      title: 'Account verified',
      body: 'Your provider account has been verified.',
      data: { providerId: verified.id },
    }));

    return toPublicProvider(verified);
  },

  reject: async (providerId: string, adminId: string, input: RejectProviderInput): Promise<PublicProvider> => {
    const provider = await providerRepository.findById(providerId);

    if (provider === null) {
      throw new AppError('Provider not found', 404, 'PROVIDER_NOT_FOUND');
    }

    if (provider.verificationStatus !== VerificationStatus.PENDING_ADMIN_REVIEW) {
      throw new AppError('Provider is not pending admin review', 409, 'PROVIDER_NOT_PENDING_REVIEW');
    }

    const rejected = await providerRepository.reject(providerId, adminId, input.rejectionReason);
    await dispatchNotification(createNotificationPayload({
      userId: rejected.userId,
      event: NotificationEvent.ACCOUNT_REJECTED,
      title: 'Account rejected',
      body: 'Your provider account was rejected. Please review the reason and resubmit.',
      data: { providerId: rejected.id, rejectionReason: input.rejectionReason },
    }));

    return toPublicProvider(rejected);
  },
};

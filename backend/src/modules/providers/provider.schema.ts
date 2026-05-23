import { VerificationStatus } from '@prisma/client';
import { z } from 'zod';

export const onboardStepParamsSchema = z.object({
  step: z.coerce.number().int().min(1).max(4).transform(String),
});

export const providerIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const providerListQuerySchema = z.object({
  category: z.string().trim().optional(),
  city: z.string().trim().optional(),
  badge: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const pendingProvidersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const onboardStepOneSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(1000).optional(),
  profilePhotoUrl: z.string().trim().url().optional(),
  city: z.string().trim().min(2).max(80).default('Mardan'),
  address: z.string().trim().max(240).optional(),
});

export const providerServiceSchema = z.object({
  categoryId: z.string().min(1),
  priceRangeMin: z.coerce.number().int().min(0),
  priceRangeMax: z.coerce.number().int().min(0),
  description: z.string().trim().max(500).optional(),
}).refine((value) => value.priceRangeMax >= value.priceRangeMin, {
  message: 'Maximum price must be greater than or equal to minimum price',
  path: ['priceRangeMax'],
});

export const onboardStepTwoSchema = z.object({
  services: z.array(providerServiceSchema).min(1),
});

export const onboardStepThreeSchema = z.object({
  cnicNumber: z.string().trim().min(13).max(15),
  cnicFrontUrl: z.string().trim().url().optional(),
  cnicBackUrl: z.string().trim().url().optional(),
  certificationUrls: z.array(z.string().trim().url()).optional(),
});

export const onboardStepFourSchema = z.object({});

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const rejectProviderSchema = z.object({
  rejectionReason: z.string().trim().min(5).max(500),
});

export const verifyProviderSchema = z.object({
  verificationStatus: z.literal(VerificationStatus.VERIFIED).optional(),
});

export type ProviderListQuery = z.infer<typeof providerListQuerySchema>;
export type OnboardStepOneInput = z.infer<typeof onboardStepOneSchema>;
export type OnboardStepTwoInput = z.infer<typeof onboardStepTwoSchema>;
export type OnboardStepThreeInput = z.infer<typeof onboardStepThreeSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type RejectProviderInput = z.infer<typeof rejectProviderSchema>;

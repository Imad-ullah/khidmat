import { Role } from '@prisma/client';
import { z } from 'zod';

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Phone number must be E.164-like');

export const sendOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits').optional(),
  firebaseIdToken: z.string().trim().min(20).optional(),
}).refine((value) => value.code !== undefined || value.firebaseIdToken !== undefined, {
  message: 'Either code or firebaseIdToken is required',
  path: ['firebaseIdToken'],
});

export const registerSchema = z.object({
  phone: phoneSchema,
  email: z.string().trim().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum([Role.CUSTOMER, Role.PROVIDER]).default(Role.CUSTOMER),
  fullName: z.string().trim().min(2).max(120).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().min(2).max(80).default('Mardan'),
  address: z.string().trim().max(240).optional(),
});

export const loginSchema = z.object({
  phone: phoneSchema.optional(),
  email: z.string().trim().email().optional(),
  password: z.string().min(8),
}).refine((value) => value.phone !== undefined || value.email !== undefined, {
  message: 'Either phone or email is required',
  path: ['phone'],
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(20),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(20),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;

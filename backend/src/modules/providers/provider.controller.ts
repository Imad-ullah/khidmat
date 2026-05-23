import type { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/response';
import type { AvailabilityInput, ProviderListQuery, RejectProviderInput } from './provider.schema';
import { providerService } from './provider.service';

export const providerController = {
  onboard: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await providerService.onboard(request.user as NonNullable<Request['user']>, Number.parseInt(request.params.step, 10), request.body);
      successResponse(response, 200, 'Provider onboarding step saved', provider);
    } catch (error) {
      next(error);
    }
  },

  list: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await providerService.listVerified(request.query as ProviderListQuery);
      successResponse(response, 200, 'Providers fetched successfully', data);
    } catch (error) {
      next(error);
    }
  },

  getById: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await providerService.getPublicProfile(request.params.id);
      successResponse(response, 200, 'Provider profile fetched successfully', provider);
    } catch (error) {
      next(error);
    }
  },

  getMe: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await providerService.getOwnProfile((request.user as NonNullable<Request['user']>).id);
      successResponse(response, 200, 'Provider profile fetched successfully', provider);
    } catch (error) {
      next(error);
    }
  },

  updateAvailability: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await providerService.updateAvailability((request.user as NonNullable<Request['user']>).id, request.body as AvailabilityInput);
      successResponse(response, 200, 'Provider availability updated', provider);
    } catch (error) {
      next(error);
    }
  },

  listPending: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await providerService.listPending(request.query as { page?: number; limit?: number });
      successResponse(response, 200, 'Pending providers fetched successfully', data);
    } catch (error) {
      next(error);
    }
  },

  verify: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await providerService.verify(request.params.id, (request.user as NonNullable<Request['user']>).id);
      successResponse(response, 200, 'Provider verified successfully', provider);
    } catch (error) {
      next(error);
    }
  },

  reject: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const provider = await providerService.reject(request.params.id, (request.user as NonNullable<Request['user']>).id, request.body as RejectProviderInput);
      successResponse(response, 200, 'Provider rejected successfully', provider);
    } catch (error) {
      next(error);
    }
  },
};

import type { Request, Response } from 'express';
import { AppError } from '../../utils/appError';
import { successResponse } from '../../utils/response';
import type { AdminDisputeListQuery, CreateDisputeInput, ResolveDisputeInput } from './dispute.schema';
import { disputeService } from './dispute.service';

export const disputeController = {
  create: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await disputeService.create(request.user, request.body as CreateDisputeInput);
    successResponse(response, 201, 'Dispute filed', result);
  },

  listAdmin: async (request: Request, response: Response): Promise<void> => {
    const result = await disputeService.listAdmin(request.query as unknown as AdminDisputeListQuery);
    successResponse(response, 200, 'Disputes retrieved', result);
  },

  resolve: async (request: Request, response: Response): Promise<void> => {
    if (request.user === undefined) {
      throw new AppError('Authentication required', 401, 'AUTHENTICATION_REQUIRED');
    }

    const result = await disputeService.resolve(request.user.id, request.params.id, request.body as ResolveDisputeInput);
    successResponse(response, 200, 'Dispute resolved', result);
  },
};

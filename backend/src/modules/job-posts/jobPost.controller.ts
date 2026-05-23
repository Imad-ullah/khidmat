import type { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/response';
import type { ApplyJobPostInput, CreateJobPostInput, ListJobPostsQuery } from './jobPost.schema';
import { jobPostService } from './jobPost.service';

export const jobPostController = {
  create: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const jobPost = await jobPostService.create(request.user as NonNullable<Request['user']>, request.body as CreateJobPostInput);
      successResponse(response, 201, 'Job post created successfully', jobPost);
    } catch (error) {
      next(error);
    }
  },

  listOpen: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await jobPostService.listOpen(request.user as NonNullable<Request['user']>, request.query as ListJobPostsQuery);
      successResponse(response, 200, 'Open job posts fetched successfully', data);
    } catch (error) {
      next(error);
    }
  },

  apply: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const application = await jobPostService.apply(request.user as NonNullable<Request['user']>, request.params.id, request.body as ApplyJobPostInput);
      successResponse(response, 201, 'Job application submitted successfully', application);
    } catch (error) {
      next(error);
    }
  },

  selectApplication: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const jobPost = await jobPostService.selectApplication(request.user as NonNullable<Request['user']>, request.params.id, request.params.applicationId);
      successResponse(response, 200, 'Job application selected successfully', jobPost);
    } catch (error) {
      next(error);
    }
  },
};

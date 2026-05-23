import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { jobPostController } from './jobPost.controller';
import { applyJobPostSchema, createJobPostSchema, jobPostIdParamsSchema, listJobPostsQuerySchema, selectApplicationParamsSchema } from './jobPost.schema';

export const jobPostRouter = Router();

jobPostRouter.use(authenticate);

jobPostRouter.post('/', authorize(Role.CUSTOMER), validate({ body: createJobPostSchema }), asyncWrapper(jobPostController.create));
jobPostRouter.get('/', authorize(Role.PROVIDER), validate({ query: listJobPostsQuerySchema }), asyncWrapper(jobPostController.listOpen));
jobPostRouter.post('/:id/apply', authorize(Role.PROVIDER), validate({ params: jobPostIdParamsSchema, body: applyJobPostSchema }), asyncWrapper(jobPostController.apply));
jobPostRouter.patch('/:id/select/:applicationId', authorize(Role.CUSTOMER), validate({ params: selectApplicationParamsSchema }), asyncWrapper(jobPostController.selectApplication));

import { Role } from '@prisma/client';
import { Router, type Request } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { uploadFileToS3 } from '../../utils/s3Upload';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { providerController } from './provider.controller';
import {
  availabilitySchema,
  onboardStepFourSchema,
  onboardStepOneSchema,
  onboardStepParamsSchema,
  onboardStepThreeSchema,
  onboardStepTwoSchema,
  pendingProvidersQuerySchema,
  providerIdParamsSchema,
  providerListQuerySchema,
  rejectProviderSchema,
  verifyProviderSchema,
} from './provider.schema';

export const providerRouter = Router();
export const adminProviderRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const onboardingSchemas = new Map<number, typeof onboardStepOneSchema | typeof onboardStepTwoSchema | typeof onboardStepThreeSchema | typeof onboardStepFourSchema>([
  [1, onboardStepOneSchema],
  [2, onboardStepTwoSchema],
  [3, onboardStepThreeSchema],
  [4, onboardStepFourSchema],
]);

const getUploadedFile = (files: Request['files'], fieldName: string): Express.Multer.File | undefined => {
  if (files === undefined || Array.isArray(files)) {
    return undefined;
  }

  return files[fieldName]?.[0];
};

const attachDocumentUrls = asyncWrapper(async (request, _response, next) => {
  if (Number.parseInt(request.params.step, 10) !== 3) {
    next();
    return;
  }

  const cnicFront = getUploadedFile(request.files, 'cnicFront');
  const cnicBack = getUploadedFile(request.files, 'cnicBack');

  if (cnicFront !== undefined) {
    request.body.cnicFrontUrl = await uploadFileToS3({
      buffer: cnicFront.buffer,
      mimeType: cnicFront.mimetype,
      originalName: cnicFront.originalname,
      folder: `providers/${request.user?.id ?? 'unknown'}/documents`,
      isPrivate: true,
    });
  }

  if (cnicBack !== undefined) {
    request.body.cnicBackUrl = await uploadFileToS3({
      buffer: cnicBack.buffer,
      mimeType: cnicBack.mimetype,
      originalName: cnicBack.originalname,
      folder: `providers/${request.user?.id ?? 'unknown'}/documents`,
      isPrivate: true,
    });
  }

  next();
});

providerRouter.get('/', validate({ query: providerListQuerySchema }), asyncWrapper(providerController.list));
providerRouter.get('/me', authenticate, authorize(Role.PROVIDER), asyncWrapper(providerController.getMe));
providerRouter.patch('/availability', authenticate, authorize(Role.PROVIDER), validate({ body: availabilitySchema }), asyncWrapper(providerController.updateAvailability));
providerRouter.post(
  '/onboard/step/:step',
  authenticate,
  authorize(Role.PROVIDER),
  upload.fields([
    { name: 'cnicFront', maxCount: 1 },
    { name: 'cnicBack', maxCount: 1 },
  ]),
  attachDocumentUrls,
  validate({ params: onboardStepParamsSchema }),
  (request, response, next) => {
    const schema = onboardingSchemas.get(Number.parseInt(request.params.step, 10));
    if (schema === undefined) {
      next();
      return;
    }

    validate({ body: schema })(request, response, next);
  },
  asyncWrapper(providerController.onboard),
);
providerRouter.get('/:id', validate({ params: providerIdParamsSchema }), asyncWrapper(providerController.getById));

adminProviderRouter.get('/providers/pending', authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), validate({ query: pendingProvidersQuerySchema }), asyncWrapper(providerController.listPending));
adminProviderRouter.patch('/providers/:id/verify', authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), validate({ params: providerIdParamsSchema, body: verifyProviderSchema }), asyncWrapper(providerController.verify));
adminProviderRouter.patch('/providers/:id/reject', authenticate, authorize(Role.ADMIN, Role.SUPER_ADMIN), validate({ params: providerIdParamsSchema, body: rejectProviderSchema }), asyncWrapper(providerController.reject));

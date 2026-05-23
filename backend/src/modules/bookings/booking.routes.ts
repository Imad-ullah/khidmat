import { Role } from '@prisma/client';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { bookingController } from './booking.controller';
import { bookingIdParamsSchema, cancelBookingSchema, completeBookingSchema, createBookingSchema, listBookingsQuerySchema } from './booking.schema';

export const bookingRouter = Router();

bookingRouter.use(authenticate);

bookingRouter.post('/', authorize(Role.CUSTOMER), validate({ body: createBookingSchema }), asyncWrapper(bookingController.create));
bookingRouter.get('/', authorize(Role.CUSTOMER, Role.PROVIDER), validate({ query: listBookingsQuerySchema }), asyncWrapper(bookingController.list));
bookingRouter.get('/:id', authorize(Role.CUSTOMER, Role.PROVIDER), validate({ params: bookingIdParamsSchema }), asyncWrapper(bookingController.getById));
bookingRouter.patch('/:id/confirm', authorize(Role.PROVIDER), validate({ params: bookingIdParamsSchema }), asyncWrapper(bookingController.confirm));
bookingRouter.patch('/:id/start', authorize(Role.PROVIDER), validate({ params: bookingIdParamsSchema }), asyncWrapper(bookingController.start));
bookingRouter.patch('/:id/complete', authorize(Role.PROVIDER), validate({ params: bookingIdParamsSchema, body: completeBookingSchema }), asyncWrapper(bookingController.complete));
bookingRouter.patch('/:id/cancel', authorize(Role.CUSTOMER, Role.PROVIDER), validate({ params: bookingIdParamsSchema, body: cancelBookingSchema }), asyncWrapper(bookingController.cancel));

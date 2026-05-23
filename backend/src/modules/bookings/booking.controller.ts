import type { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/response';
import type { CancelBookingInput, CompleteBookingInput, CreateBookingInput, ListBookingsQuery } from './booking.schema';
import { bookingService } from './booking.service';

export const bookingController = {
  create: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await bookingService.createDirect(request.user as NonNullable<Request['user']>, request.body as CreateBookingInput);
      successResponse(response, 201, 'Booking created successfully', booking);
    } catch (error) {
      next(error);
    }
  },

  list: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await bookingService.listOwn(request.user as NonNullable<Request['user']>, request.query as ListBookingsQuery);
      successResponse(response, 200, 'Bookings fetched successfully', data);
    } catch (error) {
      next(error);
    }
  },

  getById: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await bookingService.getById(request.user as NonNullable<Request['user']>, request.params.id);
      successResponse(response, 200, 'Booking fetched successfully', booking);
    } catch (error) {
      next(error);
    }
  },

  confirm: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await bookingService.confirm((request.user as NonNullable<Request['user']>).id, request.params.id);
      successResponse(response, 200, 'Booking confirmed successfully', booking);
    } catch (error) {
      next(error);
    }
  },

  start: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await bookingService.start((request.user as NonNullable<Request['user']>).id, request.params.id);
      successResponse(response, 200, 'Booking started successfully', booking);
    } catch (error) {
      next(error);
    }
  },

  complete: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await bookingService.complete((request.user as NonNullable<Request['user']>).id, request.params.id, request.body as CompleteBookingInput);
      successResponse(response, 200, 'Booking completed successfully', booking);
    } catch (error) {
      next(error);
    }
  },

  cancel: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const booking = await bookingService.cancel(request.user as NonNullable<Request['user']>, request.params.id, request.body as CancelBookingInput);
      successResponse(response, 200, 'Booking cancelled successfully', booking);
    } catch (error) {
      next(error);
    }
  },
};

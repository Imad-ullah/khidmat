import type { NextFunction, Request, Response } from 'express';
import { successResponse } from '../../utils/response';
import type { LoginInput, LogoutInput, RefreshInput, RegisterInput, SendOtpInput, VerifyOtpInput } from './auth.schema';
import { authService } from './auth.service';

export const authController = {
  sendOtp: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await authService.sendOtp(request.body as SendOtpInput);
      successResponse(response, 200, 'OTP sent successfully', data);
    } catch (error) {
      next(error);
    }
  },

  verifyOtp: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await authService.verifyOtp(request.body as VerifyOtpInput);
      successResponse(response, 200, 'OTP verified successfully', data);
    } catch (error) {
      next(error);
    }
  },

  register: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await authService.register(request.body as RegisterInput);
      successResponse(response, 201, 'Registration completed successfully', data);
    } catch (error) {
      next(error);
    }
  },

  login: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await authService.login(request.body as LoginInput);
      successResponse(response, 200, 'Login successful', data);
    } catch (error) {
      next(error);
    }
  },

  refresh: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await authService.refresh(request.body as RefreshInput);
      successResponse(response, 200, 'Token refreshed successfully', data);
    } catch (error) {
      next(error);
    }
  },

  logout: async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await authService.logout(request.body as LogoutInput);
      successResponse(response, 200, 'Logout successful', data);
    } catch (error) {
      next(error);
    }
  },
};

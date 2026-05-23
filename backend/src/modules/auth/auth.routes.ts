import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { asyncWrapper } from '../../utils/asyncWrapper';
import { authController } from './auth.controller';
import { loginSchema, logoutSchema, refreshSchema, registerSchema, sendOtpSchema, verifyOtpSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post('/otp/send', validate({ body: sendOtpSchema }), asyncWrapper(authController.sendOtp));
authRouter.post('/otp/verify', validate({ body: verifyOtpSchema }), asyncWrapper(authController.verifyOtp));
authRouter.post('/register', validate({ body: registerSchema }), asyncWrapper(authController.register));
authRouter.post('/login', validate({ body: loginSchema }), asyncWrapper(authController.login));
authRouter.post('/refresh', validate({ body: refreshSchema }), asyncWrapper(authController.refresh));
authRouter.post('/logout', authenticate, validate({ body: logoutSchema }), asyncWrapper(authController.logout));

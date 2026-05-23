import type { AccountStatus, Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        status: AccountStatus;
      };
    }
  }
}

export {};

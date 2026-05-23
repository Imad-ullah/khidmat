import type { AccountStatus, Prisma, Role, User } from '@prisma/client';
import { prisma } from '../../prisma/client';

export type AuthUser = Pick<User, 'id' | 'phone' | 'email' | 'passwordHash' | 'role' | 'status'>;

export const authRepository = {
  findUserByPhone: async (phone: string): Promise<AuthUser | null> => {
    return prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });
  },

  findUserByEmail: async (email: string): Promise<AuthUser | null> => {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        phone: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });
  },

  findUserById: async (id: string): Promise<AuthUser | null> => {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });
  },

  createPendingCustomerUser: async (phone: string): Promise<AuthUser> => {
    return prisma.user.create({
      data: {
        phone,
        customer: {
          create: {},
        },
      },
      select: {
        id: true,
        phone: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
      },
    });
  },

  completeRegistration: async (input: {
    phone: string;
    email?: string;
    passwordHash?: string;
    role: Role;
    status: AccountStatus;
    fullName?: string;
    displayName?: string;
    city: string;
    address?: string;
  }): Promise<AuthUser> => {
    return prisma.$transaction(async (transaction) => {
      const existingUser = await transaction.user.findUnique({
        where: { phone: input.phone },
        select: { id: true, role: true },
      });

      const user = await transaction.user.upsert({
        where: { phone: input.phone },
        create: {
          phone: input.phone,
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
          status: input.status,
        },
        update: {
          email: input.email,
          passwordHash: input.passwordHash,
          role: input.role,
          status: input.status,
        },
        select: {
          id: true,
          phone: true,
          email: true,
          passwordHash: true,
          role: true,
          status: true,
        },
      });

      if (input.role === 'CUSTOMER') {
        await transaction.customer.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            fullName: input.fullName,
            city: input.city,
            address: input.address,
          },
          update: {
            fullName: input.fullName,
            city: input.city,
            address: input.address,
            deletedAt: null,
          },
        });

        if (existingUser?.role === 'PROVIDER') {
          await transaction.provider.updateMany({
            where: { userId: user.id },
            data: { deletedAt: new Date() },
          });
        }
      }

      if (input.role === 'PROVIDER') {
        await transaction.provider.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            displayName: input.displayName ?? input.fullName ?? input.phone,
            city: input.city,
            address: input.address,
          },
          update: {
            displayName: input.displayName ?? input.fullName ?? input.phone,
            city: input.city,
            address: input.address,
            deletedAt: null,
          },
        });
      }

      return user;
    });
  },

  storeRefreshToken: async (input: { token: string; userId: string; expiresAt: Date }): Promise<void> => {
    await prisma.refreshToken.create({
      data: input,
    });
  },

  findRefreshToken: async (token: string): Promise<
    | (Pick<Prisma.RefreshTokenGetPayload<{ include: { user: true } }>, 'id' | 'token' | 'expiresAt' | 'revokedAt'> & {
        user: AuthUser;
      })
    | null
  > => {
    return prisma.refreshToken.findUnique({
      where: { token },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            phone: true,
            email: true,
            passwordHash: true,
            role: true,
            status: true,
          },
        },
      },
    });
  },

  revokeRefreshToken: async (token: string): Promise<void> => {
    await prisma.refreshToken.updateMany({
      where: {
        token,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },
};

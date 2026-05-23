import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const checkDatabaseConnection = async (): Promise<'connected' | 'unavailable'> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'connected';
  } catch {
    return 'unavailable';
  }
};

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export function getDb(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
    });
  }
  return prisma;
}


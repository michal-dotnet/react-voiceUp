import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export type Db = PrismaClient;

/** A Prisma client or an interactive-transaction client: services accept either. */
export type DbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Prisma "known request error" codes we translate into API errors. */
export function prismaErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.constructor.name === 'PrismaClientKnownRequestError'
  ) {
    return error.code;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown): boolean => prismaErrorCode(error) === 'P2002';

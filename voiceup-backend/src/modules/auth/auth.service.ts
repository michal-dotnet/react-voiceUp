import type { z } from 'zod';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { signAccessToken, type TokenConfig } from '../../lib/jwt.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/password.js';
import { isUniqueViolation, type Db } from '../../lib/prisma.js';
import { privateUserSelect, type PrivateUser } from '../users/users.dto.js';
import type { loginBody, registerBody } from './auth.schemas.js';

export interface AuthResult {
  user: PrivateUser;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

function issue(user: PrivateUser, config: TokenConfig): AuthResult {
  return {
    user,
    accessToken: signAccessToken(user.id, config),
    tokenType: 'Bearer',
    expiresIn: config.expiresInSeconds,
  };
}

/** Self-registration always creates a USER. Any `role` in the request body is ignored. */
export async function register(
  prisma: Db,
  input: z.output<typeof registerBody>,
  config: TokenConfig,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: 'USER' },
      select: privateUserSelect,
    });
    return issue(user, config);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, ErrorCodes.EMAIL_TAKEN, 'An account with this email already exists.');
    }
    throw error;
  }
}

/** One generic error for wrong email and wrong password, so emails cannot be enumerated. */
export async function login(
  prisma: Db,
  input: z.output<typeof loginBody>,
  config: TokenConfig,
): Promise<AuthResult> {
  const record = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...privateUserSelect, passwordHash: true },
  });
  if (!record) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(record.passwordHash, input.password))) throw invalidCredentials();

  const { passwordHash: _omit, ...user } = record;
  return issue(user, config);
}

function invalidCredentials(): AppError {
  return new AppError(401, ErrorCodes.INVALID_CREDENTIALS, 'Email or password is incorrect.');
}

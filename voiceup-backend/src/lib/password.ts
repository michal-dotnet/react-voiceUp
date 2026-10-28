import argon2 from 'argon2';

/** Argon2id with the library's current recommended defaults (memory-hard, salted). */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real verification when the email does not exist, so login
 * response times do not reveal which emails are registered.
 */
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= hashPassword('voiceup-dummy-password-for-timing');
  await verifyPassword(await dummyHash, plain);
}

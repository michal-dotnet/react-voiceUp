import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';
const ISSUER = 'voiceup';

export interface TokenConfig {
  secret: string;
  expiresInSeconds: number;
}

export function signAccessToken(userId: string, config: TokenConfig): string {
  return jwt.sign({}, config.secret, {
    algorithm: ALGORITHM,
    subject: userId,
    issuer: ISSUER,
    expiresIn: config.expiresInSeconds,
  });
}

/** Returns the user id from a valid token, or null for any invalid/expired/tampered token. */
export function verifyAccessToken(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM], issuer: ISSUER });
    if (typeof payload === 'object' && typeof payload.sub === 'string') return payload.sub;
    return null;
  } catch {
    return null;
  }
}

import type { AuthUser } from '../middleware/auth.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the authentication middleware when a valid access token is presented. */
      user?: AuthUser;
    }
  }
}

export {};

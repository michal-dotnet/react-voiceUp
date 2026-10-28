import { z } from 'zod';
import { text } from '../../lib/http.js';

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const password = z.string().min(8).max(128);

export const registerBody = z.object({
  name: text(2, 80),
  email,
  password,
});

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});

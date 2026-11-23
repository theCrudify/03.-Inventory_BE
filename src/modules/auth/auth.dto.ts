import { z } from 'zod';
import { passwordRule } from '../../core/security';

export const loginBody = z.object({ email: z.string().email().max(120).toLowerCase(), password: z.string().min(1).max(128) });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordRule });
export const TOKEN_TTL_SEC = 60 * 60 * 8; // one work shift

/** Brute-force throttling: failures inside the window lock the key for `lockMin`. */
export const LOGIN_RULES = {
  windowMin: 15,
  lockMin: 15,
  perClient: 5, // same email from the same address
  perEmail: 20, // same email from anywhere (distributed guessing)
};

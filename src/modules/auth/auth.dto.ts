import { z } from 'zod';

export const loginBody = z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) });
export const changePasswordBody = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });
export const TOKEN_TTL_SEC = 60 * 60 * 8; // one work shift

import { z } from 'zod';
import { passwordRule } from '../../core/security';

export const loginBody = z.object({ email: z.string().email().max(120).toLowerCase(), password: z.string().min(1).max(128) });
export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordRule });

import { z } from 'zod';

const base = z.object({ name: z.string().trim().min(1), email: z.string().email().toLowerCase(), role: z.string().trim().min(1) }); // refs: role
export const createUserBody = base.extend({ password: z.string().min(8) });
export const updateUserBody = base.extend({ password: z.string().min(8).optional() });
export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;

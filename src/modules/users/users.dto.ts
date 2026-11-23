import { z } from 'zod';
import { pageQuery } from '../../core/http';
import { passwordRule } from '../../core/security';

const base = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email().max(120).toLowerCase(), role: z.string().trim().min(1).max(20) }); // roles.code
export const createUserBody = base.extend({ password: passwordRule });
export const updateUserBody = base.extend({ password: passwordRule.optional() });
export const userListQuery = pageQuery.extend({ role: z.string().trim().optional() });
export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
export type UserListQuery = z.infer<typeof userListQuery>;

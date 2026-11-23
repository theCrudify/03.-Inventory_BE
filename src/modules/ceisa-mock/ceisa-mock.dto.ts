import { z } from 'zod';

export const ceisaLoginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });
export const CEISA_TOKEN_SCOPE = 'ceisa-mock';
export const CEISA_TOKEN_TTL_SEC = 3600;
export const ceisaFail = (message: string) => ({ status: 'FAILED', message });

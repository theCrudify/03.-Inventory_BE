import { z } from 'zod';

/** UI palette names (styling only), shared by role and status badges. */
export const TONES = ['gray', 'blue', 'amber', 'violet', 'green', 'red', 'teal'];
export const toneField = z.string().refine((t) => TONES.includes(t), 'Warna tidak dikenal').default('gray');

export const roleBody = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]*$/, 'Kode: huruf kecil, angka, underscore').max(20),
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  tone: toneField,
  canWrite: z.boolean().default(false),
  isAdmin: z.boolean().default(false),
  sort: z.number().int().default(0),
});
export type RoleBody = z.infer<typeof roleBody>;

import { z } from 'zod';
import { toneField } from '../roles/roles.dto';

export const statusBody = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]*$/, 'Kode: huruf kecil, angka, underscore').max(20),
  name: z.string().trim().min(1),
  tone: toneField,
  initial: z.boolean().default(false),
  editable: z.boolean().default(false),
  inFlight: z.boolean().default(false),
  registered: z.boolean().default(false),
  approved: z.boolean().default(false),
  rejected: z.boolean().default(false),
  sort: z.number().int().default(0),
});
export type StatusBody = z.infer<typeof statusBody>;

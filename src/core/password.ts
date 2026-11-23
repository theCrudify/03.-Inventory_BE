// PBKDF2-SHA256 via WebCrypto: runs unchanged on Cloudflare Workers and Node.
const ITER = 100_000;
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${hex(salt)}$${hex(await derive(password, salt))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, , salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const a = unhex(hex(await derive(password, unhex(salt)))), b = unhex(hash);
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i] ?? 0); // constant-time compare
  return diff === 0;
}

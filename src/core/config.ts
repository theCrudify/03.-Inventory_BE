import { httpError } from './errors';

// Runtime settings read from environment variables (`.env` locally, `[vars]`/secrets on Cloudflare).
// Every optional setting has a safe default; an invalid value is rejected with a clear message instead of
// being silently ignored (e.g. a mistyped CORS origin would otherwise just never match).

export type AppConfig = {
  tokenTtlSec: number;
  login: { perClient: number; perEmail: number; windowMin: number; lockMin: number };
  bodyLimitBytes: number;
  cors: { origins: string[]; allowLocalhost: boolean };
};

export const DEFAULTS = {
  TOKEN_TTL_HOURS: 8,
  LOGIN_MAX_PER_CLIENT: 5,
  LOGIN_MAX_PER_EMAIL: 20,
  LOGIN_WINDOW_MIN: 15,
  LOGIN_LOCK_MIN: 15,
  BODY_LIMIT_KB: 256,
} as const;

type Source = Record<string, unknown>;
const bad = (msg: string) => httpError(500, `Konfigurasi server tidak valid: ${msg}`);

function int(env: Source, name: keyof typeof DEFAULTS, min: number, max: number) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return DEFAULTS[name];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} harus bilangan bulat ${min} sampai ${max}`);
  return n;
}

function flag(env: Source, name: string) {
  const v = String(env[name] ?? '').trim().toLowerCase();
  if (v === '') return false;
  if (['true', '1', 'yes', 'ya'].includes(v)) return true;
  if (['false', '0', 'no', 'tidak'].includes(v)) return false;
  throw bad(`${name} harus true atau false`);
}

/** `https://app.example.com` only: scheme + host (+ port), no path, no wildcard. */
function origins(raw: unknown) {
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean).map((o) => {
    let u: URL;
    try { u = new URL(o); } catch { throw bad(`CORS_ORIGINS berisi alamat yang salah: "${o}"`); }
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== o) {
      throw bad(`CORS_ORIGINS harus berupa origin tanpa path atau garis miring di akhir (contoh https://app.example.com), bukan "${o}"`);
    }
    return o;
  });
}

const cache = new WeakMap<object, AppConfig>();

export function loadConfig(env: Source): AppConfig {
  const hit = cache.get(env);
  if (hit) return hit;
  const cfg: AppConfig = {
    tokenTtlSec: int(env, 'TOKEN_TTL_HOURS', 1, 72) * 3600,
    login: {
      perClient: int(env, 'LOGIN_MAX_PER_CLIENT', 1, 1000),
      perEmail: int(env, 'LOGIN_MAX_PER_EMAIL', 1, 10000),
      windowMin: int(env, 'LOGIN_WINDOW_MIN', 1, 1440),
      lockMin: int(env, 'LOGIN_LOCK_MIN', 1, 1440),
    },
    bodyLimitBytes: int(env, 'BODY_LIMIT_KB', 1, 10240) * 1024,
    cors: { origins: origins(env.CORS_ORIGINS), allowLocalhost: flag(env, 'CORS_ALLOW_LOCALHOST') },
  };
  cache.set(env, cfg);
  return cfg;
}

/** Listed origins, plus (development only, off by default) any http://localhost or 127.0.0.1 port. */
export function isAllowedOrigin(origin: string, cors: AppConfig['cors']) {
  if (cors.origins.includes(origin)) return true;
  return cors.allowLocalhost && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

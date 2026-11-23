// Integration security tests: they run the real app (all middleware, routes, database) in-process.
// Needs DATABASE_URL + JWT_SECRET (loaded from .dev.vars by `npm test`) and a seeded database; skipped otherwise.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import app from '../src/index';
import { createDb } from '../src/core/db/client';
import { APP_AUDIENCE, CEISA_AUDIENCE, signingSecret } from '../src/core/security';

const env = { DATABASE_URL: process.env.DATABASE_URL ?? '', JWT_SECRET: process.env.JWT_SECRET ?? '', CORS_ORIGINS: 'http://localhost:3000,https://app.example.test' };
const skip = !env.DATABASE_URL || !env.JWT_SECRET ? 'DATABASE_URL/JWT_SECRET belum diset (jalankan lewat `npm test`)' : false;

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException: () => {} };
const { db, close } = createDb(env.DATABASE_URL || 'postgres://x@127.0.0.1/x');
const cleanup: (() => Promise<unknown>)[] = [];
after(async () => { for (const f of cleanup.reverse()) await f().catch(() => {}); await Promise.allSettled(pending); await close(); });

type Opts = { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string };
async function call(method: string, path: string, o: Opts = {}) {
  const hasBody = o.body !== undefined || o.raw !== undefined;
  const res = await app.fetch(new Request(`https://api.test${path}`, {
    method,
    headers: { ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...(hasBody ? { 'content-type': 'application/json' } : {}), ...o.headers },
    body: hasBody ? (o.raw ?? JSON.stringify(o.body)) : undefined,
  }), env, ctx as never);
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { /* not JSON */ } // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json, text, headers: res.headers };
}
let ipSeq = 0;
const freshIp = () => `198.51.100.${++ipSeq}`; // each scenario gets its own client address, so throttling never leaks between tests
const login = (email: string, password = 'demo1234', ip = freshIp()) => call('POST', '/auth/login', { body: { email, password }, headers: { 'cf-connecting-ip': ip } });
const tokenOf = async (email: string) => (await login(email)).json.token as string;
const clearAttempts = (like: string) => db.execute(sql`delete from login_attempts where key like ${'%' + like + '%'}`);

type Route = [method: string, path: string, body?: unknown];
const READ: Route[] = [
  ['GET', '/meta'], ['GET', '/auth/me'], ['GET', '/dashboard'], ['GET', '/items'], ['GET', '/partners'], ['GET', '/trade-docs'],
  ['GET', '/customs-docs'], ['GET', '/customs-docs/1'], ['GET', '/reports/mutasi?category=bahan_baku&from=2026-01-01&to=2026-12-31'],
  ['GET', '/refs/hs'], ['GET', '/roles'], ['GET', '/document-statuses'], ['GET', '/insw/hs/52085200'],
];
// Bodies are empty/invalid on purpose: an allowed caller gets 400/404 (never a side effect), a denied one gets 403.
const WRITE: Route[] = [
  ['POST', '/items', {}], ['PUT', '/items/999999', {}], ['DELETE', '/items/999999'],
  ['POST', '/partners', {}], ['PUT', '/partners/999999', {}], ['DELETE', '/partners/999999'],
  ['POST', '/trade-docs', {}], ['PUT', '/trade-docs/999999', {}], ['DELETE', '/trade-docs/999999'],
  ['POST', '/customs-docs', {}], ['PUT', '/customs-docs/999999', {}], ['DELETE', '/customs-docs/999999'], ['POST', '/customs-docs/999999/submit'],
];
const ADMIN: Route[] = [
  ['GET', '/users'], ['POST', '/users', {}], ['PUT', '/users/999999', {}], ['DELETE', '/users/999999'], ['GET', '/audit-logs'],
  ['POST', '/refs/hs', {}], ['PUT', '/refs/hs/x', {}], ['DELETE', '/refs/hs/x'], ['PUT', '/settings/company', {}], ['PUT', '/settings/app', {}],
  ['POST', '/roles', {}], ['PUT', '/roles/x', {}], ['DELETE', '/roles/x'],
  ['POST', '/document-statuses', {}], ['PUT', '/document-statuses/x', {}], ['DELETE', '/document-statuses/x'],
];
const ALL = [...READ, ...WRITE, ...ADMIN];

async function statuses(routes: Route[], token?: string) {
  return Promise.all(routes.map(async ([m, p, b]) => ({ route: `${m} ${p}`, status: (await call(m, p, { token, body: b })).status })));
}
const denied = (rs: { route: string; status: number }[], code: number) => rs.filter((r) => r.status !== code).map((r) => `${r.route} -> ${r.status}`);
const allowed = (rs: { route: string; status: number }[]) => rs.filter((r) => r.status === 401 || r.status === 403 || r.status >= 500).map((r) => `${r.route} -> ${r.status}`);

describe('RBAC: hak akses setiap endpoint per role', { skip }, () => {
  test('tanpa token: semua endpoint terlindungi (401)', async () => {
    assert.deepEqual(denied(await statuses(ALL), 401), []);
  });
  test('viewer: boleh baca; menulis dan admin ditolak (403)', async () => {
    const t = await tokenOf('viewer@arunika.demo');
    assert.deepEqual(allowed(await statuses(READ, t)), [], 'baca');
    assert.deepEqual(denied(await statuses(WRITE, t), 403), [], 'tulis');
    assert.deepEqual(denied(await statuses(ADMIN, t), 403), [], 'admin');
  });
  test('operator: boleh baca dan menulis; admin ditolak (403)', async () => {
    const t = await tokenOf('operator@arunika.demo');
    assert.deepEqual(allowed(await statuses(READ, t)), [], 'baca');
    assert.deepEqual(allowed(await statuses(WRITE, t)), [], 'tulis');
    assert.deepEqual(denied(await statuses(ADMIN, t), 403), [], 'admin');
  });
  test('admin: seluruh endpoint boleh', async () => {
    const t = await tokenOf('admin@arunika.demo');
    assert.deepEqual(allowed(await statuses(ALL, t)), []);
  });
});

describe('Autentikasi: token palsu dan salah audiens', { skip }, () => {
  test('token gateway CEISA tiruan tidak berlaku di API aplikasi (celah yang ditemukan audit)', async () => {
    const mock = (await call('POST', '/mock-ceisa/nle-oauth/v1/user/login', { body: { username: 'siapa-saja', password: 'apa-saja' } })).json.item.access_token as string;
    assert.deepEqual(denied(await statuses(ALL, mock), 401), []);
    // ...tetapi tetap berlaku untuk gateway-nya sendiri
    const aju = (await call('GET', '/customs-docs/1', { token: await tokenOf('admin@arunika.demo') })).json.ajuNumber;
    assert.equal((await call('GET', `/mock-ceisa/openapi/status/${aju}`, { token: mock })).status, 200);
  });
  test('token aplikasi tidak berlaku di gateway CEISA', async () => {
    const aju = (await call('GET', '/customs-docs/1', { token: await tokenOf('admin@arunika.demo') })).json.ajuNumber;
    assert.equal((await call('GET', `/mock-ceisa/openapi/status/${aju}`, { token: await tokenOf('admin@arunika.demo') })).status, 401);
  });

  const now = () => Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  test('token yang dimanipulasi atau dibuat dengan cara lain ditolak', async () => {
    const good = await tokenOf('viewer@arunika.demo');
    const [h, p, s] = good.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    const key = signingSecret(env.JWT_SECRET, APP_AUDIENCE);
    const claims = { sub: payload.sub, tv: payload.tv, aud: APP_AUDIENCE, iat: now(), exp: now() + 600 };
    const forged: Record<string, string> = {
      'payload diubah (sub=1, admin) dengan tanda tangan lama': `${h}.${b64({ ...payload, sub: '1' })}.${s}`,
      'alg none tanpa tanda tangan': `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, sub: '1' })}.`,
      'kunci lain': await sign(claims, signingSecret('x'.repeat(48), APP_AUDIENCE)),
      'kunci mentah tanpa turunan': await sign(claims, env.JWT_SECRET),
      'kedaluwarsa': await sign({ ...claims, iat: now() - 7200, exp: now() - 3600 }, key),
      'audiens salah': await sign({ ...claims, aud: 'lain' }, key),
      'audiens gateway': await sign({ ...claims, aud: CEISA_AUDIENCE }, key),
      'tanpa versi token (tv)': await sign({ sub: payload.sub, aud: APP_AUDIENCE, iat: now(), exp: now() + 600 }, key),
      'sub bukan angka': await sign({ ...claims, sub: 'admin' }, key),
      'pengguna tidak ada': await sign({ ...claims, sub: '999999' }, key),
      'versi token tidak cocok': await sign({ ...claims, tv: 9999 }, key),
      'sampah': 'bukan.token.sama-sekali',
    };
    for (const [name, token] of Object.entries(forged)) assert.equal((await call('GET', '/items', { token })).status, 401, name);
    assert.equal((await call('GET', '/items', { token: good })).status, 200, 'token asli tetap diterima');
  });
});

describe('Sesi dan izin dibaca segar dari database', { skip }, () => {
  test('diturunkan role, ganti password, dan dihapus: efeknya langsung, bukan menunggu token kedaluwarsa', async () => {
    const admin = await tokenOf('admin@arunika.demo');
    const email = `uji-sesi-${Date.now()}@example.test`;
    const create = await call('POST', '/users', { token: admin, body: { name: 'Uji Sesi', email, role: 'operator', password: 'Sandi-Uji-2026' } });
    assert.equal(create.status, 201, create.text);
    const uid = create.json.id as number;
    cleanup.push(() => call('DELETE', `/users/${uid}`, { token: admin }));

    const t1 = (await login(email, 'Sandi-Uji-2026')).json.token as string;
    assert.equal((await call('POST', '/items', { token: t1, body: {} })).status, 400, 'operator lolos penjagaan izin (lalu 400 karena body kosong)');

    // diturunkan menjadi viewer -> token yang sama langsung kehilangan hak tulis
    assert.equal((await call('PUT', `/users/${uid}`, { token: admin, body: { name: 'Uji Sesi', email, role: 'viewer' } })).status, 200);
    assert.equal((await call('POST', '/items', { token: t1, body: {} })).status, 403, 'hak tulis hilang seketika');
    assert.equal((await call('GET', '/auth/me', { token: t1 })).json.role, 'viewer');

    // ganti password -> semua token lama dicabut
    const change = await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: 'Sandi-Uji-2026', newPassword: 'Sandi-Baru-2027' } });
    assert.equal(change.status, 200, change.text);
    assert.equal((await call('GET', '/auth/me', { token: t1 })).status, 401, 'token lama dicabut');
    const t2 = (await login(email, 'Sandi-Baru-2027')).json.token as string;
    assert.equal((await call('GET', '/auth/me', { token: t2 })).status, 200);

    // dihapus -> token yang masih berlaku langsung mati
    assert.equal((await call('DELETE', `/users/${uid}`, { token: admin })).status, 200);
    assert.equal((await call('GET', '/auth/me', { token: t2 })).status, 401, 'pengguna terhapus tidak bisa lagi memakai token');
  });

  test('admin mengganti password pengguna lain -> sesi pengguna itu dicabut', async () => {
    const admin = await tokenOf('admin@arunika.demo');
    const email = `uji-reset-${Date.now()}@example.test`;
    const uid = (await call('POST', '/users', { token: admin, body: { name: 'Uji Reset', email, role: 'viewer', password: 'Sandi-Uji-2026' } })).json.id as number;
    cleanup.push(() => call('DELETE', `/users/${uid}`, { token: admin }));
    const t = (await login(email, 'Sandi-Uji-2026')).json.token as string;
    assert.equal((await call('GET', '/auth/me', { token: t })).status, 200);
    await call('PUT', `/users/${uid}`, { token: admin, body: { name: 'Uji Reset', email, role: 'viewer', password: 'Sandi-Reset-2028' } });
    assert.equal((await call('GET', '/auth/me', { token: t })).status, 401);
  });
});

describe('Login: brute force, enumerasi, kebijakan password', { skip }, () => {
  test('email tidak ada dan password salah menghasilkan jawaban yang sama (tidak membocorkan akun)', async () => {
    const a = await login('tidak-ada-sama-sekali@example.test', 'salah-1234');
    const b = await login('operator@arunika.demo', 'salah-1234');
    assert.deepEqual([a.status, a.json.message], [b.status, b.json.message]);
    assert.equal(a.status, 401);
    await clearAttempts('operator@arunika.demo'); await clearAttempts('tidak-ada-sama-sekali@example.test');
  });

  test('5 kegagalan mengunci; setelah terkunci password benar pun ditolak; alamat lain tidak ikut terkunci', async () => {
    const victim = 'operator@arunika.demo', attacker = freshIp(), other = freshIp();
    cleanup.push(() => clearAttempts(victim));
    for (let i = 0; i < 5; i++) assert.equal((await login(victim, `tebakan-${i}-ABC`, attacker)).status, 401);
    const locked = await login(victim, 'demo1234', attacker); // password BENAR, tetapi sudah terkunci
    assert.equal(locked.status, 429);
    assert.ok(Number(locked.headers.get('retry-after')) > 0, 'ada header Retry-After');
    assert.equal((await login(victim, 'demo1234', other)).status, 200, 'korban dari alamat lain tetap bisa masuk');
  });

  test('kegagalan dicatat di audit log tanpa menyimpan password', async () => {
    const admin = await tokenOf('admin@arunika.demo');
    await login('jejak-audit@example.test', 'rahasia-banget-123');
    const log = await call('GET', '/audit-logs?q=jejak-audit&pageSize=5', { token: admin });
    assert.ok(log.json.data.some((r: { action: string }) => r.action === 'login_failed'));
    assert.ok(!log.text.includes('rahasia-banget-123'));
    await clearAttempts('jejak-audit@example.test');
  });

  test('kebijakan password: terlalu pendek, tanpa angka, tanpa huruf, terlalu panjang ditolak', async () => {
    const admin = await tokenOf('admin@arunika.demo');
    for (const password of ['Pendek1', 'hanyahurufsaja', '1234567890123', 'a1'.repeat(70)]) {
      const r = await call('POST', '/users', { token: admin, body: { name: 'x', email: `p${Date.now()}@example.test`, role: 'viewer', password } });
      assert.equal(r.status, 400, `ditolak: ${password.slice(0, 14)}`);
    }
  });
});

describe('Akun demo adalah identitas bersama: tidak bisa diubah lewat API', { skip }, () => {
  test('admin demo tidak dapat mengubah, menghapus, atau mengganti password akun demo, termasuk akunnya sendiri', async () => {
    const adminLogin = await login('admin@arunika.demo');
    const admin = adminLogin.json.token as string, adminId = adminLogin.json.user.id as number;
    const users = (await call('GET', '/users?pageSize=50', { token: admin })).json.data as { id: number; email: string; role: string }[];
    const op = users.find((u) => u.email === 'operator@arunika.demo')!;
    assert.equal((await call('PUT', `/users/${op.id}`, { token: admin, body: { name: 'x', email: 'operator@arunika.demo', role: 'admin', password: 'Peretasan-2026' } })).status, 403);
    assert.equal((await call('DELETE', `/users/${op.id}`, { token: admin })).status, 403);
    assert.equal((await call('PUT', `/users/${adminId}`, { token: admin, body: { name: 'x', email: 'admin@arunika.demo', role: 'admin', password: 'Peretasan-2026' } })).status, 403);
    assert.equal((await call('POST', '/auth/change-password', { token: admin, body: { currentPassword: 'demo1234', newPassword: 'Peretasan-2026' } })).status, 403);
    assert.equal((await login('admin@arunika.demo')).status, 200, 'password demo tetap berlaku');
  });
  test('mode demo tidak bisa dimatikan lewat pengaturan', async () => {
    const admin = await tokenOf('admin@arunika.demo');
    const meta = (await call('GET', '/meta', { token: admin })).json;
    const before = JSON.stringify(meta.app.demo);
    const r = await call('PUT', '/settings/app', { token: admin, body: { ...meta.app, demo: null } });
    assert.equal(r.status, 200, r.text);
    assert.equal(JSON.stringify((await call('GET', '/meta', { token: admin })).json.app.demo), before, 'bagian demo tidak berubah');
  });
});

describe('Input: injeksi, batas ukuran, ID, CORS, header', { skip }, () => {
  test('payload injeksi SQL diperlakukan sebagai teks biasa dan tabel tetap utuh', async () => {
    const t = await tokenOf('operator@arunika.demo');
    const probes = ["' OR '1'='1", "'; DROP TABLE items; --", '%', '_', '\\', 'x" OR 1=1 --'];
    for (const q of probes) {
      const r = await call('GET', `/items?q=${encodeURIComponent(q)}&sortBy=${encodeURIComponent("name; drop table items")}&sortDir=asc`, { token: t });
      assert.equal(r.status, 200, `q=${q}`);
      assert.ok(r.json.data.length <= 13);
    }
    const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int n from items`);
    assert.ok(n >= 13, 'tabel items masih ada dan terisi');
    assert.equal((await call('GET', `/items?sortDir=${encodeURIComponent('asc; select 1')}`, { token: t })).status, 400);
  });
  test('ID dan paginasi yang tidak wajar ditolak, bukan menyebabkan error server', async () => {
    const t = await tokenOf('operator@arunika.demo');
    for (const [path, want] of [['/customs-docs/-1', 400], ['/customs-docs/abc', 400], ['/customs-docs/0', 400], ['/customs-docs/99999999999999999999', 400],
      ['/customs-docs/999999', 404], ['/items?pageSize=100000', 400], ['/items?page=0', 400], ['/items?page=abc', 400], ['/refs/%00', 400], ['/refs/NGAWUR', 400], ['/refs/ngawur', 404]] as const) {
      assert.equal((await call('GET', path, { token: t })).status, want, path);
    }
  });
  test('body terlalu besar ditolak (413) dan JSON rusak ditolak (400), bukan 500', async () => {
    const t = await tokenOf('operator@arunika.demo');
    assert.equal((await call('POST', '/items', { token: t, raw: JSON.stringify({ name: 'x'.repeat(300_000) }) })).status, 413);
    assert.equal((await call('POST', '/items', { token: t, raw: '{rusak' })).status, 400);
  });
  test('CORS: hanya origin yang terdaftar yang mendapat izin', async () => {
    const ok = await call('GET', '/meta/public', { headers: { origin: 'https://app.example.test' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.test');
    const bad = await call('GET', '/meta/public', { headers: { origin: 'https://penyerang.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    const pre = await app.fetch(new Request('https://api.test/items', { method: 'OPTIONS', headers: { origin: 'https://penyerang.example', 'access-control-request-method': 'DELETE' } }), env, ctx as never);
    assert.equal(pre.headers.get('access-control-allow-origin'), null);
  });
  test('respons: tidak di-cache, ada header keamanan, dan tidak membocorkan hash password', async () => {
    const admin = await tokenOf('admin@arunika.demo');
    const users = await call('GET', '/users?pageSize=50', { token: admin });
    assert.equal(users.headers.get('cache-control'), 'no-store');
    assert.equal(users.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(!/pbkdf2|passwordHash|password_hash|tokenVersion/i.test(users.text), 'daftar pengguna tidak memuat hash/versi token');
    const lg = await login('viewer@arunika.demo');
    assert.ok(!/pbkdf2|passwordHash/i.test(lg.text), 'respons login tidak memuat hash');
    assert.ok(!('tokenVersion' in lg.json.user));
  });
  test('HTTP polos dialihkan ke HTTPS (kecuali localhost untuk pengembangan)', async () => {
    const r = await app.fetch(new Request('http://api.example.test/auth/login', { method: 'POST' }), env, ctx as never);
    assert.equal(r.status, 308);
    assert.equal(r.headers.get('location'), 'https://api.example.test/auth/login');
    const local = await app.fetch(new Request('http://localhost:8787/meta/public'), env, ctx as never);
    assert.equal(local.status, 200, 'localhost tetap boleh HTTP');
  });
  test('galat server tidak membocorkan detail internal', async () => {
    const r = await call('GET', '/tidak-ada-endpoint-ini', { token: await tokenOf('viewer@arunika.demo') });
    assert.equal(r.status, 404);
    assert.ok(!/at .*\.ts|node_modules|postgres|select |stack/i.test(r.text));
  });
});

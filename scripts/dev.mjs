// Starts `wrangler dev` using PORT/HOST from `.env` (shell variables win: `PORT=9000 npm run dev`).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = process.env.PORT?.trim() || '8787';
const host = process.env.HOST?.trim() || '127.0.0.1';
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error(`PORT tidak valid: "${port}" (harus 1-65535). Periksa .env`);
  process.exit(1);
}
if (!existsSync('.env')) console.warn('! Berkas .env belum ada: jalankan `cp .env.example .env` lalu isi DATABASE_URL dan JWT_SECRET.');

console.log(`Menjalankan API di http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
const child = spawn('npx', ['wrangler', 'dev', '--port', port, '--ip', host, ...process.argv.slice(2)], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

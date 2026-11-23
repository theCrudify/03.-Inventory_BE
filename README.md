# 03.-Inventory_BE

REST API untuk **Arunika IT Inventory**, prototype IT Inventory Kawasan Berikat: dokumen BC 2.3 sampai 4.1,
integrasi CEISA 4.0 (mock host-to-host), kartu stok, dan laporan mutasi barang.

**Stack:** Hono di Cloudflare Workers · Drizzle ORM · PostgreSQL (Neon) · Zod · JWT (HS256) · PBKDF2

## Arsitektur

```
src/
  index.ts                 # menyusun semua routes + middleware global
  core/                    # env, error handler, middleware (db, auth, role), helper http, db schema/client
  modules/<modul>/
    <modul>.dto.ts         # skema validasi request (Zod) + tipe
    <modul>.repository.ts  # semua query database (Drizzle)
    <modul>.service.ts     # logika bisnis + audit log
    <modul>.controller.ts  # adaptor HTTP: parse DTO → panggil service → JSON
    <modul>.routes.ts      # path + middleware role
```

Modul: `auth`, `users`, `settings` (profil perusahaan/aplikasi + `/meta`), `refs` (master referensi + mock INSW),
`items`, `partners`, `trade-docs`, `customs-docs` (+ `customs-docs.domain.ts` berisi aturan murni yang dites),
`ceisa-mock`, `dashboard`, `reports`, `audit`.

## Tanpa hardcode: semua dari master database

| Yang diatur | Di mana |
|---|---|
| 9 jenis BC: arah, jenis mitra, kode CEISA, kantor default, kode & pesan persetujuan, perlakuan pungutan, wajib jaminan | `refs` tipe `jenis_bc` |
| Tahap respon CEISA (kode, pesan, waktu) | `refs` tipe `tahap_ceisa` |
| Label & warna status dokumen | `refs` tipe `status_dokumen` |
| Tarif BM / PPN / PPh per HS | `refs` tipe `hs` (disalin ke baris dokumen saat disimpan) |
| Kurs default per valuta | `refs` tipe `valuta` |
| Kategori barang, jenis mitra, role, cara angkut, kontainer, jenis dokumen & jaminan, dll. | `refs` per tipe |
| Daftar jenis referensi + mana yang boleh diubah admin + kolom tambahannya | `refs` tipe `tipe_referensi` |
| Profil perusahaan (nama, NPWP, ID CEISA, zona waktu, penandatangan) & branding aplikasi | tabel `settings` (halaman Pengaturan → Profil Perusahaan) |

Isi awalnya ada di `scripts/seed-master.ts`.

**Tanpa enum.** Tidak ada `pgEnum` di database dan tidak ada `z.enum` untuk nilai bisnis. Semua kolom kode
(`role`, `status`, `kind`, `source`, `category`, …) adalah `varchar` berisi kode `refs` dan divalidasi oleh service.
Perilaku yang melekat pada sebuah kode dibaca dari flag di `meta`-nya, bukan dari nama kodenya:

| Master | Flag | Dipakai untuk |
|---|---|---|
| `status_dokumen` | `initial`, `editable`, `inFlight`, `registered`, `approved`, `rejected` | Siklus dokumen: status awal, boleh diubah/kirim, menunggu CEISA, nomor daftar terbit, stok dibukukan, ditolak |
| `role` | `canWrite`, `isAdmin` | Hak akses (dimasukkan ke token saat login) |
| `arah_dokumen` | `sign`, `partyLabel`, `countryField` | Tanda stok (+/−), cek saldo dokumen keluar, label & field form |
| `perlakuan_pungutan` | `charged` | Pungutan dihitung atau tidak |
| `sumber_mutasi` | `fromDocument`, `adjustment` | Sumber mutasi dari dokumen BC; kolom penyesuaian di laporan mutasi |

## Desain database (11 tabel)

| Tabel | Isi |
|---|---|
| `users` | Akun dan role |
| `settings` | Profil perusahaan dan pengaturan aplikasi (JSON per key) |
| `refs` | Semua master/referensi dalam satu tabel, dikelompokkan per `type` (termasuk role, status, arah dokumen) |
| `partners`, `items` | Mitra dan barang (kategori/jenis/satuan/negara divalidasi ke `refs`) |
| `trade_docs` | PO dan commercial invoice |
| `customs_docs` | **Satu tabel untuk semua jenis BC**; field khusus per jenis di `header jsonb` |
| `customs_doc_lines` | Barang per dokumen, termasuk tarif BM/PPN/PPh saat disimpan |
| `customs_doc_events` | Riwayat respon CEISA |
| `stock_movements` | Kartu stok; saldo & laporan mutasi dihitung dari sini |
| `audit_logs` | Jejak aktivitas pengguna |

## Mock CEISA

- `POST /customs-docs/:id/submit` mengirim dokumen. Status lalu bergerak sendiri mengikuti master `tahap_ceisa`
  (default: terkirim 0 dtk → diterima 5 dtk → tervalidasi + nomor pendaftaran 12 dtk → SPPB/NPE/SPPJ 25 dtk).
  Tidak butuh cron: tahapan dicatat saat dokumen dibaca (`modules/customs-docs`).
- Validasi meniru CEISA: HS code 8 digit dan data pengangkut wajib. Dokumen yang tidak lolos akan **ditolak (kode 900)**.
- Dokumen keluar dicek ke saldo stok. Stok baru dibukukan setelah dokumen disetujui.
- Endpoint yang meniru gateway asli: `POST /mock-ceisa/nle-oauth/v1/user/login`, `GET /mock-ceisa/openapi/status/{nomorAju}`.
- Mock INSW: `GET /insw/hs/{kodeHs}` mengembalikan tarif BM, PPN, dan PPh.

## Menjalankan lokal

```bash
npm install
cp .dev.vars.example .dev.vars     # isi DATABASE_URL dan JWT_SECRET
set -a; . ./.dev.vars; set +a
npx drizzle-kit push               # buat tabel
npm run db:seed                    # data demo (menghapus isi tabel!)
npm run dev                        # http://localhost:8787
npm test                           # unit test logika inti
```

Akun demo (password `demo1234`): `admin@arunika.demo`, `operator@arunika.demo`, `viewer@arunika.demo`.

## Deploy gratis (Cloudflare Workers + Neon)

1. Buat project di [neon.tech](https://neon.tech) (free tier), lalu salin connection string (`...?sslmode=require`).
2. Buat tabel dan isi data demo ke Neon:
   ```bash
   DATABASE_URL='postgres://...neon.tech/neondb?sslmode=require' npx drizzle-kit push
   DATABASE_URL='postgres://...neon.tech/neondb?sslmode=require' npx tsx scripts/seed.ts
   ```
3. Deploy API:
   ```bash
   npx wrangler login
   npx wrangler secret put DATABASE_URL      # tempel connection string Neon
   npx wrangler secret put JWT_SECRET        # string acak panjang, mis. `openssl rand -hex 32`
   # di wrangler.toml: CORS_ORIGINS = "https://<app-anda>.vercel.app"
   npm run deploy                            # → https://inventory-api.<akun>.workers.dev
   ```

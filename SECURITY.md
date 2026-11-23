# Keamanan

Dokumen ini menjelaskan model akses, kontrol yang berlaku, cara mengujinya, dan risiko yang **sengaja diterima**
karena aplikasi ini prototipe portofolio dengan akun demo publik. Kontrol disesuaikan dengan porsinya: ketat di
autentikasi, otorisasi, dan input; sederhana di tempat yang risikonya kecil.

## Model akses (RBAC)

Izin tidak ditulis di kode atau di token. Izin adalah kolom di tabel `roles` (`can_write`, `is_admin`) dan **dibaca
dari database pada setiap permintaan**, sehingga perubahan berlaku seketika.

| Kelompok | Endpoint | viewer | operator | admin |
|---|---|:-:|:-:|:-:|
| Baca | `GET` meta, dashboard, items, partners, trade-docs, customs-docs, reports, refs, roles, document-statuses, insw | ✅ | ✅ | ✅ |
| Tulis data usaha | `POST/PUT/DELETE` items, partners, trade-docs, customs-docs, `POST customs-docs/:id/submit` | ❌ 403 | ✅ | ✅ |
| Administrasi | users, roles, document-statuses, refs (tulis), settings, audit-logs | ❌ 403 | ❌ 403 | ✅ |
| Tanpa login | `POST /auth/login`, `GET /meta/public`, gateway `/mock-ceisa/*` (token sendiri) | | | |

Aturan tambahan: harus selalu ada minimal satu role admin; harus selalu ada tepat satu status awal; admin tidak dapat
menghapus atau menurunkan akunnya sendiri.

### IDOR (akses objek milik orang lain)

- **Aksi "milik saya"** (`/auth/me`, `/auth/change-password`) selalu memakai identitas dari token yang sudah
  diverifikasi, tidak pernah ID dari body atau URL.
- **Aksi atas pengguna lain** (`/users/:id`) hanya untuk admin.
- **Dokumen usaha** (PO, invoice, dokumen BC, barang, mitra) adalah data bersama satu perusahaan, bukan milik per
  pengguna: akses ditentukan role, bukan kepemilikan. Ini sama dengan aplikasi aslinya. Pembatas objeknya adalah
  **status**: dokumen yang sudah dikirim ke CEISA tidak dapat diubah atau dihapus oleh siapa pun.
- Semua parameter ID divalidasi (bilangan bulat positif); ID yang tidak ada menghasilkan 404, bukan error server.

## Kontrol yang berlaku

| Area | Kontrol |
|---|---|
| Token | JWT HS256 dengan **audiens** (`inventory-app`), `iat`/`exp` 8 jam, dan **versi token** per pengguna. Token hanya membuktikan identitas; user, role, dan izin dibaca ulang dari DB |
| Pemisahan kunci | Token gateway CEISA tiruan memakai kunci turunan dan audiens sendiri, sehingga tidak pernah berlaku di API aplikasi (celah yang ditemukan audit, lihat bawah) |
| Pencabutan sesi | Ganti password (sendiri atau oleh admin) menaikkan versi token: semua token lama mati. Pengguna dihapus atau role diturunkan: berlaku seketika |
| Brute force | 5 kegagalan per (alamat + email) dan 20 per email dalam 15 menit mengunci 15 menit (`429` + `Retry-After`), tersimpan di tabel `login_attempts`. Alamat lain tidak ikut terkunci |
| Enumerasi akun | Email tidak ada dan password salah: pesan dan waktu respons sama (hash umpan) |
| Password | Hash PBKDF2-SHA256 (100.000 iterasi, batas Cloudflare Workers) dengan jumlah iterasi tercatat di hash. Kebijakan: 10 sampai 128 karakter, wajib huruf dan angka |
| Secret | `JWT_SECRET` wajib minimal 32 karakter, jika tidak server menolak melayani |
| Akun demo | Akun di tabel `demo_accounts` tidak dapat diubah atau dihapus lewat API, dan mode demo tidak dapat dimatikan lewat pengaturan |
| Input | Semua body divalidasi Zod (field tak dikenal dibuang), kolom sortir di-whitelist, pencarian memakai parameter terikat, `pageSize` dibatasi, body maksimal 256 KB |
| Database | Semua query terparameter (Drizzle); foreign key membuat database sendiri menolak kode tidak sah |
| Transport/CORS | HTTP polos dialihkan ke HTTPS oleh API (308) dan HSTS aktif; hanya origin di `CORS_ORIGINS` yang diizinkan; tanpa cookie sehingga CSRF tidak relevan |
| Respons | `Cache-Control: no-store`, `secureHeaders`, error server tidak membocorkan detail, hash password tidak pernah dikirim |
| Jejak | Login berhasil dan gagal, serta semua perubahan, tercatat di `audit_logs` (tanpa password) |
| Frontend | CSP (`connect-src` hanya ke API sendiri, `frame-ancestors 'none'`), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS di produksi |
| Dependensi | `npm audit`: 0 kerentanan (BE dan FE) |

## Temuan audit: bypass autentikasi lewat token gateway CEISA tiruan (sudah diperbaiki)

Endpoint `POST /mock-ceisa/nle-oauth/v1/user/login` menerbitkan token untuk username dan password apa pun, dan token itu
ditandatangani dengan kunci yang sama dengan token aplikasi. Middleware login tidak memeriksa isi token, sehingga token
tiruan itu diterima oleh seluruh endpoint **baca** aplikasi tanpa akun apa pun. Perbaikan: kunci dan audiens terpisah,
middleware mewajibkan `sub` dan versi token yang cocok dengan database. Dijaga oleh tes regresi
(`token gateway CEISA tiruan tidak berlaku di API aplikasi`).

## Pengujian

`npm test` menjalankan 32 tes, termasuk `test/security.test.ts` yang menjalankan aplikasi sungguhan dengan database:
matriks hak akses setiap endpoint untuk setiap role, token palsu (manipulasi, `alg: none`, kunci lain, kedaluwarsa,
audiens salah), pencabutan sesi, brute force, enumerasi, kebijakan password, akun demo, injeksi SQL, batas ukuran,
CORS, dan kebocoran data. Tes ini butuh `DATABASE_URL` dan `JWT_SECRET` (dibaca dari `.env`) dan database yang sudah
di-seed; tanpa itu dilewati.

## Risiko yang diterima (dan cara mengatasinya saat dipakai sungguhan)

| Risiko | Mengapa diterima | Untuk produksi |
|---|---|---|
| Akun demo (termasuk admin) ditampilkan di halaman login | Tujuan prototipe adalah bisa dicoba pengunjung | Kosongkan tabel `demo_accounts` dan `app_settings.demo_password`, ganti password akun |
| Pengunjung dengan akun admin demo bisa menghapus atau merusak **data** (bukan akun) | Data fiktif | Reset dengan `npx tsx scripts/seed.ts` secara berkala |
| Token di `localStorage` (rentan jika ada XSS) | Frontend dan API beda domain, cookie `httpOnly` diblokir browser sebagai cookie pihak ketiga. Kompensasi: tanpa sink XSS, CSP, umur 8 jam, pencabutan sesi | Domain sendiri untuk keduanya, token di cookie `httpOnly; Secure; SameSite=Lax` |
| CSP memakai `'unsafe-inline'` untuk skrip | Dibutuhkan bootstrap Next.js pada halaman statis | Render dinamis dengan CSP berbasis nonce |
| PBKDF2 100.000 iterasi | Batas Cloudflare Workers; sudah sesuai batas, jumlah iterasi tercatat di hash | Argon2id jika pindah ke runtime lain |
| Aplikasi terhubung ke database sebagai role pemilik | Satu role untuk skema dan data demi kesederhanaan | Role aplikasi khusus (DML saja) terpisah dari role migrasi |
| Pembatasan laju hanya di login | Endpoint lain sudah dibatasi `pageSize`, ukuran body, dan wajib login | Aturan rate limiting Cloudflare (WAF) per IP |
| `GET` dokumen BC dapat memajukan tahap respon CEISA tiruan | Mekanisme tiruan tanpa cron; deterministik, tidak ada input penyerang, dan aman terhadap akses bersamaan | Tidak berlaku pada integrasi CEISA sungguhan |

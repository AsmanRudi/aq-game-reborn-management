# AQ GAME REBORN MANAGEMENT

Sistem manajemen rental PS3/PS4 untuk operasional Bungus Teluk Kabung, Padang. Proyek ini berdiri sendiri dan tidak mengubah aplikasi FoodApp.

## Prasyarat
- Node.js 22 atau lebih baru dan npm
- PostgreSQL 15 atau lebih baru

## Menjalankan lokal
1. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL` dan `SESSION_SECRET` acak minimal 32 karakter.
2. Buat database PostgreSQL kosong sesuai URL.
3. Jalankan `npm install`.
4. Jalankan `npm run db:generate` lalu `npm run db:migrate` setelah meninjau migrasi lokal.
5. Jalankan `npm run dev`; web di port Vite dan API di `http://localhost:3000`.

## Status implementasi
Dashboard membaca ringkasan melalui API dan memisahkan kesiapan konfigurasi station dari status operasional; sesi aktif dan booking terkonfirmasi tetap terlihat meskipun station belum dikonfirmasi. Perubahan API dan dashboard pada skema terbaru memerlukan migrasi aditif yang masih menunggu persetujuan sebelum aplikasi dijalankan terhadap database lokal. Database lokal telah memiliki record staf, pelanggan, booking, sesi dan tarif, sehingga jangan memperlakukannya sebagai database kosong. Harga PS3/PS4 yang diminta dan paket PS Box disiapkan sebagai versi tarif nonaktif; tarif lama tidak dinonaktifkan otomatis. Autentikasi, booking, pembayaran, reward/voucher, laporan lengkap, backup dan pemulihan masih memerlukan implementasi.

## Seed dan migrasi
`npm run db` dan `npm run db:seed` menampilkan rencana read-only secara default. Jika skema belum dimigrasikan, seed menandai rencana sebagai tidak lengkap dan menyebutkan prasyarat, tanpa menulis data. Seed tidak membuat staf, pelanggan, booking, sesi, invoice, atau pembayaran contoh, tidak mengubah record yang sudah ada, tidak menghapus data, tidak menonaktifkan tarif lama, dan tidak mengaktifkan tarif target. Seed apply memerlukan migrasi yang sudah ditinjau dan variabel `AQ_RATE_EFFECTIVE_FROM` dengan waktu ISO-8601 yang disetujui. Tinjau SQL migrasi, backup, serta dampaknya terhadap operasional terlebih dahulu. Jangan jalankan migrasi atau seed apply tanpa persetujuan eksplisit.

API saat ini belum memiliki autentikasi atau role-check. Mutasi station, tarif, dan sesi belum aman untuk produksi; jangan menambahkan atau menggunakan operasi administratif/konfirmasi station sampai autentikasi staff, otorisasi server-side, dan audit log diterapkan.

## API dasar
- `GET /api/v1/health` memeriksa proses API (belum memeriksa kesiapan database).

## Keamanan dan operasional
Jangan commit `.env`. Jangan jalankan migrasi produksi, restore database, atau deployment tanpa pemeriksaan target, backup teruji, dan persetujuan. Prosedur backup/restore lengkap disusun sebelum milestone operasional dirilis.

Rincian produk, alur, desain teknis/data, kriteria uji, dan instruksi agent ada di `docs/` serta `AGENTS.md`.

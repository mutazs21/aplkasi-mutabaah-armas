# Mutabaah Yaumiyah

Aplikasi pencatatan mutabaah harian (sholat, istighfar, puasa, Al-Quran) untuk kelompok kecil, dengan
dua peran: **anggota** (mengisi dan melihat perkembangan) dan **admin** (memantau seluruh anggota).

- Frontend: HTML, Tailwind CSS (Play CDN 3.4.17), Lucide 0.469.0, JavaScript biasa (tanpa build)
- Backend: Google Apps Script (Web App)
- Database: Google Sheets
- Zona waktu: Asia/Jakarta

## Struktur frontend

```text
mutabaah/
├── index.html
├── css/  style.css  analitik.css  admin.css  leaderboard.css  integrasi.css  responsif.css
├── js/   core.js  charts.js  auth.js  user.js  admin.js  leaderboard.js  integrasi.js  main.js
└── README.md
```

Urutan muat skrip wajib: `core, charts, auth, user, admin, leaderboard, integrasi, main` (`main.js` terakhir).
CSS: `responsif.css` dimuat terakhir. Setelah menempel file, jalankan `ujiIntegrasi()` di Console.

## Backend (Apps Script)

`Code.gs` (setup, Config, menu), `Api.gs` (router, login anggota), `Riwayat.gs` (penulisan data),
`Ringkas.gs`, `Dashboard.gs`, `Skor.gs` (mesin perhitungan murni), `Agregat.gs` (admin),
`Leaderboard.gs`, `AdminAuth.gs`, `Versi.gs`, `Admin.gs` (alat pemeliharaan),
`PeriksaSistem.gs`, `Diagnosa.gs`, dan file tes (`Tes*.gs`).

Action: `anggota`, `login`, `ringkasBulan`, `simpanRingkas`, `leaderboard` (anggota dan admin),
`adminLogin`, `adminSaya`, `adminRingkasan` (admin saja), serta action lama untuk kompatibilitas.

## Peran dan keamanan

- **Anggota:** nama + PIN 4 angka. Hanya data sendiri yang bisa dibaca atau ditulis. Identitas hanya dari token.
- **Admin:** akun terpisah di sheet `Admin` (bukan bagian dari anggota). Password disimpan sebagai hash,
  dibuat lewat menu **Mutabaah → Buat/ubah akun admin** (tidak pernah ada di kode atau Sheet).
  Token admin kedaluwarsa 8 jam di server, disimpan di `sessionStorage`.
  Mengganti password atau menonaktifkan akun mencabut semua token lamanya.
- Peran hanya ditentukan backend dari token. Field `role` atau `id` dari browser tidak pernah dibaca.
- Leaderboard hanya mengirim nama dan angka agregat (tanpa ID dan tanpa catatan harian).
- Sesi anggota: kedaluwarsa 7 hari tanpa dibuka, maksimal 30 hari (ditegakkan di browser).
- Satu identitas aktif per perangkat: login anggota menghapus sesi admin dan sebaliknya.
- Batas yang perlu diketahui: Apps Script tidak punya bcrypt/argon2, PIN 4 angka mudah ditebak,
  PIN anggota tersimpan di Sheet (bagikan Sheet hanya ke pengelola), dan token anggota tidak punya
  kedaluwarsa di server. Jangan hapus properti `TOKEN_SECRET` dan `ADMIN_PEPPER` kecuali ingin mencabut semua sesi.

## Penilaian (ringkas)

Skor harian 0-100: sholat wajib 45, berjamaah 15, sunnah 10, istighfar 10, Al-Quran 20 (target 5 halaman).
Performa = rata-rata skor hari yang sudah selesai + bonus puasa maksimal 5, dibatasi 100.
Hari lengkap = 5 sholat wajib + istighfar. Rasio dihitung sampai kemarin; total Al-Quran dan berjamaah
menyertakan hari ini. Penjelasan lengkap tampil di aplikasi (Peringkat → Cara penilaian).
Target ada di sheet `Config`; bobot ada di `Skor.gs`.

## Config (sheet Config)

`ZonaWaktu`, `MaksPercobaanPIN`, `BlokirMenit`, `TanggalMulaiProgram` (2026-11-01), `TargetHalamanHarian`,
`TargetPuasaRasio`, `AdminTokenJam`, `AdminMaksPercobaan`, `AdminBlokirMenit`, `CacheAgregatMenit`.
Baris yang kurang ditambahkan lewat menu **Siapkan konfigurasi & sheet Admin** (tidak menimpa data).

## Deployment

1. Backend: tempel file `.gs`, jalankan menu **Siapkan konfigurasi & sheet Admin**, buat akun admin,
   lalu **Deploy → Kelola deployment → pensil → Versi baru** (URL tidak berubah).
2. Frontend: isi `CONFIG.API_URL` di `js/core.js`, uji di lokal (`python3 -m http.server 8000`),
   lalu unggah seluruh folder ke GitHub Pages dalam satu commit.
3. Urutan saat memperbarui: **backend dulu, frontend sesudahnya**.

## Pemeliharaan

- Anggota baru: tambah baris di sheet `Anggota` (ID, Nama, Status `Aktif`, PIN 4 angka). Anggota keluar: `Nonaktif`.
- Ganti PIN: ubah di sheet `Anggota` (sesi lama orang itu otomatis tidak berlaku).
- Setelah mengedit atau menghapus data langsung di Sheet: menu **Segarkan cache data**.
- Kesehatan sistem: jalankan `periksaSistem()` (hanya membaca). Data ganda: `diagnosaGanda()` (hanya membaca).
- Backup: File → Buat salinan, secara berkala. Bagikan Sheet hanya ke pengelola.

## Pengujian

- Backend: `testRole`, `testSkor`, `testAdmin`, `testLeaderboard` (aman, tidak menulis data anggota).
  `testFinal`, `testPerforma`, `testStep14/15` menulis data sementara untuk M01 dan M02, jadi jalankan hanya
  di salinan spreadsheet atau di luar jam pemakaian.
- Frontend: `ujiIntegrasi()` di Console, lalu checklist per layar.
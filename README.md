# Mutabaah Yaumiyah

Aplikasi web pencatatan mutabaah harian (sholat, istighfar, puasa, Al-Quran) untuk kelompok kecil.

- Frontend: HTML + Tailwind CSS (CDN) + JavaScript, tanpa build system
- Backend: Google Apps Script (Web App)
- Database: Google Sheets (`Anggota`, `Mutabaah`, `Config`)

## Struktur

```text
mutabaah/
├── index.html      semua layar dan markup Tailwind
├── css/style.css   gaya khusus (cincin progress, kalender, safe-area, animasi)
├── js/app.js       logika: API, sesi, cache, tampilan
└── README.md
```

Library eksternal (versi dikunci): Tailwind Play CDN 3.4.17 dan Lucide 0.469.0 (jsDelivr).

## Konfigurasi

Buka `js/app.js`, isi `CONFIG.API_URL` dengan URL Web App Apps Script (berakhiran `/exec`).

Pengaturan lain di `CONFIG`:

| Nama | Arti | Bawaan |
|---|---|---|
| `SESI_IDLE_MS` | Sesi habis jika tidak dibuka selama ini | 7 hari |
| `SESI_MAKS_MS` | Batas mutlak umur sesi sejak login | 30 hari |
| `BATAS_SEGAR_MS` | Data cache lebih tua dari ini diperbarui di background | 60 detik |

## Menjalankan lokal

```bash
cd mutabaah
python3 -m http.server 8000
```

Buka `http://localhost:8000`. Jangan membuka lewat `file:///` (beberapa fitur browser dibatasi).

## Deployment (frontend statis)

**Netlify Drop:** buka https://app.netlify.com/drop, seret folder `mutabaah` (seluruh folder, bukan file satu per satu).
Pembaruan: tab Deploys, seret folder baru.

**GitHub Pages:** unggah isi folder `mutabaah` ke repository, lalu Settings, Pages, pilih branch dan folder root.

Backend tidak ikut berubah saat frontend dipindah hosting. Setelah mengubah kode Apps Script:
Deploy, Kelola deployment, pensil, Versi baru, Deploy (URL tidak berubah).

## Session

- Login nama + PIN 4 digit. Backend mengembalikan token. PIN tidak pernah disimpan di perangkat.
- `localStorage` (`mutabaah_sesi_v1`) berisi token, id, nama, `dibuat`, `terakhirAktif`.
- Sesi berakhir jika tidak dibuka 7 hari, atau 30 hari sejak login. Lalu kembali ke halaman awal.
- Token ditolak server jika PIN diganti di Sheet atau anggota dinonaktifkan: pengguna langsung keluar.
- Batas: masa berlaku sesi ditegakkan di browser. Token yang disalin tetap valid di server
  sampai PIN diganti atau `TOKEN_SECRET` dihapus (Pengaturan Proyek, Properti Skrip).

## Performa

Data per bulan diambil dengan satu request (`ringkasBulan`) dan disimpan di memori halaman.
Pindah tab tidak membuat request. Data lebih tua dari 60 detik diperbarui di background.
Menyimpan memakai `simpanRingkas` yang langsung memperbarui cache.

## Pemeliharaan

- Anggota baru: tambah baris di sheet `Anggota` (ID, Nama, Status `Aktif`, PIN 4 angka).
- Anggota keluar: Status `Nonaktif` (jangan hapus baris).
- Ganti PIN: ubah di sheet `Anggota`. Sesi lama orang itu otomatis tidak berlaku.
- Periksa isi Sheet: jalankan `periksaDatabase()` di editor Apps Script.
- Backup: File, Buat salinan, pada Google Sheet, secara berkala.
- Bagikan Google Sheet hanya ke admin (kolom PIN terlihat oleh yang punya akses).

## Pengujian

Backend: jalankan `testFinal()` di editor Apps Script (harus 0 GAGAL).
Frontend: ikuti checklist UI final (lihat dokumentasi proyek).
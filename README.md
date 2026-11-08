# Mutabaah Yaumiyah

Aplikasi web untuk mencatat, memantau, dan mengevaluasi aktivitas ibadah harian secara praktis. Dirancang dengan tampilan modern, sederhana, dan responsif agar nyaman digunakan melalui perangkat mobile maupun desktop.

## ✨ Fitur Utama

### 1. Login Pengguna
- Login menggunakan pilihan nama pengguna dan PIN 4 digit.
- Setiap pengguna hanya dapat melihat dan mengelola data mutabaah miliknya sendiri.
- Sistem autentikasi menggunakan token.
- Sesi login berlaku selama 7 hari sejak aktivitas terakhir, dengan batas maksimal 30 hari.

### 2. Dashboard
- Menampilkan ringkasan aktivitas mutabaah.
- Menampilkan statistik ibadah.
- Memudahkan pengguna memantau perkembangan ibadah harian.

### 3. Mutabaah Harian
Mencatat aktivitas ibadah harian, meliputi:

**Sholat**
- Tahajjud
- Subuh
- Dhuha
- Dzuhur
- Ashar
- Magrib
- Isya

Pilihan status sholat:
- Tidak Sholat
- Sholat Sendiri
- Sholat Berjamaah

**Aktivitas lainnya**
- Istighfar 100 kali (Belum / Sudah).
- Puasa (Tidak / Ya).
- Membaca Al-Quran (jumlah halaman).

### 4. Kalender Mutabaah
- Melihat catatan mutabaah berdasarkan tanggal.
- Memantau aktivitas harian melalui kalender.
- Memudahkan pengguna mengetahui hari yang sudah atau belum diisi.

### 5. Riwayat Mutabaah
- Melihat riwayat pencatatan ibadah.
- Menelusuri catatan berdasarkan tanggal.
- Mengakses detail aktivitas yang telah dicatat.

### 6. Pengisian dan Edit Data
- Mengisi mutabaah harian.
- Mengedit catatan tanggal sebelumnya.
- Mencegah pengisian tanggal di masa mendatang.
- Data yang sudah tersedia diperbarui, bukan dibuat sebagai catatan duplikat.

### 7. Desain Antarmuka
- Tampilan modern setelah redesign.
- Menggunakan Tailwind CSS dan Lucide Icons.
- Desain mobile-first.
- Navigasi dan komponen dirancang agar mudah digunakan.
- Tampilan menyesuaikan ukuran layar perangkat.

## 🛠️ Teknologi

| Bagian | Teknologi |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| CSS Framework | Tailwind CSS Play CDN |
| Icons | Lucide Icons |
| Backend | Google Apps Script |
| Database | Google Sheets |
| Hosting Frontend | GitHub Pages |
| Hosting Backend | Google Apps Script Web App |

## 📁 Struktur Folder

```text
mutabaah/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── README.md
```

Backend Google Apps Script dikelola secara terpisah dengan file:

```text
Code.gs
Api.gs
Admin.gs
```

## ⚙️ Konfigurasi

Sebelum menjalankan aplikasi, pastikan konfigurasi frontend sudah diarahkan ke URL Google Apps Script Web App yang benar.

Hal yang perlu diperhatikan:
- URL API harus sesuai dengan deployment Google Apps Script.
- Database Google Sheets harus tetap bersifat privat.
- PIN pengguna harus menggunakan PIN yang telah ditentukan.
- Konfigurasi rahasia backend tidak boleh dibagikan secara publik.

## 🚀 Deployment

### Frontend
1. Upload seluruh file frontend ke repository GitHub.
2. Pastikan struktur folder tetap sesuai.
3. Aktifkan GitHub Pages melalui pengaturan repository.
4. Pilih branch `main` dan folder publikasi yang sesuai.
5. Akses aplikasi melalui URL GitHub Pages.

### Backend
1. Buka proyek Google Apps Script.
2. Pastikan file backend sudah tersedia.
3. Deploy sebagai Web App.
4. Atur **Execute as: Me**.
5. Atur akses sesuai konfigurasi aplikasi.
6. Salin URL deployment dan pastikan frontend menggunakan URL tersebut.

## ⚡ Optimasi Performa

Aplikasi menggunakan mekanisme cache untuk mengurangi permintaan API yang tidak diperlukan.

Beberapa optimasi:
- Cache ringkasan data di frontend.
- Perpindahan tab memanfaatkan cache selama masih berlaku.
- Pembaruan ringkasan dilakukan di latar belakang.
- Cache diperbarui setelah penyimpanan data.
- Pengambilan data disesuaikan dengan kebutuhan pengguna yang sedang login.

## 🔐 Keamanan dan Privasi

- Setiap pengguna memiliki akses ke data mutabaah miliknya sendiri.
- Autentikasi menggunakan PIN dan token.
- Validasi dilakukan pada backend.
- Data pengguna tidak dibuka secara langsung kepada publik.
- Google Sheets tidak dibagikan secara publik.
- Tanggal di masa mendatang tidak dapat diisi.
- Penyimpanan data menggunakan mekanisme pengamanan untuk menghindari konflik penulisan.

## 🕒 Zona Waktu

Aplikasi menggunakan zona waktu:

`Asia/Jakarta (WIB)`

## 📌 Catatan

- Aplikasi menggunakan Google Sheets sebagai database.
- Backend berjalan melalui Google Apps Script.
- Frontend dan backend dikelola secara terpisah.
- Jangan menghapus atau mengubah struktur database secara sembarangan karena dapat memengaruhi data yang sudah tersimpan.

## 📄 Lisensi

Project ini dikembangkan untuk kebutuhan pencatatan dan pemantauan ibadah harian secara pribadi maupun bersama.

---

**Mutabaah Yaumiyah**  
*Mencatat kebaikan, menjaga konsistensi, memperbaiki diri setiap hari.*
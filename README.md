# Mutabaah Harian

Aplikasi web **Mutabaah Harian** untuk membantu mencatat dan memantau ibadah harian secara praktis melalui perangkat mobile.

Aplikasi ini dibuat dengan tampilan sederhana, responsif, dan mudah digunakan sehingga pengguna dapat mengisi mutabaah tanpa perlu membuka atau mengakses database secara langsung.

## ✨ Fitur

- 🔐 Login menggunakan nama dan PIN
- 🕌 Pencatatan sholat harian:
  - Tahajjud
  - Subuh
  - Dhuha
  - Dzuhur
  - Ashar
  - Magrib
  - Isya
- 📿 Pencatatan Istighfar 100x
- 🌙 Pencatatan Puasa
- 📖 Pencatatan jumlah halaman Al-Qur'an
- 📅 Mengisi atau mengedit mutabaah pada tanggal sebelumnya
- 📊 Dashboard statistik mutabaah
- 🗓️ Kalender mutabaah bulanan
- 📋 Riwayat mutabaah
- 📱 Responsive untuk perangkat mobile
- 🔒 Setiap pengguna hanya dapat mengakses data miliknya sendiri

## 🛠️ Teknologi

- HTML
- CSS
- JavaScript
- Google Apps Script
- Google Sheets

## 🏗️ Arsitektur

Frontend aplikasi menggunakan **HTML, CSS, dan JavaScript**, sedangkan Google Apps Script digunakan sebagai backend/API.

Data mutabaah disimpan pada **Google Sheets** sebagai database. Pengguna tidak mengakses Google Sheets secara langsung, melainkan berinteraksi melalui aplikasi web.

```text
User
  ↓
Web App
  ↓
Google Apps Script API
  ↓
Google Sheets
```

## 🔐 Keamanan

Aplikasi menerapkan beberapa mekanisme keamanan, di antaranya:

- Autentikasi menggunakan ID pengguna dan PIN
- Token sesi untuk akses API
- Validasi akses berdasarkan pengguna yang sedang login
- Pencegahan akses data pengguna lain
- Pembatasan percobaan PIN
- Validasi tanggal dan data yang dikirim ke server
- Pencegahan duplikasi data
- Database hanya digunakan oleh backend/admin

> **Catatan:** PIN contoh yang digunakan selama tahap pengembangan harus diganti sebelum aplikasi digunakan secara nyata.

## 📱 Tampilan

Aplikasi dirancang dengan pendekatan **mobile-first** agar proses pengisian mutabaah dapat dilakukan dengan cepat dan nyaman melalui smartphone.

## 📌 Status

**Development selesai dan telah melalui pengujian backend, keamanan, validasi data, responsive layout, serta performa dasar.**

## 👤 Pengembang

**Mumtaaz Abdurrahman**

---

> Project ini dibuat untuk membantu pencatatan dan pemantauan mutabaah harian secara lebih praktis melalui aplikasi web.

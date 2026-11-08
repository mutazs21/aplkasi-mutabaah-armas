'use strict';

/**
 * main.js — Alur utama, pemasangan event, dan boot.
 * HARUS dimuat paling akhir (setelah core.js, charts.js, auth.js, user.js).
 */

// ====================== ALUR UTAMA ======================

/** Titik awal aplikasi: dashboard jika sudah login, landing jika belum/kedaluwarsa. */
async function mulai() {
  navId++;

  if (!apiSudahDiisi()) {
    tampilError('Alamat API belum diisi. Buka js/core.js dan isi CONFIG.API_URL dengan URL Web App (berakhiran /exec).');
    return;
  }

  if (bacaSesi()) {
    perbaruiAktivitas(true);
    await bukaBulan('dashboard', null, true);
    return;
  }

  tampilLanding();
}

/** Keluar dari akun ini: hapus sesi dan cache, kembali ke landing. */
function gantiPengguna() {
  navId++;
  hapusSesi(); // juga mengosongkan cache
  tampilLanding();
}


// ====================== SAAT KEMBALI KE APLIKASI ======================

/**
 * Dipanggil saat aplikasi kembali terlihat (tab dibuka lagi, HP dibuka lagi).
 * Memeriksa masa berlaku sesi: jika kedaluwarsa, keluar ke landing.
 * Mengembalikan true jika sesi masih berlaku.
 */
function cekSesiSaatKembali() {
  const sesi = bacaSesi();
  if (sesi) {
    perbaruiAktivitas(false);
    return true;
  }
  if (sesiBaruKedaluwarsa) {
    navId++;
    tampilLanding(); // menampilkan notifikasi "Sesi berakhir..."
  }
  return false;
}

/**
 * Hanya untuk form HARI INI: jika tanggal server sudah berbeda dari yang tampil,
 * form dimuat ulang. Form tanggal lama (dari riwayat) tidak disentuh.
 * Jika tanggal masih sama, isi form yang sedang diketik TIDAK diubah.
 * Masalah koneksi diabaikan (tidak mengganggu pengguna).
 */
async function cekTanggalSaatKembali() {
  if (!formSedangTampil() || modeForm !== 'hariIni') return;
  if (sedangMenyimpan || sedangCekTanggal) return;
  if (Date.now() - waktuCekTerakhir < CONFIG.JEDA_CEK_TANGGAL_MS) return;
  if (!bacaSesi()) return;

  sedangCekTanggal = true;
  waktuCekTerakhir = Date.now();
  const hasil = await muatRingkas(null);
  sedangCekTanggal = false;

  // Pengguna mungkin sudah pindah layar atau mulai menyimpan selama menunggu
  if (!formSedangTampil() || modeForm !== 'hariIni' || sedangMenyimpan) return;

  if (hasil.ok) {
    muatUlangFormJikaHariBerganti(hasil);
    return;
  }

  if (hasil.kode === 'TOKEN_TIDAK_VALID') {
    await tanganiTokenTidakValid(hasil);
  }
  // Kode lain (masalah koneksi): abaikan
}


// ====================== PASANG EVENT ======================

function pasangEvent() {
  $('tombol-coba-lagi').addEventListener('click', function () {
    (aksiCobaLagi || mulai)();
  });
  $('tombol-error-awal').addEventListener('click', mulai);

  // Landing -> daftar nama -> PIN
  $('tombol-mulai').addEventListener('click', tampilPilihNama);
  $('tombol-nama-kembali').addEventListener('click', function () { tampilLanding(); });
  $('tombol-kembali').addEventListener('click', function () {
    anggotaTerpilih = null;
    pinDiisi = '';
    tampil('layar-nama');
  });

  // Keluar (tiga tempat: dashboard, form, sidebar desktop)
  $('tombol-ganti-pengguna').addEventListener('click', gantiPengguna);
  $('tombol-ganti-dashboard').addEventListener('click', gantiPengguna);
  $('nav-keluar').addEventListener('click', gantiPengguna);

  // Keypad PIN (satu pendengar untuk semua tombol)
  $('keypad').addEventListener('click', function (e) {
    const tombol = e.target.closest('button');
    if (!tombol || tombol.disabled) return;
    if (tombol.getAttribute('data-aksi') === 'hapus') {
      hapusAngka();
    } else if (tombol.hasAttribute('data-angka')) {
      tekanAngka(tombol.getAttribute('data-angka'));
    }
  });

  // Keyboard fisik di layar PIN (angka dan Backspace)
  document.addEventListener('keydown', function (e) {
    if (!layarTampil('layar-pin')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) {
      tekanAngka(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      hapusAngka();
    }
  });

  // Navigasi: menekan tab yang sedang aktif tidak membuat request
  $('nav-dashboard').addEventListener('click', function () {
    if (layarTampil('layar-dashboard')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    bukaBulan('dashboard', null);
  });
  $('nav-isi').addEventListener('click', function () {
    if (formSedangTampil() && modeForm === 'hariIni') {
      window.scrollTo({ top: 0, behavior: 'smooth' }); // sudah di form: jangan muat ulang
      return;
    }
    bukaFormHariIni();
  });
  $('nav-riwayat').addEventListener('click', function () {
    if (layarTampil('layar-riwayat')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    asalDetail = 'riwayat';
    bukaBulan('riwayat', null);
  });

  // Dashboard: ganti bulan (instan jika bulan itu sudah pernah dibuka)
  $('pilih-bulan').addEventListener('change', function () {
    bukaBulan('dashboard', this.value);
  });

  // Dashboard: kartu hari ini dan grafik
  $('tombol-dash-isi').addEventListener('click', function () { bukaFormHariIni(); });
  $('tab-grafik').addEventListener('click', function (e) {
    const tombol = e.target.closest('button');
    if (tombol) aturGrafik(tombol.getAttribute('data-jenis'), null);
  });
  $('skala-grafik').addEventListener('click', function (e) {
    const tombol = e.target.closest('button');
    if (tombol) aturGrafik(null, tombol.getAttribute('data-skala'));
  });

  // Gambar ulang grafik saat ukuran layar berubah (ditunda agar tidak berat)
  let timerUkuran = null;
  window.addEventListener('resize', function () {
    if (timerUkuran) clearTimeout(timerUkuran);
    timerUkuran = setTimeout(function () {
      if (layarTampil('layar-dashboard')) gambarGrafikDash();
    }, 150);
  });

  // Form mutabaah
  $('form-mutabaah').addEventListener('submit', function (e) {
    e.preventDefault();
    prosesSimpan();
  });
  $('input-alquran').addEventListener('input', bacaInputAlquran);
  $('tombol-kurang').addEventListener('click', function () { ubahAlquran(-1); });
  $('tombol-tambah').addEventListener('click', function () { ubahAlquran(1); });
  $('chip-alquran').addEventListener('click', function (e) {
    const tombol = e.target.closest('button');
    if (!tombol) return;
    if (tombol.hasAttribute('data-set')) {
      setAlquran(Number(tombol.getAttribute('data-set')));
    } else if (tombol.hasAttribute('data-tambah')) {
      ubahAlquran(Number(tombol.getAttribute('data-tambah')));
    }
  });

  // Riwayat dan detail
  $('tombol-bulan-sebelumnya').addEventListener('click', function () {
    if (bulanSebelumnya) bukaBulan('riwayat', bulanSebelumnya);
  });
  $('tombol-bulan-berikutnya').addEventListener('click', function () {
    if (bulanBerikutnya) bukaBulan('riwayat', bulanBerikutnya);
  });
  $('tombol-detail-kembali').addEventListener('click', function () {
    const bulan = detailTerakhir ? detailTerakhir.tanggal.substring(0, 7) : null;
    kembaliDariDetail(bulan);
  });
  $('tombol-isi-edit').addEventListener('click', function () {
    if (detailTerakhir) tampilForm(detailTerakhir, 'lampau');
  });
  $('tombol-form-kembali').addEventListener('click', function () {
    kembaliDariDetail(tanggalForm ? tanggalForm.substring(0, 7) : null);
  });

  // Saat pengguna kembali ke aplikasi: periksa masa berlaku sesi, lalu tanggal form hari ini
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      if (cekSesiSaatKembali()) {
        cekTanggalSaatKembali();
      }
    }
  });
}


// ====================== BOOT ======================

pasangEvent();
mulai();

// Tampilkan halaman setelah Tailwind sempat memproses kelas (mencegah kilasan tanpa gaya)
requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    document.documentElement.classList.add('siap');
  });
});
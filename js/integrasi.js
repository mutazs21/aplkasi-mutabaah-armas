'use strict';

/**
 * integrasi.js — Penyelarasan lintas peran dan layar (STEP 8).
 * Dimuat setelah leaderboard.js dan sebelum main.js. Tidak mengubah file lain;
 * hanya membungkus beberapa fungsi global.
 *
 * 1. Satu identitas aktif: login anggota menghapus sesi admin, login admin menghapus sesi anggota.
 * 2. levelHari disamakan dengan mesin backend (5 sholat wajib + istighfar, plus "catatan nol").
 * 3. Penangkap error global (toast ramah; detail hanya di Console).
 * 4. ujiIntegrasi(): pemeriksaan baca-saja dari Console.
 */

// ====================== 1. SATU IDENTITAS AKTIF ======================

const simpanSesiSebelumIntegrasi = simpanSesi;
simpanSesi = function (sesi) {
  hapusSesiAdm(); // anggota login: sesi admin di perangkat ini tidak dipakai bersamaan
  return simpanSesiSebelumIntegrasi(sesi);
};

const tulisSesiAdmSebelumIntegrasi = tulisSesiAdm;
tulisSesiAdm = function (s) {
  hapusSesi(); // admin login: sesi anggota di perangkat ini tidak dipakai bersamaan
  tulisSesiAdmSebelumIntegrasi(s);
};


// ====================== 2. LEVEL HARI (SAMA DENGAN BACKEND) ======================

const SHOLAT_WAJIB_UI = ['subuh', 'dzuhur', 'ashar', 'magrib', 'isya'];

/**
 * Tingkat satu hari untuk kartu Riwayat. Aturan sama dengan Skor.gs:
 * 'nol'    = ada catatan tetapi tidak ada ibadah terlaksana
 * 'rendah' = kelengkapan 0-3, 'sedang' = 4-5, 'penuh' = 6 (5 sholat wajib + istighfar)
 */
levelHari = function (data) {
  let wajib = 0;
  SHOLAT_WAJIB_UI.forEach(function (k) {
    if (Number(data[k]) >= 1) wajib++;
  });
  const istighfar = Number(data.istighfar) === 1 ? 1 : 0;
  const aktif = DAFTAR_SHOLAT.some(function (s) { return Number(data[s.kunci]) >= 1; }) ||
                istighfar === 1 || Number(data.puasa) === 1 || Number(data.alquran) > 0;
  if (!aktif) return 'nol';
  const kelengkapan = wajib + istighfar;
  if (kelengkapan >= 6) return 'penuh';
  if (kelengkapan >= 4) return 'sedang';
  return 'rendah';
};


// ====================== 3. PENANGKAP ERROR GLOBAL ======================

let waktuGalatTerakhir = 0;

function laporGalat(rincian) {
  console.error('Galat aplikasi:', rincian);
  if (Date.now() - waktuGalatTerakhir < 8000) return;
  waktuGalatTerakhir = Date.now();
  try {
    tampilToast('Terjadi kesalahan pada aplikasi. Muat ulang halaman jika tampilan tidak normal.', 'error');
  } catch (err) {
    // abaikan
  }
}

window.addEventListener('error', function (e) {
  if (e && e.message && e.message.indexOf('ResizeObserver') !== -1) return;
  laporGalat(e && e.message);
});

window.addEventListener('unhandledrejection', function (e) {
  laporGalat(e && e.reason);
});


// ====================== 4. UJI INTEGRASI (BACA-SAJA) ======================

/**
 * Jalankan dari Console: ujiIntegrasi(). Tidak mengubah tampilan, sesi, atau data.
 * Memeriksa urutan skrip, fungsi, ID elemen, navigasi, dan aturan level hari.
 */
function ujiIntegrasi() {
  let ok = 0;
  let gagal = 0;
  function cek(ket, kondisi) {
    if (kondisi) ok++; else gagal++;
    console.log((kondisi ? 'OK    - ' : 'GAGAL - ') + ket);
  }

  // Skrip
  const skrip = Array.prototype.map.call(document.querySelectorAll('script[src]'),
    function (s) { return s.src.split('/').pop(); });
  const urutan = ['core.js', 'charts.js', 'auth.js', 'user.js', 'admin.js', 'leaderboard.js', 'integrasi.js', 'main.js'];
  let posisi = -1;
  let berurutan = true;
  let tunggal = true;
  urutan.forEach(function (n) {
    const idx = skrip.indexOf(n);
    if (idx === -1 || idx < posisi) berurutan = false;
    posisi = idx;
    if (skrip.filter(function (x) { return x === n; }).length !== 1) tunggal = false;
  });
  cek('Delapan skrip aplikasi dimuat berurutan (main.js terakhir)', berurutan);
  cek('Tidak ada skrip aplikasi yang termuat ganda', tunggal);

  // Fungsi
  ['mulai', 'tampil', 'bukaBulan', 'bukaFormHariIni', 'bukaDetail', 'bukaAdmin', 'bukaLb', 'gambarGrafik',
   'bacaSesi', 'bacaSesiAdm', 'panggilApi', 'keluarAdmin', 'gantiPengguna', 'levelHari',
   'simpanSesi', 'tulisSesiAdm', 'hapusSesi', 'hapusSesiAdm', 'adminSedangTampil'].forEach(function (n) {
    cek('Fungsi ' + n + ' tersedia', typeof window[n] === 'function');
  });

  // Layar
  const layar = ['loading', 'error', 'landing', 'admin-login', 'nama', 'pin', 'dashboard', 'riwayat',
                 'detail', 'form', 'adm-ringkasan', 'adm-anggota', 'adm-detail', 'lb'];
  layar.forEach(function (n) {
    cek('Layar layar-' + n + ' ada', !!document.getElementById('layar-' + n));
  });
  const semuaLayar = document.querySelectorAll('.layar');
  cek('Jumlah layar 14 (ada ' + semuaLayar.length + ')', semuaLayar.length === 14);
  const terlihat = Array.prototype.filter.call(semuaLayar, function (e) { return !e.hidden; });
  cek('Tepat satu layar tampil (' + terlihat.map(function (e) { return e.id; }).join(',') + ')', terlihat.length === 1);

  // ID ganda
  const hitung = {};
  Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (e) {
    hitung[e.id] = (hitung[e.id] || 0) + 1;
  });
  const ganda = Object.keys(hitung).filter(function (k) { return hitung[k] > 1; });
  cek('Tidak ada ID elemen ganda' + (ganda.length ? ': ' + ganda.join(', ') : ''), ganda.length === 0);

  // Navigasi
  cek('Navigasi anggota punya 4 tab', document.querySelectorAll('#nav-bawah .nav-item').length === 4);
  cek('Navigasi admin punya 3 tab', document.querySelectorAll('#nav-admin .nav-item').length === 3);

  // Level hari
  const nol = { tahajjud: 0, subuh: 0, dhuha: 0, dzuhur: 0, ashar: 0, magrib: 0, isya: 0, istighfar: 0, puasa: 0, alquran: 0 };
  cek('levelHari: catatan semua nol = nol', levelHari(nol) === 'nol');
  cek('levelHari: hanya puasa = rendah', levelHari(Object.assign({}, nol, { puasa: 1 })) === 'rendah');
  cek('levelHari: 4 wajib tanpa istighfar = sedang',
      levelHari(Object.assign({}, nol, { subuh: 1, dzuhur: 1, ashar: 1, magrib: 2 })) === 'sedang');
  cek('levelHari: 5 wajib + istighfar = penuh',
      levelHari(Object.assign({}, nol, { subuh: 1, dzuhur: 1, ashar: 1, magrib: 1, isya: 1, istighfar: 1 })) === 'penuh');

  // Konfigurasi dan sesi (hanya status, tanpa menampilkan token)
  cek('CONFIG.API_URL sudah diisi', apiSudahDiisi());
  console.log('Info  - Sesi anggota: ' + (bacaSesi() ? 'ada' : 'tidak ada') +
              ', sesi admin: ' + (bacaSesiAdm() ? 'ada' : 'tidak ada') + ' (keduanya sekaligus seharusnya tidak terjadi).');
  cek('Tidak ada sesi anggota dan admin sekaligus', !(bacaSesi() && bacaSesiAdm()));

  console.log('RINGKASAN UJI INTEGRASI - ' + ok + ' OK, ' + gagal + ' GAGAL');
  return { ok: ok, gagal: gagal };
}
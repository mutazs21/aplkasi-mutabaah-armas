'use strict';

/**
 * core.js — Konfigurasi, state, util, API, cache, dan sesi.
 * Dimuat PERTAMA. File lain (auth, user, main) memakai isinya lewat scope global.
 *
 * Keamanan:
 *  - Frontend TIDAK mengirim ID pengguna. Identitas hanya dari token.
 *  - PIN hanya ada di variabel pinDiisi selama diketik, dikosongkan setelah
 *    dikirim dan saat berpindah layar. PIN tidak pernah masuk localStorage.
 *  - localStorage hanya berisi token, id, nama, dan dua penanda waktu sesi.
 *  - Cache hanya di memori halaman (bukan localStorage).
 *  - Cache dikosongkan saat keluar, login baru, sesi tidak valid/kedaluwarsa, dan refresh.
 *  - Masa berlaku sesi ditegakkan di browser. Token tetap divalidasi server
 *    pada setiap permintaan (PIN diganti / anggota nonaktif = token ditolak).
 */

// ====================== KONFIGURASI ======================

const CONFIG = {
  // GANTI dengan URL Web App (berakhiran /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbz8dznt2tqrscDFZqyLw427n597PXvADHyeZz8BvK_hmCZLNmsOw9mNOxQSVqq3nd0C/exec',

  // Nama penyimpanan sesi di HP (tidak perlu diubah)
  KUNCI_SESI: 'mutabaah_sesi_v1',

  // Sesi kedaluwarsa jika tidak dibuka selama ini (milidetik): 7 hari
  SESI_IDLE_MS: 7 * 24 * 60 * 60 * 1000,

  // Batas mutlak umur sesi sejak login (milidetik): 30 hari
  SESI_MAKS_MS: 30 * 24 * 60 * 60 * 1000,

  // Jeda minimal antar penulisan penanda "terakhir aktif" (milidetik)
  JEDA_TULIS_AKTIF_MS: 60000,

  // Batas waktu menunggu server (milidetik)
  TIMEOUT_MS: 20000,

  // Lama notifikasi tampil (milidetik)
  DURASI_TOAST_MS: 4500,

  // Jeda minimal antar pengecekan tanggal saat kembali ke aplikasi (milidetik)
  JEDA_CEK_TANGGAL_MS: 15000,

  // Data cache lebih tua dari ini diperbarui di background saat dibuka (milidetik)
  BATAS_SEGAR_MS: 60000,

  // Lama tombol Simpan menampilkan "Tersimpan" (milidetik)
  DURASI_TERSIMPAN_MS: 2000,

  // Batas jumlah halaman Al-Quran per hari (sama dengan backend)
  MAKS_HALAMAN: 604
};

// Daftar sholat. "kunci" harus sama dengan yang dipakai backend.
const DAFTAR_SHOLAT = [
  { kunci: 'tahajjud', label: 'Sholat Tahajjud' },
  { kunci: 'subuh',    label: 'Sholat Subuh' },
  { kunci: 'dhuha',    label: 'Sholat Dhuha' },
  { kunci: 'dzuhur',   label: 'Sholat Dzuhur' },
  { kunci: 'ashar',    label: 'Sholat Ashar' },
  { kunci: 'magrib',   label: 'Sholat Magrib' },
  { kunci: 'isya',     label: 'Sholat Isya' }
];

// Ikon Lucide untuk setiap ibadah
const IKON_IBADAH = {
  tahajjud: 'moon-star',
  subuh: 'sunrise',
  dhuha: 'sun',
  dzuhur: 'sun-medium',
  ashar: 'cloud-sun',
  magrib: 'sunset',
  isya: 'moon',
  istighfar: 'sparkles',
  puasa: 'utensils-crossed',
  alquran: 'book-open'
};

const OPSI_SHOLAT = [
  { nilai: 0, label: 'Tidak' },
  { nilai: 1, label: 'Sendiri' },
  { nilai: 2, label: 'Berjamaah' }
];

const OPSI_ISTIGHFAR = [
  { nilai: 0, label: 'Belum' },
  { nilai: 1, label: 'Sudah' }
];

const OPSI_PUASA = [
  { nilai: 0, label: 'Tidak' },
  { nilai: 1, label: 'Ya' }
];

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
                    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul',
                           'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Kepala kolom kalender (minggu dimulai hari Senin)
const INISIAL_HARI = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'];


// ====================== STATE ======================

// Nama yang sedang dipilih di layar PIN
let anggotaTerpilih = null;

// PIN yang sedang diketik (hanya di memori, dikosongkan setelah dikirim)
let pinDiisi = '';

// Mencegah kirim PIN ganda saat pengecekan berjalan
let sedangLogin = false;

// Isi form yang sedang diisi pengguna. null = belum dipilih/diisi.
let dataForm = dataFormKosong();

// Tanggal (yyyy-MM-dd, dari server) yang sedang ditampilkan di form
let tanggalForm = null;

// Mode form: 'hariIni' (tab Isi Mutabaah) atau 'lampau' (dibuka dari detail tanggal)
let modeForm = 'hariIni';

// Layar asal saat membuka detail tanggal: 'dashboard' (kalender) atau 'riwayat'
let asalDetail = 'riwayat';

// Tanggal hari ini menurut server (terakhir diketahui)
let tanggalHariServer = null;

// Riwayat: bulan yang sedang tampil dan bulan di sebelahnya (null = tidak ada)
let bulanRiwayat = null;
let bulanSebelumnya = null;
let bulanBerikutnya = null;

// Dashboard: bulan yang sedang tampil
let bulanDashboard = null;

// Data detail tanggal yang sedang tampil (dipakai tombol Isi/Edit)
let detailTerakhir = null;

// Penanda navigasi: mencegah hasil permintaan lama menimpa layar yang lebih baru
let navId = 0;

// Aksi yang dijalankan tombol "Coba lagi" di layar error
let aksiCobaLagi = null;

// Mencegah simpan ganda saat permintaan masih berjalan
let sedangMenyimpan = false;

// Mencegah pengecekan tanggal bertumpuk, dan mengatur jedanya
let sedangCekTanggal = false;
let waktuCekTerakhir = 0;

// Penghitung waktu untuk menyembunyikan notifikasi
let timerToast = null;

// Penghitung waktu untuk mengembalikan tombol Simpan setelah "Tersimpan"
let timerTersimpan = null;

// Cadangan sesi di memori, dipakai jika penyimpanan HP diblokir
let sesiMemori = null;

// Waktu terakhir penanda "terakhir aktif" ditulis (untuk membatasi penulisan)
let waktuAktifDitulis = 0;

// true jika sesi baru saja dihapus karena kedaluwarsa (untuk menampilkan notifikasi sekali)
let sesiBaruKedaluwarsa = false;

// ----- Cache memori -----
// Kunci = bulan "yyyy-MM". Isi = { data: jawaban ringkasBulan, waktu: Date.now() }
let cacheRingkas = {};
// Permintaan ringkasBulan yang sedang berjalan (mencegah request ganda)
let permintaanJalan = {};
// Tanggal hari ini (dari server) pada jawaban terakhir
let infoHariIni = null;
// Dinaikkan setiap cache dikosongkan, supaya jawaban lama tidak masuk cache baru
let generasiCache = 0;
// Penghitung pembaruan background (untuk indikator "Memperbarui...")
let jumlahSegar = 0;
let elSegar = null;


// ====================== FUNGSI BANTU ======================

function $(id) {
  return document.getElementById(id);
}

/** Merender icon Lucide pada elemen <i data-lucide="..."> yang ada di halaman. */
function muatIcon() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/** Membuat elemen <i data-lucide="..."> (dirender oleh muatIcon). */
function buatIkon(nama, kelas) {
  const el = document.createElement('i');
  el.setAttribute('data-lucide', nama);
  el.className = kelas;
  return el;
}

/** Apakah layar tertentu sedang tampil? */
function layarTampil(idLayar) {
  return !$(idLayar).hidden;
}

/** Menampilkan satu layar, menyembunyikan yang lain, lalu mengatur navigasi. */
function tampil(idLayar) {
  const semua = document.querySelectorAll('.layar');
  for (let i = 0; i < semua.length; i++) {
    semua[i].hidden = (semua[i].id !== idLayar);
  }
  // PIN yang belum selesai diketik dibuang jika pengguna pergi dari layar PIN
  if (idLayar !== 'layar-pin' && idLayar !== 'layar-loading') {
    pinDiisi = '';
  }
  aturNavigasi(idLayar);
  muatIcon();
  window.scrollTo(0, 0);
}

/**
 * Navigasi (bar bawah atau sidebar) tampil di: dashboard, form hari ini, dan riwayat.
 * Saat loading, keadaannya dibiarkan agar tidak berkedip.
 */
function aturNavigasi(idLayar) {
  if (idLayar === 'layar-loading') return;

  let tab = null;
  if (idLayar === 'layar-dashboard') tab = 'dashboard';
  if (idLayar === 'layar-riwayat') tab = 'riwayat';
  if (idLayar === 'layar-form' && modeForm === 'hariIni') tab = 'isi';

  $('nav-bawah').hidden = (tab === null);
  document.body.classList.toggle('ada-nav', tab !== null);

  ['dashboard', 'isi', 'riwayat'].forEach(function (nama) {
    const el = $('nav-' + nama);
    const aktif = (nama === tab);
    el.classList.toggle('aktif', aktif);
    if (aktif) {
      el.setAttribute('aria-current', 'page');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}

function tampilLoading(teks) {
  $('teks-loading').textContent = teks || 'Memuat...';
  tampil('layar-loading');
}

/**
 * Menampilkan layar error.
 * aksiCoba : fungsi untuk tombol "Coba lagi" (default: mulai ulang aplikasi)
 * denganAwal: true jika perlu tombol tambahan "Ke halaman awal"
 */
function tampilError(pesan, aksiCoba, denganAwal) {
  aksiCobaLagi = aksiCoba || mulai;
  $('teks-error').textContent = pesan;
  $('tombol-error-awal').hidden = !denganAwal;
  tampil('layar-error');
}

/**
 * Menampilkan landing page (halaman awal untuk yang belum login).
 * Jika sesi baru saja kedaluwarsa, notifikasi ditampilkan sekali.
 * pesanCadangan (opsional): notifikasi error jika tidak ada penyebab kedaluwarsa.
 */
function tampilLanding(pesanCadangan) {
  tampil('layar-landing');
  if (sesiBaruKedaluwarsa) {
    sesiBaruKedaluwarsa = false;
    tampilToast('Sesi berakhir karena lama tidak dipakai. Silakan masuk lagi.', 'error');
  } else if (pesanCadangan) {
    tampilToast(pesanCadangan, 'error');
  }
}

/**
 * Menampilkan notifikasi singkat di bawah layar.
 * jenis: 'sukses' (hijau) atau 'error' (merah).
 */
function tampilToast(teks, jenis) {
  const el = $('toast');
  el.textContent = teks;
  el.classList.toggle('toast-error', jenis === 'error');
  el.hidden = false;
  if (timerToast) clearTimeout(timerToast);
  timerToast = setTimeout(function () {
    el.hidden = true;
  }, CONFIG.DURASI_TOAST_MS);
}

/**
 * Indikator kecil "Memperbarui..." di atas layar saat pembaruan background berjalan.
 * mulaiBaru = true saat pembaruan dimulai, false saat selesai.
 */
function aturSegar(mulaiBaru) {
  jumlahSegar += mulaiBaru ? 1 : -1;
  if (jumlahSegar < 0) jumlahSegar = 0;

  if (!elSegar) {
    elSegar = document.createElement('div');
    elSegar.setAttribute('role', 'status');
    elSegar.textContent = 'Memperbarui...';
    elSegar.style.position = 'fixed';
    elSegar.style.top = 'calc(8px + env(safe-area-inset-top, 0px))';
    elSegar.style.left = '50%';
    elSegar.style.transform = 'translateX(-50%)';
    elSegar.style.zIndex = '120';
    elSegar.style.padding = '4px 14px';
    elSegar.style.fontSize = '12px';
    elSegar.style.fontWeight = '600';
    elSegar.style.color = '#ffffff';
    elSegar.style.background = '#0f766e';
    elSegar.style.borderRadius = '999px';
    elSegar.style.pointerEvents = 'none';
    elSegar.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    elSegar.hidden = true;
    document.body.appendChild(elSegar);
  }
  elSegar.hidden = (jumlahSegar === 0);
}

function apiSudahDiisi() {
  return CONFIG.API_URL.indexOf('https://script.google.com/') === 0;
}

/** Apakah layar form sedang tampil? */
function formSedangTampil() {
  return !$('layar-form').hidden;
}

/** Apakah kode error ini berarti masalah koneksi/jawaban server (bukan penolakan data)? */
function adalahMasalahKoneksi(kode) {
  return kode === 'JARINGAN' || kode === 'TIMEOUT' || kode === 'RESPON_TIDAK_VALID';
}

/** Memecah "2026-11-01" menjadi objek Date lokal. */
function keDate(teks) {
  const bagian = String(teks).split('-');
  return new Date(Number(bagian[0]), Number(bagian[1]) - 1, Number(bagian[2]));
}

/** "2026-11-01" menjadi "Minggu, 1 November 2026". */
function formatTanggal(teks) {
  if (String(teks).split('-').length !== 3) return String(teks);
  const d = keDate(teks);
  return NAMA_HARI[d.getDay()] + ', ' + d.getDate() + ' ' +
         NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear();
}

/** "2026-11-01" menjadi "01 Nov". */
function formatTanggalPendek(teks) {
  const d = keDate(teks);
  const hari = d.getDate();
  return (hari < 10 ? '0' : '') + hari + ' ' + NAMA_BULAN_PENDEK[d.getMonth()];
}

/** "2026-11-01" menjadi "Min". */
function namaHariPendek(teks) {
  return NAMA_HARI_PENDEK[keDate(teks).getDay()];
}

/** "2026-11" menjadi "November 2026". */
function formatBulan(bulan) {
  const bagian = String(bulan).split('-');
  return NAMA_BULAN[Number(bagian[1]) - 1] + ' ' + bagian[0];
}

/** Inisial dari nama: "Ahmad Fauzi" menjadi "AF", "Budi" menjadi "B". */
function inisialNama(nama) {
  const kata = String(nama).trim().split(/\s+/).filter(function (k) { return k !== ''; });
  if (kata.length === 0) return '?';
  if (kata.length === 1) return kata[0].charAt(0).toUpperCase();
  return (kata[0].charAt(0) + kata[1].charAt(0)).toUpperCase();
}

/** Nilai awal form untuk hari yang belum pernah diisi. */
function dataFormKosong() {
  return {
    tahajjud: null,
    subuh: null,
    dhuha: null,
    dzuhur: null,
    ashar: null,
    magrib: null,
    isya: null,
    istighfar: 0,
    puasa: 0,
    alquran: null
  };
}

/** Jumlah sholat yang terlaksana (sendiri atau berjamaah) dari objek data. */
function hitungSholat(data) {
  let terlaksana = 0;
  DAFTAR_SHOLAT.forEach(function (s) {
    if (Number(data[s.kunci]) >= 1) terlaksana++;
  });
  return terlaksana;
}

/** Tingkat kelengkapan satu hari: 'rendah' (1-3), 'sedang' (4-6), 'penuh' (7). */
function levelHari(data) {
  const n = hitungSholat(data);
  if (n >= DAFTAR_SHOLAT.length) return 'penuh';
  if (n >= 4) return 'sedang';
  return 'rendah';
}


// ====================== API ======================

/**
 * Mengirim permintaan ke Apps Script. Selalu mengembalikan objek,
 * tidak pernah melempar error. Kode error khusus dari frontend:
 *  - JARINGAN          : tidak ada koneksi / permintaan tidak sampai
 *  - TIMEOUT           : server terlalu lama menjawab
 *  - RESPON_TIDAK_VALID: jawaban server bukan JSON yang dikenal
 */
async function panggilApi(isi) {
  const kontrol = new AbortController();
  const timer = setTimeout(function () { kontrol.abort(); }, CONFIG.TIMEOUT_MS);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(isi),
      signal: kontrol.signal
    });

    const teks = await res.text();
    let hasil = null;
    try {
      hasil = JSON.parse(teks);
    } catch (errParse) {
      hasil = null;
    }

    if (!hasil || typeof hasil !== 'object' || typeof hasil.ok !== 'boolean') {
      return {
        ok: false,
        kode: 'RESPON_TIDAK_VALID',
        pesan: 'Server memberi jawaban yang tidak dikenali. Coba lagi. Jika terus berulang, hubungi admin.'
      };
    }
    return hasil;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return {
        ok: false,
        kode: 'TIMEOUT',
        pesan: 'Server terlalu lama menjawab. Periksa sinyal lalu coba lagi.'
      };
    }
    return {
      ok: false,
      kode: 'JARINGAN',
      pesan: 'Tidak bisa terhubung ke server. Periksa internet lalu coba lagi.'
    };
  } finally {
    clearTimeout(timer);
  }
}


// ====================== CACHE ======================

/** Mengosongkan seluruh cache. Jawaban yang masih berjalan tidak akan masuk cache. */
function hapusCache() {
  cacheRingkas = {};
  permintaanJalan = {};
  infoHariIni = null;
  generasiCache++;
}

/** Bulan berjalan menurut server (dari jawaban terakhir), atau null jika belum tahu. */
function kunciBulanBerjalan() {
  return infoHariIni ? infoHariIni.substring(0, 7) : null;
}

/** Menyimpan jawaban ringkasBulan ke cache. Jika tanggal server berganti, cache lama dibuang. */
function simpanKeCache(hasil) {
  if (infoHariIni !== null && hasil.hariIni !== infoHariIni) {
    cacheRingkas = {};
  }
  infoHariIni = hasil.hariIni;
  cacheRingkas[hasil.bulan] = { data: hasil, waktu: Date.now() };
}

/**
 * Mengambil ringkasan satu bulan dari server (bulan = "yyyy-MM" atau null = bulan berjalan),
 * lalu menyimpannya ke cache. Permintaan yang sama yang sedang berjalan dipakai bersama.
 * Jika cache dikosongkan saat menunggu, hasilnya dibuang (kode 'BATAL').
 */
function muatRingkas(bulan) {
  const kunciJalan = bulan || '_berjalan';
  if (permintaanJalan[kunciJalan]) return permintaanJalan[kunciJalan];

  const sesi = bacaSesi();
  if (!sesi) {
    return Promise.resolve({ ok: false, kode: 'BATAL', pesan: 'Sesi tidak ditemukan.' });
  }

  const generasiAwal = generasiCache;
  const isi = { action: 'ringkasBulan', token: sesi.token };
  if (bulan) isi.bulan = bulan;

  const janji = panggilApi(isi).then(function (hasil) {
    if (generasiAwal !== generasiCache) {
      return { ok: false, kode: 'BATAL', pesan: 'Dibatalkan.' };
    }
    delete permintaanJalan[kunciJalan];
    if (hasil.ok) {
      simpanKeCache(hasil);
      perbaruiAktivitas(false);
    }
    return hasil;
  });
  permintaanJalan[kunciJalan] = janji;
  return janji;
}


// ====================== SESI PERANGKAT (DENGAN MASA BERLAKU) ======================

/**
 * Merapikan objek sesi dari penyimpanan. Sesi lama tanpa penanda waktu
 * (dari versi sebelumnya) diberi waktu "sekarang", sehingga masa berlakunya
 * mulai dihitung sejak pembukaan pertama setelah pembaruan.
 */
function normalisasiSesi(s) {
  if (!s || typeof s.token !== 'string' || typeof s.nama !== 'string') return null;
  const sekarang = Date.now();
  return {
    token: s.token,
    id: (typeof s.id === 'string') ? s.id : '',
    nama: s.nama,
    dibuat: isFinite(s.dibuat) ? Number(s.dibuat) : sekarang,
    terakhirAktif: isFinite(s.terakhirAktif) ? Number(s.terakhirAktif) : sekarang
  };
}

/** Apakah sesi sudah melewati batas tidak aktif atau batas mutlak? */
function sesiKedaluwarsa(sesi) {
  const sekarang = Date.now();
  if (sekarang - sesi.dibuat > CONFIG.SESI_MAKS_MS) return true;
  if (sekarang - sesi.terakhirAktif > CONFIG.SESI_IDLE_MS) return true;
  return false;
}

/**
 * Membaca sesi. Utamanya dari penyimpanan HP; jika tidak ada/diblokir,
 * memakai cadangan di memori. Jika sesi kedaluwarsa, sesi dan cache dihapus
 * dan mengembalikan null. Mengembalikan {token, id, nama, dibuat, terakhirAktif} atau null.
 */
function bacaSesi() {
  let sesi = null;
  try {
    const mentah = localStorage.getItem(CONFIG.KUNCI_SESI);
    if (mentah) sesi = normalisasiSesi(JSON.parse(mentah));
  } catch (err) {
    sesi = null;
  }
  if (!sesi) sesi = sesiMemori;
  if (!sesi) return null;

  if (sesiKedaluwarsa(sesi)) {
    hapusSesi();
    sesiBaruKedaluwarsa = true;
    return null;
  }
  return sesi;
}

/** Menulis sesi ke memori dan penyimpanan HP. Mengembalikan true jika tersimpan di HP. */
function tulisSesi(sesi) {
  sesiMemori = sesi; // cadangan agar login tetap jalan selama halaman terbuka
  try {
    localStorage.setItem(CONFIG.KUNCI_SESI, JSON.stringify(sesi));
    return true;
  } catch (err) {
    return false;
  }
}

/** Menyimpan sesi baru setelah login. Mengembalikan true jika berhasil disimpan di HP. */
function simpanSesi(sesi) {
  const sekarang = Date.now();
  waktuAktifDitulis = sekarang;
  return tulisSesi({
    token: sesi.token,
    id: sesi.id,
    nama: sesi.nama,
    dibuat: sekarang,
    terakhirAktif: sekarang
  });
}

/**
 * Memperpanjang masa tidak aktif ("terakhir aktif" = sekarang).
 * paksa = false: penulisan dibatasi sekali per JEDA_TULIS_AKTIF_MS.
 */
function perbaruiAktivitas(paksa) {
  const sekarang = Date.now();
  if (!paksa && sekarang - waktuAktifDitulis < CONFIG.JEDA_TULIS_AKTIF_MS) return;
  const sesi = bacaSesi();
  if (!sesi) return;
  waktuAktifDitulis = sekarang;
  sesi.terakhirAktif = sekarang;
  tulisSesi(sesi);
}

/** Menghapus sesi DAN cache (cache lama tidak boleh dipakai setelah keluar). */
function hapusSesi() {
  sesiMemori = null;
  hapusCache();
  try {
    localStorage.removeItem(CONFIG.KUNCI_SESI);
  } catch (err) {
    // abaikan
  }
}

/**
 * Jika jawaban server berarti sesi tidak valid (PIN diganti / anggota nonaktif):
 * hapus sesi dan cache, kembali ke landing, lalu mengembalikan true.
 * senyap = true: tanpa notifikasi (dipakai saat aplikasi baru dibuka).
 */
async function tanganiTokenTidakValid(hasil, senyap) {
  if (hasil.kode !== 'TOKEN_TIDAK_VALID') return false;
  hapusSesi();
  tampilLanding();
  if (!senyap) {
    tampilToast('Sesi berakhir. Silakan masuk lagi.', 'error');
  }
  return true;
}
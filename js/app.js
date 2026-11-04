'use strict';

/**
 * app.js — Frontend Mutabaah Yaumiyah (redesign final)
 *
 * STEP 6: Riwayat dan Detail/Edit baru.
 * STEP 7: session timeout (7 hari tanpa dibuka, batas mutlak 30 hari; frontend).
 * STEP 8: polish. Cache, API, dan optimasi request tidak berubah.
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

/** Menampilkan satu layar, menyembunyikan yang lain, lalu mengatur navigasi bawah. */
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
 * Navigasi bawah tampil di: dashboard, form hari ini, dan riwayat.
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


// ====================== ALUR UTAMA ======================

/** Titik awal aplikasi: dashboard jika sudah login, landing jika belum/kedaluwarsa. */
async function mulai() {
  navId++;

  if (!apiSudahDiisi()) {
    tampilError('Alamat API belum diisi. Buka js/app.js dan isi CONFIG.API_URL dengan URL Web App (berakhiran /exec).');
    return;
  }

  if (bacaSesi()) {
    perbaruiAktivitas(true);
    await bukaBulan('dashboard', null, true);
    return;
  }

  tampilLanding();
}


// ====================== PILIH NAMA ======================

/** Mengambil daftar anggota dan menampilkannya sebagai kartu. */
async function tampilPilihNama() {
  tampilLoading('Memuat daftar nama...');
  const hasil = await panggilApi({ action: 'anggota' });
  if (!hasil.ok) {
    tampilError(hasil.pesan || 'Gagal memuat daftar nama.', tampilPilihNama, true);
    return;
  }

  const wadah = $('daftar-nama');
  wadah.textContent = '';

  if (!hasil.anggota || hasil.anggota.length === 0) {
    const kosong = document.createElement('p');
    kosong.className = 'sub-halaman';
    kosong.textContent = 'Belum ada anggota aktif. Periksa sheet Anggota.';
    wadah.appendChild(kosong);
  } else {
    hasil.anggota.forEach(function (a) {
      const tombol = document.createElement('button');
      tombol.type = 'button';
      tombol.className = 'kartu-nama flex min-h-[68px] w-full cursor-pointer items-center gap-3.5 px-3.5 py-2.5 text-left text-lg font-semibold text-slate-900';

      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = inisialNama(a.nama); // textContent: aman dari penyisipan kode

      const nama = document.createElement('span');
      nama.className = 'nama-teks';
      nama.textContent = a.nama;

      tombol.appendChild(avatar);
      tombol.appendChild(nama);
      tombol.appendChild(buatIkon('chevron-right', 'h-5 w-5 shrink-0 text-slate-400'));
      tombol.addEventListener('click', function () { bukaLayarPin(a); });
      wadah.appendChild(tombol);
    });
  }

  tampil('layar-nama'); // juga merender icon Lucide pada kartu
}


// ====================== LAYAR PIN (KEYPAD) ======================

/** Membuka layar PIN untuk anggota yang dipilih. */
function bukaLayarPin(anggota) {
  anggotaTerpilih = anggota;
  pinDiisi = '';
  sedangLogin = false;
  $('nama-pin').textContent = anggota.nama;
  $('avatar-pin').textContent = inisialNama(anggota.nama);
  renderTitikPin();
  sembunyikanPesanPin();
  $('status-pin').hidden = true;
  aturKeypad(false);
  tampil('layar-pin');
}

/** Memperbarui 4 titik indikator sesuai jumlah digit yang sudah diketik. */
function renderTitikPin() {
  const titik = $('titik-pin').querySelectorAll('.titik-pin');
  for (let i = 0; i < titik.length; i++) {
    titik[i].classList.toggle('isi', i < pinDiisi.length);
  }
  $('titik-pin').setAttribute('aria-label', 'PIN: ' + pinDiisi.length + ' dari 4 digit terisi');
}

/** Mengunci atau membuka seluruh tombol keypad. */
function aturKeypad(terkunci) {
  const tombol = $('keypad').querySelectorAll('button');
  for (let i = 0; i < tombol.length; i++) {
    tombol[i].disabled = terkunci;
  }
}

/** Menampilkan pesan error PIN dan menggoyangkan titik indikator. */
function tampilkanPesanPin(teks) {
  $('teks-pesan-pin').textContent = teks;
  $('pesan-pin').hidden = false;
  muatIcon();

  const kotak = $('titik-pin');
  kotak.classList.remove('goyang');
  void kotak.offsetWidth; // memulai ulang animasi
  kotak.classList.add('salah');
  kotak.classList.add('goyang');
}

function sembunyikanPesanPin() {
  $('pesan-pin').hidden = true;
  $('titik-pin').classList.remove('salah');
  $('titik-pin').classList.remove('goyang');
}

/** Menambah satu digit. Saat 4 digit terisi, PIN langsung dikirim. */
function tekanAngka(digit) {
  if (sedangLogin || pinDiisi.length >= 4) return;
  if (pinDiisi.length === 0) sembunyikanPesanPin();
  pinDiisi += String(digit);
  renderTitikPin();
  if (pinDiisi.length === 4) {
    kirimPin();
  }
}

/** Menghapus satu digit terakhir. */
function hapusAngka() {
  if (sedangLogin || pinDiisi.length === 0) return;
  pinDiisi = pinDiisi.slice(0, -1);
  renderTitikPin();
  sembunyikanPesanPin();
}

/** Mengirim PIN ke backend. PIN dikosongkan segera setelah dikirim. */
async function kirimPin() {
  if (!anggotaTerpilih || sedangLogin) return;
  if (!/^\d{4}$/.test(pinDiisi)) return;

  const pin = pinDiisi;
  sedangLogin = true;
  aturKeypad(true);
  sembunyikanPesanPin();
  $('status-pin').hidden = false;

  const hasil = await panggilApi({ action: 'login', id: anggotaTerpilih.id, pin: pin });

  sedangLogin = false;
  pinDiisi = '';
  renderTitikPin();
  $('status-pin').hidden = true;
  aturKeypad(false);

  if (hasil.ok) {
    hapusCache(); // pastikan tidak ada sisa data pengguna sebelumnya
    const tersimpan = simpanSesi({ token: hasil.token, id: hasil.id, nama: hasil.nama });
    await mulai(); // masuk ke dashboard
    if (!tersimpan) {
      tampilToast('Perangkat ini tidak bisa mengingat login. PIN perlu dimasukkan lagi saat aplikasi dibuka ulang.', 'error');
    }
    return;
  }

  tampilkanPesanPin(hasil.pesan || 'Login gagal.');
}


// ====================== DASHBOARD: RENDER ======================

/**
 * Membuat satu baris statistik: ikon, nama, "nilai/total", batang bertumpuk,
 * dan rincian (opsional).
 * segmen: daftar { nilai, kelas } yang digambar berurutan dari kiri.
 * rincian: daftar { kelas, teks } atau null.
 */
function buatBarisStat(label, ikon, nilaiTotal, total, segmen, rincian) {
  const baris = document.createElement('div');
  baris.className = 'baris-stat';

  const atas = document.createElement('div');
  atas.className = 'atas-stat';

  const bulat = document.createElement('span');
  bulat.className = 'stat-ikon';
  bulat.setAttribute('aria-hidden', 'true');
  bulat.appendChild(buatIkon(ikon, 'h-[18px] w-[18px]'));

  const nama = document.createElement('span');
  nama.className = 'stat-nama';
  nama.textContent = label;

  const nilai = document.createElement('span');
  nilai.className = 'stat-nilai';
  nilai.textContent = nilaiTotal + '/' + total;

  atas.appendChild(bulat);
  atas.appendChild(nama);
  atas.appendChild(nilai);
  baris.appendChild(atas);

  const bar = document.createElement('div');
  bar.className = 'bar';
  let terpakai = 0;
  segmen.forEach(function (s) {
    if (total <= 0 || s.nilai <= 0) return;
    let lebar = s.nilai * 100 / total;
    if (terpakai + lebar > 100) lebar = 100 - terpakai;
    terpakai += lebar;
    const isi = document.createElement('div');
    isi.className = 'bar-isi ' + s.kelas;
    isi.style.width = lebar + '%';
    bar.appendChild(isi);
  });
  baris.appendChild(bar);

  if (rincian && rincian.length > 0) {
    const detail = document.createElement('div');
    detail.className = 'detail-stat';
    rincian.forEach(function (r) {
      const sp = document.createElement('span');
      const kotak = document.createElement('i');
      kotak.className = 'kotak ' + r.kelas;
      sp.appendChild(kotak);
      sp.appendChild(document.createTextNode(r.teks));
      detail.appendChild(sp);
    });
    baris.appendChild(detail);
  }
  return baris;
}

/**
 * Membuat kalender satu bulan dari jawaban ringkasBulan (riw.hari dan riw.hariIni).
 * Warna tanggal = jumlah sholat terlaksana. Tanggal di luar rentang (masa depan,
 * sebelum tanggal mulai) dinonaktifkan.
 */
function bangunKalender(bulan, riw) {
  const kartu = $('kartu-kalender');
  if (!riw || !riw.ok) {
    kartu.hidden = true;
    return;
  }

  const peta = {};
  riw.hari.forEach(function (h) { peta[h.tanggal] = h; });

  const tahun = Number(bulan.substring(0, 4));
  const nomor = Number(bulan.substring(5, 7));
  const jumlah = new Date(tahun, nomor, 0).getDate();
  const offset = (new Date(tahun, nomor - 1, 1).getDay() + 6) % 7; // Senin = 0

  $('kal-bulan').textContent = formatBulan(bulan);

  const grid = $('kalender');
  grid.textContent = '';

  INISIAL_HARI.forEach(function (i) {
    const kepala = document.createElement('div');
    kepala.className = 'kal-kepala';
    kepala.textContent = i;
    grid.appendChild(kepala);
  });

  for (let i = 0; i < offset; i++) {
    const spasi = document.createElement('div');
    spasi.setAttribute('aria-hidden', 'true');
    grid.appendChild(spasi);
  }

  for (let d = 1; d <= jumlah; d++) {
    const tanggal = bulan + '-' + (d < 10 ? '0' : '') + d;
    const h = peta[tanggal];

    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'kal-hari';
    tombol.textContent = String(d);

    if (!h) {
      tombol.classList.add('nonaktif');
      tombol.disabled = true;
    } else {
      const kelas = h.ada ? levelHari(h.data) : 'kosong';
      tombol.classList.add(kelas);
      if (tanggal === riw.hariIni) tombol.classList.add('ini');
      tombol.setAttribute('aria-label',
        formatTanggal(tanggal) + (h.ada ? ', sudah diisi' : ', belum diisi'));
      tombol.addEventListener('click', function () {
        asalDetail = 'dashboard';
        bukaDetail(tanggal);
      });
    }
    grid.appendChild(tombol);
  }

  kartu.hidden = false;
}

/**
 * Mengisi layar dashboard dari jawaban ringkasBulan. Tidak melakukan request.
 * Jika layar sudah tampil (pembaruan background), posisi gulir tidak diubah.
 */
function renderDashboard(hasil) {
  bulanDashboard = hasil.bulan;
  tanggalHariServer = hasil.hariIni;

  $('nama-dashboard').textContent = hasil.nama;

  // Dropdown bulan
  const pilih = $('pilih-bulan');
  pilih.textContent = '';
  hasil.daftarBulan.forEach(function (b) {
    const opsi = document.createElement('option');
    opsi.value = b;
    opsi.textContent = formatBulan(b);
    pilih.appendChild(opsi);
  });
  pilih.value = hasil.bulan;

  // Kalender (selalu tampil, agar tanggal bisa diisi walau statistik kosong)
  bangunKalender(hasil.bulan, hasil);

  const kosong = $('kosong-dashboard');
  const ringkasan = $('ringkasan-dashboard');
  const kartuStat = $('kartu-statistik');

  if (hasil.hariTerhitung === 0) {
    kosong.textContent = 'Belum ada data yang bisa dihitung untuk ' + formatBulan(hasil.bulan) +
      '. Statistik mulai dihitung sejak hari pertama kamu mengisi mutabaah.';
    kosong.hidden = false;
    ringkasan.hidden = true;
    kartuStat.hidden = true;
  } else {
    kosong.hidden = true;
    ringkasan.hidden = false;
    kartuStat.hidden = false;

    // Cincin progress
    const persen = (hasil.progress === null) ? 0 : Math.min(100, hasil.progress);
    $('persen-dashboard').textContent = persen + '%';
    $('cincin').style.background =
      'conic-gradient(#0f766e ' + (persen * 3.6) + 'deg, #e2e8f0 0)';
    $('ket-progres').textContent =
      hasil.hariTerisi + ' dari ' + hasil.hariTerhitung + ' hari terhitung sudah diisi';
    $('ket-periode').textContent =
      'Periode: ' + formatTanggalPendek(hasil.mulaiHitung) + ' – ' +
      formatTanggalPendek(hasil.akhirHitung);

    // Kotak ringkasan
    $('ubin-puasa').textContent = String(hasil.puasa);
    $('ubin-istighfar').textContent = String(hasil.istighfar);
    $('ubin-quran').textContent = String(hasil.alquran.total);
    $('ubin-quran-ket').textContent = 'halaman · ' + hasil.alquran.hariMembaca + ' hari';

    // Statistik per ibadah
    const daftar = $('daftar-stat');
    daftar.textContent = '';
    const total = hasil.hariTerhitung;

    hasil.sholat.forEach(function (s) {
      let label = s.kunci;
      DAFTAR_SHOLAT.forEach(function (d) {
        if (d.kunci === s.kunci) label = d.label.replace('Sholat ', '');
      });
      daftar.appendChild(buatBarisStat(
        label, IKON_IBADAH[s.kunci] || 'moon', s.terlaksana, total,
        [
          { nilai: s.berjamaah, kelas: 'seg-jamaah' },
          { nilai: s.sendiri, kelas: 'seg-sendiri' }
        ],
        [
          { kelas: 'seg-jamaah', teks: 'Berjamaah ' + s.berjamaah + ' hari' },
          { kelas: 'seg-sendiri', teks: 'Sendiri ' + s.sendiri + ' hari' }
        ]
      ));
    });
    daftar.appendChild(buatBarisStat(
      'Istighfar', IKON_IBADAH.istighfar, hasil.istighfar, total,
      [{ nilai: hasil.istighfar, kelas: 'seg-utama' }], null
    ));
    daftar.appendChild(buatBarisStat(
      'Puasa', IKON_IBADAH.puasa, hasil.puasa, total,
      [{ nilai: hasil.puasa, kelas: 'seg-utama' }], null
    ));
  }

  if (!layarTampil('layar-dashboard')) tampil('layar-dashboard');
  muatIcon(); // juga saat pembaruan background (layar sudah tampil)
}


// ====================== RIWAYAT: RENDER ======================

/** Membuat satu chip kecil berikon untuk kartu riwayat. */
function buatChipRiwayat(ikon, teks, aktif) {
  const chip = document.createElement('span');
  chip.className = 'chip-r' + (aktif ? ' aktif' : '');
  chip.appendChild(buatIkon(ikon, 'h-3.5 w-3.5'));
  chip.appendChild(document.createTextNode(teks));
  return chip;
}

/** Membuat badge kecil "Hari ini". */
function buatBadgeIni() {
  const b = document.createElement('span');
  b.className = 'badge-ini';
  b.textContent = 'Hari ini';
  return b;
}

/**
 * Mengisi layar riwayat dari jawaban ringkasBulan. Tidak melakukan request.
 * Jika layar sudah tampil (pembaruan background), posisi gulir tidak diubah.
 */
function renderRiwayat(hasil) {
  bulanRiwayat = hasil.bulan;
  bulanSebelumnya = hasil.sebelumnya;
  bulanBerikutnya = hasil.berikutnya;
  tanggalHariServer = hasil.hariIni;

  $('nama-bulan').textContent = formatBulan(hasil.bulan);
  $('tombol-bulan-sebelumnya').disabled = (hasil.sebelumnya === null);
  $('tombol-bulan-berikutnya').disabled = (hasil.berikutnya === null);

  let terisi = 0;
  hasil.hari.forEach(function (h) { if (h.ada) terisi++; });
  $('ringkas-bulan').textContent = terisi + ' dari ' + hasil.hari.length + ' hari sudah diisi';

  const wadah = $('daftar-hari');
  wadah.textContent = '';

  hasil.hari.forEach(function (h) {
    const adaHariIni = (h.tanggal === hasil.hariIni);

    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'item-hari ' + (h.ada ? levelHari(h.data) : 'kosong');
    tombol.setAttribute('aria-label',
      formatTanggal(h.tanggal) + (h.ada ? ', sudah diisi' : ', belum diisi'));

    // Blok tanggal
    const blok = document.createElement('span');
    blok.className = 'tgl-blok';
    const angka = document.createElement('span');
    angka.className = 'tgl-angka';
    angka.textContent = String(Number(h.tanggal.substring(8, 10)));
    const hari = document.createElement('span');
    hari.className = 'tgl-nama';
    hari.textContent = namaHariPendek(h.tanggal);
    blok.appendChild(angka);
    blok.appendChild(hari);

    // Isi
    const isi = document.createElement('span');
    isi.className = 'isi-hari';

    const atas = document.createElement('span');
    atas.className = 'baris-atas-r';
    const judul = document.createElement('span');

    if (h.ada) {
      const n = hitungSholat(h.data);
      judul.className = 'sholat-teks';
      judul.textContent = 'Sholat ' + n + '/' + DAFTAR_SHOLAT.length;
      atas.appendChild(judul);
      if (adaHariIni) atas.appendChild(buatBadgeIni());
      isi.appendChild(atas);

      const bar = document.createElement('span');
      bar.className = 'bar bar-mini';
      const bagian = document.createElement('span');
      bagian.className = 'bar-isi seg-utama';
      bagian.style.width = (n * 100 / DAFTAR_SHOLAT.length) + '%';
      bar.appendChild(bagian);
      isi.appendChild(bar);

      const chips = document.createElement('span');
      chips.className = 'chip-baris-r';
      chips.appendChild(buatChipRiwayat('sparkles', 'Istighfar', Number(h.data.istighfar) === 1));
      chips.appendChild(buatChipRiwayat('utensils-crossed', 'Puasa', Number(h.data.puasa) === 1));
      chips.appendChild(buatChipRiwayat('book-open', h.data.alquran + ' hlm', Number(h.data.alquran) > 0));
      isi.appendChild(chips);
    } else {
      judul.className = 'belum-teks';
      judul.textContent = 'Belum diisi';
      atas.appendChild(judul);
      if (adaHariIni) atas.appendChild(buatBadgeIni());
      isi.appendChild(atas);
    }

    // Kanan: panah (terisi) atau tombol "Isi" (kosong)
    const kanan = document.createElement('span');
    kanan.className = 'aksi-r';
    kanan.setAttribute('aria-hidden', 'true');
    if (h.ada) {
      kanan.appendChild(buatIkon('chevron-right', 'h-5 w-5'));
    } else {
      const pil = document.createElement('span');
      pil.className = 'pil-isi';
      pil.appendChild(buatIkon('plus', 'h-3.5 w-3.5'));
      pil.appendChild(document.createTextNode('Isi'));
      kanan.appendChild(pil);
    }

    tombol.appendChild(blok);
    tombol.appendChild(isi);
    tombol.appendChild(kanan);
    tombol.addEventListener('click', function () {
      asalDetail = 'riwayat';
      bukaDetail(h.tanggal);
    });
    wadah.appendChild(tombol);
  });

  if (!layarTampil('layar-riwayat')) tampil('layar-riwayat');
  muatIcon(); // juga saat pembaruan background (layar sudah tampil)
}


// ====================== DASHBOARD / RIWAYAT: BUKA DARI CACHE ======================

/** Menampilkan data bulan ke layar tujuan ('dashboard' atau 'riwayat'). */
function renderBulan(tujuan, data) {
  if (tujuan === 'dashboard') {
    renderDashboard(data);
  } else {
    renderRiwayat(data);
  }
}

/**
 * Membuka dashboard atau riwayat satu bulan (bulan = "yyyy-MM", atau null = bulan berjalan).
 *  - Ada di cache  : tampil SEKETIKA; jika data lebih tua dari BATAS_SEGAR_MS,
 *                    diperbarui di background.
 *  - Belum ada     : loading, 1 request, lalu tampil.
 * senyap = true: jika sesi tidak valid, tanpa notifikasi (saat aplikasi baru dibuka).
 */
async function bukaBulan(tujuan, bulan, senyap) {
  const saya = ++navId;

  if (!bacaSesi()) {
    tampilLanding();
    return;
  }

  const kunci = bulan || kunciBulanBerjalan();
  const entri = kunci ? cacheRingkas[kunci] : null;

  if (entri) {
    renderBulan(tujuan, entri.data);
    if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) {
      segarkanLatar(bulan, tujuan, saya);
    }
    return;
  }

  tampilLoading(tujuan === 'dashboard' ? 'Memuat dashboard...' : 'Memuat riwayat...');
  const hasil = await muatRingkas(bulan);
  if (saya !== navId) return;

  if (hasil.ok) {
    renderBulan(tujuan, hasil);
    return;
  }
  if (hasil.kode === 'BATAL') return;
  if (await tanganiTokenTidakValid(hasil, senyap)) return;

  tampilError(
    hasil.pesan || 'Gagal memuat data.',
    function () { bukaBulan(tujuan, bulan); },
    tujuan === 'riwayat'
  );
}

/**
 * Memperbarui data di background tanpa menutup layar yang sedang tampil.
 * Kegagalan jaringan diabaikan (data lama tetap tampil). Sesi tidak valid = keluar.
 * tujuan: 'dashboard', 'riwayat', atau 'form' (hanya memeriksa pergantian hari).
 */
async function segarkanLatar(bulanDiminta, tujuan, saya) {
  aturSegar(true);
  const hasil = await muatRingkas(bulanDiminta);
  aturSegar(false);

  if (!bacaSesi()) return;

  if (!hasil.ok) {
    if (hasil.kode === 'TOKEN_TIDAK_VALID') {
      await tanganiTokenTidakValid(hasil);
    }
    return; // kegagalan lain: abaikan, jangan ganggu pengguna
  }

  if (saya !== navId) return; // pengguna sudah pindah layar; cache tetap diperbarui

  if (tujuan === 'dashboard' && layarTampil('layar-dashboard')) {
    renderDashboard(hasil);
  } else if (tujuan === 'riwayat' && layarTampil('layar-riwayat')) {
    renderRiwayat(hasil);
  } else if (tujuan === 'form') {
    muatUlangFormJikaHariBerganti(hasil);
  }
}

/** Kembali ke layar asal detail tanggal (dashboard atau riwayat) untuk bulan tertentu. */
async function kembaliDariDetail(bulan) {
  await bukaBulan(asalDetail === 'dashboard' ? 'dashboard' : 'riwayat', bulan);
}


// ====================== DETAIL TANGGAL ======================

/**
 * Membuat satu baris detail: ikon bulat, label, dan badge nilai.
 * kelasNilai: nilai-0, nilai-1, nilai-2, atau nilai-ya.
 */
function buatBarisDetail(ikon, label, teksNilai, kelasNilai) {
  const baris = document.createElement('div');
  baris.className = 'baris-detail-b';

  const bulat = document.createElement('span');
  bulat.className = 'stat-ikon';
  bulat.setAttribute('aria-hidden', 'true');
  bulat.appendChild(buatIkon(ikon, 'h-[18px] w-[18px]'));

  const nama = document.createElement('span');
  nama.className = 'stat-nama';
  nama.textContent = label;

  const nilai = document.createElement('span');
  nilai.className = 'badge-nilai ' + kelasNilai;
  nilai.textContent = teksNilai;

  baris.appendChild(bulat);
  baris.appendChild(nama);
  baris.appendChild(nilai);
  return baris;
}

/**
 * Membuka detail satu tanggal. Datanya diambil dari cache bulan tersebut
 * (tanpa request). Jika bulannya belum ada di cache, 1 request ringkasBulan.
 */
async function bukaDetail(tanggal) {
  const saya = ++navId;

  if (!bacaSesi()) {
    tampilLanding();
    return;
  }

  const bulan = String(tanggal).substring(0, 7);
  const entri = cacheRingkas[bulan];
  let data = entri ? entri.data : null;

  if (!data) {
    tampilLoading('Memuat data tanggal...');
    const hasil = await muatRingkas(bulan);
    if (saya !== navId) return;
    if (!hasil.ok) {
      if (hasil.kode === 'BATAL') return;
      if (await tanganiTokenTidakValid(hasil)) return;
      tampilError(hasil.pesan || 'Gagal memuat data tanggal.',
                  function () { bukaDetail(tanggal); }, true);
      return;
    }
    data = hasil;
  }

  let h = null;
  for (let i = 0; i < data.hari.length; i++) {
    if (data.hari[i].tanggal === tanggal) h = data.hari[i];
  }
  if (!h) {
    await kembaliDariDetail(bulan);
    tampilToast('Tanggal tidak bisa dibuka.', 'error');
    return;
  }

  detailTerakhir = {
    tanggal: tanggal,
    nama: data.nama,
    hariIni: data.hariIni,
    ada: h.ada,
    data: h.data
  };
  tanggalHariServer = data.hariIni;
  renderDetail(detailTerakhir);
}

/** Mengisi layar detail dari objek detail. Tidak melakukan request. */
function renderDetail(hasil) {
  $('teks-detail-kembali').textContent = (asalDetail === 'dashboard') ? 'Dashboard' : 'Riwayat';
  $('tanggal-detail').textContent = formatTanggal(hasil.tanggal);

  const status = $('status-detail');
  status.textContent = hasil.ada ? 'Sudah diisi' : 'Belum diisi';
  status.className = 'badge-status ' + (hasil.ada ? 'ok' : 'kosong');

  const isi = $('isi-detail');
  isi.textContent = '';

  if (!hasil.ada) {
    const kosong = document.createElement('div');
    kosong.className = 'kosong-d';
    kosong.textContent = 'Belum ada mutabaah untuk tanggal ini. Ketuk tombol di bawah untuk mengisinya.';
    isi.appendChild(kosong);
  } else {
    const d = hasil.data;

    // Kartu sholat
    const kartuSholat = document.createElement('div');
    kartuSholat.className = 'kartu-d';
    const kepala = document.createElement('div');
    kepala.className = 'flex items-center justify-between gap-3';
    const judul = document.createElement('h2');
    judul.className = 'judul-d';
    judul.textContent = 'Sholat';
    const hitung = document.createElement('span');
    hitung.className = 'text-sm font-semibold text-slate-500';
    hitung.textContent = hitungSholat(d) + '/' + DAFTAR_SHOLAT.length + ' terlaksana';
    kepala.appendChild(judul);
    kepala.appendChild(hitung);
    kartuSholat.appendChild(kepala);

    const wadahSholat = document.createElement('div');
    wadahSholat.style.marginTop = '4px';
    DAFTAR_SHOLAT.forEach(function (s) {
      const nilai = Number(d[s.kunci]);
      const opsi = OPSI_SHOLAT[nilai];
      wadahSholat.appendChild(buatBarisDetail(
        IKON_IBADAH[s.kunci] || 'moon',
        s.label.replace('Sholat ', ''),
        opsi ? opsi.label : '-',
        'nilai-' + (opsi ? nilai : 0)
      ));
    });
    kartuSholat.appendChild(wadahSholat);
    isi.appendChild(kartuSholat);

    // Kartu lainnya
    const kartuLain = document.createElement('div');
    kartuLain.className = 'kartu-d';
    kartuLain.appendChild(buatBarisDetail(
      IKON_IBADAH.istighfar, 'Istighfar 100x',
      Number(d.istighfar) === 1 ? 'Sudah' : 'Belum',
      Number(d.istighfar) === 1 ? 'nilai-ya' : 'nilai-0'
    ));
    kartuLain.appendChild(buatBarisDetail(
      IKON_IBADAH.puasa, 'Puasa',
      Number(d.puasa) === 1 ? 'Ya' : 'Tidak',
      Number(d.puasa) === 1 ? 'nilai-ya' : 'nilai-0'
    ));
    kartuLain.appendChild(buatBarisDetail(
      IKON_IBADAH.alquran, 'Al-Quran',
      d.alquran + ' halaman',
      Number(d.alquran) > 0 ? 'nilai-ya' : 'nilai-0'
    ));
    isi.appendChild(kartuLain);

    const catatan = document.createElement('p');
    catatan.className = 'catatan-d';
    catatan.textContent = 'Terakhir diperbarui: ' + d.updatedAt;
    isi.appendChild(catatan);
  }

  $('teks-isi-edit').textContent = hasil.ada ? 'Edit Mutabaah' : 'Isi Mutabaah';
  tampil('layar-detail');
}


// ====================== FORM MUTABAAH ======================

/**
 * Menyusun objek "hari ini" (bentuk sama dengan jawaban action hariIni)
 * dari jawaban ringkasBulan bulan berjalan. null jika tidak ditemukan.
 */
function hasilHariIniDari(data) {
  if (!data || !data.hari || data.hari.length === 0) return null;
  const h = data.hari[0]; // hari terbaru = hari ini pada bulan berjalan
  if (h.tanggal !== data.hariIni) return null;
  return { ok: true, tanggal: h.tanggal, nama: data.nama, ada: h.ada, data: h.data };
}

/** Membuka form hari ini (tab "Isi Mutabaah"), dari cache jika tersedia. */
async function bukaFormHariIni() {
  const saya = ++navId;

  if (!bacaSesi()) {
    tampilLanding();
    return;
  }

  const kunci = kunciBulanBerjalan();
  const entri = kunci ? cacheRingkas[kunci] : null;
  if (entri) {
    const h = hasilHariIniDari(entri.data);
    if (h) {
      tampilForm(h, 'hariIni');
      if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) {
        segarkanLatar(null, 'form', saya);
      }
      return;
    }
  }

  tampilLoading('Memuat form...');
  const hasil = await muatRingkas(null);
  if (saya !== navId) return;

  if (!hasil.ok) {
    if (hasil.kode === 'BATAL') return;
    if (await tanganiTokenTidakValid(hasil)) return;
    tampilError(hasil.pesan || 'Gagal memuat form.', bukaFormHariIni, true);
    return;
  }

  const h = hasilHariIniDari(hasil);
  if (!h) {
    tampilError('Data hari ini tidak ditemukan. Coba lagi.', bukaFormHariIni, true);
    return;
  }
  tampilForm(h, 'hariIni');
}

/**
 * Jika tanggal server sudah berbeda dari tanggal di form hari ini, form dimuat ulang
 * untuk hari baru. Jika tanggal sama, isi form yang sedang diketik TIDAK diubah.
 */
function muatUlangFormJikaHariBerganti(hasil) {
  if (!formSedangTampil() || modeForm !== 'hariIni' || sedangMenyimpan) return;
  if (hasil.hariIni === tanggalForm) return;
  const h = hasilHariIniDari(hasil);
  if (!h) return;
  tampilForm(h, 'hariIni');
  tampilToast('Hari sudah berganti. Form dimuat ulang untuk hari ini.', 'error');
}

/**
 * Menampilkan form.
 * hasil : objek dengan tanggal, nama, ada, data (dari cache)
 * mode  : 'hariIni' atau 'lampau'
 * Jika data pada tanggal itu sudah ada, form diisi otomatis.
 */
function tampilForm(hasil, mode) {
  modeForm = mode || 'hariIni';
  tanggalForm = hasil.tanggal; // dikirim kembali saat Simpan
  if (modeForm === 'hariIni') tanggalHariServer = hasil.tanggal;

  const lampau = (modeForm === 'lampau');
  $('tombol-form-kembali').hidden = !lampau;
  $('sapaan-form').textContent = lampau
    ? (hasil.ada ? 'Mengedit mutabaah,' : 'Mengisi mutabaah,')
    : "Assalamu'alaikum,";

  $('nama-form').textContent = hasil.nama;
  $('tanggal-form').textContent = formatTanggal(hasil.tanggal);

  // Siapkan isi form: dari data tersimpan, atau kosong
  dataForm = dataFormKosong();
  if (hasil.ada && hasil.data) {
    DAFTAR_SHOLAT.forEach(function (s) {
      dataForm[s.kunci] = Number(hasil.data[s.kunci]);
    });
    dataForm.istighfar = Number(hasil.data.istighfar);
    dataForm.puasa = Number(hasil.data.puasa);
    dataForm.alquran = Number(hasil.data.alquran);
    $('status-form').textContent =
      'Sudah diisi. Kamu bisa mengubahnya. Terakhir diperbarui: ' + hasil.data.updatedAt;
  } else {
    $('status-form').textContent = lampau
      ? 'Belum diisi untuk tanggal ini.'
      : 'Belum diisi hari ini.';
  }

  bangunForm();
  $('pesan-form').hidden = true;
  $('kartu-sholat').classList.remove('salah');
  aturTombolSimpan(false);
  tampil('layar-form');
}

/** Mengunci/membuka tombol Simpan. sibuk = true: spinner dan "Menyimpan...". */
function aturTombolSimpan(sibuk) {
  if (timerTersimpan) {
    clearTimeout(timerTersimpan);
    timerTersimpan = null;
  }
  const tombol = $('tombol-simpan');
  tombol.disabled = sibuk;
  tombol.classList.remove('sukses');
  $('teks-simpan').textContent = sibuk ? 'Menyimpan...' : 'Simpan';
  $('spin-simpan').hidden = !sibuk;
  $('ikon-simpan').hidden = sibuk;
}

/** Menampilkan "Tersimpan" hijau sebentar di tombol Simpan, lalu mengembalikannya. */
function kilatTersimpan() {
  aturTombolSimpan(false);
  $('tombol-simpan').classList.add('sukses');
  $('teks-simpan').textContent = 'Tersimpan';
  timerTersimpan = setTimeout(function () {
    timerTersimpan = null;
    $('tombol-simpan').classList.remove('sukses');
    $('teks-simpan').textContent = 'Simpan';
  }, CONFIG.DURASI_TERSIMPAN_MS);
}

/** Membuat seluruh isi form dari nol berdasarkan dataForm. */
function bangunForm() {
  // --- Sholat ---
  const wadahSholat = $('daftar-sholat');
  wadahSholat.textContent = '';
  DAFTAR_SHOLAT.forEach(function (s) {
    const baris = document.createElement('div');
    baris.className = 'baris-sholat';
    baris.id = 'baris-' + s.kunci;

    const kepala = document.createElement('div');
    kepala.className = 'kepala-sholat';

    const bulat = document.createElement('span');
    bulat.className = 'stat-ikon';
    bulat.setAttribute('aria-hidden', 'true');
    bulat.appendChild(buatIkon(IKON_IBADAH[s.kunci] || 'moon', 'h-[18px] w-[18px]'));

    const label = document.createElement('p');
    label.className = 'nama-sholat-b';
    label.textContent = s.label;

    kepala.appendChild(bulat);
    kepala.appendChild(label);
    baris.appendChild(kepala);
    baris.appendChild(buatPilihan(s.kunci, OPSI_SHOLAT, s.label));
    wadahSholat.appendChild(baris);
  });

  // --- Istighfar dan Puasa ---
  const wadahIstighfar = $('pilih-istighfar');
  wadahIstighfar.textContent = '';
  wadahIstighfar.appendChild(buatPilihan('istighfar', OPSI_ISTIGHFAR, 'Istighfar 100x'));

  const wadahPuasa = $('pilih-puasa');
  wadahPuasa.textContent = '';
  wadahPuasa.appendChild(buatPilihan('puasa', OPSI_PUASA, 'Puasa'));

  // --- Al-Quran ---
  $('input-alquran').value = (dataForm.alquran === null) ? '' : String(dataForm.alquran);
  $('kartu-alquran').classList.remove('salah');

  perbaruiHitungSholat();
}

/**
 * Membuat satu grup tombol pilihan (seperti radio).
 * kunci   : nama field di dataForm
 * opsi    : daftar { nilai, label }
 * namaAria: label untuk pembaca layar
 */
function buatPilihan(kunci, opsi, namaAria) {
  const grup = document.createElement('div');
  grup.className = 'pilihan-grup' + (opsi.length === 2 ? ' dua' : '');
  grup.setAttribute('role', 'radiogroup');
  grup.setAttribute('aria-label', namaAria);

  const tombolTombol = [];

  function segarkan() {
    tombolTombol.forEach(function (item) {
      const aktif = (dataForm[kunci] === item.nilai);
      item.el.classList.toggle('aktif', aktif);
      item.el.setAttribute('aria-checked', aktif ? 'true' : 'false');
    });
  }

  opsi.forEach(function (o) {
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'pilihan pil-' + o.nilai;
    tombol.setAttribute('role', 'radio');
    tombol.textContent = o.label;
    tombol.addEventListener('click', function () {
      dataForm[kunci] = o.nilai;
      segarkan();
      tandaiBenar('baris-' + kunci);
      perbaruiHitungSholat();
    });
    grup.appendChild(tombol);
    tombolTombol.push({ el: tombol, nilai: o.nilai });
  });

  segarkan();
  return grup;
}

/** Menghapus tanda merah dari satu elemen. */
function tandaiBenar(idElemen) {
  const el = $(idElemen);
  if (el) el.classList.remove('salah');
}

/** Memperbarui teks "3/7 dipilih" dan batang progress sholat. */
function perbaruiHitungSholat() {
  let terisi = 0;
  DAFTAR_SHOLAT.forEach(function (s) {
    if (dataForm[s.kunci] !== null) terisi++;
  });
  $('hitung-sholat').textContent = terisi + '/' + DAFTAR_SHOLAT.length + ' dipilih';
  $('bar-sholat').style.width = (terisi * 100 / DAFTAR_SHOLAT.length) + '%';
}


// ====================== INPUT AL-QURAN ======================

/** Membaca kolom Al-Quran ke dataForm (hanya angka, maksimal 3 digit). */
function bacaInputAlquran() {
  const el = $('input-alquran');
  const bersih = el.value.replace(/\D/g, '').slice(0, 3);
  el.value = bersih;
  dataForm.alquran = (bersih === '') ? null : parseInt(bersih, 10);
  $('kartu-alquran').classList.remove('salah');
}

/** Menambah/mengurangi halaman (batas 0 sampai MAKS_HALAMAN). */
function ubahAlquran(selisih) {
  const sekarang = (dataForm.alquran === null) ? 0 : dataForm.alquran;
  setAlquran(sekarang + selisih);
}

/** Mengisi halaman dengan nilai tertentu (batas 0 sampai MAKS_HALAMAN). */
function setAlquran(nilai) {
  let baru = Math.round(Number(nilai));
  if (!isFinite(baru) || baru < 0) baru = 0;
  if (baru > CONFIG.MAKS_HALAMAN) baru = CONFIG.MAKS_HALAMAN;
  dataForm.alquran = baru;
  $('input-alquran').value = String(baru);
  $('kartu-alquran').classList.remove('salah');
}


// ====================== VALIDASI FORM ======================

/**
 * Memeriksa dataForm. Mengembalikan { ok, pesan, elemenPertama }.
 * Item yang bermasalah diberi tanda merah.
 */
function validasiForm() {
  const masalah = [];
  let elemenPertama = null;

  // Semua sholat wajib dipilih
  let sholatKosong = 0;
  DAFTAR_SHOLAT.forEach(function (s) {
    const baris = $('baris-' + s.kunci);
    if (dataForm[s.kunci] === null) {
      sholatKosong++;
      baris.classList.add('salah');
      if (!elemenPertama) elemenPertama = baris;
    } else {
      baris.classList.remove('salah');
    }
  });
  if (sholatKosong > 0) {
    masalah.push('Pilih salah satu untuk setiap sholat (' + sholatKosong + ' belum dipilih).');
  }

  // Al-Quran: wajib diisi, bilangan bulat 0 sampai MAKS_HALAMAN
  const kartuQuran = $('kartu-alquran');
  const q = dataForm.alquran;
  if (q === null) {
    masalah.push('Isi jumlah halaman Al-Quran. Isi 0 jika tidak membaca.');
    kartuQuran.classList.add('salah');
    if (!elemenPertama) elemenPertama = kartuQuran;
  } else if (!Number.isInteger(q) || q < 0 || q > CONFIG.MAKS_HALAMAN) {
    masalah.push('Jumlah halaman Al-Quran harus 0 sampai ' + CONFIG.MAKS_HALAMAN + '.');
    kartuQuran.classList.add('salah');
    if (!elemenPertama) elemenPertama = kartuQuran;
  } else {
    kartuQuran.classList.remove('salah');
  }

  return {
    ok: masalah.length === 0,
    pesan: masalah.join(' '),
    elemenPertama: elemenPertama
  };
}


// ====================== SIMPAN KE SERVER ======================

/** Dipanggil saat tombol Simpan ditekan: validasi, lalu kirim ke backend. */
async function prosesSimpan() {
  if (sedangMenyimpan) return;

  const pesan = $('pesan-form');

  // 1. Validasi di frontend (pemeriksaan sebenarnya tetap di backend)
  const cek = validasiForm();
  if (!cek.ok) {
    pesan.textContent = cek.pesan;
    pesan.hidden = false;
    if (cek.elemenPertama) {
      cek.elemenPertama.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  pesan.hidden = true;

  // 2. Pastikan sesi masih ada (dan belum kedaluwarsa)
  const sesi = bacaSesi();
  if (!sesi) {
    tampilLanding('Sesi tidak ditemukan. Silakan masuk lagi.');
    return;
  }

  // 3. Kirim ke server: tanggal yang sedang tampil + data. Tanpa ID (identitas dari token).
  //    simpanRingkas menjawab dengan ringkasan bulan terbaru, jadi tidak perlu ambil ulang.
  const tanggalDisimpan = tanggalForm;
  const modeSaatSimpan = modeForm;
  sedangMenyimpan = true;
  aturTombolSimpan(true);

  const hasil = await panggilApi({
    action: 'simpanRingkas',
    token: sesi.token,
    tanggal: tanggalDisimpan,
    data: Object.assign({}, dataForm)
  });

  sedangMenyimpan = false;

  // 4. Tangani hasil
  if (hasil.ok) {
    aturTombolSimpan(false);
    perbaruiAktivitas(false);

    // Perbarui cache lokal dari jawaban server
    if (hasil.ringkas && hasil.ringkas.ok) {
      simpanKeCache(hasil.ringkas);
    } else {
      delete cacheRingkas[tanggalDisimpan.substring(0, 7)]; // paksa ambil ulang saat dibuka
    }

    const teksToast = (hasil.status === 'dibuat')
      ? 'Alhamdulillah, mutabaah tersimpan ✓'
      : 'Alhamdulillah, perubahan tersimpan ✓';

    if (modeSaatSimpan === 'lampau') {
      // Kembali ke layar asal (dashboard/riwayat): tampil langsung dari cache yang baru
      await kembaliDariDetail(tanggalDisimpan.substring(0, 7));
      tampilToast(teksToast, 'sukses');
      return;
    }

    $('status-form').textContent =
      'Sudah diisi. Kamu bisa mengubahnya. Terakhir diperbarui: ' + hasil.updatedAt;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    kilatTersimpan();
    tampilToast(teksToast, 'sukses');
    return;
  }

  if (await tanganiTokenTidakValid(hasil)) return;

  // Koneksi bermasalah, data/tanggal ditolak, atau server sibuk: isi form tetap utuh
  aturTombolSimpan(false);
  let teksPesan = hasil.pesan || 'Gagal menyimpan. Coba lagi.';
  if (adalahMasalahKoneksi(hasil.kode)) {
    teksPesan += ' Data mungkin sudah tersimpan. Menekan Simpan lagi aman dan tidak membuat data ganda.';
  }
  pesan.textContent = teksPesan;
  pesan.hidden = false;
  pesan.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  $('tombol-ganti-pengguna').addEventListener('click', gantiPengguna);
  $('tombol-ganti-dashboard').addEventListener('click', gantiPengguna);

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

  // Navigasi bawah: menekan tab yang sedang aktif tidak membuat request
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

pasangEvent();
mulai();

// Tampilkan halaman setelah Tailwind sempat memproses kelas (mencegah kilasan tanpa gaya)
requestAnimationFrame(function () {
  requestAnimationFrame(function () {
    document.documentElement.classList.add('siap');
  });
});
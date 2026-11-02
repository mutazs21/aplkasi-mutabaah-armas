'use strict';

/**
 * app.js — Frontend Mutabaah Harian
 * OPTIMASI: cache memori per bulan, satu request per bulan (ringkasBulan),
 * pindah tab instan, revalidasi di background, simpan memperbarui cache lokal.
 *
 * Keamanan:
 *  - Frontend TIDAK mengirim ID pengguna. Identitas hanya dari token.
 *  - Cache hanya di memori halaman (bukan localStorage), berisi data yang sudah
 *    dikirim server ke user yang login. PIN dan secret tidak pernah ada di frontend.
 *  - Cache dikosongkan saat ganti pengguna, login baru, sesi tidak valid, dan refresh.
 */

// ====================== KONFIGURASI ======================

const CONFIG = {
  // GANTI dengan URL Web App dari STEP 4 (berakhiran /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbz8dznt2tqrscDFZqyLw427n597PXvADHyeZz8BvK_hmCZLNmsOw9mNOxQSVqq3nd0C/exec',

  // Nama penyimpanan sesi di HP (tidak perlu diubah)
  KUNCI_SESI: 'mutabaah_sesi_v1',

  // Batas waktu menunggu server (milidetik)
  TIMEOUT_MS: 20000,

  // Lama notifikasi tampil (milidetik)
  DURASI_TOAST_MS: 4500,

  // Jeda minimal antar pengecekan tanggal saat kembali ke aplikasi (milidetik)
  JEDA_CEK_TANGGAL_MS: 15000,

  // Data cache lebih tua dari ini diperbarui di background saat dibuka (milidetik)
  BATAS_SEGAR_MS: 60000,

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

const OPSI_SHOLAT = [
  { nilai: 0, label: 'Tidak' },
  { nilai: 1, label: 'Sendiri' },
  { nilai: 2, label: 'Berjamaah' }
];

const OPSI_ISTIGHFAR = [
  { nilai: 0, label: 'Belum' },
  { nilai: 1, label: 'Selesai' }
];

const OPSI_PUASA = [
  { nilai: 0, label: 'Tidak' },
  { nilai: 1, label: 'Ya' }
];

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
                    'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul',
                           'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Kepala kolom kalender (minggu dimulai hari Senin)
const INISIAL_HARI = ['Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb', 'Mg'];

// Nama yang sedang dipilih di layar PIN
let anggotaTerpilih = null;

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

// Cadangan sesi di memori, dipakai jika penyimpanan HP diblokir
let sesiMemori = null;

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
  aturNavigasi(idLayar);
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

/** "2026-11-01" menjadi "Minggu". */
function namaHari(teks) {
  return NAMA_HARI[keDate(teks).getDay()];
}

/** "2026-11" menjadi "November 2026". */
function formatBulan(bulan) {
  const bagian = String(bulan).split('-');
  return NAMA_BULAN[Number(bagian[1]) - 1] + ' ' + bagian[0];
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

/** Ringkasan satu hari untuk daftar riwayat. */
function teksRingkas(data) {
  return 'Sholat ' + hitungSholat(data) + '/' + DAFTAR_SHOLAT.length +
    ' · Istighfar ' + (Number(data.istighfar) === 1 ? '✅' : '❌') +
    ' · Puasa ' + (Number(data.puasa) === 1 ? '✅' : '❌') +
    ' · Quran ' + data.alquran + ' hlm';
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
    if (hasil.ok) simpanKeCache(hasil);
    return hasil;
  });
  permintaanJalan[kunciJalan] = janji;
  return janji;
}


// ====================== SESI PERANGKAT ======================

/**
 * Membaca sesi. Utamanya dari penyimpanan HP; jika tidak ada/diblokir,
 * memakai cadangan di memori. Mengembalikan {token, id, nama} atau null.
 */
function bacaSesi() {
  try {
    const mentah = localStorage.getItem(CONFIG.KUNCI_SESI);
    if (mentah) {
      const sesi = JSON.parse(mentah);
      if (sesi && typeof sesi.token === 'string' && typeof sesi.nama === 'string') {
        return sesi;
      }
    }
  } catch (err) {
    // abaikan, lanjut ke cadangan memori
  }
  return sesiMemori;
}

/** Menyimpan sesi. Mengembalikan true jika berhasil disimpan di HP, false jika tidak. */
function simpanSesi(sesi) {
  sesiMemori = sesi; // cadangan agar login tetap jalan selama halaman terbuka
  try {
    localStorage.setItem(CONFIG.KUNCI_SESI, JSON.stringify(sesi));
    return true;
  } catch (err) {
    return false;
  }
}

/** Menghapus sesi DAN cache (cache lama tidak boleh dipakai setelah logout). */
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
 * hapus sesi dan cache, kembali ke daftar nama, lalu mengembalikan true.
 * senyap = true: tanpa notifikasi (dipakai saat aplikasi baru dibuka).
 */
async function tanganiTokenTidakValid(hasil, senyap) {
  if (hasil.kode !== 'TOKEN_TIDAK_VALID') return false;
  hapusSesi();
  await tampilPilihNama();
  if (!senyap) {
    tampilToast('Sesi berakhir. Silakan pilih nama dan masuk lagi.', 'error');
  }
  return true;
}


// ====================== ALUR UTAMA ======================

/** Titik awal aplikasi: dashboard jika sudah login, daftar nama jika belum. */
async function mulai() {
  navId++;

  if (!apiSudahDiisi()) {
    tampilError('Alamat API belum diisi. Buka app.js dan isi CONFIG.API_URL dengan URL Web App (berakhiran /exec).');
    return;
  }

  if (bacaSesi()) {
    await bukaBulan('dashboard', null, true);
    return;
  }

  await tampilPilihNama();
}

/** Mengambil daftar anggota dan menampilkannya sebagai tombol. */
async function tampilPilihNama() {
  tampilLoading('Memuat daftar nama...');
  const hasil = await panggilApi({ action: 'anggota' });
  if (!hasil.ok) {
    tampilError(hasil.pesan || 'Gagal memuat daftar nama.');
    return;
  }

  const wadah = $('daftar-nama');
  wadah.textContent = '';

  if (!hasil.anggota || hasil.anggota.length === 0) {
    const kosong = document.createElement('p');
    kosong.className = 'teks-redup';
    kosong.textContent = 'Belum ada anggota aktif. Periksa sheet Anggota.';
    wadah.appendChild(kosong);
  } else {
    hasil.anggota.forEach(function (a) {
      const tombol = document.createElement('button');
      tombol.type = 'button';
      tombol.className = 'tombol-nama';
      tombol.textContent = a.nama; // textContent: aman dari penyisipan kode
      tombol.addEventListener('click', function () { bukaLayarPin(a); });
      wadah.appendChild(tombol);
    });
  }

  tampil('layar-nama');
}


// ====================== LAYAR PIN ======================

function bukaLayarPin(anggota) {
  anggotaTerpilih = anggota;
  $('nama-pin').textContent = anggota.nama;
  $('input-pin').value = '';
  sembunyikanPesanPin();
  $('tombol-masuk').disabled = false;
  tampil('layar-pin');
  $('input-pin').focus();
}

function tampilkanPesanPin(teks) {
  const el = $('pesan-pin');
  el.textContent = teks;
  el.hidden = false;
}

function sembunyikanPesanPin() {
  $('pesan-pin').hidden = true;
}

async function kirimPin() {
  if (!anggotaTerpilih) return;

  const pin = $('input-pin').value.trim();
  if (!/^\d{4}$/.test(pin)) {
    tampilkanPesanPin('PIN harus 4 angka.');
    return;
  }

  sembunyikanPesanPin();
  $('tombol-masuk').disabled = true;
  $('tombol-masuk').textContent = 'Memeriksa...';

  const hasil = await panggilApi({ action: 'login', id: anggotaTerpilih.id, pin: pin });

  $('tombol-masuk').textContent = 'Masuk';

  if (hasil.ok) {
    hapusCache(); // pastikan tidak ada sisa data pengguna sebelumnya
    const tersimpan = simpanSesi({ token: hasil.token, id: hasil.id, nama: hasil.nama });
    await mulai(); // masuk ke dashboard
    if (!tersimpan) {
      tampilToast('Perangkat ini tidak bisa mengingat login. PIN perlu dimasukkan lagi saat aplikasi dibuka ulang.', 'error');
    }
    return;
  }

  $('tombol-masuk').disabled = false;
  $('input-pin').value = '';
  tampilkanPesanPin(hasil.pesan || 'Login gagal.');
  $('input-pin').focus();
}


// ====================== DASHBOARD: RENDER ======================

/**
 * Membuat satu baris statistik dengan batang bertumpuk.
 * segmen: daftar { nilai, kelas } yang digambar berurutan dari kiri.
 */
function buatBarisStat(label, nilaiTotal, total, segmen, detail) {
  const baris = document.createElement('div');
  baris.className = 'baris-stat';

  const atas = document.createElement('div');
  atas.className = 'atas-stat';
  const kiri = document.createElement('span');
  kiri.textContent = label;
  const kanan = document.createElement('strong');
  kanan.textContent = nilaiTotal + '/' + total;
  atas.appendChild(kiri);
  atas.appendChild(kanan);
  baris.appendChild(atas);

  const bar = document.createElement('div');
  bar.className = 'bar bar-kecil';
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

  if (detail) {
    const p = document.createElement('p');
    p.className = 'detail-stat';
    p.textContent = detail;
    baris.appendChild(p);
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
      'conic-gradient(#0f766e ' + (persen * 3.6) + 'deg, #e5e7eb 0)';
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
        label, s.terlaksana, total,
        [
          { nilai: s.berjamaah, kelas: 'seg-jamaah' },
          { nilai: s.sendiri, kelas: 'seg-sendiri' }
        ],
        'Berjamaah: ' + s.berjamaah + ' hari · Sendiri: ' + s.sendiri + ' hari'
      ));
    });
    daftar.appendChild(buatBarisStat(
      'Istighfar', hasil.istighfar, total,
      [{ nilai: hasil.istighfar, kelas: 'seg-utama' }], null
    ));
    daftar.appendChild(buatBarisStat(
      'Puasa', hasil.puasa, total,
      [{ nilai: hasil.puasa, kelas: 'seg-utama' }], null
    ));
  }

  if (!layarTampil('layar-dashboard')) tampil('layar-dashboard');
}


// ====================== RIWAYAT: RENDER ======================

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

  const wadah = $('daftar-hari');
  wadah.textContent = '';

  hasil.hari.forEach(function (h) {
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'item-hari ' + (h.ada ? levelHari(h.data) : 'kosong');

    const kiri = document.createElement('span');
    kiri.className = 'tgl-hari';
    const nomor = document.createElement('strong');
    nomor.textContent = formatTanggalPendek(h.tanggal);
    const hari = document.createElement('small');
    hari.textContent = namaHari(h.tanggal) + (h.tanggal === hasil.hariIni ? ' · Hari ini' : '');
    kiri.appendChild(nomor);
    kiri.appendChild(hari);

    const kanan = document.createElement('span');
    kanan.className = 'ringkas';
    kanan.textContent = h.ada ? teksRingkas(h.data) : 'Belum diisi';

    const panah = document.createElement('span');
    panah.className = 'panah';
    panah.setAttribute('aria-hidden', 'true');
    panah.textContent = '›';

    tombol.appendChild(kiri);
    tombol.appendChild(kanan);
    tombol.appendChild(panah);
    tombol.addEventListener('click', function () {
      asalDetail = 'riwayat';
      bukaDetail(h.tanggal);
    });
    wadah.appendChild(tombol);
  });

  if (!layarTampil('layar-riwayat')) tampil('layar-riwayat');
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
    await tampilPilihNama();
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
 * Kegagalan jaringan diabaikan (data lama tetap tampil). Sesi tidak valid = logout.
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

function buatBarisDetail(label, nilai) {
  const baris = document.createElement('div');
  baris.className = 'baris-detail';
  const kiri = document.createElement('span');
  kiri.textContent = label;
  const kanan = document.createElement('strong');
  kanan.textContent = nilai;
  baris.appendChild(kiri);
  baris.appendChild(kanan);
  return baris;
}

/**
 * Membuka detail satu tanggal. Datanya diambil dari cache bulan tersebut
 * (tanpa request). Jika bulannya belum ada di cache, 1 request ringkasBulan.
 */
async function bukaDetail(tanggal) {
  const saya = ++navId;

  if (!bacaSesi()) {
    await tampilPilihNama();
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
  $('tombol-detail-kembali').textContent =
    (asalDetail === 'dashboard') ? '← Dashboard' : '← Riwayat';
  $('tanggal-detail').textContent = formatTanggal(hasil.tanggal);

  const isi = $('isi-detail');
  isi.textContent = '';

  const kartu = document.createElement('div');
  kartu.className = 'kartu';

  if (!hasil.ada) {
    const p = document.createElement('p');
    p.textContent = 'Belum ada mutabaah untuk tanggal ini.';
    kartu.appendChild(p);
  } else {
    const d = hasil.data;
    DAFTAR_SHOLAT.forEach(function (s) {
      const opsi = OPSI_SHOLAT[Number(d[s.kunci])];
      kartu.appendChild(buatBarisDetail(s.label, opsi ? opsi.label : '-'));
    });
    kartu.appendChild(buatBarisDetail('Istighfar 100x', Number(d.istighfar) === 1 ? 'Selesai' : 'Belum'));
    kartu.appendChild(buatBarisDetail('Puasa', Number(d.puasa) === 1 ? 'Ya' : 'Tidak'));
    kartu.appendChild(buatBarisDetail('Al-Quran', d.alquran + ' halaman'));

    const catatan = document.createElement('p');
    catatan.className = 'catatan-detail';
    catatan.textContent = 'Terakhir diperbarui: ' + d.updatedAt;
    kartu.appendChild(catatan);
  }
  isi.appendChild(kartu);

  $('tombol-isi-edit').textContent = hasil.ada ? 'Edit Mutabaah' : 'Isi Mutabaah';
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
    await tampilPilihNama();
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
  aturTombolSimpan(false);
  tampil('layar-form');
}

/** Mengunci/membuka tombol Simpan. */
function aturTombolSimpan(sibuk) {
  const tombol = $('tombol-simpan');
  tombol.disabled = sibuk;
  tombol.textContent = sibuk ? 'Menyimpan...' : 'Simpan';
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

    const label = document.createElement('p');
    label.className = 'nama-sholat';
    label.textContent = s.label;
    baris.appendChild(label);

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
  grup.className = 'pilihan-grup';
  grup.setAttribute('role', 'radiogroup');
  grup.setAttribute('aria-label', namaAria);

  const tombolTombol = [];

  function segarkan() {
    tombolTombol.forEach(function (item) {
      const aktif = (dataForm[kunci] === item.nilai);
      item.el.classList.toggle('aktif', aktif);
      item.el.classList.toggle('nol', item.nilai === 0);
      item.el.setAttribute('aria-checked', aktif ? 'true' : 'false');
    });
  }

  opsi.forEach(function (o) {
    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'pilihan';
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

/** Memperbarui teks "3/7 dipilih". */
function perbaruiHitungSholat() {
  let terisi = 0;
  DAFTAR_SHOLAT.forEach(function (s) {
    if (dataForm[s.kunci] !== null) terisi++;
  });
  $('hitung-sholat').textContent = terisi + '/' + DAFTAR_SHOLAT.length + ' dipilih';
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

function ubahAlquran(selisih) {
  const sekarang = (dataForm.alquran === null) ? 0 : dataForm.alquran;
  let baru = sekarang + selisih;
  if (baru < 0) baru = 0;
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

  // 2. Pastikan sesi masih ada
  const sesi = bacaSesi();
  if (!sesi) {
    await tampilPilihNama();
    tampilToast('Sesi tidak ditemukan. Silakan pilih nama dan masuk lagi.', 'error');
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

async function gantiPengguna() {
  navId++;
  hapusSesi(); // juga mengosongkan cache
  await tampilPilihNama();
}


// ====================== CEK TANGGAL SAAT KEMBALI KE APLIKASI ======================

/**
 * Dipanggil saat aplikasi kembali terlihat (tab dibuka lagi, HP dibuka lagi).
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

  $('tombol-kembali').addEventListener('click', function () {
    anggotaTerpilih = null;
    tampil('layar-nama');
  });

  $('tombol-ganti-pengguna').addEventListener('click', gantiPengguna);
  $('tombol-ganti-dashboard').addEventListener('click', gantiPengguna);

  $('form-pin').addEventListener('submit', function (e) {
    e.preventDefault();
    kirimPin();
  });

  // PIN: hanya angka; otomatis kirim saat 4 digit terisi
  $('input-pin').addEventListener('input', function () {
    const bersih = this.value.replace(/\D/g, '').slice(0, 4);
    this.value = bersih;
    if (bersih.length > 0) sembunyikanPesanPin();
    if (bersih.length === 4 && !$('tombol-masuk').disabled) {
      kirimPin();
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

  // Saat pengguna kembali ke aplikasi, pastikan tanggal form hari ini masih benar
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      cekTanggalSaatKembali();
    }
  });
}

pasangEvent();
mulai();
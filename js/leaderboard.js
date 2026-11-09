'use strict';

/**
 * leaderboard.js — Layar Peringkat (STEP 7). Dimuat setelah admin.js, sebelum main.js.
 *
 * - Layar dan tab navigasi dibuat lewat JavaScript (index.html hanya memuat file ini).
 * - Anggota dan admin memakai action yang sama (leaderboard). Peran ditentukan oleh tab
 *   yang diketuk (nav-lb = anggota, nav-adm-lb = admin); token diambil dari sesi peran itu.
 * - Jawaban hanya berisi nama dan angka agregat. Semua teks dipasang dengan textContent.
 * - Ganti kategori: tanpa request. Ganti periode: cache per periode (BATAS_SEGAR_MS).
 * - Membungkus tampil(), adminSedangTampil(), hapusSesi(), hapusSesiAdm(), panggilApi()
 *   tanpa mengubah core.js, admin.js, atau main.js.
 * Memakai fungsi dari core.js, admin.js (buatEl, labelPeriode, keLandingDariAdmin, ...).
 */

// ====================== KONFIGURASI KATEGORI ======================

const LB_KATEGORI = [
  { kunci: 'performa', label: 'Performa', judul: 'Performa Terbaik', satuan: 'skor', rasio: true,
    ket: 'Skor gabungan sholat wajib, berjamaah, sunnah, istighfar, dan Al-Quran, ditambah bonus puasa kecil (maksimal 100).' },
  { kunci: 'alquran', label: 'Al-Quran', judul: 'Al-Quran Terbanyak', satuan: 'halaman', rasio: false,
    ket: 'Total halaman Al-Quran yang dibaca pada periode ini.' },
  { kunci: 'jamaah', label: 'Berjamaah', judul: 'Sholat Berjamaah Terbanyak', satuan: 'sholat', rasio: false,
    ket: 'Jumlah sholat wajib (Subuh, Dzuhur, Ashar, Magrib, Isya) dengan status berjamaah.' },
  { kunci: 'konsistensi', label: 'Konsistensi', judul: 'Konsistensi Mutabaah', satuan: 'skor', rasio: true,
    ket: 'Gabungan hari aktif dan hari lengkap (5 sholat wajib dan istighfar) dari hari yang sudah selesai.' }
];

const LB_CARA = [
  'Skor harian (0 sampai 100): sholat wajib 45, berjamaah 15, sholat sunnah (Tahajjud dan Dhuha) 10, istighfar 10, Al-Quran 20 (target harian 5 halaman, lebih dari itu tidak menambah skor).',
  'Performa = rata-rata skor harian ditambah bonus puasa maksimal 5, dibatasi 100. Tidak berpuasa tidak mengurangi skor.',
  'Konsistensi = 50% hari aktif ditambah 50% hari lengkap. Hari lengkap berarti 5 sholat wajib dan istighfar.',
  'Penyebut sama untuk semua anggota: hari yang sudah selesai (sampai kemarin). Hari tanpa catatan bernilai nol, dan hari ini tidak pernah dihitung gagal.',
  'Al-Quran dan Berjamaah adalah total jumlah dan sudah menyertakan hari ini. "Berjamaah" berarti status sholat berjamaah, bukan lokasi sholat.',
  'Jika nilai sama, peringkat dibagi. Urutan dalam seri ditentukan ukuran kedua dan ketiga (misalnya hari lengkap atau total Al-Quran), lalu nama A sampai Z.'
];


// ====================== STATE ======================

let cacheLb = {};          // 'peran|periode' -> { data, waktu }
let permintaanLb = {};     // permintaan yang sedang berjalan
let generasiLb = 0;        // dinaikkan saat cache dikosongkan
let hariLb = null;         // tanggal server pada jawaban terakhir

let lbPeran = null;        // 'user' | 'admin'
let lbPeriode = null;      // periode yang sedang tampil
let lbKategori = 'performa';
let lbData = null;


// ====================== FUNGSI BANTU ======================

function lbKat(kunci) {
  for (let i = 0; i < LB_KATEGORI.length; i++) {
    if (LB_KATEGORI[i].kunci === kunci) return LB_KATEGORI[i];
  }
  return LB_KATEGORI[0];
}

function lbSesi(peran) {
  return peran === 'admin' ? bacaSesiAdm() : bacaSesi();
}

function lbFormatNilai(kat, v) {
  if (v === null || v === undefined) return '–';
  if (kat.rasio) return (Math.round(v * 10) / 10).toString().replace('.', ',');
  return String(v);
}

function lbRinci(kat, r) {
  const skor = (r.performa === null || r.performa === undefined) ? null : lbFormatNilai(lbKat('performa'), r.performa);
  if (kat.kunci === 'performa') return r.hariLengkap + ' hari lengkap · ' + r.totalAlquran + ' hlm';
  if (kat.kunci === 'alquran') return r.hariMembaca + ' hari membaca';
  if (kat.kunci === 'jamaah') return skor === null ? '' : 'Skor performa ' + skor;
  return 'Streak ' + r.streak + ' hari';
}

function hapusCacheLb() {
  cacheLb = {};
  permintaanLb = {};
  hariLb = null;
  generasiLb++;
}

function resetLb() {
  hapusCacheLb();
  lbPeran = null;
  lbPeriode = null;
  lbData = null;
}


// ====================== PEMBUNGKUS FUNGSI LAIN ======================

// Navigasi: tab Peringkat untuk anggota (bar bawah) dan admin
const tampilSebelumLb = tampil;
tampil = function (idLayar) {
  tampilSebelumLb(idLayar);
  if (idLayar === 'layar-loading') return;

  const adaLb = (idLayar === 'layar-lb');
  const admin = (lbPeran === 'admin');
  if (adaLb) {
    $('nav-bawah').hidden = admin;
    $('nav-admin').hidden = !admin;
    document.body.classList.add('ada-nav');
    ['nav-dashboard', 'nav-isi', 'nav-riwayat', 'nav-adm-ringkasan', 'nav-adm-anggota'].forEach(function (id) {
      const el = $(id);
      el.classList.remove('aktif');
      el.removeAttribute('aria-current');
    });
  }
  [['nav-lb', !admin], ['nav-adm-lb', admin]].forEach(function (p) {
    const el = $(p[0]);
    const aktif = adaLb && p[1];
    el.classList.toggle('aktif', aktif);
    if (aktif) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
};

// Saat admin melihat Peringkat, pengecekan sesi saat kembali memakai sesi admin
const adminSedangTampilSebelumLb = adminSedangTampil;
adminSedangTampil = function () {
  return adminSedangTampilSebelumLb() || (layarTampil('layar-lb') && lbPeran === 'admin');
};

// Keluar: bersihkan data peringkat
const hapusSesiSebelumLb = hapusSesi;
hapusSesi = function () {
  hapusSesiSebelumLb();
  resetLb();
};

const hapusSesiAdmSebelumLb = hapusSesiAdm;
hapusSesiAdm = function () {
  hapusSesiAdmSebelumLb();
  resetLb();
};

// Setelah anggota menyimpan mutabaah, cache peringkat tidak berlaku lagi
const panggilApiSebelumLb = panggilApi;
panggilApi = async function (isi) {
  const hasil = await panggilApiSebelumLb(isi);
  if (isi && isi.action === 'simpanRingkas' && hasil && hasil.ok) hapusCacheLb();
  return hasil;
};


// ====================== DATA ======================

function simpanCacheLb(peran, hasil) {
  if (hariLb !== null && hasil.hariIni !== hariLb) cacheLb = {};
  hariLb = hasil.hariIni;
  cacheLb[peran + '|' + hasil.periode.kunci] = { data: hasil, waktu: Date.now() };
}

/** Mengambil peringkat satu periode (null = bawaan server: bulan berjalan). */
function muatLb(peran, periode) {
  const kunciJalan = peran + '|' + (periode || '_default');
  if (permintaanLb[kunciJalan]) return permintaanLb[kunciJalan];

  const sesi = lbSesi(peran);
  if (!sesi) {
    return Promise.resolve({ ok: false, kode: 'BATAL', pesan: 'Sesi tidak ditemukan.' });
  }

  const generasiAwal = generasiLb;
  const isi = { action: 'leaderboard', token: sesi.token };
  if (periode) isi.periode = periode;

  const janji = panggilApi(isi).then(function (hasil) {
    if (generasiAwal !== generasiLb) {
      return { ok: false, kode: 'BATAL', pesan: 'Dibatalkan.' };
    }
    delete permintaanLb[kunciJalan];
    if (hasil.ok) {
      simpanCacheLb(peran, hasil);
      if (peran === 'user') perbaruiAktivitas(false);
    }
    return hasil;
  });
  permintaanLb[kunciJalan] = janji;
  return janji;
}

function lbKeLanding(peran) {
  if (peran === 'admin') keLandingDariAdmin();
  else tampilLanding();
}

/** Membuka layar Peringkat. periode null = periode yang sedang dipakai (atau bulan berjalan). */
async function bukaLb(peran, periode) {
  const saya = ++navId;
  if (lbPeran !== peran) {
    lbPeriode = null;
    lbData = null;
  }
  lbPeran = peran;

  if (!lbSesi(peran)) {
    lbKeLanding(peran);
    return;
  }

  const kunci = periode || lbPeriode;
  const entri = kunci ? cacheLb[peran + '|' + kunci] : null;
  if (entri) {
    lbRender(entri.data);
    if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) segarkanLb(peran, kunci, saya);
    return;
  }

  const terlihat = layarTampil('layar-lb');
  if (terlihat) lbStatus('muat');
  else tampilLoading('Memuat peringkat...');

  const hasil = await muatLb(peran, kunci);
  if (saya !== navId) return;

  if (hasil.ok) {
    lbRender(hasil);
    return;
  }
  if (hasil.kode === 'BATAL') return;
  if (peran === 'admin') {
    if (await tanganiAdminGagal(hasil)) return;
  } else if (await tanganiTokenTidakValid(hasil)) {
    return;
  }

  const ulang = function () { bukaLb(peran, kunci); };
  if (terlihat) lbStatus('galat', hasil.pesan || 'Gagal memuat peringkat.', ulang);
  else tampilError(hasil.pesan || 'Gagal memuat peringkat.', ulang, true);
}

/** Pembaruan di background tanpa menutup layar. Kegagalan jaringan diabaikan. */
async function segarkanLb(peran, kunci, saya) {
  aturSegar(true);
  const hasil = await muatLb(peran, kunci);
  aturSegar(false);

  if (!lbSesi(peran)) return;
  if (!hasil.ok) {
    if (hasil.kode === 'TOKEN_TIDAK_VALID') {
      if (peran === 'admin') await tanganiAdminGagal(hasil);
      else await tanganiTokenTidakValid(hasil);
    }
    return;
  }
  if (saya !== navId) return;
  if (layarTampil('layar-lb') && lbPeran === peran) lbRender(hasil);
}


// ====================== TAMPILAN ======================

function bangunLayarLb() {
  const sec = document.createElement('section');
  sec.id = 'layar-lb';
  sec.className = 'layar';
  sec.hidden = true;
  sec.innerHTML =
    '<header class="hero-dash">' +
      '<div class="relative flex items-start justify-between gap-3">' +
        '<div class="min-w-0"><p class="m-0 text-sm text-teal-100/80">Leaderboard</p>' +
        '<h1 class="m-0 mt-0.5 text-2xl font-bold leading-tight text-white">Peringkat</h1></div>' +
        '<button type="button" id="lb-keluar" class="tombol-keluar" aria-label="Keluar dari akun">' +
        '<i data-lucide="log-out" class="h-4 w-4"></i>Keluar</button>' +
      '</div>' +
      '<div class="pilih-wadah">' +
        '<label for="lb-periode" class="sr-only">Pilih periode</label>' +
        '<i data-lucide="calendar-days" class="pilih-ikon kiri h-5 w-5"></i>' +
        '<select id="lb-periode" class="pilih-bulan-baru"></select>' +
        '<i data-lucide="chevron-down" class="pilih-ikon kanan h-5 w-5"></i>' +
      '</div>' +
    '</header>' +
    '<div class="lb-tabs" id="lb-tabs" role="tablist" aria-label="Kategori peringkat"></div>' +
    '<p class="lb-ket" id="lb-ket"></p>' +
    '<div id="lb-status"></div>' +
    '<div class="lb-grid" id="lb-isi" hidden>' +
      '<div class="kartu-d" id="lb-podium-kartu"><div class="lb-podium" id="lb-podium"></div></div>' +
      '<div class="kartu-d"><h2 class="judul-d" id="lb-judul-daftar"></h2><div id="lb-daftar"></div></div>' +
    '</div>' +
    '<details class="lb-cara"><summary>Cara penilaian</summary><ul id="lb-cara-isi"></ul></details>';
  document.querySelector('main.wadah').appendChild(sec);

  const tabs = $('lb-tabs');
  LB_KATEGORI.forEach(function (k) {
    const b = buatEl('button', 'lb-tab', k.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('data-kat', k.kunci);
    tabs.appendChild(b);
  });

  const cara = $('lb-cara-isi');
  LB_CARA.forEach(function (t) { cara.appendChild(buatEl('li', null, t)); });
}

/** Menambah tab Peringkat ke navigasi anggota dan admin (sebelum tombol Keluar). */
function bangunNavLb() {
  [['nav-bawah', 'nav-lb', 'nav-keluar'], ['nav-admin', 'nav-adm-lb', 'nav-adm-keluar']].forEach(function (c) {
    const tombol = buatEl('button', 'nav-item');
    tombol.type = 'button';
    tombol.id = c[1];
    const ikon = buatEl('span', 'nav-ikon');
    ikon.setAttribute('aria-hidden', 'true');
    ikon.appendChild(buatIkon('trophy', 'h-5 w-5'));
    tombol.appendChild(ikon);
    tombol.appendChild(buatEl('span', null, 'Peringkat'));
    $(c[0]).insertBefore(tombol, $(c[2]));
  });
}

/** Mengganti isi area status: memuat, galat (dengan tombol ulang), atau kosong. */
function lbStatus(jenis, teks, aksi) {
  const w = $('lb-status');
  w.textContent = '';
  $('lb-isi').hidden = true;
  if (jenis === 'muat') {
    const k = buatEl('div', 'lb-muat');
    const s = buatEl('div', 'spinner');
    s.setAttribute('aria-hidden', 'true');
    k.appendChild(s);
    k.appendChild(buatEl('p', null, 'Memuat peringkat...'));
    w.appendChild(k);
  } else if (jenis === 'galat') {
    const k = buatEl('div', 'lb-galat');
    k.setAttribute('role', 'alert');
    k.appendChild(buatEl('p', null, teks));
    const b = buatEl('button', 'tombol tombol-utama', 'Coba lagi');
    b.type = 'button';
    b.addEventListener('click', aksi);
    k.appendChild(b);
    w.appendChild(k);
  } else if (jenis === 'kosong') {
    w.appendChild(buatEl('div', 'kosong-d', teks));
  }
}

function lbIsiPeriode(d) {
  const sel = $('lb-periode');
  sel.textContent = '';
  const nilai = (d.bulanProgram || []).slice();
  if (d.periode.kunci !== 'all' && nilai.indexOf(d.periode.kunci) === -1) nilai.push(d.periode.kunci);
  nilai.push('all');
  nilai.forEach(function (k) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = labelPeriode(k);
    sel.appendChild(o);
  });
  sel.value = d.periode.kunci;
}

function lbAturTab() {
  document.querySelectorAll('#lb-tabs .lb-tab').forEach(function (b) {
    const aktif = (b.getAttribute('data-kat') === lbKategori);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
}

function lbRender(d) {
  lbData = d;
  lbPeriode = d.periode.kunci;
  tanggalHariServer = d.hariIni;
  lbIsiPeriode(d);
  lbAturTab();
  lbRenderKonten();
  if (!layarTampil('layar-lb')) tampil('layar-lb');
  muatIcon();
}

/** Mengisi podium dan daftar untuk kategori yang dipilih (tanpa request). */
function lbRenderKonten() {
  const d = lbData;
  if (!d) return;
  const kat = lbKat(lbKategori);
  $('lb-ket').textContent = kat.ket + (kat.rasio ? ' Dihitung sampai kemarin.' : ' Termasuk hari ini.');

  const daftar = d.kategori[kat.kunci] || [];
  let pesan = null;
  if (d.jumlahPeserta === 0) {
    pesan = 'Belum ada anggota aktif.';
  } else if (d.kosong) {
    pesan = (d.tanggalMulai && d.hariIni < d.tanggalMulai)
      ? 'Program mutabaah dimulai pada ' + formatTanggal(d.tanggalMulai) + '. Peringkat muncul setelah program berjalan.'
      : 'Belum ada data untuk ' + labelPeriode(d.periode.kunci) + '.';
  } else if (kat.rasio && d.hariSelesai === 0) {
    pesan = 'Peringkat ' + kat.judul + ' muncul setelah hari pertama selesai (dihitung sampai kemarin).';
  } else if (!daftar.some(function (e) { return e.nilai !== null && e.nilai > 0; })) {
    pesan = 'Belum ada yang tercatat untuk kategori ini pada periode ini.';
  }

  if (pesan) {
    lbStatus('kosong', pesan);
    return;
  }

  $('lb-status').textContent = '';
  $('lb-isi').hidden = false;

  // ----- Podium: hanya anggota bernilai di atas 0, urutan tampil 2-1-3 -----
  const pod = daftar.filter(function (e) { return e.nilai !== null && e.nilai > 0; }).slice(0, 3);
  let urutan;
  if (pod.length === 3) urutan = [1, 0, 2];
  else if (pod.length === 2) urutan = [1, 0];
  else urutan = [0];

  const wadahPod = $('lb-podium');
  wadahPod.textContent = '';
  pod.length > 0 && urutan.forEach(function (i) {
    const e = pod[i];
    const p = Math.min(3, e.peringkat);
    const kolom = buatEl('div', 'lb-pod' + (e.saya ? ' saya' : ''));
    const mahkota = buatEl('div', 'lb-mahkota');
    if (e.peringkat === 1) mahkota.appendChild(buatIkon('crown', 'h-5 w-5'));
    kolom.appendChild(mahkota);
    const avatar = buatEl('span', 'avatar', inisialNama(e.nama));
    avatar.setAttribute('aria-hidden', 'true');
    kolom.appendChild(avatar);
    kolom.appendChild(buatEl('p', 'lb-pod-nama', e.nama));
    kolom.appendChild(buatEl('p', 'lb-pod-nilai', lbFormatNilai(kat, e.nilai) + ' ' + kat.satuan));
    kolom.appendChild(buatEl('div', 'lb-blok p' + p, e.peringkat));
    wadahPod.appendChild(kolom);
  });
  $('lb-podium-kartu').hidden = (pod.length === 0);
  $('lb-isi').classList.toggle('tanpa-podium', pod.length === 0);

  // ----- Daftar semua peserta -----
  $('lb-judul-daftar').textContent = kat.judul + ' · ' + d.jumlahPeserta + ' peserta';
  const wadah = $('lb-daftar');
  wadah.textContent = '';
  daftar.forEach(function (e) {
    const baris = buatEl('div', 'lb-baris' + (e.saya ? ' saya' : ''));
    baris.appendChild(buatEl('span', 'lb-no' + (e.peringkat <= 3 ? ' p' + e.peringkat : ''), e.peringkat));
    const avatar = buatEl('span', 'avatar', inisialNama(e.nama));
    avatar.setAttribute('aria-hidden', 'true');
    baris.appendChild(avatar);

    const info = buatEl('div', 'lb-info');
    const nama = buatEl('p', 'lb-nama');
    nama.appendChild(buatEl('span', 'teks', e.nama));
    if (e.saya) nama.appendChild(buatEl('span', 'lb-anda', 'Anda'));
    info.appendChild(nama);
    const rinci = lbRinci(kat, e.rinci);
    if (rinci) info.appendChild(buatEl('p', 'lb-rinci', rinci));
    baris.appendChild(info);

    const nilai = buatEl('div', 'lb-nilai', lbFormatNilai(kat, e.nilai));
    nilai.appendChild(buatEl('span', 'lb-satuan', kat.satuan));
    baris.appendChild(nilai);
    wadah.appendChild(baris);
  });
}


// ====================== EVENT ======================

function pasangEventLb() {
  $('nav-lb').addEventListener('click', function () {
    if (layarTampil('layar-lb') && lbPeran === 'user') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    bukaLb('user', null);
  });
  $('nav-adm-lb').addEventListener('click', function () {
    if (layarTampil('layar-lb') && lbPeran === 'admin') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    bukaLb('admin', null);
  });

  $('lb-tabs').addEventListener('click', function (e) {
    const tombol = e.target.closest('button');
    if (!tombol) return;
    lbKategori = tombol.getAttribute('data-kat');
    lbAturTab();
    lbRenderKonten();
    muatIcon();
  });

  $('lb-periode').addEventListener('change', function () {
    bukaLb(lbPeran, this.value);
  });

  $('lb-keluar').addEventListener('click', function () {
    if (lbPeran === 'admin') keluarAdmin();
    else gantiPengguna();
  });
}

bangunLayarLb();
bangunNavLb();
pasangEventLb();
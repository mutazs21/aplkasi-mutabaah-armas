'use strict';

/**
 * evaluasi.js — Evaluasi bulanan anggota (STEP 4). Dimuat setelah laporan.js, sebelum main.js.
 *
 * - Hanya anggota: token dari sesi anggota. Tidak ada parameter anggota (backend memakai token).
 * - Semua isi evaluasi dan teks ambang berasal dari backend (action evaluasiSaya).
 * - Satu request per bulan, cache 60 detik. Pindah tab: tanpa request.
 * - Semua teks dari server dipasang dengan textContent.
 * Memakai: core.js, user.js, admin.js (buatEl, ubinAdmin, fmtPersen), laporan.js (lapBaris, lapAngka).
 */

// ====================== STATE ======================

let cacheEv = {};         // bulan -> { data, waktu }
let permintaanEv = {};
let generasiEv = 0;
let hariEv = null;
let evData = null;
let evBulan = null;

function hapusCacheEv() {
  cacheEv = {};
  permintaanEv = {};
  hariEv = null;
  generasiEv++;
}

function resetEv() {
  hapusCacheEv();
  evData = null;
  evBulan = null;
}


// ====================== PEMBUNGKUS FUNGSI LAIN ======================

const tampilSebelumEv = tampil;
tampil = function (idLayar) {
  tampilSebelumEv(idLayar);
  if (idLayar === 'layar-loading') return;

  const adaEv = (idLayar === 'layar-ev');
  if (adaEv) {
    $('nav-bawah').hidden = false;
    $('nav-admin').hidden = true;
    document.body.classList.add('ada-nav');
    ['nav-dashboard', 'nav-isi', 'nav-riwayat', 'nav-lb'].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.classList.remove('aktif');
      el.removeAttribute('aria-current');
    });
  }
  const tombol = $('nav-ev');
  tombol.classList.toggle('aktif', adaEv);
  if (adaEv) tombol.setAttribute('aria-current', 'page');
  else tombol.removeAttribute('aria-current');
};

const hapusSesiSebelumEv = hapusSesi;
hapusSesi = function () {
  hapusSesiSebelumEv();
  resetEv();
};

// Setelah anggota menyimpan mutabaah, evaluasi lama tidak berlaku lagi
const panggilApiSebelumEv = panggilApi;
panggilApi = async function (isi) {
  const hasil = await panggilApiSebelumEv(isi);
  if (isi && isi.action === 'simpanRingkas' && hasil && hasil.ok) hapusCacheEv();
  return hasil;
};


// ====================== DATA ======================

function simpanCacheEv(h) {
  if (hariEv !== null && h.hariIni !== hariEv) cacheEv = {};
  hariEv = h.hariIni;
  cacheEv[h.periode.bulan] = { data: h, waktu: Date.now() };
}

/** Mengambil evaluasi satu bulan (null = bulan berjalan menurut server). */
function muatEv(bulan) {
  const kunciJalan = bulan || '_default';
  if (permintaanEv[kunciJalan]) return permintaanEv[kunciJalan];

  const sesi = bacaSesi();
  if (!sesi) return Promise.resolve({ ok: false, kode: 'BATAL', pesan: 'Sesi tidak ditemukan.' });

  const generasiAwal = generasiEv;
  const isi = { action: 'evaluasiSaya', token: sesi.token };
  if (bulan) isi.bulan = bulan;

  const janji = panggilApi(isi).then(function (hasil) {
    if (generasiAwal !== generasiEv) return { ok: false, kode: 'BATAL', pesan: 'Dibatalkan.' };
    delete permintaanEv[kunciJalan];
    if (hasil.ok) {
      simpanCacheEv(hasil);
      perbaruiAktivitas(false);
    }
    return hasil;
  });
  permintaanEv[kunciJalan] = janji;
  return janji;
}

/** Membuka layar Evaluasi. bulan null = bulan yang sedang dipakai (atau bulan berjalan). */
async function bukaEv(bulan) {
  const saya = ++navId;
  if (!bacaSesi()) {
    tampilLanding();
    return;
  }

  const kunci = bulan || evBulan;
  const entri = kunci ? cacheEv[kunci] : null;
  if (entri) {
    evRender(entri.data);
    if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) segarkanEv(kunci, saya);
    return;
  }

  const terlihat = layarTampil('layar-ev');
  if (terlihat) evStatus('muat');
  else tampilLoading('Memuat evaluasi...');

  const hasil = await muatEv(kunci);
  if (saya !== navId) return;

  if (hasil.ok) {
    evRender(hasil);
    return;
  }
  if (hasil.kode === 'BATAL') return;
  if (await tanganiTokenTidakValid(hasil)) return;

  const ulang = function () { bukaEv(kunci); };
  if (terlihat) evStatus('galat', hasil.pesan || 'Gagal memuat evaluasi.', ulang);
  else tampilError(hasil.pesan || 'Gagal memuat evaluasi.', ulang, true);
}

/** Pembaruan di background tanpa menutup layar. Kegagalan jaringan diabaikan. */
async function segarkanEv(kunci, saya) {
  aturSegar(true);
  const hasil = await muatEv(kunci);
  aturSegar(false);

  if (!bacaSesi()) return;
  if (!hasil.ok) {
    if (hasil.kode === 'TOKEN_TIDAK_VALID') await tanganiTokenTidakValid(hasil);
    return;
  }
  if (saya !== navId) return;
  if (layarTampil('layar-ev')) evRender(hasil);
}


// ====================== KERANGKA LAYAR ======================

function bangunLayarEv() {
  const sec = document.createElement('section');
  sec.id = 'layar-ev';
  sec.className = 'layar';
  sec.hidden = true;
  sec.innerHTML =
    '<header class="hero-dash">' +
      '<div class="relative flex items-start justify-between gap-3">' +
        '<div class="min-w-0"><p class="m-0 text-sm text-teal-100/80">Evaluasi bulanan</p>' +
        '<h1 id="ev-nama" class="m-0 mt-0.5 truncate text-2xl font-bold leading-tight text-white"></h1></div>' +
        '<button type="button" id="ev-keluar" class="tombol-keluar" aria-label="Keluar dari akun">' +
        '<i data-lucide="log-out" class="h-4 w-4"></i>Keluar</button>' +
      '</div>' +
      '<div class="pilih-wadah">' +
        '<label for="ev-bulan" class="sr-only">Pilih bulan</label>' +
        '<i data-lucide="calendar-days" class="pilih-ikon kiri h-5 w-5"></i>' +
        '<select id="ev-bulan" class="pilih-bulan-baru"></select>' +
        '<i data-lucide="chevron-down" class="pilih-ikon kanan h-5 w-5"></i>' +
      '</div>' +
    '</header>' +
    '<p class="ev-ket" id="ev-ket"></p>' +
    '<div id="ev-status"></div>' +
    '<div id="ev-isi" hidden>' +
      '<div class="adm-kartu-grid" id="ev-kartu"></div>' +
      '<div class="kartu-d" id="ev-banding-kartu"><h2 class="judul-d">Dibanding bulan sebelumnya</h2>' +
        '<p class="ev-ket" id="ev-banding-ket" style="margin:4px 0 0"></p>' +
        '<div id="ev-banding"></div></div>' +
      '<div class="dash-kolom" id="ev-kolom">' +
        '<div class="kartu-d"><h2 class="judul-d">Hal yang sudah baik</h2><div id="ev-baik"></div></div>' +
        '<div class="kartu-d"><h2 class="judul-d">Hal yang dapat ditingkatkan</h2><div id="ev-tingkat"></div></div>' +
      '</div>' +
      '<div class="kartu-d" id="ev-rek-kartu"><h2 class="judul-d">Rekomendasi bulan berikutnya</h2><div id="ev-rek"></div></div>' +
      '<p class="ev-catatan" id="ev-catatan"></p>' +
    '</div>' +
    '<details class="lb-cara"><summary>Cara evaluasi</summary><ul id="ev-cara"></ul></details>';
  document.querySelector('main.wadah').appendChild(sec);
}

function bangunNavEv() {
  const tombol = buatEl('button', 'nav-item');
  tombol.type = 'button';
  tombol.id = 'nav-ev';
  const ikon = buatEl('span', 'nav-ikon');
  ikon.setAttribute('aria-hidden', 'true');
  ikon.appendChild(buatIkon('clipboard-check', 'h-5 w-5'));
  tombol.appendChild(ikon);
  tombol.appendChild(buatEl('span', null, 'Evaluasi'));
  $('nav-bawah').insertBefore(tombol, $('nav-keluar'));
}

/** Area status: memuat, galat (dengan tombol ulang), atau keterangan. */
function evStatus(jenis, teks, aksi) {
  const w = $('ev-status');
  w.textContent = '';
  if (jenis !== 'info') $('ev-isi').hidden = true;
  if (jenis === 'muat') {
    const k = buatEl('div', 'lb-muat');
    const s = buatEl('div', 'spinner');
    s.setAttribute('aria-hidden', 'true');
    k.appendChild(s);
    k.appendChild(buatEl('p', null, 'Memuat evaluasi...'));
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
  } else if (jenis === 'info' || jenis === 'kosong') {
    w.appendChild(buatEl('div', 'kosong-d', teks));
  }
}


// ====================== RENDER ======================

function evDaftar(idWadah, butir, ikon, kelas, teksKosong) {
  const w = $(idWadah);
  w.textContent = '';
  if (!butir || butir.length === 0) {
    w.appendChild(buatEl('p', 'ev-kosong', teksKosong));
    return;
  }
  butir.forEach(function (b) {
    const baris = buatEl('div', 'ev-butir ' + kelas);
    baris.appendChild(buatIkon(ikon, 'ev-ikon h-5 w-5'));
    baris.appendChild(buatEl('span', null, b.teks));
    w.appendChild(baris);
  });
}

function evIsiPilihBulan(d) {
  const sel = $('ev-bulan');
  sel.textContent = '';
  const nilai = (d.bulanProgram || []).slice();
  if (nilai.indexOf(d.periode.bulan) === -1) nilai.push(d.periode.bulan);
  nilai.forEach(function (b) {
    const o = document.createElement('option');
    o.value = b;
    o.textContent = formatBulan(b);
    sel.appendChild(o);
  });
  sel.value = d.periode.bulan;
}

function evRenderKartu(r) {
  const w = $('ev-kartu');
  w.textContent = '';
  const ada = r.hariSelesai > 0;
  w.appendChild(ubinAdmin('gauge', ada ? fmtPersen(r.performa) : '–', 'Performa', ada ? 'sampai kemarin' : 'belum ada hari selesai'));
  w.appendChild(ubinAdmin('trending-up', ada ? fmtPersen(r.konsistensi) : '–', 'Konsistensi', 'hari aktif dan lengkap'));
  w.appendChild(ubinAdmin('calendar-check', ada ? (r.hariAktif + '/' + r.hariSelesai) : '–', 'Hari aktif', 'dari hari selesai'));
  w.appendChild(ubinAdmin('badge-check', ada ? r.hariLengkap : '–', 'Hari lengkap', '5 wajib + istighfar'));
  w.appendChild(ubinAdmin('book-open', r.totalAlquran, 'Al-Quran', 'halaman bulan ini'));
}

function evRenderBanding(d) {
  const ket = $('ev-banding-ket');
  const w = $('ev-banding');
  w.textContent = '';
  const b = d.banding;
  if (!b) {
    ket.textContent = 'Belum ada bulan sebelumnya dalam program ini, jadi belum ada pembanding.';
    return;
  }
  if (!b.cukup || !b.selisih) {
    ket.textContent = 'Perbandingan dengan ' + formatBulan(b.bulan) +
      ' belum tersedia. Dibutuhkan minimal 5 hari yang sudah selesai pada kedua periode.';
    return;
  }
  ket.textContent = 'Dibanding ' + formatBulan(b.bulan) +
    (b.penuh ? ' (satu bulan penuh).' : ', sampai tanggal ' + Number(b.sampaiTanggal.substring(8, 10)) + '.') +
    (b.terpotong ? ' Bulan itu lebih pendek, jadi dipakai tanggal terakhirnya.' : '');

  const r = d.ringkasan;
  w.appendChild(lapBaris('Performa', lapAngka(r.performa), 'perubahan', b.selisih.performa));
  w.appendChild(lapBaris('Konsistensi', lapAngka(r.konsistensi), 'perubahan', b.selisih.konsistensi));
  w.appendChild(lapBaris('Ketepatan sholat wajib', lapAngka(r.ketepatanWajib) + '%', 'perubahan', b.selisih.ketepatanWajib));
  w.appendChild(lapBaris('Al-Quran per hari', lapAngka(r.alquranPerHari) + ' hlm', 'perubahan', b.selisih.alquranPerHari));
}

function evRender(d) {
  evData = d;
  evBulan = d.periode.bulan;
  tanggalHariServer = d.hariIni;
  $('ev-nama').textContent = d.nama;
  evIsiPilihBulan(d);
  $('ev-ket').textContent = 'Evaluasi dari catatan yang tersimpan, bukan penilaian pribadi dan bukan peringkat. ' +
    'Hari dihitung sampai kemarin. "Berjamaah" adalah status sholat berjamaah, bukan lokasi sholat.';

  // Cara evaluasi (teks dari backend)
  const cara = $('ev-cara');
  cara.textContent = '';
  (d.ambang || []).forEach(function (t) { cara.appendChild(buatEl('li', null, t)); });

  $('ev-status').textContent = '';
  const isi = $('ev-isi');
  if (d.ringkasan) {
    isi.hidden = false;
    evRenderKartu(d.ringkasan);
  } else {
    isi.hidden = true;
  }

  if (!d.cukup) {
    if (d.ringkasan) {
      // hanya kartu ringkasan; bagian evaluasi disembunyikan
      ['ev-banding-kartu', 'ev-kolom', 'ev-rek-kartu', 'ev-catatan'].forEach(function (id) { $(id).hidden = true; });
    }
    evStatus('info', d.pesan || 'Evaluasi belum bisa dibuat.');
  } else {
    ['ev-banding-kartu', 'ev-kolom', 'ev-rek-kartu', 'ev-catatan'].forEach(function (id) { $(id).hidden = false; });
    evRenderBanding(d);
    evDaftar('ev-baik', d.baik, 'check-circle-2', 'baik', d.pesanBaik || 'Belum ada butir pada bagian ini.');
    evDaftar('ev-tingkat', d.tingkat, 'arrow-up-circle', 'tingkat', 'Tidak ada butir yang perlu ditingkatkan pada bulan ini.');
    evDaftar('ev-rek', d.rekomendasi, 'arrow-right-circle', 'rek', 'Belum ada rekomendasi.');
    const c = d.catatan;
    $('ev-catatan').textContent = 'Dari ' + c.hariSelesai + ' hari yang selesai: ' + c.tanpaCatatan +
      ' hari tanpa catatan dan ' + c.catatanNol + ' hari dengan catatan yang semua nilainya nol. Keduanya dibedakan.';
  }

  if (!layarTampil('layar-ev')) tampil('layar-ev');
  muatIcon();
}


// ====================== EVENT ======================

function pasangEventEv() {
  $('nav-ev').addEventListener('click', function () {
    if (layarTampil('layar-ev')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    bukaEv(null);
  });
  $('ev-bulan').addEventListener('change', function () { bukaEv(this.value); });
  $('ev-keluar').addEventListener('click', function () { gantiPengguna(); });
}

bangunLayarEv();
bangunNavEv();
pasangEventEv();
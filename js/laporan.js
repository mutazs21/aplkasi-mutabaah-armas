'use strict';

/**
 * laporan.js — Laporan bulanan admin (STEP 3). Dimuat setelah admin.js dan leaderboard.js,
 * sebelum main.js.
 *
 * - Layar dan tab navigasi dibuat lewat JavaScript (index.html hanya memuat file ini).
 * - Hanya admin: token dari sesi admin. Anggota tidak punya akses (backend menolak).
 * - Semua angka berasal dari backend (action adminLaporan). Frontend hanya menampilkan.
 * - Satu request per bulan, cache 60 detik. Tab, pencarian, urutan, dan detail: tanpa request.
 * - Detail anggota memakai data yang sudah ada di jawaban (tanpa request, tanpa catatan harian).
 * - Semua teks dari server dipasang dengan textContent.
 * Memakai: core.js, charts.js, user.js (buatBarisStat), admin.js (buatEl, fmtPersen, ubinAdmin,
 * bacaSesiAdm, tanganiAdminGagal, keLandingDariAdmin, keluarAdmin).
 */

// ====================== STATE ======================

let cacheLap = {};          // bulan -> { data, waktu }
let permintaanLap = {};
let generasiLap = 0;
let hariLap = null;
let lapData = null;
let lapBulan = null;
let lapTrenJenis = 'performa';   // 'performa' | 'konsistensi' | 'alquran'
let lapTrenIdx = null;
let lapBarJenis = 'performa';    // 'performa' | 'konsistensi' | 'alquran'
let lapIdDetail = null;
let lapDetailIdx = null;


// ====================== FUNGSI BANTU ======================

function lapAngka(v) {
  if (v === null || v === undefined) return '–';
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

function lapHariAktif(a) {
  return a.hariSelesai > 0 ? (a.hariAktif + '/' + a.hariSelesai) : '–';
}

/** Lencana perubahan. Netral: naik hijau, turun abu. selisih null = elemen kosong. */
function lapDelta(selisih) {
  if (selisih === null || selisih === undefined) return buatEl('span', 'lap-b-sebelum', 'belum ada pembanding');
  const arah = Math.abs(selisih) < 0.05 ? 'tetap' : (selisih > 0 ? 'naik' : 'turun');
  const el = buatEl('span', 'lap-delta ' + arah);
  el.appendChild(buatIkon(arah === 'naik' ? 'trending-up' : (arah === 'turun' ? 'trending-down' : 'minus'), 'h-3.5 w-3.5'));
  el.appendChild(document.createTextNode(arah === 'tetap' ? 'tetap' : ((selisih > 0 ? '+' : '') + lapAngka(selisih))));
  return el;
}

function lapBaris(nama, sekarang, sebelumTeks, selisih) {
  const b = buatEl('div', 'lap-b-baris');
  b.appendChild(buatEl('span', 'lap-b-nama', nama));
  b.appendChild(buatEl('span', 'lap-b-nilai', sekarang));
  b.appendChild(buatEl('span', 'lap-b-sebelum', sebelumTeks));
  b.appendChild(lapDelta(selisih));
  return b;
}

function hapusCacheLap() {
  cacheLap = {};
  permintaanLap = {};
  hariLap = null;
  generasiLap++;
}

function resetLap() {
  hapusCacheLap();
  lapData = null;
  lapBulan = null;
  lapIdDetail = null;
  lapTrenIdx = null;
  lapDetailIdx = null;
}


// ====================== PEMBUNGKUS FUNGSI LAIN ======================

const tampilSebelumLap = tampil;
tampil = function (idLayar) {
  tampilSebelumLap(idLayar);
  if (idLayar === 'layar-loading') return;

  const adaLap = (idLayar === 'layar-lap' || idLayar === 'layar-lap-detail');
  if (adaLap) {
    $('nav-bawah').hidden = true;
    $('nav-admin').hidden = false;
    document.body.classList.add('ada-nav');
    Array.prototype.forEach.call(document.querySelectorAll('#nav-admin .nav-item'), function (el) {
      el.classList.remove('aktif');
      el.removeAttribute('aria-current');
    });
  }
  const tombol = $('nav-adm-lap');
  tombol.classList.toggle('aktif', adaLap);
  if (adaLap) tombol.setAttribute('aria-current', 'page');
  else tombol.removeAttribute('aria-current');
};

const adminSedangTampilSebelumLap = adminSedangTampil;
adminSedangTampil = function () {
  return adminSedangTampilSebelumLap() || layarTampil('layar-lap') || layarTampil('layar-lap-detail');
};

const hapusSesiAdmSebelumLap = hapusSesiAdm;
hapusSesiAdm = function () {
  hapusSesiAdmSebelumLap();
  resetLap();
};


// ====================== DATA ======================

function simpanCacheLap(h) {
  if (hariLap !== null && h.hariIni !== hariLap) cacheLap = {};
  hariLap = h.hariIni;
  cacheLap[h.periode.bulan] = { data: h, waktu: Date.now() };
}

/** Mengambil laporan satu bulan (null = bulan berjalan menurut server). */
function muatLap(bulan) {
  const kunciJalan = bulan || '_default';
  if (permintaanLap[kunciJalan]) return permintaanLap[kunciJalan];

  const sesi = bacaSesiAdm();
  if (!sesi) return Promise.resolve({ ok: false, kode: 'BATAL', pesan: 'Sesi admin tidak ditemukan.' });

  const generasiAwal = generasiLap;
  const isi = { action: 'adminLaporan', token: sesi.token };
  if (bulan) isi.bulan = bulan;

  const janji = panggilApi(isi).then(function (hasil) {
    if (generasiAwal !== generasiLap) return { ok: false, kode: 'BATAL', pesan: 'Dibatalkan.' };
    delete permintaanLap[kunciJalan];
    if (hasil.ok) simpanCacheLap(hasil);
    return hasil;
  });
  permintaanLap[kunciJalan] = janji;
  return janji;
}

/** Membuka layar Laporan. bulan null = bulan yang sedang dipakai (atau bulan berjalan). */
async function bukaLap(bulan) {
  const saya = ++navId;
  if (!bacaSesiAdm()) {
    keLandingDariAdmin();
    return;
  }

  const kunci = bulan || lapBulan;
  const entri = kunci ? cacheLap[kunci] : null;
  if (entri) {
    lapRender(entri.data);
    if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) segarkanLap(kunci, saya);
    return;
  }

  const terlihat = layarTampil('layar-lap');
  if (terlihat) lapStatus('muat');
  else tampilLoading('Memuat laporan...');

  const hasil = await muatLap(kunci);
  if (saya !== navId) return;

  if (hasil.ok) {
    lapRender(hasil);
    return;
  }
  if (hasil.kode === 'BATAL') return;
  if (await tanganiAdminGagal(hasil)) return;

  const ulang = function () { bukaLap(kunci); };
  if (terlihat) lapStatus('galat', hasil.pesan || 'Gagal memuat laporan.', ulang);
  else tampilError(hasil.pesan || 'Gagal memuat laporan.', ulang, true);
}

/** Pembaruan di background tanpa menutup layar. Kegagalan jaringan diabaikan. */
async function segarkanLap(kunci, saya) {
  aturSegar(true);
  const hasil = await muatLap(kunci);
  aturSegar(false);

  if (!bacaSesiAdm()) return;
  if (!hasil.ok) {
    if (hasil.kode === 'TOKEN_TIDAK_VALID' || hasil.kode === 'AKSES_DITOLAK') await tanganiAdminGagal(hasil);
    return;
  }
  if (saya !== navId) return;
  if (layarTampil('layar-lap')) lapRender(hasil);
}


// ====================== KERANGKA LAYAR ======================

function bangunLayarLap() {
  const utama = document.createElement('section');
  utama.id = 'layar-lap';
  utama.className = 'layar';
  utama.hidden = true;
  utama.innerHTML =
    '<header class="hero-dash">' +
      '<div class="relative flex items-start justify-between gap-3">' +
        '<div class="min-w-0"><p class="m-0 text-sm text-teal-100/80">Admin Dashboard</p>' +
        '<h1 class="m-0 mt-0.5 text-2xl font-bold leading-tight text-white">Laporan Bulanan</h1></div>' +
        '<button type="button" id="lap-keluar" class="tombol-keluar" aria-label="Keluar dari akun admin">' +
        '<i data-lucide="log-out" class="h-4 w-4"></i>Keluar</button>' +
      '</div>' +
      '<div class="pilih-wadah">' +
        '<label for="lap-bulan" class="sr-only">Pilih bulan</label>' +
        '<i data-lucide="calendar-days" class="pilih-ikon kiri h-5 w-5"></i>' +
        '<select id="lap-bulan" class="pilih-bulan-baru"></select>' +
        '<i data-lucide="chevron-down" class="pilih-ikon kanan h-5 w-5"></i>' +
      '</div>' +
    '</header>' +
    '<p class="lap-ket" id="lap-ket"></p>' +
    '<div id="lap-status"></div>' +
    '<div id="lap-isi" hidden>' +
      '<div class="adm-kartu-grid" id="lap-kartu"></div>' +
      '<div class="dash-kolom">' +
        '<div class="kartu-d"><h2 class="judul-d">Dibanding bulan sebelumnya</h2>' +
          '<p class="ds-sub" id="lap-banding-ket" style="margin:4px 0 0;font-size:13px;color:#64748b"></p>' +
          '<div id="lap-banding-isi"></div></div>' +
        '<div class="kartu-d"><h2 class="judul-d">Tren bulanan kelompok</h2>' +
          '<div class="tab-grafik" id="lap-tren-tab" role="tablist" aria-label="Jenis tren">' +
            '<button type="button" class="tab-g aktif" role="tab" aria-selected="true" data-j="performa">Performa</button>' +
            '<button type="button" class="tab-g" role="tab" aria-selected="false" data-j="konsistensi">Konsistensi</button>' +
            '<button type="button" class="tab-g" role="tab" aria-selected="false" data-j="alquran">Al-Quran</button>' +
          '</div>' +
          '<div class="grafik-wadah" id="lap-tren-grafik"></div>' +
          '<p class="grafik-info" id="lap-tren-info" aria-live="polite"></p></div>' +
      '</div>' +
      '<div class="kartu-d"><h2 class="judul-d">Perbandingan antaranggota</h2>' +
        '<div class="tab-grafik" id="lap-bar-tab" role="tablist" aria-label="Jenis perbandingan">' +
          '<button type="button" class="tab-g aktif" role="tab" aria-selected="true" data-j="performa">Performa</button>' +
          '<button type="button" class="tab-g" role="tab" aria-selected="false" data-j="konsistensi">Konsistensi</button>' +
          '<button type="button" class="tab-g" role="tab" aria-selected="false" data-j="alquran">Al-Quran</button>' +
        '</div>' +
        '<p class="lap-ket" id="lap-bar-ket" style="margin:10px 0 0"></p>' +
        '<div class="adm-banding" id="lap-bar"></div></div>' +
      '<div class="kartu-d"><h2 class="judul-d">Tabel anggota</h2>' +
        '<div class="adm-alat" style="margin-top:10px">' +
          '<input id="lap-cari" class="adm-input" type="search" placeholder="Cari nama anggota" autocomplete="off" aria-label="Cari nama anggota">' +
          '<select id="lap-urut" class="adm-input" aria-label="Urutkan">' +
            '<option value="nama">Urut: nama A-Z</option>' +
            '<option value="performa">Urut: performa tertinggi</option>' +
            '<option value="konsistensi">Urut: konsistensi tertinggi</option>' +
            '<option value="aktif">Urut: hari aktif terbanyak</option>' +
            '<option value="lengkap">Urut: hari lengkap terbanyak</option>' +
            '<option value="alquran">Urut: Al-Quran terbanyak</option>' +
            '<option value="jamaah">Urut: berjamaah terbanyak</option>' +
          '</select></div>' +
        '<p class="mt-2 text-xs text-slate-500" id="lap-ket-tabel"></p>' +
        '<div class="adm-tabel-wadah" id="lap-tabel-wadah"></div>' +
        '<div class="adm-daftar-kartu" id="lap-daftar-kartu"></div>' +
        '<div id="lap-tabel-kosong" class="kosong-d" hidden>Tidak ada anggota yang cocok.</div></div>' +
    '</div>';
  document.querySelector('main.wadah').appendChild(utama);

  const detail = document.createElement('section');
  detail.id = 'layar-lap-detail';
  detail.className = 'layar';
  detail.hidden = true;
  detail.innerHTML =
    '<header class="hero-dash">' +
      '<button type="button" class="tombol-keluar mb-3" id="lap-detail-kembali">' +
        '<i data-lucide="arrow-left" class="h-4 w-4"></i>Laporan</button>' +
      '<div class="relative"><p class="m-0 text-sm text-teal-100/80">Laporan individu</p>' +
      '<h1 id="lap-detail-nama" class="m-0 mt-0.5 truncate text-2xl font-bold leading-tight text-white"></h1>' +
      '<p class="m-0 mt-2 text-[13px] text-teal-100/80" id="lap-detail-periode"></p></div>' +
    '</header>' +
    '<div class="adm-kartu-grid" id="lap-detail-kartu"></div>' +
    '<div class="dash-kolom">' +
      '<div class="kartu-d"><h2 class="judul-d">Dibanding bulan sebelumnya</h2>' +
        '<p class="lap-ket" id="lap-detail-banding-ket" style="margin:4px 0 0"></p>' +
        '<div id="lap-detail-banding"></div></div>' +
      '<div class="kartu-d"><h2 class="judul-d">Tren performa bulanan</h2>' +
        '<div class="grafik-wadah" id="lap-detail-tren"></div>' +
        '<p class="grafik-info" id="lap-detail-tren-info" aria-live="polite"></p></div>' +
    '</div>' +
    '<div class="kartu-d"><h2 class="judul-d">Aktivitas ibadah</h2>' +
      '<div class="legenda legenda-atas">' +
        '<span><i class="kotak seg-jamaah"></i> Berjamaah</span>' +
        '<span><i class="kotak seg-sendiri"></i> Sendiri</span>' +
        '<span><i class="kotak seg-utama"></i> Terlaksana</span></div>' +
      '<div id="lap-detail-ibadah"></div></div>';
  document.querySelector('main.wadah').appendChild(detail);
}

function bangunNavLap() {
  const tombol = buatEl('button', 'nav-item');
  tombol.type = 'button';
  tombol.id = 'nav-adm-lap';
  const ikon = buatEl('span', 'nav-ikon');
  ikon.setAttribute('aria-hidden', 'true');
  ikon.appendChild(buatIkon('file-text', 'h-5 w-5'));
  tombol.appendChild(ikon);
  tombol.appendChild(buatEl('span', null, 'Laporan'));
  $('nav-admin').insertBefore(tombol, $('nav-adm-lb') || $('nav-adm-keluar'));
}

/** Area status: memuat, galat (dengan tombol ulang), atau keterangan kosong. */
function lapStatus(jenis, teks, aksi) {
  const w = $('lap-status');
  w.textContent = '';
  $('lap-isi').hidden = true;
  if (jenis === 'muat') {
    const k = buatEl('div', 'lb-muat');
    const s = buatEl('div', 'spinner');
    s.setAttribute('aria-hidden', 'true');
    k.appendChild(s);
    k.appendChild(buatEl('p', null, 'Memuat laporan...'));
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


// ====================== RENDER: LAPORAN ======================

function lapIsiPilihBulan(d) {
  const sel = $('lap-bulan');
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

function lapRender(d) {
  lapData = d;
  lapBulan = d.periode.bulan;
  tanggalHariServer = d.hariIni;
  lapIsiPilihBulan(d);
  $('lap-ket').textContent = 'Untuk monitoring dan pembinaan. "Mengisi" berarti minimal satu hari aktif pada bulan ini. ' +
    'Rasio dihitung sampai kemarin; Al-Quran dan sholat berjamaah menyertakan hari ini. ' +
    '"Berjamaah" adalah status sholat wajib berjamaah, bukan lokasi sholat.';

  if (layarTampil('layar-lap-detail') && lapIdDetail) {
    // pembaruan background saat detail terbuka: data diperbarui, layar tidak berpindah
    return;
  }

  const k = d.kelompok;
  let pesan = null;
  if (k.anggotaAktif === 0) pesan = 'Belum ada anggota aktif. Periksa sheet Anggota.';
  else if (d.kosong) {
    pesan = (d.tanggalMulai && d.hariIni < d.tanggalMulai)
      ? 'Program mutabaah dimulai pada ' + formatTanggal(d.tanggalMulai) + '. Laporan muncul setelah program berjalan.'
      : 'Belum ada data untuk ' + formatBulan(d.periode.bulan) + '.';
  }

  if (pesan) {
    lapStatus('kosong', pesan);
  } else {
    $('lap-status').textContent = '';
    $('lap-isi').hidden = false;
    lapRenderKartu(d);
    lapRenderBanding(d);
    lapRenderTabel(d);
  }

  if (!layarTampil('layar-lap')) tampil('layar-lap');
  muatIcon();
  if (!pesan) {
    lapGambarTren();
    lapRenderBar();
  }
}

function lapRenderKartu(d) {
  const k = d.kelompok;
  const w = $('lap-kartu');
  w.textContent = '';
  const ada = k.hariSelesai > 0;
  w.appendChild(ubinAdmin('users', k.anggotaAktif, 'Anggota aktif', 'terdaftar'));
  w.appendChild(ubinAdmin('user-check', k.mengisi, 'Mengisi', 'min. 1 hari aktif'));
  w.appendChild(ubinAdmin('gauge', ada ? fmtPersen(k.rataPerforma) : '–', 'Rata performa', ada ? 'sampai kemarin' : 'belum ada hari selesai'));
  w.appendChild(ubinAdmin('trending-up', ada ? fmtPersen(k.rataKonsistensi) : '–', 'Rata konsistensi', 'hari aktif dan lengkap'));
  w.appendChild(ubinAdmin('book-open', k.totalAlquran, 'Al-Quran', 'halaman, semua anggota'));
  w.appendChild(ubinAdmin('users-round', k.totalBerjamaah, 'Berjamaah', 'sholat wajib'));
}

function lapRenderBanding(d) {
  const ket = $('lap-banding-ket');
  const w = $('lap-banding-isi');
  w.textContent = '';
  const b = d.banding;
  if (!b) {
    ket.textContent = 'Belum ada bulan sebelumnya dalam program ini, jadi belum ada pembanding.';
    return;
  }
  if (!b.cukup) {
    ket.textContent = 'Perbandingan dengan ' + formatBulan(b.bulan) +
      ' belum tersedia. Dibutuhkan minimal 5 hari yang sebanding pada kedua periode.';
    return;
  }
  ket.textContent = 'Dibanding ' + formatBulan(b.bulan) +
    (b.penuh ? ' (satu bulan penuh).' : ', sampai tanggal ' + Number(b.sampaiTanggal.substring(8, 10)) + '.') +
    (b.terpotong ? ' Bulan itu lebih pendek, jadi dipakai tanggal terakhirnya.' : '');

  const k = d.kelompok;
  const s = b.sebelumnya;
  w.appendChild(lapBaris('Rata performa', lapAngka(k.rataPerforma), 'bulan pembanding: ' + lapAngka(s.rataPerforma), b.selisih.rataPerforma));
  w.appendChild(lapBaris('Rata konsistensi', lapAngka(k.rataKonsistensi), 'bulan pembanding: ' + lapAngka(s.rataKonsistensi), b.selisih.rataKonsistensi));
  w.appendChild(lapBaris('Al-Quran per hari', lapAngka(k.alquranPerHari) + ' hlm', 'bulan pembanding: ' + lapAngka(s.alquranPerHari) + ' hlm', b.selisih.alquranPerHari));
  w.appendChild(lapBaris('Anggota yang mengisi', String(k.mengisi), 'bulan pembanding: ' + s.mengisi, k.mengisi - s.mengisi));
}


// ====================== GRAFIK ======================

function lapGambarTren() {
  const d = lapData;
  if (!d || d.kosong || !layarTampil('layar-lap')) return;
  const bulanIni = d.hariIni.substring(0, 7);

  function nilaiDari(t) {
    if (lapTrenJenis === 'performa') return t.rataPerforma;
    if (lapTrenJenis === 'konsistensi') return t.rataKonsistensi;
    return t.totalAlquran;
  }
  function info(t) {
    const v = nilaiDari(t);
    const dasar = formatBulan(t.bulan) + (t.bulan === bulanIni ? ' (berjalan, sementara)' : '');
    if (v === null || v === undefined) return dasar + ': belum ada hari yang selesai.';
    if (lapTrenJenis === 'alquran') return dasar + ': total ' + v + ' halaman Al-Quran, ' + t.mengisi + ' anggota mengisi';
    return dasar + ': rata-rata ' + lapAngka(v) + ' dari 100 (' + t.hariSelesai + ' hari selesai, ' + t.mengisi + ' anggota mengisi)';
  }

  const titik = d.tren.map(function (t) {
    return {
      label: NAMA_BULAN_PENDEK[Number(t.bulan.substring(5, 7)) - 1],
      nilai: nilaiDari(t),
      sementara: t.bulan === bulanIni,
      aria: info(t)
    };
  });
  const n = titik.length;
  const pilih = (lapTrenIdx !== null && lapTrenIdx < n) ? lapTrenIdx : n - 1;
  const opsi = {
    jenis: 'batang',
    titik: titik,
    judul: 'Tren bulanan kelompok: ' + lapTrenJenis,
    terpilih: pilih,
    minimalMaks: 5,
    onPilih: function (i) { lapTrenIdx = i; lapGambarTren(); }
  };
  if (lapTrenJenis !== 'alquran') opsi.maks = 100;
  gambarGrafik($('lap-tren-grafik'), opsi);
  $('lap-tren-info').textContent = n > 0 ? info(d.tren[pilih]) : '';

  Array.prototype.forEach.call(document.querySelectorAll('#lap-tren-tab .tab-g'), function (b) {
    const aktif = (b.getAttribute('data-j') === lapTrenJenis);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
}

/** Perbandingan antaranggota: batang horizontal, urutan alfabet (bukan peringkat). */
function lapRenderBar() {
  const d = lapData;
  if (!d || d.kosong) return;
  const w = $('lap-bar');
  w.textContent = '';

  const daftar = d.anggota.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  const quran = (lapBarJenis === 'alquran');
  $('lap-bar-ket').textContent = quran
    ? 'Kontribusi halaman Al-Quran tiap anggota terhadap total kelompok. Diurutkan menurut nama.'
    : (lapBarJenis === 'performa'
        ? 'Performa tiap anggota (skala 0 sampai 100). Diurutkan menurut nama.'
        : 'Konsistensi tiap anggota (skala 0 sampai 100). Diurutkan menurut nama.');

  let maks = 0;
  daftar.forEach(function (a) { if (quran && a.totalAlquran > maks) maks = a.totalAlquran; });
  const total = d.kelompok.totalAlquran;

  daftar.forEach(function (a) {
    const baris = buatEl('div', 'adm-banding-baris');
    baris.appendChild(buatEl('span', 'adm-banding-nama', a.nama));
    const bar = buatEl('div', 'bar');
    const isi = buatEl('div', 'bar-isi seg-utama');
    let lebar = 0;
    let teks;
    if (quran) {
      lebar = maks > 0 ? (a.totalAlquran / maks) * 100 : 0;
      teks = String(a.totalAlquran);
    } else {
      const v = (lapBarJenis === 'performa') ? a.performa : a.konsistensi;
      lebar = (v === null || v === undefined) ? 0 : Math.max(0, Math.min(100, v));
      teks = fmtPersen(v);
    }
    isi.style.width = lebar + '%';
    bar.appendChild(isi);
    baris.appendChild(bar);
    const nilai = buatEl('span', 'adm-banding-nilai', teks);
    if (quran && total > 0) nilai.appendChild(buatEl('span', 'lap-bar-sub', Math.round(100 * a.totalAlquran / total) + '%'));
    baris.appendChild(nilai);
    w.appendChild(baris);
  });

  Array.prototype.forEach.call(document.querySelectorAll('#lap-bar-tab .tab-g'), function (b) {
    const aktif = (b.getAttribute('data-j') === lapBarJenis);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
}


// ====================== TABEL ANGGOTA ======================

function lapUrutkan(daftar, cara) {
  const salinan = daftar.slice();
  function angka(a) {
    if (cara === 'performa') return a.performa === null ? -1 : a.performa;
    if (cara === 'konsistensi') return a.konsistensi === null ? -1 : a.konsistensi;
    if (cara === 'aktif') return a.hariAktif;
    if (cara === 'lengkap') return a.hariLengkap;
    if (cara === 'alquran') return a.totalAlquran;
    if (cara === 'jamaah') return a.berjamaah;
    return 0;
  }
  salinan.sort(function (a, b) {
    if (cara !== 'nama') {
      const s = angka(b) - angka(a);
      if (s !== 0) return s;
    }
    return a.nama.localeCompare(b.nama);
  });
  return salinan;
}

function lapRenderTabel(d) {
  const kata = $('lap-cari').value.trim().toLowerCase();
  const cara = $('lap-urut').value;
  const disaring = d.anggota.filter(function (a) { return kata === '' || a.nama.toLowerCase().indexOf(kata) !== -1; });
  const daftar = lapUrutkan(disaring, cara);

  $('lap-ket-tabel').textContent = daftar.length + ' dari ' + d.anggota.length + ' anggota · ' +
    formatBulan(d.periode.bulan) + ' · ketuk anggota untuk melihat laporan individu';
  $('lap-tabel-kosong').hidden = daftar.length > 0;

  // ----- Tabel (tampil mulai 1024px) -----
  const wt = $('lap-tabel-wadah');
  wt.textContent = '';
  if (daftar.length > 0) {
    const tabel = buatEl('table', 'adm-tabel');
    const kepala = document.createElement('thead');
    const br = document.createElement('tr');
    [['Nama', ''], ['Performa', 'angka'], ['Konsistensi', 'angka'], ['Hari aktif', 'angka'],
     ['Hari lengkap', 'angka'], ['Al-Quran', 'angka'], ['Berjamaah', 'angka']].forEach(function (c) {
      const th = buatEl('th', c[1], c[0]);
      th.scope = 'col';
      br.appendChild(th);
    });
    kepala.appendChild(br);
    tabel.appendChild(kepala);

    const badan = document.createElement('tbody');
    daftar.forEach(function (a) {
      const tr = buatEl('tr', 'klik');
      const td = document.createElement('td');
      const tombol = buatEl('button', 'adm-baris-btn');
      tombol.type = 'button';
      tombol.setAttribute('aria-label', 'Lihat laporan ' + a.nama);
      const av = buatEl('span', 'avatar', inisialNama(a.nama));
      av.setAttribute('aria-hidden', 'true');
      tombol.appendChild(av);
      tombol.appendChild(buatEl('span', null, a.nama));
      td.appendChild(tombol);
      tr.appendChild(td);
      tr.appendChild(buatEl('td', 'angka', fmtPersen(a.performa)));
      tr.appendChild(buatEl('td', 'angka', fmtPersen(a.konsistensi)));
      tr.appendChild(buatEl('td', 'angka', lapHariAktif(a)));
      tr.appendChild(buatEl('td', 'angka', a.hariSelesai > 0 ? a.hariLengkap : '–'));
      tr.appendChild(buatEl('td', 'angka', a.totalAlquran));
      tr.appendChild(buatEl('td', 'angka', a.berjamaah));
      tr.addEventListener('click', function () { lapBukaDetail(a.id); });
      badan.appendChild(tr);
    });
    tabel.appendChild(badan);
    wt.appendChild(tabel);
  }

  // ----- Kartu (HP dan tablet) -----
  const wk = $('lap-daftar-kartu');
  wk.textContent = '';
  daftar.forEach(function (a) {
    const kartu = buatEl('button', 'adm-kartu-anggota');
    kartu.type = 'button';
    kartu.setAttribute('aria-label', 'Lihat laporan ' + a.nama);
    const atas = buatEl('div', 'adm-ka-atas');
    const av = buatEl('span', 'avatar', inisialNama(a.nama));
    av.setAttribute('aria-hidden', 'true');
    atas.appendChild(av);
    atas.appendChild(buatEl('span', 'adm-ka-nama', a.nama));
    atas.appendChild(buatEl('span', 'adm-ka-nilai', fmtPersen(a.performa)));
    kartu.appendChild(atas);
    const info = buatEl('div', 'adm-ka-info');
    info.appendChild(buatEl('span', null, 'Konsistensi ' + fmtPersen(a.konsistensi)));
    info.appendChild(buatEl('span', null, 'Aktif ' + lapHariAktif(a)));
    info.appendChild(buatEl('span', null, 'Lengkap ' + (a.hariSelesai > 0 ? a.hariLengkap : '–')));
    info.appendChild(buatEl('span', null, 'Al-Quran ' + a.totalAlquran + ' hlm'));
    info.appendChild(buatEl('span', null, 'Berjamaah ' + a.berjamaah));
    kartu.appendChild(info);
    kartu.addEventListener('click', function () { lapBukaDetail(a.id); });
    wk.appendChild(kartu);
  });
}


// ====================== DETAIL ANGGOTA ======================

function lapBukaDetail(id) {
  const d = lapData;
  if (!d) return;
  let a = null;
  for (let i = 0; i < d.anggota.length; i++) {
    if (d.anggota[i].id === id) a = d.anggota[i];
  }
  if (!a) {
    tampilToast('Anggota tidak ditemukan.', 'error');
    return;
  }
  navId++;
  lapIdDetail = id;
  lapDetailIdx = null;
  lapRenderDetail(a, d);
}

function lapGambarTrenDetail(a, d) {
  const bulanIni = d.hariIni.substring(0, 7);
  function info(t) {
    const dasar = formatBulan(t.bulan) + (t.bulan === bulanIni ? ' (berjalan, sementara)' : '');
    if (t.performa === null || t.performa === undefined) return dasar + ': belum ada hari yang selesai.';
    return dasar + ': performa ' + lapAngka(t.performa) + ' dari 100, Al-Quran ' + lapAngka(t.alquranPerHari) + ' halaman per hari';
  }
  const titik = a.tren.map(function (t) {
    return {
      label: NAMA_BULAN_PENDEK[Number(t.bulan.substring(5, 7)) - 1],
      nilai: t.performa,
      sementara: t.bulan === bulanIni,
      aria: info(t)
    };
  });
  const n = titik.length;
  const pilih = (lapDetailIdx !== null && lapDetailIdx < n) ? lapDetailIdx : n - 1;
  gambarGrafik($('lap-detail-tren'), {
    jenis: 'batang',
    titik: titik,
    maks: 100,
    judul: 'Tren performa bulanan ' + a.nama,
    terpilih: pilih,
    onPilih: function (i) { lapDetailIdx = i; lapGambarTrenDetail(a, d); }
  });
  $('lap-detail-tren-info').textContent = n > 0 ? info(a.tren[pilih]) : 'Belum ada bulan dengan data.';
}

function lapRenderDetail(a, d) {
  $('lap-detail-nama').textContent = a.nama;
  $('lap-detail-periode').textContent = 'Periode: ' + formatBulan(d.periode.bulan) +
    (d.periode.akhir ? ' · sampai ' + formatTanggal(d.periode.akhir) : '') +
    ' · rasio dihitung sampai kemarin';

  const ada = a.hariSelesai > 0;
  const kartu = $('lap-detail-kartu');
  kartu.textContent = '';
  kartu.appendChild(ubinAdmin('gauge', fmtPersen(a.performa), 'Performa', 'skor periode'));
  kartu.appendChild(ubinAdmin('trending-up', fmtPersen(a.konsistensi), 'Konsistensi', 'aktif dan lengkap'));
  kartu.appendChild(ubinAdmin('check-check', fmtPersen(a.ketepatanWajib), 'Ketepatan wajib', 'sholat wajib terlaksana'));
  kartu.appendChild(ubinAdmin('calendar-check', lapHariAktif(a), 'Hari aktif', 'dari hari selesai'));
  kartu.appendChild(ubinAdmin('badge-check', ada ? a.hariLengkap : '–', 'Hari lengkap', '5 wajib + istighfar'));
  kartu.appendChild(ubinAdmin('flame', ada ? a.streak : '–', 'Streak', 'hari aktif beruntun'));
  kartu.appendChild(ubinAdmin('book-open', a.totalAlquran, 'Al-Quran', 'halaman, ' + lapAngka(a.alquranPerHari) + ' per hari'));
  kartu.appendChild(ubinAdmin('users-round', a.berjamaah, 'Berjamaah', a.porsiJamaah === null ? 'sholat wajib' : fmtPersen(a.porsiJamaah) + ' dari yang terlaksana'));

  // Perubahan dari bulan sebelumnya
  const kb = $('lap-detail-banding-ket');
  const wb = $('lap-detail-banding');
  wb.textContent = '';
  const b = d.banding;
  if (!b) {
    kb.textContent = 'Belum ada bulan sebelumnya dalam program ini.';
  } else if (!b.cukup || !a.selisih) {
    kb.textContent = 'Perbandingan dengan ' + formatBulan(b.bulan) + ' belum tersedia (minimal 5 hari yang sebanding).';
  } else {
    kb.textContent = 'Dibanding ' + formatBulan(b.bulan) + (b.penuh ? ' (satu bulan penuh).' : ', sampai tanggal ' + Number(b.sampaiTanggal.substring(8, 10)) + '.');
    wb.appendChild(lapBaris('Performa', lapAngka(a.performa), 'perubahan', a.selisih.performa));
    wb.appendChild(lapBaris('Konsistensi', lapAngka(a.konsistensi), 'perubahan', a.selisih.konsistensi));
    wb.appendChild(lapBaris('Ketepatan sholat wajib', lapAngka(a.ketepatanWajib) + '%', 'perubahan', a.selisih.ketepatanWajib));
    wb.appendChild(lapBaris('Al-Quran per hari', lapAngka(a.alquranPerHari) + ' hlm', 'perubahan', a.selisih.alquranPerHari));
  }

  // Aktivitas ibadah (agregat)
  const wi = $('lap-detail-ibadah');
  wi.textContent = '';
  const ib = a.ibadah;
  if (ib.hariTerhitung > 0) {
    const total = ib.hariTerhitung;
    ib.sholat.forEach(function (s) {
      let label = s.kunci;
      DAFTAR_SHOLAT.forEach(function (x) { if (x.kunci === s.kunci) label = x.label.replace('Sholat ', ''); });
      wi.appendChild(buatBarisStat(
        label, IKON_IBADAH[s.kunci] || 'moon', s.terlaksana, total,
        [{ nilai: s.berjamaah, kelas: 'seg-jamaah' }, { nilai: s.sendiri, kelas: 'seg-sendiri' }],
        [{ kelas: 'seg-jamaah', teks: 'Berjamaah ' + s.berjamaah + ' hari' },
         { kelas: 'seg-sendiri', teks: 'Sendiri ' + s.sendiri + ' hari' }]
      ));
    });
    wi.appendChild(buatBarisStat('Istighfar', IKON_IBADAH.istighfar, ib.istighfar, total, [{ nilai: ib.istighfar, kelas: 'seg-utama' }], null));
    wi.appendChild(buatBarisStat('Puasa', IKON_IBADAH.puasa, ib.puasa, total, [{ nilai: ib.puasa, kelas: 'seg-utama' }], null));
  } else {
    wi.appendChild(buatEl('p', 'text-sm text-slate-500', 'Belum ada data ibadah pada bulan ini.'));
  }

  tampil('layar-lap-detail');
  muatIcon();
  lapGambarTrenDetail(a, d);
}


// ====================== EVENT ======================

function pasangEventLap() {
  $('nav-adm-lap').addEventListener('click', function () {
    if (layarTampil('layar-lap')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    lapIdDetail = null;
    bukaLap(null);
  });
  $('lap-keluar').addEventListener('click', keluarAdmin);
  $('lap-bulan').addEventListener('change', function () { lapIdDetail = null; bukaLap(this.value); });

  $('lap-tren-tab').addEventListener('click', function (e) {
    const t = e.target.closest('button');
    if (!t) return;
    lapTrenJenis = t.getAttribute('data-j');
    lapTrenIdx = null;
    lapGambarTren();
  });
  $('lap-bar-tab').addEventListener('click', function (e) {
    const t = e.target.closest('button');
    if (!t) return;
    lapBarJenis = t.getAttribute('data-j');
    lapRenderBar();
  });

  // Cari dan urut: hanya menyaring data yang sudah ada (tanpa request)
  $('lap-cari').addEventListener('input', function () { if (lapData && layarTampil('layar-lap')) lapRenderTabel(lapData); });
  $('lap-urut').addEventListener('change', function () { if (lapData && layarTampil('layar-lap')) lapRenderTabel(lapData); });

  $('lap-detail-kembali').addEventListener('click', function () {
    lapIdDetail = null;
    tampil('layar-lap');
    if (lapData) lapRender(lapData);
  });

  // Gambar ulang grafik saat ukuran berubah
  let timer = null;
  window.addEventListener('resize', function () {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      if (layarTampil('layar-lap')) { lapGambarTren(); }
      if (layarTampil('layar-lap-detail') && lapData && lapIdDetail) {
        const a = lapData.anggota.filter(function (x) { return x.id === lapIdDetail; })[0];
        if (a) lapGambarTrenDetail(a, lapData);
      }
    }, 150);
  });
}

bangunLayarLap();
bangunNavLap();
pasangEventLap();
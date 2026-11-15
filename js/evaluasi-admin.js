'use strict';

/**
 * evaluasi-admin.js — Evaluasi bulanan admin (STEP 5). Dimuat setelah evaluasi.js, sebelum main.js.
 *
 * - Hanya admin: token dari sesi admin. Tidak ada parameter anggota; evaluasi individu memakai
 *   data yang sudah ada di jawaban adminEvaluasi (tanpa request, tanpa catatan harian).
 * - Semua isi dan teks ambang berasal dari backend. Teks dipasang dengan textContent.
 * - Satu request per bulan, cache 60 detik.
 * Memakai: core.js, admin.js (buatEl, ubinAdmin, fmtPersen, bacaSesiAdm, tanganiAdminGagal,
 * keLandingDariAdmin, keluarAdmin), laporan.js (lapBaris, lapAngka), evaluasi.js (evDaftar).
 */

let cacheEva = {};
let permintaanEva = {};
let generasiEva = 0;
let hariEva = null;
let evaData = null;
let evaBulan = null;
let evaIdDetail = null;

function hapusCacheEva() {
  cacheEva = {};
  permintaanEva = {};
  hariEva = null;
  generasiEva++;
}

function resetEva() {
  hapusCacheEva();
  evaData = null;
  evaBulan = null;
  evaIdDetail = null;
}

// ====================== PEMBUNGKUS ======================

const tampilSebelumEva = tampil;
tampil = function (idLayar) {
  tampilSebelumEva(idLayar);
  if (idLayar === 'layar-loading') return;
  const adaEva = (idLayar === 'layar-eva' || idLayar === 'layar-eva-detail');
  if (adaEva) {
    $('nav-bawah').hidden = true;
    $('nav-admin').hidden = false;
    document.body.classList.add('ada-nav');
    Array.prototype.forEach.call(document.querySelectorAll('#nav-admin .nav-item'), function (el) {
      el.classList.remove('aktif');
      el.removeAttribute('aria-current');
    });
  }
  const t = $('nav-adm-eva');
  t.classList.toggle('aktif', adaEva);
  if (adaEva) t.setAttribute('aria-current', 'page');
  else t.removeAttribute('aria-current');
};

const adminSedangTampilSebelumEva = adminSedangTampil;
adminSedangTampil = function () {
  return adminSedangTampilSebelumEva() || layarTampil('layar-eva') || layarTampil('layar-eva-detail');
};

const hapusSesiAdmSebelumEva = hapusSesiAdm;
hapusSesiAdm = function () {
  hapusSesiAdmSebelumEva();
  resetEva();
};

// ====================== DATA ======================

function simpanCacheEva(h) {
  if (hariEva !== null && h.hariIni !== hariEva) cacheEva = {};
  hariEva = h.hariIni;
  cacheEva[h.periode.bulan] = { data: h, waktu: Date.now() };
}

function muatEva(bulan) {
  const kunciJalan = bulan || '_default';
  if (permintaanEva[kunciJalan]) return permintaanEva[kunciJalan];
  const sesi = bacaSesiAdm();
  if (!sesi) return Promise.resolve({ ok: false, kode: 'BATAL', pesan: 'Sesi admin tidak ditemukan.' });

  const generasiAwal = generasiEva;
  const isi = { action: 'adminEvaluasi', token: sesi.token };
  if (bulan) isi.bulan = bulan;

  const janji = panggilApi(isi).then(function (hasil) {
    if (generasiAwal !== generasiEva) return { ok: false, kode: 'BATAL', pesan: 'Dibatalkan.' };
    delete permintaanEva[kunciJalan];
    if (hasil.ok) simpanCacheEva(hasil);
    return hasil;
  });
  permintaanEva[kunciJalan] = janji;
  return janji;
}

async function bukaEva(bulan) {
  const saya = ++navId;
  if (!bacaSesiAdm()) {
    keLandingDariAdmin();
    return;
  }
  const kunci = bulan || evaBulan;
  const entri = kunci ? cacheEva[kunci] : null;
  if (entri) {
    evaRender(entri.data);
    if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) segarkanEva(kunci, saya);
    return;
  }

  const terlihat = layarTampil('layar-eva');
  if (terlihat) evaStatus('muat');
  else tampilLoading('Memuat evaluasi...');

  const hasil = await muatEva(kunci);
  if (saya !== navId) return;
  if (hasil.ok) {
    evaRender(hasil);
    return;
  }
  if (hasil.kode === 'BATAL') return;
  if (await tanganiAdminGagal(hasil)) return;

  const ulang = function () { bukaEva(kunci); };
  if (terlihat) evaStatus('galat', hasil.pesan || 'Gagal memuat evaluasi.', ulang);
  else tampilError(hasil.pesan || 'Gagal memuat evaluasi.', ulang, true);
}

async function segarkanEva(kunci, saya) {
  aturSegar(true);
  const hasil = await muatEva(kunci);
  aturSegar(false);
  if (!bacaSesiAdm()) return;
  if (!hasil.ok) {
    if (hasil.kode === 'TOKEN_TIDAK_VALID' || hasil.kode === 'AKSES_DITOLAK') await tanganiAdminGagal(hasil);
    return;
  }
  if (saya !== navId) return;
  if (layarTampil('layar-eva')) evaRender(hasil);
}

// ====================== KERANGKA ======================

function bangunLayarEva() {
  const sec = document.createElement('section');
  sec.id = 'layar-eva';
  sec.className = 'layar';
  sec.hidden = true;
  sec.innerHTML =
    '<header class="hero-dash">' +
      '<div class="relative flex items-start justify-between gap-3">' +
        '<div class="min-w-0"><p class="m-0 text-sm text-teal-100/80">Admin Dashboard</p>' +
        '<h1 class="m-0 mt-0.5 text-2xl font-bold leading-tight text-white">Evaluasi Bulanan</h1></div>' +
        '<button type="button" id="eva-keluar" class="tombol-keluar" aria-label="Keluar dari akun admin">' +
        '<i data-lucide="log-out" class="h-4 w-4"></i>Keluar</button>' +
      '</div>' +
      '<div class="pilih-wadah">' +
        '<label for="eva-bulan" class="sr-only">Pilih bulan</label>' +
        '<i data-lucide="calendar-days" class="pilih-ikon kiri h-5 w-5"></i>' +
        '<select id="eva-bulan" class="pilih-bulan-baru"></select>' +
        '<i data-lucide="chevron-down" class="pilih-ikon kanan h-5 w-5"></i>' +
      '</div>' +
    '</header>' +
    '<p class="ev-ket" id="eva-ket"></p>' +
    '<div id="eva-status"></div>' +
    '<div id="eva-isi" hidden>' +
      '<div class="adm-kartu-grid" id="eva-kartu"></div>' +
      '<div class="kartu-d"><h2 class="judul-d">Dibanding bulan sebelumnya</h2>' +
        '<p class="ev-ket" id="eva-banding-ket" style="margin:4px 0 0"></p><div id="eva-banding"></div></div>' +
      '<div class="dash-kolom">' +
        '<div class="kartu-d"><h2 class="judul-d">Paling konsisten</h2><p class="ev-ket" id="eva-kuat-ket" style="margin:4px 0 0"></p><div id="eva-kuat"></div></div>' +
        '<div class="kartu-d"><h2 class="judul-d">Perlu ditingkatkan bersama</h2><p class="ev-ket" id="eva-perlu-ket" style="margin:4px 0 0"></p><div id="eva-perlu"></div></div>' +
      '</div>' +
      '<div class="kartu-d"><h2 class="judul-d">Perubahan performa antarbulan</h2>' +
        '<p class="ev-ket" id="eva-perubahan-ket" style="margin:4px 0 0"></p><div id="eva-perubahan"></div></div>' +
      '<div class="kartu-d"><h2 class="judul-d">Evaluasi individu</h2>' +
        '<p class="ev-ket" style="margin:4px 0 0">Ketuk anggota untuk melihat evaluasinya. Diurutkan menurut nama.</p>' +
        '<div class="adm-daftar-kartu" id="eva-daftar" style="display:grid"></div></div>' +
    '</div>' +
    '<details class="lb-cara"><summary>Cara evaluasi</summary><ul id="eva-cara"></ul></details>';
  document.querySelector('main.wadah').appendChild(sec);

  const det = document.createElement('section');
  det.id = 'layar-eva-detail';
  det.className = 'layar';
  det.hidden = true;
  det.innerHTML =
    '<header class="hero-dash">' +
      '<button type="button" class="tombol-keluar mb-3" id="eva-detail-kembali"><i data-lucide="arrow-left" class="h-4 w-4"></i>Evaluasi</button>' +
      '<div class="relative"><p class="m-0 text-sm text-teal-100/80">Evaluasi individu</p>' +
      '<h1 id="eva-detail-nama" class="m-0 mt-0.5 truncate text-2xl font-bold leading-tight text-white"></h1>' +
      '<p class="m-0 mt-2 text-[13px] text-teal-100/80" id="eva-detail-periode"></p></div>' +
    '</header>' +
    '<div id="eva-detail-status"></div>' +
    '<div id="eva-detail-isi">' +
      '<div class="adm-kartu-grid" id="eva-detail-kartu"></div>' +
      '<div class="kartu-d"><h2 class="judul-d">Dibanding bulan sebelumnya</h2>' +
        '<p class="ev-ket" id="eva-detail-banding-ket" style="margin:4px 0 0"></p><div id="eva-detail-banding"></div></div>' +
      '<div class="dash-kolom">' +
        '<div class="kartu-d"><h2 class="judul-d">Hal yang sudah baik</h2><div id="eva-detail-baik"></div></div>' +
        '<div class="kartu-d"><h2 class="judul-d">Hal yang dapat ditingkatkan</h2><div id="eva-detail-tingkat"></div></div>' +
      '</div>' +
      '<div class="kartu-d"><h2 class="judul-d">Rekomendasi bulan berikutnya</h2><div id="eva-detail-rek"></div></div>' +
      '<p class="ev-catatan" id="eva-detail-catatan"></p>' +
    '</div>';
  document.querySelector('main.wadah').appendChild(det);
}

function bangunNavEva() {
  const t = buatEl('button', 'nav-item');
  t.type = 'button';
  t.id = 'nav-adm-eva';
  const ikon = buatEl('span', 'nav-ikon');
  ikon.setAttribute('aria-hidden', 'true');
  ikon.appendChild(buatIkon('clipboard-check', 'h-5 w-5'));
  t.appendChild(ikon);
  t.appendChild(buatEl('span', null, 'Evaluasi'));
  $('nav-admin').insertBefore(t, $('nav-adm-lb') || $('nav-adm-keluar'));
}

function evaStatus(jenis, teks, aksi) {
  const w = $('eva-status');
  w.textContent = '';
  $('eva-isi').hidden = true;
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
  } else {
    w.appendChild(buatEl('div', 'kosong-d', teks));
  }
}

// ====================== RENDER: KELOMPOK ======================

function evaRender(d) {
  evaData = d;
  evaBulan = d.periode.bulan;
  tanggalHariServer = d.hariIni;

  const sel = $('eva-bulan');
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

  $('eva-ket').textContent = 'Untuk monitoring dan pembinaan, bukan penilaian pribadi. Evaluasi dibuat dari catatan yang tersimpan ' +
    'dan hanya untuk anggota dengan minimal 5 hari selesai. "Berjamaah" adalah status sholat berjamaah, bukan lokasi sholat.';

  const cara = $('eva-cara');
  cara.textContent = '';
  (d.ambang || []).forEach(function (t) { cara.appendChild(buatEl('li', null, t)); });

  if (evaIdDetail && layarTampil('layar-eva-detail')) return; // pembaruan background: layar tidak berpindah

  const k = d.kelompok;
  let pesan = null;
  if (k.anggotaAktif === 0) pesan = 'Belum ada anggota aktif. Periksa sheet Anggota.';
  else if (d.kosong) {
    pesan = (d.tanggalMulai && d.hariIni < d.tanggalMulai)
      ? 'Program mutabaah dimulai pada ' + formatTanggal(d.tanggalMulai) + '. Evaluasi muncul setelah program berjalan.'
      : 'Belum ada data untuk ' + formatBulan(d.periode.bulan) + '.';
  }

  if (pesan) {
    evaStatus('kosong', pesan);
  } else {
    $('eva-status').textContent = '';
    $('eva-isi').hidden = false;
    evaKartu(d);
    evaBanding(d);
    evaAspek(d);
    evaPerubahan(d);
    evaDaftar(d);
  }

  if (!layarTampil('layar-eva')) tampil('layar-eva');
  muatIcon();
}

function evaKartu(d) {
  const k = d.kelompok;
  const w = $('eva-kartu');
  w.textContent = '';
  const ada = k.hariSelesai > 0;
  w.appendChild(ubinAdmin('users', k.anggotaAktif, 'Anggota aktif', 'terdaftar'));
  w.appendChild(ubinAdmin('user-check', k.mengisi, 'Mengisi', 'min. 1 hari aktif'));
  w.appendChild(ubinAdmin('clipboard-check', k.evaluasiCukup, 'Evaluasi tersedia', 'min. 5 hari selesai'));
  w.appendChild(ubinAdmin('gauge', ada ? fmtPersen(k.rataPerforma) : '–', 'Rata performa', ada ? 'sampai kemarin' : 'belum ada hari selesai'));
  w.appendChild(ubinAdmin('trending-up', ada ? fmtPersen(k.rataKonsistensi) : '–', 'Rata konsistensi', 'hari aktif dan lengkap'));
}

function evaBanding(d) {
  const ket = $('eva-banding-ket');
  const w = $('eva-banding');
  w.textContent = '';
  const b = d.banding;
  if (!b) {
    ket.textContent = 'Belum ada bulan sebelumnya dalam program ini, jadi belum ada pembanding.';
    return;
  }
  if (!b.cukup || !b.selisih) {
    ket.textContent = 'Perbandingan dengan ' + formatBulan(b.bulan) + ' belum tersedia. Dibutuhkan minimal 5 hari yang sebanding pada kedua periode.';
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
}

function evaAspekDaftar(idWadah, idKet, daftar, kelas, teksKosong) {
  const w = $(idWadah);
  w.textContent = '';
  $(idKet).textContent = '';
  if (!daftar || daftar.length === 0) {
    w.appendChild(buatEl('p', 'ev-kosong', teksKosong));
    return;
  }
  daftar.forEach(function (s) {
    const b = buatEl('div', 'eva-aspek ' + kelas);
    b.appendChild(buatEl('span', null, s.label));
    b.appendChild(buatEl('span', 'jumlah', s.jumlah + ' dari ' + s.dari + ' anggota'));
    w.appendChild(b);
  });
}

function evaAspek(d) {
  if (d.kelompok.evaluasiCukup === 0) {
    $('eva-kuat').textContent = '';
    $('eva-perlu').textContent = '';
    $('eva-kuat-ket').textContent = 'Belum ada anggota dengan evaluasi yang cukup (minimal 5 hari selesai).';
    $('eva-perlu-ket').textContent = 'Belum ada anggota dengan evaluasi yang cukup (minimal 5 hari selesai).';
    return;
  }
  evaAspekDaftar('eva-kuat', 'eva-kuat-ket', d.kuat, 'kuat', 'Belum ada aspek yang memenuhi kriteria "sudah baik" pada kelompok ini.');
  evaAspekDaftar('eva-perlu', 'eva-perlu-ket', d.perlu, 'perlu', 'Tidak ada aspek yang perlu ditingkatkan bersama pada bulan ini.');
}

function evaPerubahan(d) {
  const p = d.perubahan;
  const w = $('eva-perubahan');
  w.textContent = '';
  const ket = $('eva-perubahan-ket');
  if (!d.banding || !d.banding.cukup) {
    ket.textContent = 'Perubahan antarbulan belum tersedia (butuh bulan sebelumnya dan minimal 5 hari sebanding).';
    return;
  }
  ket.textContent = 'Perubahan performa 3 poin atau lebih dibanding ' + formatBulan(d.banding.bulan) +
    '. Diurutkan menurut nama. ' + p.tetap + ' anggota relatif tetap, ' + p.tanpaPembanding + ' belum ada pembanding.';
  [['Meningkat', p.naik, 'naik'], ['Lebih rendah dari bulan pembanding', p.turun, 'turun']].forEach(function (x) {
    w.appendChild(buatEl('p', 'eva-sub', x[0] + ' (' + x[1].length + ')'));
    const baris = buatEl('div', 'eva-nama-daftar');
    if (x[1].length === 0) baris.appendChild(buatEl('span', 'ev-kosong', 'Tidak ada.'));
    x[1].forEach(function (a) {
      baris.appendChild(buatEl('span', 'eva-nama ' + x[2], a.nama + ' (' + (a.selisih > 0 ? '+' : '') + lapAngka(a.selisih) + ')'));
    });
    w.appendChild(baris);
  });
}

function evaDaftar(d) {
  const w = $('eva-daftar');
  w.textContent = '';
  d.anggota.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); }).forEach(function (a) {
    const kartu = buatEl('button', 'adm-kartu-anggota');
    kartu.type = 'button';
    kartu.setAttribute('aria-label', 'Lihat evaluasi ' + a.nama);
    const atas = buatEl('div', 'adm-ka-atas');
    const av = buatEl('span', 'avatar', inisialNama(a.nama));
    av.setAttribute('aria-hidden', 'true');
    atas.appendChild(av);
    atas.appendChild(buatEl('span', 'adm-ka-nama', a.nama));
    kartu.appendChild(atas);
    kartu.appendChild(buatEl('div', 'adm-ka-info', a.cukup
      ? a.baik.length + ' sudah baik · ' + a.tingkat.length + ' dapat ditingkatkan'
      : 'Evaluasi belum cukup'));
    kartu.addEventListener('click', function () { evaBukaDetail(a.id); });
    w.appendChild(kartu);
  });
}

// ====================== RENDER: INDIVIDU ======================

function evaBukaDetail(id) {
  const d = evaData;
  if (!d) return;
  const a = d.anggota.filter(function (x) { return x.id === id; })[0];
  if (!a) {
    tampilToast('Anggota tidak ditemukan.', 'error');
    return;
  }
  navId++;
  evaIdDetail = id;
  evaRenderDetail(a, d);
}

function evaRenderDetail(a, d) {
  $('eva-detail-nama').textContent = a.nama;
  $('eva-detail-periode').textContent = 'Periode: ' + formatBulan(d.periode.bulan) +
    (d.periode.akhir ? ' · sampai ' + formatTanggal(d.periode.akhir) : '') + ' · rasio dihitung sampai kemarin';

  const st = $('eva-detail-status');
  st.textContent = '';
  const isi = $('eva-detail-isi');
  const kartu = $('eva-detail-kartu');
  kartu.textContent = '';

  if (a.ringkasan) {
    const r = a.ringkasan;
    const ada = r.hariSelesai > 0;
    kartu.appendChild(ubinAdmin('gauge', ada ? fmtPersen(r.performa) : '–', 'Performa', 'sampai kemarin'));
    kartu.appendChild(ubinAdmin('trending-up', ada ? fmtPersen(r.konsistensi) : '–', 'Konsistensi', 'hari aktif dan lengkap'));
    kartu.appendChild(ubinAdmin('calendar-check', ada ? (r.hariAktif + '/' + r.hariSelesai) : '–', 'Hari aktif', 'dari hari selesai'));
    kartu.appendChild(ubinAdmin('badge-check', ada ? r.hariLengkap : '–', 'Hari lengkap', '5 wajib + istighfar'));
    kartu.appendChild(ubinAdmin('book-open', r.totalAlquran, 'Al-Quran', 'halaman bulan ini'));
  }

  const bagian = ['eva-detail-banding', 'eva-detail-baik', 'eva-detail-tingkat', 'eva-detail-rek'];
  const kartuBagian = Array.prototype.slice.call(isi.querySelectorAll('.kartu-d, .dash-kolom, .ev-catatan'));

  if (!a.cukup) {
    kartuBagian.forEach(function (e) { e.hidden = true; });
    st.appendChild(buatEl('div', 'kosong-d', a.pesan || 'Evaluasi belum bisa dibuat.'));
  } else {
    kartuBagian.forEach(function (e) { e.hidden = false; });
    const kb = $('eva-detail-banding-ket');
    const wb = $('eva-detail-banding');
    wb.textContent = '';
    const b = a.banding;
    if (!b) {
      kb.textContent = 'Belum ada bulan sebelumnya dalam program ini.';
    } else if (!b.cukup || !b.selisih) {
      kb.textContent = 'Perbandingan dengan ' + formatBulan(b.bulan) + ' belum tersedia (minimal 5 hari yang sebanding).';
    } else {
      kb.textContent = 'Dibanding ' + formatBulan(b.bulan) + (b.penuh ? ' (satu bulan penuh).' : ', sampai tanggal ' + Number(b.sampaiTanggal.substring(8, 10)) + '.');
      const r = a.ringkasan;
      wb.appendChild(lapBaris('Performa', lapAngka(r.performa), 'perubahan', b.selisih.performa));
      wb.appendChild(lapBaris('Konsistensi', lapAngka(r.konsistensi), 'perubahan', b.selisih.konsistensi));
      wb.appendChild(lapBaris('Ketepatan sholat wajib', lapAngka(r.ketepatanWajib) + '%', 'perubahan', b.selisih.ketepatanWajib));
      wb.appendChild(lapBaris('Al-Quran per hari', lapAngka(r.alquranPerHari) + ' hlm', 'perubahan', b.selisih.alquranPerHari));
    }
    evDaftar('eva-detail-baik', a.baik, 'check-circle-2', 'baik', a.pesanBaik || 'Belum ada butir pada bagian ini.');
    evDaftar('eva-detail-tingkat', a.tingkat, 'arrow-up-circle', 'tingkat', 'Tidak ada butir yang perlu ditingkatkan pada bulan ini.');
    evDaftar('eva-detail-rek', a.rekomendasi, 'arrow-right-circle', 'rek', 'Belum ada rekomendasi.');
    const c = a.catatan;
    $('eva-detail-catatan').textContent = 'Dari ' + c.hariSelesai + ' hari yang selesai: ' + c.tanpaCatatan +
      ' hari tanpa catatan dan ' + c.catatanNol + ' hari dengan catatan yang semua nilainya nol. Keduanya dibedakan.';
  }

  tampil('layar-eva-detail');
  muatIcon();
}

// ====================== EVENT ======================

function pasangEventEva() {
  $('nav-adm-eva').addEventListener('click', function () {
    if (layarTampil('layar-eva')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    evaIdDetail = null;
    bukaEva(null);
  });
  $('eva-keluar').addEventListener('click', keluarAdmin);
  $('eva-bulan').addEventListener('change', function () { evaIdDetail = null; bukaEva(this.value); });
  $('eva-detail-kembali').addEventListener('click', function () {
    evaIdDetail = null;
    tampil('layar-eva');
    if (evaData) evaRender(evaData);
  });
}

bangunLayarEva();
bangunNavEva();
pasangEventEva();
'use strict';

/**
 * dashboard.js — Upgrade dashboard anggota (STEP 2). Dimuat setelah user.js, sebelum main.js.
 *
 * - Membungkus renderDashboard() dan gambarGrafikDash() (user.js) tanpa mengubah user.js.
 * - Semua angka berasal dari backend (analitik.*). Frontend hanya menampilkan.
 * - Tanpa request tambahan: memakai jawaban ringkasBulan yang sudah ada di cache.
 * - Teks dipasang dengan textContent. Tidak ada ID anggota lain di data.
 * - Jika backend belum di-deploy (field baru tidak ada), bagian baru disembunyikan.
 */

let trenJenis = 'skor';   // 'skor' | 'quran'
let indeksTren = null;

function dsEl(tag, kelas, teks) {
  const e = document.createElement(tag);
  if (kelas) e.className = kelas;
  if (teks !== undefined && teks !== null) e.textContent = String(teks);
  return e;
}

function dsPersen(v) {
  return (v === null || v === undefined) ? '–' : (Math.round(v) + '%');
}

function dsAngka(v) {
  if (v === null || v === undefined) return '–';
  return (Math.round(v * 10) / 10).toString().replace('.', ',');
}

function dsUbin(idAngka, idKet, ikon, nama) {
  const u = dsEl('div', 'ubin-d');
  const b = dsEl('span', 'ikon-bulat');
  b.appendChild(buatIkon(ikon, 'h-5 w-5'));
  u.appendChild(b);
  const p1 = dsEl('p', 'ubin-angka-d');
  p1.id = idAngka;
  u.appendChild(p1);
  u.appendChild(dsEl('p', 'ubin-nama-d', nama));
  const p2 = dsEl('p', 'ubin-ket-d');
  p2.id = idKet;
  u.appendChild(p2);
  return u;
}

// ====================== MEMBANGUN ELEMEN (SEKALI) ======================

function bangunDashboardTambahan() {
  const grid = document.querySelector('#ringkasan-dashboard .ubin-grid');
  grid.appendChild(dsUbin('ub-konsis', 'ub-konsis-ket', 'trending-up', 'Konsistensi'));
  grid.appendChild(dsUbin('ub-tepat', 'ub-tepat-ket', 'check-check', 'Ketepatan wajib'));

  const tab = dsEl('button', 'tab-g', 'Wajib');
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.setAttribute('data-jenis', 'wajib');
  $('tab-grafik').appendChild(tab);

  const kolom = dsEl('div', 'dash-kolom');
  kolom.id = 'ds-kolom';
  kolom.hidden = true;
  kolom.innerHTML =
    '<div class="kartu-d" id="ds-target">' +
      '<h2 class="judul-d">Target dan realisasi</h2>' +
      '<p class="ds-sub" id="ds-target-ket"></p>' +
      '<div id="ds-target-isi"></div>' +
      '<p class="ds-sub">Target dari pengaturan: Al-Quran dan puasa. Patokan harian: 5 sholat wajib dan istighfar. ' +
      'Sholat berjamaah dan sholat sunnah tidak memiliki target.</p>' +
    '</div>' +
    '<div class="kartu-d" id="ds-banding">' +
      '<h2 class="judul-d">Perbandingan antarperiode</h2>' +
      '<p class="ds-sub" id="ds-banding-ket"></p>' +
      '<div id="ds-banding-isi"></div>' +
      '<p class="ds-judul-kecil">Tren bulanan</p>' +
      '<div class="tab-grafik" id="ds-tren-tab" role="tablist" aria-label="Jenis tren">' +
        '<button type="button" class="tab-g aktif" role="tab" aria-selected="true" data-tren="skor">Pencapaian</button>' +
        '<button type="button" class="tab-g" role="tab" aria-selected="false" data-tren="quran">Al-Quran per hari</button>' +
      '</div>' +
      '<div class="grafik-wadah" id="ds-tren-grafik"></div>' +
      '<p class="grafik-info" id="ds-tren-info" aria-live="polite"></p>' +
      '<p class="ds-judul-kecil">Seluruh program</p>' +
      '<div class="adm-rekap" id="ds-semua"></div>' +
    '</div>';
  $('kartu-statistik').parentNode.insertBefore(kolom, $('kartu-statistik'));

  $('ds-tren-tab').addEventListener('click', function (e) {
    const t = e.target.closest('button');
    if (!t) return;
    trenJenis = t.getAttribute('data-tren');
    indeksTren = null;
    gambarTren();
  });
}

// ====================== GRAFIK: SHOLAT WAJIB ======================

function gambarWajib() {
  const a = analitikDash;
  if (!a || a.kosong || !layarTampil('layar-dashboard')) return;

  const harian = (grafikSkala === 'harian');
  const sumber = harian ? a.harian : a.mingguan;
  function nilaiDari(e) {
    const v = harian ? e.wajib : e.tepat;
    return (v === undefined) ? null : v;
  }
  function info(e) {
    const v = nilaiDari(e);
    const rentang = harian ? formatTanggal(e.t) : formatTanggalPendek(e.mulai) + ' – ' + formatTanggalPendek(e.akhir);
    let isi;
    if (v === null) isi = harian ? 'belum diisi (hari ini)' : 'belum ada hari yang selesai';
    else isi = harian ? (v + ' dari 5 sholat wajib terlaksana') : ('ketepatan sholat wajib ' + dsAngka(v) + '%');
    return rentang + ': ' + isi + (harian && e.sem ? ' (hari ini, sementara)' : '');
  }

  const titik = sumber.map(function (e) {
    return {
      label: harian ? String(Number(e.t.substring(8, 10))) : String(Number(e.mulai.substring(8, 10))),
      nilai: nilaiDari(e),
      sementara: harian ? (e.sem === true) : false,
      aria: info(e)
    };
  });
  const n = titik.length;
  const pilih = (indeksGrafik !== null && indeksGrafik < n) ? indeksGrafik : n - 1;

  gambarGrafik($('grafik'), {
    jenis: 'batang',
    titik: titik,
    maks: harian ? 5 : 100,
    judul: harian ? 'Grafik sholat wajib terlaksana per hari' : 'Grafik ketepatan sholat wajib per minggu',
    terpilih: pilih,
    onPilih: function (i) {
      indeksGrafik = i;
      gambarGrafikDash();
    }
  });
  $('grafik-info').textContent = n > 0 ? info(sumber[pilih]) : '';
}

const gambarGrafikDashAsli = gambarGrafikDash;
gambarGrafikDash = function () {
  if (grafikJenis === 'wajib') gambarWajib();
  else gambarGrafikDashAsli();
  gambarTren();
};

// ====================== TREN BULANAN ======================

function gambarTren() {
  const a = analitikDash;
  if (!a || a.kosong || !Array.isArray(a.tren) || !layarTampil('layar-dashboard')) return;

  const bulanIni = a.hariIni.tanggal.substring(0, 7);
  const skor = (trenJenis === 'skor');
  function nilaiDari(t) { return skor ? t.performa : t.alquranPerHari; }
  function info(t) {
    const v = nilaiDari(t);
    const dasar = formatBulan(t.bulan) + (t.bulan === bulanIni ? ' (berjalan, sementara)' : '');
    if (v === null) return dasar + ': belum ada hari yang selesai.';
    return skor
      ? dasar + ': pencapaian ' + dsAngka(v) + ' dari 100 (' + t.hariSelesai + ' hari selesai)'
      : dasar + ': rata-rata ' + dsAngka(v) + ' halaman Al-Quran per hari';
  }

  const titik = a.tren.map(function (t) {
    return {
      label: NAMA_BULAN_PENDEK[Number(t.bulan.substring(5, 7)) - 1],
      nilai: nilaiDari(t),
      sementara: t.bulan === bulanIni,
      aria: info(t)
    };
  });
  const n = titik.length;
  const pilih = (indeksTren !== null && indeksTren < n) ? indeksTren : n - 1;

  const opsi = {
    jenis: 'batang',
    titik: titik,
    judul: skor ? 'Tren pencapaian per bulan' : 'Tren Al-Quran per hari per bulan',
    terpilih: pilih,
    minimalMaks: 5,
    onPilih: function (i) { indeksTren = i; gambarTren(); }
  };
  if (skor) opsi.maks = 100;
  gambarGrafik($('ds-tren-grafik'), opsi);
  $('ds-tren-info').textContent = n > 0 ? info(a.tren[pilih]) : '';

  document.querySelectorAll('#ds-tren-tab .tab-g').forEach(function (b) {
    const aktif = (b.getAttribute('data-tren') === trenJenis);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
}

// ====================== RENDER TAMBAHAN ======================

function dsBarisBanding(nama, sekarang, sebelum, selisih, satuan, desimal) {
  const baris = dsEl('div', 'ds-b-baris');
  baris.appendChild(dsEl('span', 'ds-b-nama', nama));
  baris.appendChild(dsEl('span', 'ds-b-nilai', sekarang + satuan));
  baris.appendChild(dsEl('span', 'ds-b-sebelum', 'bulan pembanding: ' + sebelum + satuan));
  const arah = Math.abs(selisih) < 0.05 ? 'tetap' : (selisih > 0 ? 'naik' : 'turun');
  const delta = dsEl('span', 'ds-delta ' + arah);
  delta.appendChild(buatIkon(arah === 'naik' ? 'trending-up' : (arah === 'turun' ? 'trending-down' : 'minus'), 'h-3.5 w-3.5'));
  const angka = (selisih > 0 ? '+' : '') + (desimal ? dsAngka(selisih) : String(Math.round(selisih)));
  delta.appendChild(document.createTextNode(arah === 'tetap' ? 'tetap' : angka));
  baris.appendChild(delta);
  return baris;
}

function renderTambahan(hasil) {
  const a = hasil.analitik;
  const kolom = $('ds-kolom');
  if (!a || a.kosong || !Array.isArray(a.tren)) {
    kolom.hidden = true;
    return;
  }
  const k = a.kartu;

  // Kartu tambahan (dua ubin baru dan keterangan berjamaah)
  $('ub-konsis').textContent = dsPersen(k.konsistensi);
  $('ub-konsis-ket').textContent = 'hari aktif dan lengkap';
  $('ub-tepat').textContent = dsPersen(k.ketepatanWajib);
  $('ub-tepat-ket').textContent = 'sholat wajib terlaksana';
  if (k.porsiJamaah !== undefined && k.porsiJamaah !== null) {
    $('ub-jamaah-ket').textContent = dsPersen(k.porsiJamaah) + ' dari sholat wajib terlaksana';
  }

  kolom.hidden = false;

  // ----- Target dan realisasi -----
  const tIsi = $('ds-target-isi');
  tIsi.textContent = '';
  const LABEL = { alquran: 'Al-Quran', puasa: 'Puasa', wajib: 'Sholat wajib', istighfar: 'Istighfar 100x' };
  const IKON = { alquran: 'book-open', puasa: 'utensils-crossed', wajib: 'badge-check', istighfar: 'sparkles' };
  if (!a.targetRealisasi) {
    $('ds-target-ket').textContent = 'Belum ada hari yang selesai untuk dibandingkan dengan target.';
  } else {
    $('ds-target-ket').textContent = 'Realisasi dibanding target pada periode ini.';
    a.targetRealisasi.forEach(function (t) {
      const baris = buatBarisStat(
        LABEL[t.kunci] || t.kunci, IKON[t.kunci] || 'check', t.realisasi, dsAngka(t.target),
        [{ nilai: Math.min(t.realisasi, t.target), kelas: 'seg-utama' }],
        [{ kelas: 'seg-utama', teks: (t.sumber === 'config' ? 'Target' : 'Patokan') + ' · ' + t.persen +
           '% dari ' + t.hariDasar + ' hari · satuan: ' + t.satuan }]
      );
      tIsi.appendChild(baris);
    });
  }

  // ----- Perbandingan antarperiode -----
  const bIsi = $('ds-banding-isi');
  bIsi.textContent = '';
  const b = a.banding;
  if (b === null || b === undefined) {
    $('ds-banding-ket').textContent = 'Belum ada bulan sebelumnya dalam program ini, jadi belum ada pembanding.';
  } else if (!b.cukup) {
    $('ds-banding-ket').textContent = 'Perbandingan dengan ' + formatBulan(b.bulan) +
      ' belum tersedia. Dibutuhkan minimal 5 hari yang sebanding pada kedua periode.';
  } else {
    $('ds-banding-ket').textContent = 'Dibanding ' + formatBulan(b.bulan) +
      (b.penuh ? ' (satu bulan penuh).' : ', sampai tanggal ' + Number(b.sampaiTanggal.substring(8, 10)) + '.') +
      (b.terpotong ? ' Bulan itu lebih pendek, jadi dipakai tanggal terakhirnya.' : '');
    const s = b.sebelumnya;
    bIsi.appendChild(dsBarisBanding('Pencapaian', dsAngka(k.pencapaian), dsAngka(s.performa), b.selisih.performa, '', true));
    bIsi.appendChild(dsBarisBanding('Konsistensi', dsAngka(k.konsistensi), dsAngka(s.konsistensi), b.selisih.konsistensi, '', true));
    bIsi.appendChild(dsBarisBanding('Ketepatan sholat wajib', dsAngka(k.ketepatanWajib), dsAngka(s.ketepatanWajib), b.selisih.ketepatanWajib, '%', true));
    bIsi.appendChild(dsBarisBanding('Al-Quran per hari', dsAngka(k.alquranPerHari), dsAngka(s.alquranPerHari), b.selisih.alquranPerHari, ' hlm', true));
    bIsi.appendChild(dsBarisBanding('Sholat berjamaah per hari', dsAngka(k.jamaahPerHari), dsAngka(s.jamaahPerHari), b.selisih.jamaahPerHari, '', true));
  }

  // ----- Seluruh program -----
  const wadah = $('ds-semua');
  wadah.textContent = '';
  const sm = a.semua;
  if (sm) {
    [[dsPersen(sm.performa), 'Pencapaian'], [dsPersen(sm.konsistensi), 'Konsistensi'],
     [sm.hariAktif + '/' + sm.hariSelesai, 'Hari aktif'], [String(sm.hariLengkap), 'Hari lengkap'],
     [String(sm.totalAlquran), 'Total halaman Al-Quran'], [String(sm.berjamaah), 'Sholat wajib berjamaah']]
      .forEach(function (x) {
        const item = dsEl('div', 'adm-rekap-item');
        item.appendChild(dsEl('p', 'adm-rekap-angka', x[0]));
        item.appendChild(dsEl('p', 'adm-rekap-label', x[1]));
        wadah.appendChild(item);
      });
  }

  muatIcon();
  gambarTren();
}

// ====================== PEMBUNGKUS RENDER ======================

const renderDashboardAsli = renderDashboard;
renderDashboard = function (hasil) {
  renderDashboardAsli(hasil);
  renderTambahan(hasil);
};

bangunDashboardTambahan();

// ====================== PEMERIKSAAN BACA-SAJA ======================

/** Jalankan dari Console: ujiDashboard(). Tidak mengubah tampilan, sesi, atau data. */
function ujiDashboard() {
  let ok = 0;
  let gagal = 0;
  function cek(ket, kondisi) {
    if (kondisi) ok++; else gagal++;
    console.log((kondisi ? 'OK    - ' : 'GAGAL - ') + ket);
  }
  const skrip = Array.prototype.map.call(document.querySelectorAll('script[src]'), function (s) { return s.src.split('/').pop(); });
  cek('dashboard.js dimuat tepat satu kali, sebelum main.js',
      skrip.filter(function (x) { return x === 'dashboard.js'; }).length === 1 && skrip.indexOf('dashboard.js') < skrip.indexOf('main.js'));
  cek('Enam kartu ringkasan', document.querySelectorAll('#ringkasan-dashboard .ubin-d').length === 6);
  cek('Empat tab grafik', document.querySelectorAll('#tab-grafik .tab-g').length === 4);
  cek('Kartu target dan perbandingan ada', !!$('ds-target') && !!$('ds-banding'));
  cek('renderDashboard dan gambarGrafikDash terbungkus',
      renderDashboard !== renderDashboardAsli && gambarGrafikDash !== gambarGrafikDashAsli);
  const hitung = {};
  Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (e) { hitung[e.id] = (hitung[e.id] || 0) + 1; });
  cek('Tidak ada ID elemen ganda', Object.keys(hitung).filter(function (x) { return hitung[x] > 1; }).length === 0);
  if (analitikDash) {
    cek('Backend mengirim field baru (tren, banding, semua, targetRealisasi)',
        Array.isArray(analitikDash.tren) && analitikDash.banding !== undefined && analitikDash.semua !== undefined);
    cek('harian memuat field wajib', analitikDash.kosong || analitikDash.harian.length === 0 || analitikDash.harian[0].wajib !== undefined);
  } else {
    console.log('Info  - Buka Dashboard dulu agar pemeriksaan data bisa dijalankan.');
  }
  console.log('RINGKASAN UJI DASHBOARD - ' + ok + ' OK, ' + gagal + ' GAGAL');
  return { ok: ok, gagal: gagal };
}
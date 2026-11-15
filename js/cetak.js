'use strict';

/**
 * cetak.js — Ekspor PDF lewat cetak browser (STEP 6). Dimuat setelah evaluasi-admin.js,
 * sebelum main.js. Tanpa library dan tanpa request baru.
 *
 * - Dokumen dibuat dari data yang SUDAH dimiliki peran itu (evData anggota, lapData dan evaData admin).
 * - Setiap tombol memeriksa sesi peran yang sesuai. Tidak ada PIN, token, ID, atau catatan harian.
 * - Area cetak dikosongkan setelah cetak dan saat keluar.
 * Memakai: core.js, admin.js (buatEl, fmtPersen), laporan.js (lapAngka, lapData),
 * evaluasi.js (evData), evaluasi-admin.js (evaData, evaIdDetail).
 */

const CP_APLIKASI = 'Mutabaah Yaumiyah ARMAS';

function cpEl(tag, kelas, teks) {
  return buatEl(tag, kelas, teks);
}

function cpKepala(judul, sub) {
  const k = cpEl('div', 'cp-kepala');
  k.appendChild(cpEl('p', 'cp-merek', CP_APLIKASI));
  k.appendChild(cpEl('h1', 'cp-judul', judul));
  k.appendChild(cpEl('p', 'cp-sub', sub));
  return k;
}

function cpBagian(judul) {
  const b = cpEl('div', 'cp-bagian');
  b.appendChild(cpEl('h2', null, judul));
  return b;
}

function cpGrid(daftar) {
  const g = cpEl('div', 'cp-grid');
  daftar.forEach(function (x) {
    const k = cpEl('div', 'cp-kotak');
    k.appendChild(cpEl('p', 'angka', x[0]));
    k.appendChild(cpEl('p', 'label', x[1]));
    g.appendChild(k);
  });
  return g;
}

function cpDaftar(butir, teksKosong) {
  if (!butir || butir.length === 0) return cpEl('p', 'cp-ket', teksKosong);
  const ul = cpEl('ul', 'cp-daftar');
  butir.forEach(function (b) { ul.appendChild(cpEl('li', null, b.teks)); });
  return ul;
}

/** kepala: [teks]; baris: [[teks,...]]; angka: indeks kolom rata kanan. */
function cpTabel(kepala, baris, angka) {
  const t = cpEl('table', 'cp-tabel');
  const th = document.createElement('thead');
  const tr = document.createElement('tr');
  kepala.forEach(function (h, i) { tr.appendChild(cpEl('th', angka.indexOf(i) !== -1 ? 'angka' : null, h)); });
  th.appendChild(tr);
  t.appendChild(th);
  const tb = document.createElement('tbody');
  baris.forEach(function (r) {
    const x = document.createElement('tr');
    r.forEach(function (v, i) { x.appendChild(cpEl('td', angka.indexOf(i) !== -1 ? 'angka' : null, v)); });
    tb.appendChild(x);
  });
  t.appendChild(tb);
  return t;
}

function cpKaki(hariIni, catatan) {
  return cpEl('p', 'cp-kaki', 'Dibuat dari catatan yang tersimpan, per ' + formatTanggal(hariIni) + '. ' + catatan);
}

function cpDelta(s) {
  return (s === null || s === undefined) ? 'belum ada pembanding' : ((s > 0 ? '+' : '') + lapAngka(s));
}

function cpKeteranganBanding(b) {
  return 'Dibanding ' + formatBulan(b.bulan) +
    (b.penuh ? ' (satu bulan penuh).' : ', sampai tanggal ' + Number(b.sampaiTanggal.substring(8, 10)) + '.') +
    (b.terpotong ? ' Bulan itu lebih pendek, jadi dipakai tanggal terakhirnya.' : '');
}

// ====================== DOKUMEN: EVALUASI ======================

/** ev: { cukup, pesan, ringkasan, banding, baik, pesanBaik, tingkat, rekomendasi, catatan }. */
function bangunCetakEvaluasi(nama, ev, periode, ambang, hariIni) {
  const root = cpEl('div', 'cp-dok');
  root.appendChild(cpKepala('Evaluasi Mutabaah Bulanan',
    nama + ' · ' + formatBulan(periode.bulan) + (periode.akhir ? ' · sampai ' + formatTanggal(periode.akhir) : '')));

  if (ev.ringkasan) {
    const r = ev.ringkasan;
    const ada = r.hariSelesai > 0;
    const b = cpBagian('Ringkasan');
    b.appendChild(cpGrid([
      [ada ? fmtPersen(r.performa) : '–', 'Performa'],
      [ada ? fmtPersen(r.konsistensi) : '–', 'Konsistensi'],
      [ada ? r.hariAktif + '/' + r.hariSelesai : '–', 'Hari aktif'],
      [ada ? String(r.hariLengkap) : '–', 'Hari lengkap'],
      [String(r.totalAlquran), 'Al-Quran (halaman)'],
      [String(r.berjamaah), 'Sholat wajib berjamaah']
    ]));
    root.appendChild(b);
  }

  if (!ev.cukup) {
    const b = cpBagian('Evaluasi');
    b.appendChild(cpEl('p', null, ev.pesan || 'Evaluasi belum bisa dibuat.'));
    root.appendChild(b);
  } else {
    const bb = cpBagian('Dibanding bulan sebelumnya');
    const bd = ev.banding;
    if (!bd) {
      bb.appendChild(cpEl('p', 'cp-ket', 'Belum ada bulan sebelumnya dalam program ini.'));
    } else if (!bd.cukup || !bd.selisih) {
      bb.appendChild(cpEl('p', 'cp-ket', 'Perbandingan dengan ' + formatBulan(bd.bulan) + ' belum tersedia (minimal 5 hari yang sebanding).'));
    } else {
      const r = ev.ringkasan;
      bb.appendChild(cpEl('p', 'cp-ket', cpKeteranganBanding(bd)));
      bb.appendChild(cpTabel(['Aspek', 'Bulan ini', 'Perubahan'], [
        ['Performa', lapAngka(r.performa), cpDelta(bd.selisih.performa)],
        ['Konsistensi', lapAngka(r.konsistensi), cpDelta(bd.selisih.konsistensi)],
        ['Ketepatan sholat wajib (%)', lapAngka(r.ketepatanWajib), cpDelta(bd.selisih.ketepatanWajib)],
        ['Al-Quran per hari (halaman)', lapAngka(r.alquranPerHari), cpDelta(bd.selisih.alquranPerHari)]
      ], [1, 2]));
    }
    root.appendChild(bb);

    const b1 = cpBagian('Hal yang sudah baik');
    b1.appendChild(cpDaftar(ev.baik, ev.pesanBaik || 'Belum ada butir pada bagian ini.'));
    root.appendChild(b1);
    const b2 = cpBagian('Hal yang dapat ditingkatkan');
    b2.appendChild(cpDaftar(ev.tingkat, 'Tidak ada butir yang perlu ditingkatkan pada bulan ini.'));
    root.appendChild(b2);
    const b3 = cpBagian('Rekomendasi bulan berikutnya');
    b3.appendChild(cpDaftar(ev.rekomendasi, 'Belum ada rekomendasi.'));
    root.appendChild(b3);

    if (ev.catatan) {
      root.appendChild(cpEl('p', 'cp-ket', 'Dari ' + ev.catatan.hariSelesai + ' hari yang selesai: ' + ev.catatan.tanpaCatatan +
        ' hari tanpa catatan dan ' + ev.catatan.catatanNol + ' hari dengan catatan yang semua nilainya nol. Keduanya dibedakan.'));
    }
  }

  const cara = cpBagian('Cara evaluasi');
  const ul = cpEl('ul', 'cp-daftar');
  (ambang || []).forEach(function (t) { ul.appendChild(cpEl('li', null, t)); });
  cara.appendChild(ul);
  root.appendChild(cara);

  root.appendChild(cpKaki(hariIni, 'Evaluasi menggambarkan kebiasaan yang tercatat, bukan penilaian pribadi dan bukan peringkat. "Berjamaah" adalah status sholat berjamaah, bukan lokasi sholat.'));
  return root;
}

// ====================== DOKUMEN: LAPORAN KELOMPOK ======================

function bangunCetakLaporan(d) {
  const root = cpEl('div', 'cp-dok');
  root.appendChild(cpKepala('Laporan Bulanan Kelompok',
    formatBulan(d.periode.bulan) + (d.periode.akhir ? ' · sampai ' + formatTanggal(d.periode.akhir) : '')));

  const k = d.kelompok;
  const ada = k.hariSelesai > 0;
  const b1 = cpBagian('Ringkasan kelompok');
  b1.appendChild(cpGrid([
    [String(k.anggotaAktif), 'Anggota aktif'],
    [String(k.mengisi), 'Mengisi (min. 1 hari aktif)'],
    [ada ? fmtPersen(k.rataPerforma) : '–', 'Rata performa'],
    [ada ? fmtPersen(k.rataKonsistensi) : '–', 'Rata konsistensi'],
    [String(k.totalAlquran), 'Total Al-Quran (halaman)'],
    [String(k.totalBerjamaah), 'Sholat wajib berjamaah']
  ]));
  root.appendChild(b1);

  const b2 = cpBagian('Dibanding bulan sebelumnya');
  const bd = d.banding;
  if (!bd) {
    b2.appendChild(cpEl('p', 'cp-ket', 'Belum ada bulan sebelumnya dalam program ini.'));
  } else if (!bd.cukup || !bd.selisih) {
    b2.appendChild(cpEl('p', 'cp-ket', 'Perbandingan dengan ' + formatBulan(bd.bulan) + ' belum tersedia (minimal 5 hari yang sebanding).'));
  } else {
    b2.appendChild(cpEl('p', 'cp-ket', cpKeteranganBanding(bd)));
    b2.appendChild(cpTabel(['Aspek', 'Bulan ini', 'Bulan pembanding', 'Perubahan'], [
      ['Rata performa', lapAngka(k.rataPerforma), lapAngka(bd.sebelumnya.rataPerforma), cpDelta(bd.selisih.rataPerforma)],
      ['Rata konsistensi', lapAngka(k.rataKonsistensi), lapAngka(bd.sebelumnya.rataKonsistensi), cpDelta(bd.selisih.rataKonsistensi)],
      ['Al-Quran per hari (halaman)', lapAngka(k.alquranPerHari), lapAngka(bd.sebelumnya.alquranPerHari), cpDelta(bd.selisih.alquranPerHari)]
    ], [1, 2, 3]));
  }
  root.appendChild(b2);

  if (d.tren && d.tren.length > 0) {
    const b3 = cpBagian('Tren bulanan kelompok');
    b3.appendChild(cpTabel(['Bulan', 'Hari selesai', 'Mengisi', 'Rata performa', 'Rata konsistensi', 'Al-Quran'],
      d.tren.map(function (t) {
        return [formatBulan(t.bulan), String(t.hariSelesai), String(t.mengisi), lapAngka(t.rataPerforma), lapAngka(t.rataKonsistensi), String(t.totalAlquran)];
      }), [1, 2, 3, 4, 5]));
    root.appendChild(b3);
  }

  const b4 = cpBagian('Tabel anggota');
  b4.appendChild(cpEl('p', 'cp-ket', 'Diurutkan menurut nama.'));
  b4.appendChild(cpTabel(['Nama', 'Performa', 'Konsistensi', 'Hari aktif', 'Hari lengkap', 'Al-Quran', 'Berjamaah'],
    d.anggota.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); }).map(function (a) {
      return [a.nama, fmtPersen(a.performa), fmtPersen(a.konsistensi),
              a.hariSelesai > 0 ? a.hariAktif + '/' + a.hariSelesai : '–',
              a.hariSelesai > 0 ? String(a.hariLengkap) : '–', String(a.totalAlquran), String(a.berjamaah)];
    }), [1, 2, 3, 4, 5, 6]));
  root.appendChild(b4);

  root.appendChild(cpKaki(d.hariIni, 'Untuk monitoring dan pembinaan. Rasio dihitung sampai kemarin; Al-Quran dan sholat berjamaah menyertakan hari ini. "Berjamaah" adalah status sholat berjamaah, bukan lokasi sholat.'));
  return root;
}

// ====================== CETAK ======================

function cpAreaCetak() {
  let a = $('area-cetak');
  if (!a) {
    a = document.createElement('div');
    a.id = 'area-cetak';
    document.body.appendChild(a);
  }
  return a;
}

function cpBersihkan() {
  const a = $('area-cetak');
  if (a) a.textContent = '';
}

function cpNamaFile(teks) {
  return String(teks).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function cpCetak(isi, namaFile) {
  const area = cpAreaCetak();
  area.textContent = '';
  area.appendChild(isi);
  const judulAsli = document.title;
  document.title = namaFile; // browser memakai judul halaman sebagai nama file PDF
  function sesudah() {
    window.removeEventListener('afterprint', sesudah);
    document.title = judulAsli;
    cpBersihkan();
  }
  window.addEventListener('afterprint', sesudah);
  window.print();
}

function cetakEvaluasiSaya() {
  if (!bacaSesi()) { tampilToast('Sesi tidak ditemukan. Silakan masuk lagi.', 'error'); return; }
  if (!evData) { tampilToast('Data evaluasi belum dimuat. Tunggu sebentar.', 'error'); return; }
  const d = evData;
  cpCetak(bangunCetakEvaluasi(d.nama, d, d.periode, d.ambang, d.hariIni),
    'Evaluasi-Mutabaah-' + cpNamaFile(d.nama) + '-' + d.periode.bulan);
}

function cetakLaporan() {
  if (!bacaSesiAdm()) { tampilToast('Sesi admin tidak ditemukan. Silakan masuk lagi.', 'error'); return; }
  if (!lapData) { tampilToast('Data laporan belum dimuat. Tunggu sebentar.', 'error'); return; }
  cpCetak(bangunCetakLaporan(lapData), 'Laporan-Mutabaah-ARMAS-' + lapData.periode.bulan);
}

function cetakEvaluasiIndividu() {
  if (!bacaSesiAdm()) { tampilToast('Sesi admin tidak ditemukan. Silakan masuk lagi.', 'error'); return; }
  if (!evaData || !evaIdDetail) { tampilToast('Pilih anggota terlebih dahulu.', 'error'); return; }
  const a = evaData.anggota.filter(function (x) { return x.id === evaIdDetail; })[0];
  if (!a) { tampilToast('Anggota tidak ditemukan.', 'error'); return; }
  cpCetak(bangunCetakEvaluasi(a.nama, a, evaData.periode, evaData.ambang, evaData.hariIni),
    'Evaluasi-Mutabaah-' + cpNamaFile(a.nama) + '-' + evaData.periode.bulan);
}

// ====================== TOMBOL ======================

function cpSisipTombol(sebelumId, id, teks, aksi) {
  const target = $(sebelumId);
  if (!target) return;
  const w = cpEl('div', 'cp-aksi');
  const b = cpEl('button', 'tombol-kecil');
  b.type = 'button';
  b.id = id;
  b.appendChild(buatIkon('file-down', 'h-4 w-4'));
  b.appendChild(document.createTextNode(teks));
  b.addEventListener('click', aksi);
  w.appendChild(b);
  target.parentNode.insertBefore(w, target);
}

// Bersihkan area cetak saat keluar
const hapusSesiSebelumCp = hapusSesi;
hapusSesi = function () { hapusSesiSebelumCp(); cpBersihkan(); };
const hapusSesiAdmSebelumCp = hapusSesiAdm;
hapusSesiAdm = function () { hapusSesiAdmSebelumCp(); cpBersihkan(); };

cpAreaCetak();
cpSisipTombol('ev-ket', 'cp-btn-ev', 'Unduh PDF', cetakEvaluasiSaya);
cpSisipTombol('lap-ket', 'cp-btn-lap', 'Unduh PDF laporan', cetakLaporan);
cpSisipTombol('eva-detail-status', 'cp-btn-eva', 'Unduh PDF evaluasi', cetakEvaluasiIndividu);

// ====================== PEMERIKSAAN BACA-SAJA ======================

/** Jalankan dari Console: ujiCetak(). Membangun dokumen di memori tanpa mencetak. */
function ujiCetak() {
  let ok = 0;
  let gagal = 0;
  function cek(ket, kondisi) {
    if (kondisi) ok++; else gagal++;
    console.log((kondisi ? 'OK    - ' : 'GAGAL - ') + ket);
  }
  const skrip = Array.prototype.map.call(document.querySelectorAll('script[src]'), function (s) { return s.src.split('/').pop(); });
  cek('cetak.js dimuat tepat satu kali, sebelum main.js',
      skrip.filter(function (x) { return x === 'cetak.js'; }).length === 1 && skrip.indexOf('cetak.js') < skrip.indexOf('main.js'));
  cek('Area cetak ada dan kosong saat tidak mencetak', !!$('area-cetak') && $('area-cetak').textContent === '');
  cek('Tiga tombol PDF ada', !!$('cp-btn-ev') && !!$('cp-btn-lap') && !!$('cp-btn-eva'));

  const larang = ['"pin"', 'token', 'masjid', 'buruk', 'gagal', 'malas', 'iman'];
  function periksa(nama, el, anggota) {
    const t = el.textContent.toLowerCase();
    cek(nama + ': teks tidak memuat PIN, token, atau kata terlarang', larang.every(function (k) { return t.indexOf(k) === -1; }));
    if (anggota) {
      cek(nama + ': tidak memuat ID internal anggota',
          anggota.every(function (a) { return !new RegExp('\\b' + a.id + '\\b').test(el.textContent); }));
    }
    cek(nama + ': memuat identitas aplikasi dan keterangan tanggal', el.textContent.indexOf(CP_APLIKASI) !== -1 && el.textContent.indexOf('Dibuat dari catatan') !== -1);
  }
  if (typeof evData !== 'undefined' && evData) {
    periksa('PDF evaluasi anggota', bangunCetakEvaluasi(evData.nama, evData, evData.periode, evData.ambang, evData.hariIni), null);
  } else console.log('Info  - Buka tab Evaluasi (anggota) agar PDF evaluasi anggota diperiksa.');
  if (typeof lapData !== 'undefined' && lapData) {
    periksa('PDF laporan kelompok', bangunCetakLaporan(lapData), lapData.anggota);
  } else console.log('Info  - Buka Laporan (admin) agar PDF laporan diperiksa.');
  if (typeof evaData !== 'undefined' && evaData && evaData.anggota.length > 0) {
    const a = evaData.anggota[0];
    periksa('PDF evaluasi individu', bangunCetakEvaluasi(a.nama, a, evaData.periode, evaData.ambang, evaData.hariIni), evaData.anggota);
  } else console.log('Info  - Buka Evaluasi (admin) agar PDF evaluasi individu diperiksa.');
  console.log('RINGKASAN UJI CETAK - ' + ok + ' OK, ' + gagal + ' GAGAL');
  return { ok: ok, gagal: gagal };
}
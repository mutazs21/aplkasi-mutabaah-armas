'use strict';

/**
 * user.js — Dashboard (baru, STEP 5), riwayat, detail tanggal, form, dan simpan.
 * Memakai fungsi dan state dari core.js dan charts.js.
 * Semua angka dashboard berasal dari backend (objek "analitik"); frontend hanya menampilkan.
 */

// ====================== STATE DASHBOARD ======================

// Analitik bulan yang sedang tampil di dashboard (dari jawaban ringkasBulan)
let analitikDash = null;

// Grafik: jenis ('skor' | 'quran' | 'jamaah'), skala ('harian' | 'mingguan'), titik terpilih
let grafikJenis = 'skor';
let grafikSkala = 'harian';
let indeksGrafik = null;
let bulanGrafikTerakhir = null;

const KETERANGAN_LEVEL = {
  t: 'belum ada catatan',
  n: 'catatan kosong',
  r: 'sebagian',
  s: 'hampir lengkap',
  l: 'lengkap'
};

const KELAS_LEVEL = {
  t: 'kosong',
  n: 'nol',
  r: 'rendah',
  s: 'sedang',
  l: 'penuh'
};


// ====================== DASHBOARD: KOMPONEN ======================

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
 * Kalender heatmap satu bulan. Kode level dari backend (riw.analitik.heatmap):
 * t tanpa catatan, n catatan nol, r rendah, s sedang, l lengkap, x di luar rentang.
 * Tanggal 'x' dinonaktifkan dan tidak dianggap gagal.
 */
function bangunKalender(bulan, riw) {
  const kartu = $('kartu-kalender');
  const a = riw && riw.analitik;
  if (!riw || !riw.ok || !a || !a.heatmap) {
    kartu.hidden = true;
    return;
  }

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
    const kode = a.heatmap[tanggal] || 'x';

    const tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.className = 'kal-hari';
    tombol.textContent = String(d);

    if (kode === 'x') {
      tombol.classList.add('nonaktif');
      tombol.disabled = true;
    } else {
      tombol.classList.add(KELAS_LEVEL[kode] || 'kosong');
      if (tanggal === riw.hariIni) tombol.classList.add('ini');
      tombol.setAttribute('aria-label', formatTanggal(tanggal) + ', ' + (KETERANGAN_LEVEL[kode] || ''));
      tombol.addEventListener('click', function () {
        asalDetail = 'dashboard';
        bukaDetail(tanggal);
      });
    }
    grid.appendChild(tombol);
  }

  kartu.hidden = false;
}


// ====================== DASHBOARD: GRAFIK ======================

/** Teks info saat titik grafik dipilih. */
function teksInfoGrafik(e, jenis, harian) {
  const rentang = harian
    ? formatTanggal(e.t)
    : formatTanggalPendek(e.mulai) + ' – ' + formatTanggalPendek(e.akhir);
  let isi;
  if (jenis === 'skor') {
    if (e.skor === null) {
      isi = harian ? 'belum diisi (hari ini)' : 'belum ada hari yang selesai';
    } else {
      isi = (harian ? 'skor ' : 'rata-rata skor ') + (Number.isInteger(e.skor) ? e.skor : e.skor.toFixed(1)) + ' dari 100';
    }
  } else if (jenis === 'quran') {
    isi = e.quran + ' halaman';
  } else {
    isi = e.jamaah + ' sholat wajib berjamaah';
  }
  return rentang + ': ' + isi + (harian && e.sem ? ' (hari ini, sementara)' : '');
}

/** Menggambar grafik dari analitikDash. Hanya jika dashboard sedang tampil. */
function gambarGrafikDash() {
  const a = analitikDash;
  if (!a || a.kosong || !layarTampil('layar-dashboard')) return;

  const harian = (grafikSkala === 'harian');
  const sumber = harian ? a.harian : a.mingguan;

  const titik = sumber.map(function (e) {
    let nilai;
    if (grafikJenis === 'skor') nilai = e.skor;
    else if (grafikJenis === 'quran') nilai = e.quran;
    else nilai = e.jamaah;
    return {
      label: harian ? String(Number(e.t.substring(8, 10))) : String(Number(e.mulai.substring(8, 10))),
      nilai: nilai,
      sementara: harian ? (e.sem === true) : false,
      aria: teksInfoGrafik(e, grafikJenis, harian)
    };
  });

  const n = titik.length;
  const pilih = (indeksGrafik !== null && indeksGrafik < n) ? indeksGrafik : n - 1;

  const judul = {
    skor: 'Grafik pencapaian',
    quran: 'Grafik halaman Al-Quran',
    jamaah: 'Grafik sholat wajib berjamaah'
  }[grafikJenis] + (harian ? ' harian' : ' mingguan');

  const opsi = {
    jenis: grafikJenis === 'skor' ? 'garis' : 'batang',
    titik: titik,
    judul: judul,
    terpilih: pilih,
    onPilih: function (i) {
      indeksGrafik = i;
      gambarGrafikDash();
    }
  };
  if (grafikJenis === 'skor') opsi.maks = 100;
  if (grafikJenis === 'jamaah' && harian) opsi.maks = 5;
  opsi.minimalMaks = 5;

  gambarGrafik($('grafik'), opsi);

  $('grafik-info').textContent = n > 0 ? teksInfoGrafik(sumber[pilih], grafikJenis, harian) : '';
}

/** Mengganti jenis dan/atau skala grafik (null = tidak berubah). */
function aturGrafik(jenis, skala) {
  if (jenis) grafikJenis = jenis;
  if (skala) grafikSkala = skala;
  indeksGrafik = null;

  document.querySelectorAll('#tab-grafik .tab-g').forEach(function (b) {
    const aktif = (b.getAttribute('data-jenis') === grafikJenis);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });
  document.querySelectorAll('#skala-grafik .skala-g').forEach(function (b) {
    const aktif = (b.getAttribute('data-skala') === grafikSkala);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-pressed', aktif ? 'true' : 'false');
  });

  gambarGrafikDash();
}


// ====================== DASHBOARD: RENDER ======================

/** Kartu "hari ini": status sudah/belum diisi dan tombol Isi/Edit. */
function renderKartuHariIni(a) {
  const status = $('hari-ini-status');
  const tombol = $('tombol-dash-isi');

  $('hari-ini-tanggal').textContent = formatTanggal(a.hariIni.tanggal);

  if (!a.programMulai) {
    status.className = 'badge-hari info-p';
    status.textContent = 'Program dimulai ' + formatTanggal(a.tanggalMulai);
    tombol.hidden = true;
    return;
  }

  tombol.hidden = false;
  if (a.hariIni.sudah) {
    status.className = 'badge-hari sudah';
    status.textContent = 'Sudah diisi';
    $('teks-dash-isi').textContent = 'Edit hari ini';
  } else {
    status.className = 'badge-hari belum';
    status.textContent = 'Belum diisi';
    $('teks-dash-isi').textContent = 'Isi sekarang';
  }
}

/**
 * Mengisi layar dashboard dari jawaban ringkasBulan. Tidak melakukan request.
 * Jika layar sudah tampil (pembaruan background), posisi gulir tidak diubah.
 */
function renderDashboard(hasil) {
  bulanDashboard = hasil.bulan;
  tanggalHariServer = hasil.hariIni;

  $('nama-dashboard').textContent = hasil.nama;

  const a = hasil.analitik || null;
  analitikDash = a;

  const kosong = $('kosong-dashboard');
  const ringkasan = $('ringkasan-dashboard');
  const kartuGrafik = $('kartu-grafik');
  const kartuKalender = $('kartu-kalender');
  const kartuStat = $('kartu-statistik');
  const kartuHari = $('kartu-hari-ini');

  // Server belum diperbarui (tidak ada analitik)
  if (!a) {
    kosong.textContent = 'Data analitik belum tersedia. Pastikan backend sudah di-deploy ulang (Versi baru).';
    kosong.hidden = false;
    ringkasan.hidden = true;
    kartuGrafik.hidden = true;
    kartuKalender.hidden = true;
    kartuStat.hidden = true;
    kartuHari.hidden = true;
    if (!layarTampil('layar-dashboard')) tampil('layar-dashboard');
    return;
  }

  kartuHari.hidden = false;

  // Dropdown bulan (bulan program, terbaru dulu)
  const pilih = $('pilih-bulan');
  pilih.textContent = '';
  const daftar = a.bulanProgram.slice();
  if (daftar.indexOf(hasil.bulan) === -1) daftar.push(hasil.bulan);
  daftar.forEach(function (b) {
    const opsi = document.createElement('option');
    opsi.value = b;
    opsi.textContent = formatBulan(b);
    pilih.appendChild(opsi);
  });
  pilih.value = hasil.bulan;

  renderKartuHariIni(a);

  // Ganti bulan: titik grafik terpilih dikembalikan ke yang terbaru
  if (bulanGrafikTerakhir !== hasil.bulan) {
    indeksGrafik = null;
    bulanGrafikTerakhir = hasil.bulan;
  }

  if (a.kosong) {
    let pesan = 'Belum ada data untuk ' + formatBulan(hasil.bulan) + '.';
    if (!a.programMulai) {
      pesan = 'Program mutabaah dimulai pada ' + formatTanggal(a.tanggalMulai) + '. Statistik muncul setelah program berjalan.';
    } else if (hasil.bulan < a.bulanPertama) {
      pesan = 'Bulan ini sebelum program dimulai (' + formatTanggal(a.tanggalMulai) + '), jadi tidak dihitung.';
    }
    kosong.textContent = pesan;
    kosong.hidden = false;
    ringkasan.hidden = true;
    kartuGrafik.hidden = true;
    kartuKalender.hidden = true;
    kartuStat.hidden = true;
    if (!layarTampil('layar-dashboard')) tampil('layar-dashboard');
    return;
  }

  kosong.hidden = true;
  ringkasan.hidden = false;
  kartuGrafik.hidden = false;

  const k = a.kartu;

  // Pencapaian (cincin)
  if (k.pencapaian === null) {
    $('persen-dashboard').textContent = '–';
    $('cincin').style.background = '#e2e8f0';
    $('ket-progres').textContent = 'Belum ada hari yang selesai dihitung';
    $('ket-periode').textContent = 'Pencapaian muncul setelah hari pertama berlalu.';
  } else {
    const persen = Math.round(Math.max(0, Math.min(100, k.pencapaian)));
    $('persen-dashboard').textContent = persen + '%';
    $('cincin').style.background = 'conic-gradient(#0f766e ' + (persen * 3.6) + 'deg, #e2e8f0 0)';
    $('ket-progres').textContent = k.hariAktif + ' hari aktif dari ' + k.hariSelesai + ' hari';
    $('ket-periode').textContent = 'Dihitung sampai kemarin · ' +
      formatTanggalPendek(a.periode.awal) + ' – ' + formatTanggalPendek(a.periode.akhir);
  }

  // Empat kartu
  $('ub-aktif').textContent = k.hariSelesai > 0 ? (k.hariAktif + '/' + k.hariSelesai) : '–';
  $('ub-aktif-ket').textContent = k.hariSelesai > 0 ? ('streak terpanjang ' + k.streak + ' hari') : 'belum ada hari selesai';
  $('ub-quran').textContent = String(k.totalAlquran);
  $('ub-quran-ket').textContent = 'halaman · ' + k.hariMembaca + ' hari';
  $('ub-jamaah').textContent = String(k.berjamaah);
  $('ub-jamaah-ket').textContent = 'sholat wajib berjamaah';
  $('ub-lengkap').textContent = String(k.hariLengkap);
  $('ub-lengkap-ket').textContent = k.hariSelesai > 0 ? ('dari ' + k.hariSelesai + ' hari') : 'belum ada hari selesai';

  // Kalender heatmap
  bangunKalender(hasil.bulan, hasil);

  // Aktivitas ibadah
  const ib = a.ibadah;
  if (ib.hariTerhitung > 0) {
    kartuStat.hidden = false;
    const wadah = $('daftar-stat');
    wadah.textContent = '';
    const total = ib.hariTerhitung;

    ib.sholat.forEach(function (s) {
      let label = s.kunci;
      DAFTAR_SHOLAT.forEach(function (d) {
        if (d.kunci === s.kunci) label = d.label.replace('Sholat ', '');
      });
      wadah.appendChild(buatBarisStat(
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
    wadah.appendChild(buatBarisStat(
      'Istighfar', IKON_IBADAH.istighfar, ib.istighfar, total,
      [{ nilai: ib.istighfar, kelas: 'seg-utama' }], null
    ));
    wadah.appendChild(buatBarisStat(
      'Puasa', IKON_IBADAH.puasa, ib.puasa, total,
      [{ nilai: ib.puasa, kelas: 'seg-utama' }], null
    ));
    $('ket-ibadah').textContent = total + ' hari terhitung. Hari ini yang belum diisi tidak dihitung.';
  } else {
    kartuStat.hidden = true;
  }

  if (!layarTampil('layar-dashboard')) tampil('layar-dashboard');
  muatIcon(); // juga saat pembaruan background (layar sudah tampil)
  gambarGrafikDash(); // setelah layar tampil agar lebar wadah terukur
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
 * Navigasi bulan dibatasi mulai bulan program (November 2026).
 * Jika layar sudah tampil (pembaruan background), posisi gulir tidak diubah.
 */
function renderRiwayat(hasil) {
  const awalProgram = hasil.analitik ? hasil.analitik.bulanPertama : null;

  bulanRiwayat = hasil.bulan;
  bulanSebelumnya = (hasil.sebelumnya && (!awalProgram || hasil.sebelumnya >= awalProgram))
    ? hasil.sebelumnya : null;
  bulanBerikutnya = hasil.berikutnya;
  tanggalHariServer = hasil.hariIni;

  $('nama-bulan').textContent = formatBulan(hasil.bulan);
  $('tombol-bulan-sebelumnya').disabled = (bulanSebelumnya === null);
  $('tombol-bulan-berikutnya').disabled = (bulanBerikutnya === null);

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

  // 3. Kirim ke server: tanggal yang sedang tampil + data. Tanpa ID dan tanpa angka analitik
  //    (identitas dari token, skor dihitung ulang di server).
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

    // Perbarui cache lokal dari jawaban server (termasuk analitik terbaru)
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
'use strict';

/**
 * admin.js — Panel admin (STEP 6): sesi, cache, login, Ringkasan, Anggota, Detail.
 * Dimuat setelah core.js, charts.js, auth.js, user.js. main.js dimuat paling akhir.
 *
 * Keamanan:
 *  - Token admin disimpan di sessionStorage (hilang saat tab ditutup); kedaluwarsa dari server.
 *  - Password hanya ada di kolom input, dikosongkan segera setelah dikirim.
 *  - Frontend tidak pernah mengirim role atau ID anggota. Detail anggota memakai data yang
 *    sudah ada di jawaban adminRingkasan (tanpa request tambahan).
 *  - Semua teks dari server dipasang dengan textContent.
 */

// ====================== STATE ======================

const KUNCI_SESI_ADM = 'mutabaah_admin_v1';

let sesiAdmMemori = null;          // cadangan jika sessionStorage diblokir
let sesiAdmKedaluwarsa = false;    // true jika sesi admin baru saja habis (toast sekali)
let sedangLoginAdm = false;

let cacheAdm = {};                 // kunci periode ('yyyy-MM' atau 'all') -> { data, waktu }
let permintaanAdm = {};            // permintaan yang sedang berjalan
let generasiAdm = 0;               // dinaikkan saat cache dikosongkan
let hariAdm = null;                // tanggal hari ini (server) pada jawaban terakhir

let periodeAdm = null;             // periode yang sedang tampil
let tabAdm = 'ringkasan';          // 'ringkasan' | 'anggota'
let dataAdmin = null;              // jawaban adminRingkasan yang sedang tampil

let grafikAdmJenis = 'skor';       // 'skor' | 'aktif' | 'quran' | 'jamaah'
let indeksAdm = null;              // titik grafik terpilih


// ====================== FUNGSI BANTU ======================

function buatEl(tag, kelas, teks) {
  const e = document.createElement(tag);
  if (kelas) e.className = kelas;
  if (teks !== undefined && teks !== null) e.textContent = String(teks);
  return e;
}

function fmtPersen(v) {
  return (v === null || v === undefined) ? '–' : (Math.round(v) + '%');
}

function labelPeriode(kunci) {
  return kunci === 'all' ? 'Semua waktu' : formatBulan(kunci);
}

function adminSedangTampil() {
  return layarTampil('layar-adm-ringkasan') ||
         layarTampil('layar-adm-anggota') ||
         layarTampil('layar-adm-detail');
}


// ====================== NAVIGASI ADMIN (membungkus tampil) ======================

const tampilAsli = tampil;

tampil = function (idLayar) {
  tampilAsli(idLayar);
  if (idLayar === 'layar-loading') return; // keadaan navigasi dibiarkan agar tidak berkedip

  const layarAdmin = (idLayar === 'layar-adm-ringkasan' ||
                      idLayar === 'layar-adm-anggota' ||
                      idLayar === 'layar-adm-detail');
  if (layarAdmin) {
    $('nav-bawah').hidden = true;
    $('nav-admin').hidden = false;
    document.body.classList.add('ada-nav');
    const tab = (idLayar === 'layar-adm-ringkasan') ? 'ringkasan' : 'anggota';
    ['ringkasan', 'anggota'].forEach(function (nama) {
      const tombol = $('nav-adm-' + nama);
      const aktif = (nama === tab);
      tombol.classList.toggle('aktif', aktif);
      if (aktif) tombol.setAttribute('aria-current', 'page');
      else tombol.removeAttribute('aria-current');
    });
  } else {
    $('nav-admin').hidden = true;
  }
};


// ====================== SESI ADMIN ======================

/** Membaca sesi admin. Jika kedaluwarsa, sesi dan cache dihapus dan hasilnya null. */
function bacaSesiAdm() {
  let s = null;
  try {
    const mentah = sessionStorage.getItem(KUNCI_SESI_ADM);
    if (mentah) s = JSON.parse(mentah);
  } catch (err) {
    s = null;
  }
  if (!s) s = sesiAdmMemori;
  if (!s || typeof s.token !== 'string' || typeof s.nama !== 'string' || !isFinite(s.kedaluwarsaMs)) {
    return null;
  }
  if (Date.now() >= s.kedaluwarsaMs) {
    hapusSesiAdm();
    sesiAdmKedaluwarsa = true;
    return null;
  }
  return s;
}

function tulisSesiAdm(s) {
  sesiAdmMemori = s;
  try {
    sessionStorage.setItem(KUNCI_SESI_ADM, JSON.stringify(s));
  } catch (err) {
    // abaikan: cadangan memori tetap dipakai
  }
}

function hapusCacheAdm() {
  cacheAdm = {};
  permintaanAdm = {};
  hariAdm = null;
  generasiAdm++;
}

function hapusSesiAdm() {
  sesiAdmMemori = null;
  dataAdmin = null;
  periodeAdm = null;
  indeksAdm = null;
  hapusCacheAdm();
  try {
    sessionStorage.removeItem(KUNCI_SESI_ADM);
  } catch (err) {
    // abaikan
  }
}

/** Kembali ke landing dari area admin, dengan notifikasi jika sesi habis. */
function keLandingDariAdmin(pesan) {
  const teks = sesiAdmKedaluwarsa ? 'Sesi admin berakhir. Silakan masuk lagi.' : pesan;
  sesiAdmKedaluwarsa = false;
  tampilLanding(teks);
}

/** Jika jawaban berarti sesi admin tidak berlaku: hapus sesi, kembali ke landing, return true. */
async function tanganiAdminGagal(hasil, senyap) {
  if (hasil.kode !== 'TOKEN_TIDAK_VALID' && hasil.kode !== 'AKSES_DITOLAK') return false;
  hapusSesiAdm();
  keLandingDariAdmin(senyap ? null : 'Sesi admin berakhir. Silakan masuk lagi.');
  return true;
}

function keluarAdmin() {
  navId++;
  hapusSesiAdm();
  tampilLanding();
}

/** Dipanggil saat aplikasi kembali terlihat: keluar jika sesi admin sudah habis. */
function cekSesiAdminSaatKembali() {
  if (!bacaSesiAdm()) {
    navId++;
    keLandingDariAdmin('Sesi admin berakhir. Silakan masuk lagi.');
  }
}


// ====================== LOGIN ADMIN ======================

async function kirimLoginAdmin() {
  if (sedangLoginAdm) return;
  const pesan = $('adm-pesan');
  const id = $('adm-id').value.trim();
  const pw = $('adm-pw').value;

  if (id === '' || pw === '') {
    pesan.textContent = 'Isi ID dan password.';
    pesan.hidden = false;
    return;
  }

  sedangLoginAdm = true;
  pesan.hidden = true;
  $('tombol-adm-masuk').disabled = true;
  $('teks-adm-masuk').textContent = 'Memeriksa...';

  const hasil = await panggilApi({ action: 'adminLogin', id: id, password: pw });

  $('adm-pw').value = ''; // password tidak disimpan di mana pun
  sedangLoginAdm = false;
  $('tombol-adm-masuk').disabled = false;
  $('teks-adm-masuk').textContent = 'Masuk';

  if (hasil.ok) {
    hapusCacheAdm();
    tulisSesiAdm({ token: hasil.token, nama: hasil.nama, kedaluwarsaMs: hasil.kedaluwarsaMs });
    $('adm-id').value = '';
    tabAdm = 'ringkasan';
    await mulai(); // main.js: mengenali sesi admin
    return;
  }

  pesan.textContent = hasil.pesan || 'Login gagal.';
  pesan.hidden = false;
}


// ====================== DATA: CACHE DAN PEMUATAN ======================

function simpanCacheAdm(h) {
  if (hariAdm !== null && h.hariIni.tanggal !== hariAdm) cacheAdm = {};
  hariAdm = h.hariIni.tanggal;
  cacheAdm[h.periode.kunci] = { data: h, waktu: Date.now() };
}

/** Mengambil agregat satu periode (null = bawaan server: bulan berjalan). */
function muatAdmin(periode) {
  const kunciJalan = periode || '_default';
  if (permintaanAdm[kunciJalan]) return permintaanAdm[kunciJalan];

  const sesi = bacaSesiAdm();
  if (!sesi) {
    return Promise.resolve({ ok: false, kode: 'BATAL', pesan: 'Sesi admin tidak ditemukan.' });
  }

  const generasiAwal = generasiAdm;
  const isi = { action: 'adminRingkasan', token: sesi.token };
  if (periode) isi.periode = periode;

  const janji = panggilApi(isi).then(function (hasil) {
    if (generasiAwal !== generasiAdm) {
      return { ok: false, kode: 'BATAL', pesan: 'Dibatalkan.' };
    }
    delete permintaanAdm[kunciJalan];
    if (hasil.ok) simpanCacheAdm(hasil);
    return hasil;
  });
  permintaanAdm[kunciJalan] = janji;
  return janji;
}

/**
 * Membuka tab admin ('ringkasan' | 'anggota') untuk satu periode.
 * Ada di cache: tampil seketika (diperbarui di background jika lebih tua dari BATAS_SEGAR_MS).
 * Belum ada: loading dan 1 request.
 */
async function bukaAdmin(tab, periode, senyap) {
  const saya = ++navId;
  tabAdm = tab;

  if (!bacaSesiAdm()) {
    keLandingDariAdmin();
    return;
  }

  const kunci = periode || periodeAdm;
  const entri = kunci ? cacheAdm[kunci] : null;

  if (entri) {
    renderAdmin(entri.data);
    if (Date.now() - entri.waktu > CONFIG.BATAS_SEGAR_MS) {
      segarkanAdmin(kunci, saya);
    }
    return;
  }

  tampilLoading('Memuat data admin...');
  const hasil = await muatAdmin(kunci);
  if (saya !== navId) return;

  if (hasil.ok) {
    renderAdmin(hasil);
    return;
  }
  if (hasil.kode === 'BATAL') return;
  if (await tanganiAdminGagal(hasil, senyap)) return;

  tampilError(hasil.pesan || 'Gagal memuat data admin.',
              function () { bukaAdmin(tab, periode); }, true);
}

/** Memperbarui di background tanpa menutup layar. Kegagalan jaringan diabaikan. */
async function segarkanAdmin(kunci, saya) {
  aturSegar(true);
  const hasil = await muatAdmin(kunci);
  aturSegar(false);

  if (!bacaSesiAdm()) return;
  if (!hasil.ok) {
    if (hasil.kode === 'TOKEN_TIDAK_VALID' || hasil.kode === 'AKSES_DITOLAK') {
      await tanganiAdminGagal(hasil);
    }
    return;
  }
  if (saya !== navId) return;
  if (layarTampil('layar-adm-ringkasan') || layarTampil('layar-adm-anggota')) {
    renderAdmin(hasil);
  }
}


// ====================== RENDER: UMUM ======================

function isiPilihPeriode(d) {
  ['adm-periode', 'adm-periode2'].forEach(function (idSel) {
    const sel = $(idSel);
    sel.textContent = '';
    const nilai = (d.bulanProgram || []).slice();
    if (nilai.indexOf(d.periode.kunci) === -1 && d.periode.kunci !== 'all') nilai.push(d.periode.kunci);
    nilai.push('all');
    nilai.forEach(function (k) {
      const opsi = document.createElement('option');
      opsi.value = k;
      opsi.textContent = labelPeriode(k);
      sel.appendChild(opsi);
    });
    sel.value = d.periode.kunci;
  });
}

function renderAdmin(d) {
  dataAdmin = d;
  periodeAdm = d.periode.kunci;
  tanggalHariServer = d.hariIni.tanggal;
  isiPilihPeriode(d);
  const sesi = bacaSesiAdm();
  $('adm-nama').textContent = sesi ? sesi.nama : 'Admin';

  if (tabAdm === 'anggota') renderAnggota(d);
  else renderRingkasan(d);
}


// ====================== RENDER: RINGKASAN ======================

function renderRingkasan(d) {
  const hi = d.hariIni;

  // Hari ini (R6): selalu hari ini, tidak mengikuti periode
  $('adm-hi-tgl').textContent = formatTanggal(hi.tanggal);
  if (!hi.programMulai) {
    $('adm-hi-sudah').textContent = '–';
    $('adm-hi-belum').textContent = '–';
    $('adm-hi-daftar').textContent = 'Program dimulai pada ' + formatTanggal(d.tanggalMulai) + '.';
  } else {
    $('adm-hi-sudah').textContent = String(hi.sudah);
    $('adm-hi-belum').textContent = String(hi.belum);
    const belum = hi.status.filter(function (s) { return !s.sudah; }).map(function (s) { return s.nama; });
    $('adm-hi-daftar').textContent = hi.totalAnggota === 0
      ? 'Belum ada anggota aktif.'
      : (belum.length === 0 ? 'Semua anggota sudah mengisi hari ini.' : 'Belum mengisi: ' + belum.join(', ') + '.');
  }

  const kosong = $('adm-kosong');
  const isi = $('adm-isi');

  if (d.kosong) {
    let pesan = 'Belum ada data untuk periode ' + labelPeriode(d.periode.kunci) + '.';
    if (hi.totalAnggota === 0) pesan = 'Belum ada anggota aktif. Periksa sheet Anggota.';
    else if (!hi.programMulai) pesan = 'Program mutabaah dimulai pada ' + formatTanggal(d.tanggalMulai) + '. Statistik muncul setelah program berjalan.';
    kosong.textContent = pesan;
    kosong.hidden = false;
    isi.hidden = true;
  } else {
    kosong.hidden = true;
    isi.hidden = false;

    const k = d.kartu;
    $('adm-k-total').textContent = String(k.totalAnggota);
    $('adm-k-sudah').textContent = hi.programMulai ? String(hi.sudah) : '–';
    $('adm-k-belum').textContent = hi.programMulai ? String(hi.belum) : '–';
    $('adm-k-rata').textContent = fmtPersen(k.rataPencapaian);
    $('adm-k-rata-ket').textContent = k.rataPencapaian === null
      ? 'belum ada hari selesai'
      : 'pencapaian, sampai kemarin';
    $('adm-k-quran').textContent = String(k.totalAlquran);
    $('adm-k-jamaah').textContent = String(k.totalBerjamaah);

    indeksAdm = null;
    renderBanding(d);
  }

  if (!layarTampil('layar-adm-ringkasan')) tampil('layar-adm-ringkasan');
  muatIcon();
  aturGrafikAdm(null); // menggambar setelah layar tampil agar lebar terukur
}

/** Perbandingan pencapaian antaranggota (batang horizontal, tertinggi di atas). */
function renderBanding(d) {
  const wadah = $('adm-banding');
  wadah.textContent = '';
  const urut = d.anggota.slice().sort(function (a, b) {
    const pa = a.performa === null ? -1 : a.performa;
    const pb = b.performa === null ? -1 : b.performa;
    if (pb !== pa) return pb - pa;
    return a.nama.localeCompare(b.nama);
  });
  urut.forEach(function (a) {
    const baris = buatEl('div', 'adm-banding-baris');
    baris.appendChild(buatEl('span', 'adm-banding-nama', a.nama));
    const bar = buatEl('div', 'bar');
    const isi = buatEl('div', 'bar-isi seg-utama');
    isi.style.width = (a.performa === null ? 0 : Math.max(0, Math.min(100, a.performa))) + '%';
    bar.appendChild(isi);
    baris.appendChild(bar);
    baris.appendChild(buatEl('span', 'adm-banding-nilai', fmtPersen(a.performa)));
    wadah.appendChild(baris);
  });
}


// ====================== GRAFIK ADMIN ======================

function teksInfoAdm(e, jenis, harian) {
  const rentang = harian
    ? formatTanggal(e.t)
    : formatTanggalPendek(e.mulai) + ' – ' + formatTanggalPendek(e.akhir);
  let isi;
  if (jenis === 'skor') {
    isi = (e.skor === null)
      ? 'belum ada hari yang selesai'
      : 'rata-rata skor ' + (Number.isInteger(e.skor) ? e.skor : e.skor.toFixed(1)) + ' dari 100';
  } else if (jenis === 'aktif') {
    isi = e.aktif + ' anggota aktif';
  } else if (jenis === 'quran') {
    isi = e.quran + ' halaman Al-Quran';
  } else {
    isi = e.jamaah + ' sholat wajib berjamaah';
  }
  return rentang + ': ' + isi + (harian && e.sem ? ' (hari ini, sementara)' : '');
}

/** Mengatur jenis grafik (null = tidak berubah) lalu menggambar ulang. */
function aturGrafikAdm(jenis) {
  if (jenis) {
    grafikAdmJenis = jenis;
    indeksAdm = null;
  }
  const d = dataAdmin;
  if (!d || d.kosong || !layarTampil('layar-adm-ringkasan')) return;

  const harian = (d.deret.skala === 'harian');
  if (!harian && grafikAdmJenis === 'aktif') grafikAdmJenis = 'skor';

  document.querySelectorAll('#adm-tab-grafik .tab-g').forEach(function (b) {
    const j = b.getAttribute('data-jenis');
    if (j === 'aktif') b.hidden = !harian; // jumlah anggota aktif hanya ada di skala harian
    const aktif = (j === grafikAdmJenis);
    b.classList.toggle('aktif', aktif);
    b.setAttribute('aria-selected', aktif ? 'true' : 'false');
  });

  const sumber = d.deret.titik;
  const titik = sumber.map(function (e) {
    let nilai;
    if (grafikAdmJenis === 'skor') nilai = e.skor;
    else if (grafikAdmJenis === 'aktif') nilai = e.aktif;
    else if (grafikAdmJenis === 'quran') nilai = e.quran;
    else nilai = e.jamaah;
    return {
      label: harian ? String(Number(e.t.substring(8, 10))) : String(Number(e.mulai.substring(8, 10))),
      nilai: nilai,
      sementara: harian ? (e.sem === true) : false,
      aria: teksInfoAdm(e, grafikAdmJenis, harian)
    };
  });

  const n = titik.length;
  const pilih = (indeksAdm !== null && indeksAdm < n) ? indeksAdm : n - 1;
  const judul = {
    skor: 'Grafik rata-rata pencapaian anggota',
    aktif: 'Grafik jumlah anggota aktif',
    quran: 'Grafik halaman Al-Quran seluruh anggota',
    jamaah: 'Grafik sholat wajib berjamaah seluruh anggota'
  }[grafikAdmJenis] + (harian ? ' per hari' : ' per minggu');

  const opsi = {
    jenis: grafikAdmJenis === 'skor' ? 'garis' : 'batang',
    titik: titik,
    judul: judul,
    terpilih: pilih,
    minimalMaks: 5,
    onPilih: function (i) {
      indeksAdm = i;
      aturGrafikAdm(null);
    }
  };
  if (grafikAdmJenis === 'skor') opsi.maks = 100;
  if (grafikAdmJenis === 'aktif') opsi.maks = Math.max(1, d.kartu.totalAnggota);

  gambarGrafik($('adm-grafik'), opsi);
  $('adm-grafik-info').textContent = n > 0 ? teksInfoAdm(sumber[pilih], grafikAdmJenis, harian) : '';
}


// ====================== RENDER: ANGGOTA ======================

function urutkanAnggota(daftar, cara) {
  const salinan = daftar.slice();
  function angka(a) {
    if (cara === 'performa') return a.performa === null ? -1 : a.performa;
    if (cara === 'alquran') return a.totalAlquran;
    if (cara === 'jamaah') return a.berjamaah;
    if (cara === 'aktif') return a.hariAktif;
    return 0;
  }
  salinan.sort(function (a, b) {
    if (cara !== 'nama') {
      const selisih = angka(b) - angka(a);
      if (selisih !== 0) return selisih;
    }
    return a.nama.localeCompare(b.nama);
  });
  return salinan;
}

/** Lencana status hari ini untuk satu anggota. */
function buatLencanaHariIni(d, a) {
  if (!d.hariIni.programMulai) return buatEl('span', 'adm-lencana info-p', 'Belum mulai');
  return a.sudahHariIni
    ? buatEl('span', 'adm-lencana sudah', 'Sudah')
    : buatEl('span', 'adm-lencana belum', 'Belum');
}

function teksHariAktif(a) {
  return a.hariSelesai > 0 ? (a.hariAktif + '/' + a.hariSelesai) : '–';
}

function itemRekap(angka, label) {
  const item = buatEl('div', 'adm-rekap-item');
  item.appendChild(buatEl('p', 'adm-rekap-angka', angka));
  item.appendChild(buatEl('p', 'adm-rekap-label', label));
  return item;
}

function renderAnggota(d) {
  const kata = $('adm-cari').value.trim().toLowerCase();
  const cara = $('adm-urut').value;
  const disaring = d.anggota.filter(function (a) {
    return kata === '' || a.nama.toLowerCase().indexOf(kata) !== -1;
  });
  const daftar = urutkanAnggota(disaring, cara);

  $('adm-ket-tabel').textContent = daftar.length + ' dari ' + d.anggota.length + ' anggota · ' +
    labelPeriode(d.periode.kunci) + ' · pencapaian dihitung sampai kemarin';
  $('adm-tabel-kosong').hidden = daftar.length > 0;

  // ----- Tabel (tampil mulai 1024px) -----
  const wadahTabel = $('adm-tabel-wadah');
  wadahTabel.textContent = '';
  if (daftar.length > 0) {
    const tabel = buatEl('table', 'adm-tabel');
    const kepala = document.createElement('thead');
    const barisKepala = document.createElement('tr');
    [['Nama', ''], ['Pencapaian', 'angka'], ['Hari aktif', 'angka'], ['Al-Quran', 'angka'],
     ['Berjamaah', 'angka'], ['Hari ini', '']].forEach(function (k) {
      const th = buatEl('th', k[1], k[0]);
      th.scope = 'col';
      barisKepala.appendChild(th);
    });
    kepala.appendChild(barisKepala);
    tabel.appendChild(kepala);

    const badan = document.createElement('tbody');
    daftar.forEach(function (a) {
      const tr = buatEl('tr', 'klik');
      const tdNama = document.createElement('td');
      const tombol = buatEl('button', 'adm-baris-btn');
      tombol.type = 'button';
      tombol.setAttribute('aria-label', 'Lihat detail ' + a.nama);
      const avatar = buatEl('span', 'avatar', inisialNama(a.nama));
      avatar.setAttribute('aria-hidden', 'true');
      tombol.appendChild(avatar);
      tombol.appendChild(buatEl('span', null, a.nama));
      tdNama.appendChild(tombol);
      tr.appendChild(tdNama);
      tr.appendChild(buatEl('td', 'angka', fmtPersen(a.performa)));
      tr.appendChild(buatEl('td', 'angka', teksHariAktif(a)));
      tr.appendChild(buatEl('td', 'angka', a.totalAlquran));
      tr.appendChild(buatEl('td', 'angka', a.berjamaah));
      const tdHari = document.createElement('td');
      tdHari.appendChild(buatLencanaHariIni(d, a));
      tr.appendChild(tdHari);
      tr.addEventListener('click', function () { bukaDetailAdmin(a.id); });
      badan.appendChild(tr);
    });
    tabel.appendChild(badan);

    const kaki = document.createElement('tfoot');
    const barisKaki = document.createElement('tr');
    barisKaki.appendChild(buatEl('td', null, 'Seluruh anggota'));
    barisKaki.appendChild(buatEl('td', 'angka', fmtPersen(d.kartu.rataPencapaian)));
    let jumlahAktif = 0;
    d.anggota.forEach(function (a) { jumlahAktif += a.hariAktif; });
    barisKaki.appendChild(buatEl('td', 'angka', jumlahAktif));
    barisKaki.appendChild(buatEl('td', 'angka', d.kartu.totalAlquran));
    barisKaki.appendChild(buatEl('td', 'angka', d.kartu.totalBerjamaah));
    barisKaki.appendChild(buatEl('td', null, d.hariIni.programMulai ? (d.hariIni.sudah + '/' + d.hariIni.totalAnggota + ' sudah') : '–'));
    kaki.appendChild(barisKaki);
    tabel.appendChild(kaki);

    wadahTabel.appendChild(tabel);
  }

  // ----- Kartu (HP dan tablet) -----
  const wadahKartu = $('adm-daftar-kartu');
  wadahKartu.textContent = '';
  daftar.forEach(function (a) {
    const kartu = buatEl('button', 'adm-kartu-anggota');
    kartu.type = 'button';
    kartu.setAttribute('aria-label', 'Lihat detail ' + a.nama);

    const atas = buatEl('div', 'adm-ka-atas');
    const avatar = buatEl('span', 'avatar', inisialNama(a.nama));
    avatar.setAttribute('aria-hidden', 'true');
    atas.appendChild(avatar);
    atas.appendChild(buatEl('span', 'adm-ka-nama', a.nama));
    atas.appendChild(buatEl('span', 'adm-ka-nilai', fmtPersen(a.performa)));
    kartu.appendChild(atas);

    const info = buatEl('div', 'adm-ka-info');
    info.appendChild(buatEl('span', null, 'Aktif ' + teksHariAktif(a)));
    info.appendChild(buatEl('span', null, 'Al-Quran ' + a.totalAlquran + ' hlm'));
    info.appendChild(buatEl('span', null, 'Berjamaah ' + a.berjamaah));
    info.appendChild(buatLencanaHariIni(d, a));
    kartu.appendChild(info);

    kartu.addEventListener('click', function () { bukaDetailAdmin(a.id); });
    wadahKartu.appendChild(kartu);
  });

  // ----- Rekap seluruh anggota -----
  $('adm-rekap-periode').textContent = 'Periode: ' + labelPeriode(d.periode.kunci) +
    (d.periode.akhir ? ' · sampai ' + formatTanggal(d.periode.akhir) : '');
  const rekap = $('adm-rekap');
  rekap.textContent = '';
  let jAktif = 0;
  let jLengkap = 0;
  d.anggota.forEach(function (a) { jAktif += a.hariAktif; jLengkap += a.hariLengkap; });
  rekap.appendChild(itemRekap(d.kartu.totalAnggota, 'Anggota aktif'));
  rekap.appendChild(itemRekap(fmtPersen(d.kartu.rataPencapaian), 'Rata-rata pencapaian'));
  rekap.appendChild(itemRekap(d.kartu.totalAlquran, 'Total halaman Al-Quran'));
  rekap.appendChild(itemRekap(d.kartu.totalBerjamaah, 'Total sholat berjamaah'));
  rekap.appendChild(itemRekap(jAktif, 'Total hari aktif'));
  rekap.appendChild(itemRekap(jLengkap, 'Total hari lengkap'));

  if (!layarTampil('layar-adm-anggota')) tampil('layar-adm-anggota');
  muatIcon();
}


// ====================== RENDER: DETAIL ANGGOTA ======================

function ubinAdmin(ikon, angka, nama, ket) {
  const ubin = buatEl('div', 'ubin-d');
  const bulat = buatEl('span', 'ikon-bulat');
  bulat.appendChild(buatIkon(ikon, 'h-5 w-5'));
  ubin.appendChild(bulat);
  ubin.appendChild(buatEl('p', 'ubin-angka-d', angka));
  ubin.appendChild(buatEl('p', 'ubin-nama-d', nama));
  ubin.appendChild(buatEl('p', 'ubin-ket-d', ket));
  return ubin;
}

/** Heatmap satu bulan dari kode level (hanya level, tanpa isi catatan). Tidak bisa diketuk. */
function bangunHeatAdmin(bulan, heat) {
  const grid = $('adm-detail-heat');
  grid.textContent = '';

  const tahun = Number(bulan.substring(0, 4));
  const nomor = Number(bulan.substring(5, 7));
  const jumlah = new Date(tahun, nomor, 0).getDate();
  const offset = (new Date(tahun, nomor - 1, 1).getDay() + 6) % 7; // Senin = 0

  INISIAL_HARI.forEach(function (i) {
    grid.appendChild(buatEl('div', 'kal-kepala', i));
  });
  for (let i = 0; i < offset; i++) {
    const spasi = document.createElement('div');
    spasi.setAttribute('aria-hidden', 'true');
    grid.appendChild(spasi);
  }
  for (let d = 1; d <= jumlah; d++) {
    const tanggal = bulan + '-' + (d < 10 ? '0' : '') + d;
    const kode = heat[tanggal] || 'x';
    const sel = buatEl('div', 'kal-hari', d);
    sel.style.display = 'flex';
    sel.style.alignItems = 'center';
    sel.style.justifyContent = 'center';
    sel.style.cursor = 'default';
    if (kode === 'x') {
      sel.classList.add('nonaktif');
    } else {
      sel.classList.add(KELAS_LEVEL[kode] || 'kosong');
      if (tanggal === dataAdmin.hariIni.tanggal) sel.classList.add('ini');
    }
    sel.setAttribute('aria-label', formatTanggal(tanggal) + ', ' +
      (kode === 'x' ? 'di luar periode' : (KETERANGAN_LEVEL[kode] || '')));
    grid.appendChild(sel);
  }
}

function bukaDetailAdmin(id) {
  const d = dataAdmin;
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
  tabAdm = 'anggota';
  renderDetailAdmin(a, d);
}

function renderDetailAdmin(a, d) {
  $('adm-detail-nama').textContent = a.nama;
  $('adm-detail-periode').textContent = 'Periode: ' + labelPeriode(d.periode.kunci) +
    (d.periode.akhir ? ' · sampai ' + formatTanggal(d.periode.akhir) : '') +
    ' · pencapaian dihitung sampai kemarin';

  const kartu = $('adm-detail-kartu');
  kartu.textContent = '';
  kartu.appendChild(ubinAdmin('gauge', fmtPersen(a.performa), 'Pencapaian', 'skor periode'));
  kartu.appendChild(ubinAdmin('trending-up', fmtPersen(a.konsistensi), 'Konsistensi', 'aktif dan lengkap'));
  kartu.appendChild(ubinAdmin('calendar-check', teksHariAktif(a), 'Hari aktif', 'dari hari selesai'));
  kartu.appendChild(ubinAdmin('badge-check', a.hariSelesai > 0 ? a.hariLengkap : '–', 'Hari lengkap', '5 wajib + istighfar'));
  kartu.appendChild(ubinAdmin('flame', a.hariSelesai > 0 ? a.streak : '–', 'Streak', 'hari aktif beruntun'));
  kartu.appendChild(ubinAdmin('book-open', a.totalAlquran, 'Al-Quran', 'halaman · ' + a.hariMembaca + ' hari'));
  kartu.appendChild(ubinAdmin('users-round', a.berjamaah, 'Berjamaah', 'sholat wajib'));
  kartu.appendChild(ubinAdmin('calendar-clock',
    d.hariIni.programMulai ? (a.sudahHariIni ? 'Sudah' : 'Belum') : '–', 'Hari ini', 'mengisi mutabaah'));

  // Heatmap (hanya untuk periode bulan)
  const kartuHeat = $('adm-detail-heat-kartu');
  if (a.heatmap && d.periode.jenis === 'bulan') {
    kartuHeat.hidden = false;
    bangunHeatAdmin(d.periode.kunci, a.heatmap);
  } else {
    kartuHeat.hidden = true;
  }

  // Aktivitas ibadah (agregat)
  const wadah = $('adm-detail-ibadah');
  wadah.textContent = '';
  const ib = a.ibadah;
  if (ib.hariTerhitung > 0) {
    const total = ib.hariTerhitung;
    ib.sholat.forEach(function (s) {
      let label = s.kunci;
      DAFTAR_SHOLAT.forEach(function (x) {
        if (x.kunci === s.kunci) label = x.label.replace('Sholat ', '');
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
    wadah.appendChild(buatBarisStat('Istighfar', IKON_IBADAH.istighfar, ib.istighfar, total,
      [{ nilai: ib.istighfar, kelas: 'seg-utama' }], null));
    wadah.appendChild(buatBarisStat('Puasa', IKON_IBADAH.puasa, ib.puasa, total,
      [{ nilai: ib.puasa, kelas: 'seg-utama' }], null));
  } else {
    wadah.appendChild(buatEl('p', 'text-sm text-slate-500', 'Belum ada data ibadah pada periode ini.'));
  }

  tampil('layar-adm-detail');
}


// ====================== EVENT ======================

function pasangEventAdmin() {
  // Landing dan login
  $('tombol-landing-admin').addEventListener('click', function () {
    $('adm-pesan').hidden = true;
    tampil('layar-admin-login');
  });
  $('tombol-adm-login-kembali').addEventListener('click', function () {
    $('adm-pw').value = '';
    tampilLanding();
  });
  $('form-admin-login').addEventListener('submit', function (e) {
    e.preventDefault();
    kirimLoginAdmin();
  });

  // Keluar (tiga tempat)
  $('tombol-adm-keluar').addEventListener('click', keluarAdmin);
  $('tombol-adm-keluar2').addEventListener('click', keluarAdmin);
  $('nav-adm-keluar').addEventListener('click', keluarAdmin);

  // Navigasi: menekan tab yang sedang aktif tidak membuat request
  $('nav-adm-ringkasan').addEventListener('click', function () {
    if (layarTampil('layar-adm-ringkasan')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    bukaAdmin('ringkasan', null);
  });
  $('nav-adm-anggota').addEventListener('click', function () {
    if (layarTampil('layar-adm-anggota')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    bukaAdmin('anggota', null);
  });

  // Periode (instan jika sudah ada di cache)
  $('adm-periode').addEventListener('change', function () { bukaAdmin('ringkasan', this.value); });
  $('adm-periode2').addEventListener('change', function () { bukaAdmin('anggota', this.value); });

  // Grafik
  $('adm-tab-grafik').addEventListener('click', function (e) {
    const tombol = e.target.closest('button');
    if (tombol && !tombol.hidden) aturGrafikAdm(tombol.getAttribute('data-jenis'));
  });

  // Cari dan urut: hanya menyaring data yang sudah ada (tanpa request)
  $('adm-cari').addEventListener('input', function () {
    if (dataAdmin && layarTampil('layar-adm-anggota')) renderAnggota(dataAdmin);
  });
  $('adm-urut').addEventListener('change', function () {
    if (dataAdmin && layarTampil('layar-adm-anggota')) renderAnggota(dataAdmin);
  });

  // Detail
  $('adm-detail-kembali').addEventListener('click', function () {
    tampil('layar-adm-anggota');
  });

  // Gambar ulang grafik saat ukuran berubah
  let timerUkuranAdm = null;
  window.addEventListener('resize', function () {
    if (timerUkuranAdm) clearTimeout(timerUkuranAdm);
    timerUkuranAdm = setTimeout(function () {
      if (layarTampil('layar-adm-ringkasan')) aturGrafikAdm(null);
    }, 150);
  });
}
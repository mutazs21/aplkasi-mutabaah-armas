'use strict';

/**
 * auth.js — Pilih nama dan layar PIN (keypad).
 * Memakai fungsi dan state dari core.js. Dimuat setelah core.js.
 */

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
    await mulai(); // masuk ke dashboard (mulai ada di main.js)
    if (!tersimpan) {
      tampilToast('Perangkat ini tidak bisa mengingat login. PIN perlu dimasukkan lagi saat aplikasi dibuka ulang.', 'error');
    }
    return;
  }

  tampilkanPesanPin(hasil.pesan || 'Login gagal.');
}
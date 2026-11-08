'use strict';

/**
 * charts.js — Grafik SVG buatan sendiri (tanpa library). Dimuat setelah core.js.
 *
 * gambarGrafik(wadah, opsi) menggambar grafik garis atau batang ke dalam elemen wadah.
 * Teks dibuat dengan textContent (aman dari penyisipan kode).
 *
 * opsi = {
 *   jenis      : 'garis' | 'batang'
 *   titik      : [{ label, nilai (angka atau null), sementara (bool), aria (teks) }]
 *   maks       : batas atas sumbu Y (opsional; jika kosong dihitung otomatis)
 *   minimalMaks: batas atas minimal saat otomatis (bawaan 5)
 *   judul      : label aksesibilitas untuk grafik
 *   terpilih   : indeks titik yang disorot
 *   onPilih    : fungsi(indeks) dipanggil saat titik diketuk atau ditekan Enter/Spasi
 * }
 */

const NS_SVG = 'http://www.w3.org/2000/svg';

function svgEl(nama, atribut, teks) {
  const el = document.createElementNS(NS_SVG, nama);
  if (atribut) {
    Object.keys(atribut).forEach(function (k) { el.setAttribute(k, String(atribut[k])); });
  }
  if (teks !== undefined && teks !== null) el.textContent = String(teks);
  return el;
}

/** Membulatkan batas atas ke angka "rapi" (1, 2, 5 x 10^n), minimal "minimal". */
function nilaiMaksGrafik(v, minimal) {
  const dasar = Math.max(Number(v) || 0, minimal || 5);
  const p = Math.pow(10, Math.floor(Math.log(dasar) / Math.LN10));
  const f = dasar / p;
  const n = f <= 1 ? 1 : (f <= 2 ? 2 : (f <= 5 ? 5 : 10));
  return n * p;
}

function fmtAngkaGrafik(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

function gambarGrafik(wadah, opsi) {
  wadah.textContent = '';
  const titik = opsi.titik || [];
  const n = titik.length;

  if (n === 0) {
    const kosong = document.createElement('p');
    kosong.className = 'grafik-kosong';
    kosong.textContent = 'Belum ada data untuk ditampilkan.';
    wadah.appendChild(kosong);
    return;
  }

  const W = Math.max(260, Math.round(wadah.clientWidth || 320));
  const H = 200;
  const M = { l: 34, r: 10, t: 12, b: 26 };
  const lebar = W - M.l - M.r;
  const tinggi = H - M.t - M.b;
  const batang = (opsi.jenis === 'batang');

  let maks = opsi.maks;
  if (!maks) {
    let tertinggi = 0;
    titik.forEach(function (t) {
      if (t.nilai !== null && t.nilai > tertinggi) tertinggi = t.nilai;
    });
    maks = nilaiMaksGrafik(tertinggi, opsi.minimalMaks || 5);
  }

  const svg = svgEl('svg', {
    viewBox: '0 0 ' + W + ' ' + H,
    class: 'grafik-svg',
    role: 'img',
    'aria-label': opsi.judul || 'Grafik'
  });
  svg.appendChild(svgEl('title', null, opsi.judul || 'Grafik'));

  function posX(i) {
    if (batang) return M.l + (i + 0.5) * lebar / n;
    return n === 1 ? M.l + lebar / 2 : M.l + i * lebar / (n - 1);
  }
  function posY(v) {
    return M.t + tinggi - Math.min(1, Math.max(0, v) / maks) * tinggi;
  }

  // Garis bantu dan label sumbu Y
  [0, 0.5, 1].forEach(function (f) {
    const y = M.t + tinggi - f * tinggi;
    svg.appendChild(svgEl('line', { x1: M.l, y1: y, x2: W - M.r, y2: y, class: 'gr-grid' }));
    svg.appendChild(svgEl('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end', class: 'gr-teks' }, fmtAngkaGrafik(maks * f)));
  });

  const terpilih = (typeof opsi.terpilih === 'number') ? opsi.terpilih : -1;

  if (batang) {
    const band = lebar / n;
    const lebarBatang = Math.max(3, Math.min(28, band * 0.62));
    titik.forEach(function (t, i) {
      if (t.nilai === null || t.nilai <= 0) return;
      const y = posY(t.nilai);
      const kelas = t.sementara ? 'gr-batang-sem' : (i === terpilih ? 'gr-terpilih' : 'gr-batang');
      svg.appendChild(svgEl('rect', {
        x: posX(i) - lebarBatang / 2,
        y: y,
        width: lebarBatang,
        height: Math.max(0, M.t + tinggi - y),
        rx: Math.min(4, lebarBatang / 2),
        class: kelas
      }));
    });
  } else {
    // Segmen garis kontinu (terputus oleh nilai kosong dan titik sementara)
    const segmen = [];
    let sekarang = [];
    titik.forEach(function (t, i) {
      if (t.nilai === null || t.sementara) {
        if (sekarang.length) segmen.push(sekarang);
        sekarang = [];
      } else {
        sekarang.push(i);
      }
    });
    if (sekarang.length) segmen.push(sekarang);

    const dasarY = M.t + tinggi;
    segmen.forEach(function (seg) {
      if (seg.length < 2) return;
      let garis = '';
      seg.forEach(function (i, k) {
        garis += (k === 0 ? 'M' : 'L') + posX(i).toFixed(1) + ' ' + posY(titik[i].nilai).toFixed(1) + ' ';
      });
      const area = garis + 'L' + posX(seg[seg.length - 1]).toFixed(1) + ' ' + dasarY +
                   ' L' + posX(seg[0]).toFixed(1) + ' ' + dasarY + ' Z';
      svg.appendChild(svgEl('path', { d: area, class: 'gr-area' }));
      svg.appendChild(svgEl('path', { d: garis.trim(), class: 'gr-garis' }));
    });

    // Sambungan putus-putus ke titik sementara
    titik.forEach(function (t, i) {
      if (!t.sementara || t.nilai === null || i === 0) return;
      const sebelum = titik[i - 1];
      if (sebelum.nilai === null || sebelum.sementara) return;
      svg.appendChild(svgEl('line', {
        x1: posX(i - 1), y1: posY(sebelum.nilai), x2: posX(i), y2: posY(t.nilai), class: 'gr-sambung'
      }));
    });

    // Penanda titik
    titik.forEach(function (t, i) {
      if (t.nilai === null) return;
      svg.appendChild(svgEl('circle', {
        cx: posX(i),
        cy: posY(t.nilai),
        r: (i === terpilih) ? 5.5 : (n > 20 ? 2.5 : 3.5),
        class: t.sementara ? 'gr-titik-sem' : 'gr-titik'
      }));
    });
  }

  // Garis penanda titik terpilih
  if (terpilih >= 0 && terpilih < n) {
    svg.appendChild(svgEl('line', {
      x1: posX(terpilih), y1: M.t, x2: posX(terpilih), y2: M.t + tinggi, class: 'gr-pilih'
    }));
  }

  // Label sumbu X (jarang agar tidak bertumpuk)
  const langkah = Math.max(1, Math.ceil(n / 7));
  titik.forEach(function (t, i) {
    if (i % langkah !== 0) return;
    svg.appendChild(svgEl('text', { x: posX(i), y: H - 8, 'text-anchor': 'middle', class: 'gr-teks' }, t.label));
  });

  // Area ketuk (transparan) per titik
  const lebarHit = Math.max(14, lebar / n);
  titik.forEach(function (t, i) {
    const hit = svgEl('rect', {
      x: posX(i) - lebarHit / 2,
      y: M.t,
      width: lebarHit,
      height: tinggi + 10,
      class: 'gr-hit',
      tabindex: 0,
      role: 'button',
      'aria-label': t.aria || t.label
    });
    function pilih() {
      if (typeof opsi.onPilih === 'function') opsi.onPilih(i);
    }
    hit.addEventListener('click', pilih);
    hit.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pilih();
      }
    });
    svg.appendChild(hit);
  });

  wadah.appendChild(svg);
}
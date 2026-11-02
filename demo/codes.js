/*
 * codes.js - a gift card code drawn as a barcode (Code 128) or a QR code, for
 * Checkout mode (1.3.11, D2). Offline and self-contained: the app has no
 * internet and loads no outside script, so both symbologies are drawn here,
 * as SVG, from the standards' own tables.
 *
 *   YCJ.codes.barcodeSvg(text) -> "<svg ...>" Code 128 (set C for an even run
 *                                 of digits, else set B), quiet zones included
 *   YCJ.codes.qrSvg(text)      -> "<svg ...>" QR code, byte mode, error
 *                                 correction M, versions 1-10 (up to 213 bytes)
 *
 * Checked against OpenCV's decoders (tools/test-giftcard-1311.py).
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------ Code 128 --
  // Bar/space widths for symbol values 0..106 (106 = stop, 7 elements).
  const C128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 "
    + "122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 "
    + "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 "
    + "113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 "
    + "431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 "
    + "241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 "
    + "131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112").split(" ");
  const START_B = 104, START_C = 105, STOP = 106;

  /** text -> symbol values, checksum and stop included. */
  function c128Values(text) {
    const t = String(text || "");
    let vals;
    if (/^\d+$/.test(t) && t.length % 2 === 0) {
      vals = [START_C];
      for (let i = 0; i < t.length; i += 2) vals.push(parseInt(t.slice(i, i + 2), 10));
    } else {
      vals = [START_B];
      for (const ch of t) {
        const code = ch.charCodeAt(0);
        if (code < 32 || code > 126) throw new Error("not printable ASCII");
        vals.push(code - 32);
      }
    }
    let sum = vals[0];
    for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
    vals.push(sum % 103, STOP);
    return vals;
  }

  function barcodeSvg(text) {
    const vals = c128Values(text);
    const QUIET = 10, H = 60;
    let x = QUIET, rects = "";
    vals.forEach((v) => {
      const w = C128[v];
      for (let i = 0; i < w.length; i++) {
        const n = +w[i];
        if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${n}" height="${H}"/>`;
        x += n;
      }
    });
    const W = x + QUIET;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  }

  // ----------------------------------------------------------------- QR --
  // Error correction M, per version 1..10: [ec codewords per block,
  // [blocks, data codewords] for group 1, then group 2].
  const QR_M = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  const dataCap = (v) => QR_M[v].slice(1).reduce((t, g) => t + g[0] * g[1], 0);

  // GF(256) with the QR polynomial 0x11D.
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }
  function rsRemainder(data, n) {
    const g = rsGen(n), r = new Array(n).fill(0);
    data.forEach((b) => {
      const f = b ^ r[0];
      r.shift(); r.push(0);
      for (let i = 0; i < n; i++) r[i] ^= gmul(g[i + 1], f);
    });
    return r;
  }

  function qrCodewords(bytes, v) {
    const cap = dataCap(v);
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4);                                     // byte mode
    put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length));    // terminator
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
    // Split into blocks, add error correction, interleave.
    const ec = QR_M[v][0], blocks = [];
    let k = 0;
    QR_M[v].slice(1).forEach(([n, len]) => { for (let i = 0; i < n; i++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, ec) }); } });
    const out = [];
    const maxD = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ec; i++) blocks.forEach((b) => out.push(b.e[i]));
    return out;
  }

  function bchBits(val, gen, genLen) {
    let r = val << (genLen - 1);
    for (let i = 31; i >= genLen - 1; i--) if ((r >>> i) & 1) r ^= gen << (i - genLen + 1);
    return r;
  }

  function qrMatrix(bytes) {
    let v = 1;
    while (v <= 10 && dataCap(v) * 8 < 4 + (v < 10 ? 8 : 16) + bytes.length * 8) v++;
    if (v > 10) throw new Error("too long for a QR code here");
    const N = 17 + 4 * v;
    const M = Array.from({ length: N }, () => new Array(N).fill(null));   // null = data area
    const set = (r, c, on) => { if (r >= 0 && c >= 0 && r < N && c < N) M[r][c] = on ? 1 : 0; };
    const finder = (r, c) => {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(r + dr, c + dc, on);
      }
    };
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
    for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[v];
    al.forEach((r) => al.forEach((c) => {
      if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) return;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }));
    // Reserve the format areas (filled per mask) and the dark module.
    for (let i = 0; i < 9; i++) { if (M[8][i] === null) M[8][i] = 0; if (M[i][8] === null) M[i][8] = 0; }
    for (let i = 0; i < 8; i++) { M[8][N - 1 - i] = 0; M[N - 1 - i][8] = 0; }
    M[N - 8][8] = 1;
    if (v >= 7) {
      const vb = (v << 12) | bchBits(v, 0x1f25, 13);
      for (let i = 0; i < 18; i++) {
        const on = (vb >>> i) & 1, a = N - 11 + (i % 3), b = Math.floor(i / 3);
        M[a][b] = on; M[b][a] = on;
      }
    }
    // Data, in the zigzag.
    const isData = M.map((row) => row.map((x) => x === null));
    const cw = qrCodewords(bytes, v);
    let bit = 0;
    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < N; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = right - j, upward = ((right + 1) & 2) === 0;
          const r = upward ? N - 1 - vert : vert;
          if (!isData[r][c]) continue;
          M[r][c] = bit < cw.length * 8 ? (cw[bit >>> 3] >>> (7 - (bit & 7))) & 1 : 0;
          bit++;
        }
      }
    }
    // Pick the mask with the lowest penalty.
    const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
    let best = null, bestScore = Infinity;
    MASKS.forEach((fn, m) => {
      const X = M.map((row, r) => row.map((x, c) => (isData[r][c] && fn(r, c) ? x ^ 1 : x)));
      // format: EC level M = 00, then the mask; BCH(15,5), XOR 0x5412
      const fb = (((0 << 3) | m) << 10 | bchBits((0 << 3) | m, 0x537, 11)) ^ 0x5412;
      // (X[row][col]) first copy around the top-left finder, second split
      // between the top-right and bottom-left ones.
      for (let i = 0; i <= 5; i++) X[i][8] = (fb >>> i) & 1;
      X[7][8] = (fb >>> 6) & 1; X[8][8] = (fb >>> 7) & 1; X[8][7] = (fb >>> 8) & 1;
      for (let i = 9; i < 15; i++) X[8][14 - i] = (fb >>> i) & 1;
      for (let i = 0; i < 8; i++) X[8][N - 1 - i] = (fb >>> i) & 1;
      for (let i = 8; i < 15; i++) X[N - 15 + i][8] = (fb >>> i) & 1;
      X[N - 8][8] = 1;
      const sc = penalty(X, N);
      if (sc < bestScore) { bestScore = sc; best = X; }
    });
    return best;
  }

  function penalty(X, N) {
    let p = 0;
    const lines = (get) => {
      for (let a = 0; a < N; a++) {
        let run = 1;
        for (let b = 1; b < N; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; }
          else run = 1;
        }
        for (let b = 0; b + 10 < N; b++) {
          const s = Array.from({ length: 11 }, (_, k) => get(a, b + k)).join("");
          if (s === "10111010000" || s === "00001011101") p += 40;
        }
      }
    };
    lines((a, b) => X[a][b]); lines((a, b) => X[b][a]);
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) {
      const v = X[r][c];
      if (v === X[r][c + 1] && v === X[r + 1][c] && v === X[r + 1][c + 1]) p += 3;
    }
    let dark = 0;
    X.forEach((row) => row.forEach((x) => { dark += x; }));
    p += Math.floor(Math.abs(dark * 20 - N * N * 10) / (N * N)) * 10;
    return p;
  }

  function qrSvg(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text || "")));
    const X = qrMatrix(bytes), N = X.length, Q = 4, S = N + Q * 2;
    let d = "";
    X.forEach((row, r) => row.forEach((x, c) => { if (x) d += `M${c + Q} ${r + Q}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${S}" height="${S}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
  }

  root.codes = { barcodeSvg, qrSvg, _c128Values: c128Values };
})(window.YCJ = window.YCJ || {});

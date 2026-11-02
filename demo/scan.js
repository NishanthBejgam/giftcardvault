/*
 * scan.js - read a gift card through the phone's camera, live, on the phone.
 *
 * Two halves (plus readImage(), the same reader for a screenshot):
 *
 *   grab(video, view) + readCanvas(c)
 *                    one camera frame -> text, with Tesseract.js running
 *                    OFFLINE from web/vendor/ocr (see tools/vendor-ocr.js).
 *                    The app calls these in a loop while the viewfinder is
 *                    open; nothing is photographed, recorded or kept - each
 *                    frame lives in a canvas for the length of one read.
 *                    The engine loads when the camera is first turned on,
 *                    never at app start.
 *
 *   extract(text)    text -> voucher fields, each marked with HOW it was found
 *                    ("label" = next to a word like PIN or Valid till, "guess"
 *                    = the likeliest unlabelled token, "" = not found).
 *
 * Why not just the paste parser (parse.js)? It must stay a line-for-line
 * translation of the desktop's, and it treats each line as a candidate card -
 * right for "one voucher per line" email lists, wrong for a card where the
 * code, PIN and validity sit on separate lines, often with the label on one
 * line and the value under it. Its date reader IS reused, so a date means the
 * same thing whichever way the card came in.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ OCR --
  const BASE = "vendor/ocr/";
  let worker = null, loading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  /** Does this WebView run WebAssembly SIMD? (The smallest module that uses a
   *  SIMD instruction - the same probe wasm-feature-detect uses.) Every
   *  WebView since Chrome 91 says yes; very old ones get the plain build. */
  function simdSupported() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
        2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) { return false; }
  }

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (!loading) {
      loading = (async () => {
        if (!window.Tesseract) await loadScript(BASE + "tesseract.min.js");
        // Every path is local. workerBlobURL:false loads the worker file
        // directly (a blob worker would importScripts from a CDN by default);
        // cacheMethod:"none" keeps the model out of IndexedDB - it is already
        // on disk inside the app.
        return window.Tesseract.createWorker("eng", 1, {
          workerPath: BASE + "worker.min.js",
          // A FILE, not the folder. Given a folder, Tesseract.js 7 picks its
          // own build - and on a current WebView it asks for the
          // "relaxedsimd" one, which is not bundled (it would be a third
          // 3.7 MB copy for a few percent of speed). The test suite caught it
          // as a 404 and a scan that never finished.
          corePath: BASE + "core/" + (simdSupported() ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js"),
          langPath: BASE + "lang",
          // The model ships unzipped: Android's packaging strips ".gz" from
          // assets and decompresses them, so a .gz name would 404 on the phone.
          gzip: false,
          cacheMethod: "none",
          workerBlobURL: false,
          logger: (m) => { if (progressCb) progressCb(m); },
        });
      })();
    }
    progressCb = onProgress;
    try {
      worker = await loading;
      // Sauvola (LOCAL) thresholding, not Tesseract's default global Otsu. A
      // card held up to a camera is a mid-tone block on a lighter or darker
      // surround; one global cut lands between surround and card and turns
      // the whole card - text included - solid black. Measured on the suite's
      // Myntra frame: Otsu read nothing, Sauvola read every line.
      await worker.setParameters({ thresholding_method: "2" });
    } catch (e) { loading = null; worker = null; throw e; }
    return worker;
  }
  let progressCb = null;

  /** Load the engine now, while the camera warms up, so the first frame is
   *  read as soon as it arrives instead of after a two-second load. */
  function preload(onProgress) { return getWorker(onProgress); }

  /**
   * Copy exactly what the user SEES in the viewfinder into a canvas. The
   * <video> is shown with object-fit: cover, so the visible part is a centred
   * crop of the camera frame - reading the whole frame would read text the
   * user cannot see and is not aiming at. Scaled to ~1600px on the long side
   * (what Tesseract reads well) and greyscaled with a little contrast.
   */
  function grab(video, view, flip) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const cw = view.clientWidth, ch = view.clientHeight;
    const s = Math.max(cw / vw, ch / vh);           // cover scale
    const sw = Math.min(vw, cw / s), sh = Math.min(vh, ch / s);
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const k = Math.min(1, 1600 / Math.max(sw, sh)) * (Math.max(sw, sh) < 900 ? 1.6 : 1);
    // Light text on a dark card (most printed gift cards: white on the
    // store's colour) reads as NOTHING to Tesseract, which expects dark ink -
    // the suite's pink Myntra card came back empty frame after frame. So
    // measure the frame and invert dark ones. `flip` lets the caller try the
    // opposite on the next frame when a frame yields nothing.
    const probe = document.createElement("canvas");
    probe.width = 48; probe.height = 36;
    const pc = probe.getContext("2d", { willReadFrequently: true });
    pc.filter = "grayscale(1)";
    pc.drawImage(video, sx + sw * 0.15, sy + sh * 0.15, sw * 0.7, sh * 0.7, 0, 0, 48, 36);
    const px = pc.getImageData(0, 0, 48, 36).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i];
    let invert = sum / (px.length / 4) < 120;
    if (flip) invert = !invert;
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext("2d");
    ctx.filter = "grayscale(1) " + (invert ? "invert(1) " : "") + "contrast(1.3)";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    c.inverted = invert;
    return c;
  }

  // 1.3.9 (Card Vault 1.3.8): a read that never answers is abandoned. When
  // the OS suspended the engine mid-read, the promise stayed pending for good
  // and the scanner "did nothing" until the app was restarted. The engine is
  // dropped and reloads on the next read. Long enough for a tall screenshot
  // on a slow phone.
  const READ_TIMEOUT_MS = 25000;
  async function readCanvas(canvas) {
    const w = await getWorker();
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("read timed out")), READ_TIMEOUT_MS);
    });
    try {
      const r = await Promise.race([w.recognize(canvas), late]);
      return (r && r.data && r.data.text) || "";
    } catch (e) {
      if (worker === w) terminate();
      throw e;
    } finally { clearTimeout(timer); }
  }

  // ------------------------------------------------------ native reader --
  // 1.3.11 (Card Vault 2.0's scanner): the phone's own text reader - Google
  // ML Kit on Android, Apple Vision on iPhone - through the GiftReader plugin
  // (tools/harden-android.js step 13). Faster and far better than Tesseract on
  // small, coloured and dark-mode text; Tesseract stays only as the fallback
  // where the plugin is absent (a desktop browser, the test harness). Nothing
  // leaves the phone: the picture goes to the OS reader in memory and is
  // dropped. Reached through Capacitor.Plugins.GiftReader, or by name through
  // Capacitor.nativePromise if the page never got that entry (seen once with
  // Card Vault on an iPhone). probeReader() asks once; only a plugin that
  // answered is used.
  const READER_METHODS = ["status", "readText", "pdfPages", "setBrightness", "textZoom"];
  const reader = { ok: null, via: "", why: "", pdf: false, brightness: false, textZoom: false };
  function readerPlugin() {
    const C = window.Capacitor;
    const p = C && C.Plugins && C.Plugins.GiftReader;
    if (p && typeof p.readText === "function") return p;
    if (!C || typeof C.nativePromise !== "function" || !(C.isNativePlatform && C.isNativePlatform())) return null;
    const o = { direct: true };
    READER_METHODS.forEach((m) => { o[m] = (opts) => C.nativePromise("GiftReader", m, opts || {}); });
    return o;
  }
  let probing = null;
  function probeReader() {
    if (probing) return probing;
    probing = (async () => {
      const p = readerPlugin();
      if (!p) { reader.ok = false; reader.why = "not in this build"; return reader; }
      try {
        let t;
        const late = new Promise((_, reject) => { t = setTimeout(() => reject(new Error("no answer from the phone")), 4000); });
        let st;
        try { st = await Promise.race([p.status(), late]); } finally { clearTimeout(t); }
        reader.ok = true; reader.via = p.direct ? "direct" : "bridge";
        reader.pdf = !!(st && st.pdf); reader.brightness = !!(st && st.brightness); reader.textZoom = !!(st && st.textZoom);
        reader.engine = (st && st.engine) || "";
      } catch (e) {
        reader.ok = false; reader.why = String((e && (e.message || e.code)) || e).slice(0, 80);
      }
      return reader;
    })();
    return probing;
  }
  function nativeReader() { return reader.ok ? readerPlugin() : null; }

  /** The viewfinder as the user sees it, in colour (the native reader wants
   *  the real picture, not a thresholded one). rotate=90 / 270 turns a card
   *  held sideways upright. */
  function grabColor(video, view, rotate) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const cw = view.clientWidth, ch = view.clientHeight;
    const s = Math.max(cw / vw, ch / vh);
    const sw = Math.min(vw, cw / s), sh = Math.min(vh, ch / s);
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const k = Math.min(1, 1600 / Math.max(sw, sh));
    const w = Math.round(sw * k), h = Math.round(sh * k);
    const c = document.createElement("canvas");
    const side = rotate === 90 || rotate === 270;
    c.width = side ? h : w; c.height = side ? w : h;
    const ctx = c.getContext("2d");
    if (rotate === 90) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
    if (rotate === 270) { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
    return c;
  }

  const NATIVE_TIMEOUT_MS = 15000;
  /** canvas -> lines [{ text, x, y, w, h }] in that canvas's pixels. */
  async function readNativeLines(canvas) {
    const p = nativeReader();
    const image = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("read timed out")), NATIVE_TIMEOUT_MS); });
    try {
      const r = await Promise.race([p.readText({ image }), late]);
      const kx = canvas.width / (r.width || canvas.width), ky = canvas.height / (r.height || canvas.height);
      return (r.lines || []).map((l) => ({
        text: String(l.text || ""), x: l.x * kx, y: l.y * ky, w: l.w * kx, h: l.h * ky,
      }));
    } finally { clearTimeout(timer); }
  }
  /** Camera frame -> text, rows rebuilt from the boxes. */
  async function readNative(canvas) {
    return rowsText(await readNativeLines(canvas));
  }

  /**
   * Lines with boxes -> text, one ROW per line of text as a person reads it.
   * The reader returns blocks; on a voucher list the label ("PIN") and its
   * value often come back as two blocks side by side. Joining what shares a
   * row puts them back on one line, which is what the label rules expect.
   */
  function rowsText(lines) {
    const ls = lines.filter((l) => l.text.trim()).slice().sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    const rows = [];
    ls.forEach((l) => {
      const cy = l.y + l.h / 2;
      const row = rows.find((r) => Math.abs(r.cy - cy) < Math.min(r.h, l.h) * 0.55);
      if (row) { row.items.push(l); row.cy = (row.cy + cy) / 2; row.h = Math.max(row.h, l.h); }
      else rows.push({ cy, h: l.h, items: [l] });
    });
    rows.sort((a, b) => a.cy - b.cy);
    return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((l) => l.text.trim()).join("  ")).join("\n");
  }

  /** A whole picture through the native reader. A tall one (a scrolling
   *  screenshot of a long list or email) is read in overlapping slices so
   *  the text stays big enough; each line is kept from the slice where it
   *  sits furthest from an edge, so nothing is read twice or cut in half. */
  async function readImageNative(img, sharpen) {
    const W = img.naturalWidth, H = img.naturalHeight;
    const k = Math.min(1, (sharpen ? 1200 : 1440) / W);
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const sliceH = Math.round(w * 1.7), overlap = Math.round(sliceH * 0.14);
    const starts = [];
    if (h <= sliceH * 1.15) starts.push(0);
    else for (let y = 0; ; y += sliceH - overlap) { if (y + sliceH >= h) { starts.push(Math.max(0, h - sliceH)); break; } starts.push(y); }
    const all = [];
    for (let i = 0; i < starts.length; i++) {
      const y0 = starts[i], sh = Math.min(sliceH, h - y0);
      const c = document.createElement("canvas");
      c.width = w; c.height = sh;
      const cx = c.getContext("2d");
      // The second read (1.3.11 reconcile): a different size, grey, more
      // contrast - so it does not simply repeat the first read's mistakes.
      if (sharpen) cx.filter = "grayscale(1) contrast(1.35)";
      cx.drawImage(img, 0, y0 / k, W, sh / k, 0, 0, w, sh);
      const lines = await readNativeLines(c);
      c.width = c.height = 0;
      const lo = i === 0 ? -1 : y0 + overlap / 2, hi = i === starts.length - 1 ? Infinity : starts[i + 1] + overlap / 2;
      lines.forEach((l) => {
        const cy = y0 + l.y + l.h / 2;
        if (cy >= lo && cy < hi) all.push(Object.assign({}, l, { y: l.y + y0 }));
      });
    }
    return all;
  }

  /** PDF bytes (base64) -> page pictures as data: URLs, rendered on the
   *  phone (Android PdfRenderer). [] where the build cannot. */
  async function pdfPages(b64, max) {
    const p = nativeReader();
    if (!p || !reader.pdf) return [];
    const r = await p.pdfPages({ data: b64, max: max || 8 });
    return (r && r.pages) || [];
  }

  /** Text size (Settings > Text size): zoom %, 0 = the phone's own. Resolves
   *  to { zoom, system } or null where the build cannot. */
  async function textZoom(zoom) {
    const p = nativeReader();
    if (!p || !reader.textZoom) return null;
    try { return await p.textZoom({ zoom }); } catch (e) { return null; }
  }

  /** Screen brightness for the checkout view: 1 = full, -1 = back to the
   *  phone's own setting. Silently nothing where the build cannot. */
  async function setBrightness(level) {
    const p = nativeReader();
    if (!p || !reader.brightness) return false;
    try { await p.setBrightness({ level }); return true; } catch (e) { return false; }
  }

  // ----------------------------------------------------------- pictures --
  // A SCREENSHOT of a voucher already on this phone (bought in another app) -
  // from the Scan tab's "From a screenshot", or shared in from another app.
  // Easier than a camera frame: flat, sharp, no glare - but often dark mode,
  // which Tesseract reads as nothing, so both polarities are tried.

  /** File, Blob or data: URL -> a decoded <img>. */
  async function loadImage(src) {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      if (typeof src !== "string") URL.revokeObjectURL(url);
    }
  }

  function prepImage(img, invert) {
    const w = img.naturalWidth, h = img.naturalHeight;
    // ~1400px wide is where Tesseract reads phone-sized text best; a tall
    // screenshot is capped so one read stays a couple of seconds.
    let k = Math.min(1, 1400 / w);
    if (w < 800) k = 1.6;
    if (h * k > 4200) k = 4200 / h;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext("2d");
    ctx.filter = "grayscale(1) " + (invert ? "invert(1) " : "") + "contrast(1.25)";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.inverted = invert;
    return c;
  }

  function isDark(img) {
    const p = document.createElement("canvas");
    p.width = 40; p.height = 80;
    const pc = p.getContext("2d", { willReadFrequently: true });
    pc.filter = "grayscale(1)";
    pc.drawImage(img, 0, 0, 40, 80);
    const px = pc.getImageData(0, 0, 40, 80).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i];
    return sum / (px.length / 4) < 110;
  }

  const found = (r) => r.multi || !!r.card.code;

  /** A small copy for the review screen's thumbnail. */
  function thumbOf(img) {
    const k = Math.min(1, 600 / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /**
   * Read a voucher picture. -> { text, result (as extract()), canvas }
   * Nothing is kept: the picture lives in this call's canvases only.
   * 1.3.11: the phone's own reader where the build has it (both polarities
   * are not needed - it reads dark mode as it is).
   */
  async function readImage(src, onProgress) {
    const img = await loadImage(src);
    await probeReader();
    if (nativeReader()) {
      const text = rowsText(await readImageNative(img));
      let text2 = "";
      try { text2 = rowsText(await readImageNative(img, true)); } catch (e) { text2 = ""; }
      return { text, text2, result: extract(text), canvas: thumbOf(img), native: true };
    }
    await getWorker(onProgress);
    const dark = isDark(img);
    let canvas = prepImage(img, dark);
    let text = await readCanvas(canvas);
    let result = extract(text);
    if (!found(result)) {
      const c2 = prepImage(img, !dark);
      const t2 = await readCanvas(c2);
      const r2 = extract(t2);
      if (found(r2) || t2.length > text.length) { canvas = c2; text = t2; result = r2; }
    }
    return { text, result, canvas };
  }

  /**
   * Several pictures at once (1.3.11, E1): a list that did not fit one
   * screen, screenshots of three apps, the pages of a PDF. Read one after
   * another and treated as ONE text, so a voucher split over two shots is
   * still one voucher and the same voucher on two shots counts once.
   * onEach(done, total) reports progress.
   */
  async function readImages(list, onEach) {
    const texts = [], texts2 = [];
    let canvas = null;
    for (let i = 0; i < list.length; i++) {
      const r = await readImage(list[i]);
      texts.push(r.text);
      if (r.text2) texts2.push(r.text2);
      if (!canvas) canvas = r.canvas;
      if (onEach) onEach(i + 1, list.length);
    }
    const text = texts.join("\n\n");
    // Two reads of every picture (phone reader): both extracted, for
    // reconcile.js to compare.
    const second = texts2.length === texts.length ? extract(texts2.join("\n\n")) : null;
    return { text, result: extract(text), second, canvas };
  }

  /** Drop the engine (and the decoded picture with it). Called on lock. */
  async function terminate() {
    const w = worker;
    worker = null; loading = null;
    if (w) { try { await w.terminate(); } catch (e) {} }
  }

  // ------------------------------------------------------------- extract --
  const SEP = "\\s*(?:no\\.?|number|#)?\\s*[:#\\-–]?\\s*";
  // Order matters on a line: PIN labels are tested before code labels, because
  // "security code" and "scratch code" are PINs, not codes.
  const PIN_L = new RegExp("\\b(?:card\\s*pin|pin|security\\s*code|scratch\\s*code|pass\\s*code|cvv)\\b" + SEP + "(.*)$", "i");
  // 1.3.11 (E8): also the words voucher apps and bank reward portals print -
  // "Activation code", "E-voucher no", "EGV number", "Serial no", "Gift code".
  const CODE_L = new RegExp("\\b(?:e-?gift\\s*card\\s*(?:code|no\\.?|number)|gift\\s*card\\s*(?:code|no\\.?|number)|"
    + "card\\s*(?:code|no\\.?|number)|e-?voucher\\s*(?:code|no\\.?|number)?|voucher\\s*(?:code|no\\.?|number)?|claim\\s*code|coupon\\s*code|"
    + "redemption\\s*code|activation\\s*code|egv\\s*(?:code|no\\.?|number)?|serial\\s*(?:no\\.?|number)|gift\\s*code|e-?code|code)\\b" + SEP + "(.*)$", "i");
  const EXP_L = /\b(?:valid\s*(?:till|until|upto|up\s*to|thru|through|to)|validity|expir(?:y|es|ation)(?:\s*date|\s*on)?|exp\.?|use\s*(?:by|before)|valid)\b\s*(?:date|on|by)?\s*[:#\-–]?\s*(.*)$/i;
  const AMT_L = /(?:₹|\brs\.?|\binr\b|\bamount\b|\bvalue\b|\bdenomination\b|\bworth\b|\bbalance\b)\s*[:#\-–]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const ORDER_L = /\border\s*(?:id|no\.?|number|#)\s*[:#\-–]?\s*([A-Z0-9][A-Z0-9\-]{4,})/i;
  // 1.3.11 (E2): numbers that sit next to these words are never a voucher
  // code - transaction ids, UTRs, phone numbers, invoice and booking refs.
  // 1.3.11 round 2: "Voucher ID", "Card ID", "Order no", "Txn ID"... are never
  // the code - the code is what you redeem. These label+value runs are cut
  // out of a line before a code is looked for in it, so "Voucher ID 123456
  // Voucher Code AB12CD34" gives AB12CD34, not 123456.
  const ID_RUN = /\b(?:(?:voucher|card|gift\s*card|e-?gift(?:\s*card)?|customer|request|payment)\s*id|(?:order|transaction|txn|reference|ref|booking|invoice|tracking|awb|utr|sub[- ]?order)\s*(?:id|no\.?|number|#)?)\s*[:#\-–]?\s*[A-Za-z0-9][A-Za-z0-9\-\/]{3,}/gi;
  const NOT_CODE_L = /\b(?:order|txn|transaction|utr|ref(?:erence)?|invoice|mobile|phone|ph\.?|upi|booking|pnr|gstin|a\/c|account|ifsc|otp|tracking|awb|customer\s*id)\b/i;

  /** A code-shaped run at the start of a label's value: letters and digits,
   *  optionally grouped by single spaces or hyphens ("6014 8705 9059 0208",
   *  "AQ7K-2M9X-PL4T"). Spaces go (they are print layout); hyphens stay
   *  (Amazon claim codes carry them). */
  function codeFrom(v) {
    const m = String(v || "").match(/[A-Za-z0-9](?:[A-Za-z0-9]|[ \-](?=[A-Za-z0-9])){5,40}/);
    if (!m) return "";
    const t = m[0].replace(/ /g, "");
    return /\d/.test(t) && t.replace(/-/g, "").length >= 6 ? t.toUpperCase() : "";
  }
  /** PINs are digits; OCR reads 0 as O, 1 as I or l, 5 as S, 8 as B. */
  function pinFrom(v) {
    const m = String(v || "").match(/[0-9OoIlSB]{4,8}\b/);
    if (!m) return "";
    const t = m[0].replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
    return /^\d{4,8}$/.test(t) ? t : "";
  }
  function dateFrom(v) {
    const P = root.parse;
    const s = String(v || "").trim();
    if (!s) return "";
    const d = P.normalizeDate(s);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // A label line often has trailing words ("31/12/2026 11:59 PM IST").
    const m = s.match(/\d{1,2}[\/\-. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-. ,]*\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}|[A-Za-z]{3,9}\.? \d{4}/);
    if (m) { const d2 = P.normalizeDate(m[0]); if (/^\d{4}-\d{2}-\d{2}$/.test(d2)) return d2; }
    return "";
  }
  const money = (s) => String(s || "").replace(/,/g, "").replace(/\.0+$/, "");

  const COMMON_WORDS = new Set(["next", "max", "campus", "liberty", "forever", "gas", "mango", "coach",
    "dune", "shell", "district", "imagine", "cello", "pigeon", "prestige", "hammer", "cult", "steam",
    "titan", "arrow", "speedo", "tira", "skinn", "natural", "naturals", "lego", "uber", "ola"]);
  function findBrand(lines) {
    const B = root.brands;
    const words = (l) => l.split(/[^A-Za-z0-9&'+]+/).filter(Boolean);
    // Exact matches anywhere near the top first (a header, a logo's caption),
    // then typos - but only on longer words, so "Pay" or "Card" never
    // "corrects" into a store.
    for (const pass of ["exact", "fuzzy"]) {
      for (const line of lines.slice(0, 10)) {
        const w = words(line);
        for (let n = 3; n >= 1; n--) {
          for (let i = 0; i + n <= w.length; i++) {
            const phrase = w.slice(i, i + n).join(" ");
            if (pass === "fuzzy" && phrase.replace(/[^A-Za-z]/g, "").length < 5) continue;
            // A lone ordinary word ("Next", "Max", "Campus", "Shell", "Value")
            // is a store name only by coincidence; on a voucher it is usually
            // just a word. Multi-word phrases and the store's own line still count.
            if (n === 1 && (phrase.length < 4 || COMMON_WORDS.has(phrase.toLowerCase())) && w.length > 1) continue;
            const m = B.match(phrase);
            if (m && m.how === pass) return m.store.name;
          }
        }
      }
    }
    return "";
  }

  /** Label on one line, value on the next: "Card Number" / "6014 8705 ...". */
  function valueOrNext(lines, i, v, reader) {
    const got = reader(v);
    if (got) return got;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      if (!lines[j].trim()) continue;
      // Only borrow a BARE value. "Voucher 1  Rs.500" over "Code: FK..." is a
      // heading over a labelled line, and borrowing that code put it on the
      // heading's line - which then won the nearest-code vote for the
      // previous voucher's validity date.
      if ([PIN_L, CODE_L, EXP_L, AMT_L, ORDER_L].some((re) => re.test(lines[j]))) return "";
      return reader(lines[j]);
    }
    return "";
  }

  function extract(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const hits = { code: [], pin: [], expiry: [], amount: [], order: [] };

    lines.forEach((line, i) => {
      let m;
      if ((m = line.match(ORDER_L))) hits.order.push({ i, v: m[1].toUpperCase() });
      // The same line without its id / order / transaction runs (ID_RUN).
      const clean = line.replace(ID_RUN, " ").replace(/\s+/g, " ").trim();
      if ((m = clean.match(PIN_L))) {
        const v = valueOrNext(lines, i, m[1], pinFrom);
        if (v) hits.pin.push({ i, v });
        // "Code: AB12CD34  PIN: 4821" on one row - the code before the PIN.
        const before = clean.slice(0, clean.search(PIN_L));
        const cm = before.match(CODE_L);
        if (cm) { const cv = codeFrom(cm[1]); if (cv) hits.code.push({ i, v: cv, w: codeWeight(cm[0], cm[1]) }); }
      } else if ((m = clean.match(CODE_L))) {
        const v = valueOrNext(lines, i, m[1], codeFrom);
        if (v) hits.code.push({ i, v, w: codeWeight(m[0], m[1]) });
      }
      if ((m = line.match(EXP_L))) {
        const v = valueOrNext(lines, i, m[1], dateFrom);
        if (v) hits.expiry.push({ i, v });
      }
      if ((m = line.match(AMT_L))) {
        const v = money(m[1]);
        if (Number(v) > 0) hits.amount.push({ i, v });
      }
    });

    const brand = findBrand(lines);
    const orderNo = hits.order[0] ? hits.order[0].v : "";
    const key = (v) => String(v || "").replace(/[\s\-]/g, "").toUpperCase();

    // Labelled codes, once each (spacing and case aside). A "code" label beats
    // a "number" label two lines away or less: "Voucher number 1234 5678 /
    // Voucher code AB12-CD34" is ONE voucher whose code is AB12-CD34.
    let codes = hits.code.filter((h, k, a) => a.findIndex((x) => key(x.v) === key(h.v)) === k);
    codes = codes.filter((h) => !codes.some((o) => o !== h && Math.abs(o.i - h.i) <= 2 && (o.w || 2) > (h.w || 2)));
    let loose = false;
    // 1.3.11 (E2): an UNLABELLED list - a notes app with ten codes, an app's
    // "My vouchers" screen that prints the code on its own line. Two or more
    // distinct code-shaped lines, none next to an order/transaction/phone
    // word, are read as that many vouchers. A labelled code that is one of
    // them does not stop it.
    if (codes.length < 2) {
      const found = looseCodes(lines, orderNo, key);
      if (found.length >= 2 && (!codes.length || found.some((f) => key(f.v) === key(codes[0].v)))) {
        codes = found; loose = true;
      }
    }

    // Several codes: one voucher each. Each PIN / date / amount goes to the
    // NEAREST code by line (a tie goes to the code above - details usually
    // follow the code they belong to). The store is looked for among each
    // voucher's own lines first (a screen listing Amazon and Myntra cards),
    // then the screen's heading.
    if (codes.length >= 2) {
      const cards = codes.map((c) => ({ brand: "", code: c.v, pin: c.pin || "", amount: "", expiry: "", order_number: orderNo }));
      const near = (i) => {
        let best = 0, bd = Infinity;
        codes.forEach((c, k) => { const dd = Math.abs(c.i - i); if (dd < bd) { bd = dd; best = k; } });
        return best;
      };
      ["pin", "expiry", "amount"].forEach((f) => hits[f].forEach((h) => {
        const card = cards[near(h.i)];
        if (!card[f]) card[f] = h.v;
      }));
      const own = cards.map(() => []);
      lines.forEach((l, i) => own[near(i)].push(l));
      cards.forEach((c, k) => { c.brand = findBrand(own[k]) || brand || brandFromCode(c.code); });
      return { multi: true, loose, cards, text: lines.join("\n") };
    }

    // One voucher.
    const how = { brand: brand ? "label" : "", code: "", pin: "", expiry: "", amount: "" };
    const card = { brand, code: "", pin: "", amount: "", expiry: "", order_number: orderNo };
    if (codes[0]) { card.code = codes[0].v; how.code = "label"; }
    else {
      // No label: the longest code-shaped token that is not an order number,
      // a date or an Indian mobile number. Marked "guess" for the review.
      const one = looseCodes(lines, orderNo, key).sort((x, y) => key(y.v).length - key(x.v).length)[0];
      if (one) { card.code = one.v; how.code = "guess"; if (one.pin && !hits.pin[0]) { card.pin = one.pin; how.pin = "guess"; } }
    }
    if (hits.pin[0]) { card.pin = hits.pin[0].v; how.pin = "label"; }
    if (hits.expiry[0]) { card.expiry = hits.expiry[0].v; how.expiry = "label"; }
    if (hits.amount[0]) { card.amount = hits.amount[0].v; how.amount = "label"; }
    if (!card.brand && card.code) { card.brand = brandFromCode(card.code); if (card.brand) how.brand = "guess"; }
    return { multi: false, card, how, text: lines.join("\n") };
  }

  /** How strongly a label says "this is THE code": 3 for code / claim code /
   *  PIN-less redemption code, 2 for card / voucher number. */
  function codeWeight(label, value) {
    const l = String(label || "").slice(0, String(label || "").length - String(value || "").length).toLowerCase();
    return /code/.test(l) ? 3 : 2;
  }

  /** Code-shaped tokens, one per line (the longest): letters and digits with
   *  at least four digits, grouped or not. Not an order number, a phone
   *  number or a date, and not on a line that names one (NOT_CODE_L). A PIN
   *  printed after the code on the same line ("AB12CD34EF56  4821") comes
   *  with it. -> [{ i, v, pin }] */
  function looseCodes(lines, orderNo, key) {
    const out = [], seen = new Set();
    lines.forEach((line, i) => {
      line = line.replace(ID_RUN, " ");
      if (NOT_CODE_L.test(line) && !CODE_L.test(line)) return;
      if (PIN_L.test(line) && !CODE_L.test(line)) return;          // "PIN 123456" is not a code
      // Printed groups: fours split by spaces ("6001 2200 8855 1234"), or
      // hyphenated blocks ("AQ7K-2M9XPL-4TZ8"); else one unbroken run.
      const groups = (line.match(/\b[A-Za-z0-9]{4}(?: [A-Za-z0-9]{4}){2,4}\b/g) || [])
        .concat(line.match(/\b[A-Za-z0-9]{4,6}(?:-[A-Za-z0-9]{4,6}){2,4}\b/g) || []);
      const singles = line.match(/\b[A-Za-z0-9][A-Za-z0-9\-]{9,29}\b/g) || [];
      let best = "", bestTok = "";
      groups.concat(singles).forEach((tok) => {
        const t = tok.replace(/ /g, "").toUpperCase();
        const bare = t.replace(/-/g, "");
        if (bare.length < 8 || (bare.match(/\d/g) || []).length < 4) return;
        if (orderNo && bare === orderNo.replace(/-/g, "")) return;
        if (/^(?:\+?91)?[6-9]\d{9}$/.test(bare)) return;
        if (/^\d{4}-\d{2}-\d{2}$/.test(t) || /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(t)) return;
        if (bare.length > best.replace(/-/g, "").length) { best = t; bestTok = tok; }
      });
      if (!best || seen.has(key(best))) return;
      seen.add(key(best));
      // Same line: a bare 4-8 digit number beside the code is its PIN - but
      // not on a line that carries a date or an amount (a year, a price).
      const rest = line.replace(bestTok, " ");
      const pm = EXP_L.test(line) || AMT_L.test(rest) ? null : rest.match(/(?:^|\s)(\d{4,8})(?:\s|$)/);
      out.push({ i, v: best, pin: pm ? pm[1] : "" });
    });
    return out;
  }

  /** A code whose SHAPE names its store, for when nothing on the screen does:
   *  Amazon claim codes are 4-6-4 (or 4-6-5) letters and digits. */
  function brandFromCode(code) {
    return /^[A-Z0-9]{4}-[A-Z0-9]{6}-[A-Z0-9]{4,5}$/.test(String(code || "").toUpperCase()) ? "Amazon" : "";
  }

  root.scan = { preload, grab, grabColor, readCanvas, readNative, readImage, readImages, extract, terminate, rowsText,
    probeReader, nativeReader, reader, pdfPages, setBrightness, textZoom, _codeFrom: codeFrom, _pinFrom: pinFrom };
})(window.YCJ = window.YCJ || {});

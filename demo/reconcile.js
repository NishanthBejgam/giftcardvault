/*
 * reconcile.js - is what the reader read really on the voucher? (1.3.11)
 *
 * Every way a voucher comes in - the camera, a screenshot, a PDF, a shared or
 * pasted message, Collect mode, a CSV - ends in the same review, and before it
 * gets there each voucher goes through these checks, the gift-card twin of
 * Card Vault's Luhn / network-length / name checks:
 *
 *   code     OCR's letter-for-digit swaps undone on number-shaped codes
 *            (O->0, I/L->1, S->5, B->8 - only where at most two such
 *            letters sit in a long number), 6-30 characters, some digits,
 *            never an order / transaction id (scan.js cuts those out first)
 *   PIN      4-8 digits after the same swaps, and not a piece of the code
 *   amount   a sane gift card value (Rs 10 - Rs 5,00,000), at most 2 decimals
 *   expiry   a real date, not years out of range; one already gone is flagged
 *   store    present, and agreeing with a code whose shape names its store
 *
 * Pictures are read TWICE on a phone (as taken, and sharpened - scan.js) and
 * the two reads are reconciled field by field: what both reads agree on is
 * taken; what only one read saw, or where they differ, is kept but marked
 * Check in the review. The camera reconciles across frames instead (a value
 * locks only when two frames agree - app.js). Nothing is ever saved without
 * the user's tap; this decides only what is marked for a second look.
 *
 * Each voucher comes back with _guess: the fields to check.
 */
(function (root) {
  "use strict";

  const FIELDS = ["brand", "code", "pin", "amount", "expiry"];
  const LETTER_DIGIT = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", S: "5", B: "8", Z: "2", G: "6", T: "7" };
  const bare = (v) => String(v || "").replace(/[\s\-]/g, "").toUpperCase();

  /** A code as it should be: upper case, no spaces; on a code that is
   *  mostly digits (16-digit card numbers), letters OCR put in for digits are
   *  turned back. Hyphenated codes (Amazon's 4-6-4) keep their hyphens. */
  function normCode(v) {
    let t = String(v || "").replace(/\s+/g, "").toUpperCase();
    const b = t.replace(/-/g, "");
    // Only a NUMBER with one or two misread characters (a 16-digit card
    // number read as "6001 22O0 ..."): letters that are part of a code
    // ("AMZ...", "FKGC...") are never touched.
    const letters = b.replace(/\d/g, "");
    if (b.length >= 12 && letters.length <= 2 && /^[OQDILSBZGT|]*$/.test(letters)) t = t.replace(/[OQDILSBZGT|]/g, (c) => LETTER_DIGIT[c] || c);
    return t;
  }
  function codeOk(code) {
    const b = bare(code);
    return b.length >= 6 && b.length <= 30 && /^[A-Z0-9]+$/.test(b) && (b.match(/\d/g) || []).length >= 2;
  }
  function normPin(v) {
    return String(v || "").replace(/\s+/g, "").replace(/[OoQDIl|SBZ]/g, (c) => LETTER_DIGIT[c.toUpperCase()] || c);
  }
  function pinOk(pin, code) {
    if (!/^\d{4,8}$/.test(pin)) return false;
    if (/^(\d)\1+$/.test(pin)) return false;
    const b = bare(code);
    // A PIN the reader took from the code's own start or end (the two run
    // together on one line) is not a PIN.
    return !(b.length > pin.length && (b.startsWith(pin) || b.endsWith(pin)));
  }
  function amountOk(a) {
    const s = String(a || "").replace(/,/g, "");
    if (!s) return true;
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return false;
    const n = parseFloat(s);
    return n >= 10 && n <= 500000;
  }
  /** -> "" ok, "bad" (not a date / out of range), "past" */
  function expiryState(iso) {
    if (!iso) return "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "bad";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return "bad";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 864e5);
    if (days < -3 * 365 || days > 10 * 365) return "bad";
    return days < 0 ? "past" : "";
  }
  const CODE_STORE = [[/^[A-Z0-9]{4}-[A-Z0-9]{6}-[A-Z0-9]{4,5}$/, /^amazon/i]];

  /** One voucher on its own (paste, CSV, a single read). -> card with _guess. */
  function check(c) {
    const out = Object.assign({}, c);
    const g = new Set(c._guess || []);
    out.code = normCode(c.code);
    if (!codeOk(out.code)) g.add("code");
    if (c.pin) {
      const p = normPin(c.pin);
      if (pinOk(p, out.code)) out.pin = p;
      else { out.pin = /^\d{4,8}$/.test(p) ? p : c.pin; g.add("pin"); }
    }
    if (c.amount && !amountOk(c.amount)) g.add("amount");
    const es = expiryState(c.expiry);
    if (es === "bad") g.add("expiry");
    if (!String(c.brand || "").trim()) g.add("brand");
    for (const [re, store] of CODE_STORE) {
      if (re.test(out.code) && out.brand && !store.test(out.brand)) g.add("brand");
    }
    out._guess = [...g];
    return out;
  }

  function dist(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 1) return 9;
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  /**
   * Two independent reads of the same picture(s) -> one list.
   * A voucher both reads found (same code, or one character apart) keeps the
   * fields they agree on; a field only one saw, or they disagree on, is
   * marked; a code one character apart is marked. A voucher only one read
   * found is kept with its code marked.
   */
  function reconcile(listA, listB) {
    const A = (listA || []).map(check), B = (listB || []).map(check);
    const used = new Set();
    const out = A.map((a) => {
      const ka = bare(a.code);
      let bi = B.findIndex((b, i) => !used.has(i) && bare(b.code) === ka);
      if (bi < 0) bi = B.findIndex((b, i) => !used.has(i) && dist(bare(b.code), ka) <= 1);
      if (bi < 0) return Object.assign(a, { _guess: [...new Set(a._guess.concat("code"))], _once: true });
      used.add(bi);
      const b = B[bi], g = new Set(a._guess.filter((f) => b._guess.includes(f)));
      const merged = Object.assign({}, a);
      FIELDS.forEach((f) => {
        const va = String(a[f] || "").trim(), vb = String(b[f] || "").trim();
        if (f === "code") { if (bare(va) !== bare(vb)) { g.add("code"); if (!codeOk(va) && codeOk(vb)) merged.code = vb; } return; }
        if (va === vb) return;
        if (!va && vb) { merged[f] = vb; g.add(f); return; }
        if (va && !vb) { g.add(f); return; }
        // Both read something different: keep the one that passes its check.
        const okA = !check(Object.assign({}, a))._guess.includes(f), okB = !check(Object.assign({}, b))._guess.includes(f);
        if (!okA && okB) merged[f] = vb;
        g.add(f);
      });
      merged._guess = [...g];
      return merged;
    });
    B.forEach((b, i) => { if (!used.has(i)) out.push(Object.assign(b, { _guess: [...new Set(b._guess.concat("code"))], _once: true })); });
    return out;
  }

  root.reconcile = { check, reconcile, normCode, codeOk, pinOk, amountOk, expiryState };
})(window.YCJ = window.YCJ || {});

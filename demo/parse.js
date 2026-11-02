/*
 * parse.js - Gift Card Vault's paste parser, ported from app.py.
 *
 * This is the one genuinely non-trivial port in the whole mobile line. It is a
 * direct translation, function for function and regex for regex, of the Python
 * in giftcard-vault-v2/app.py:
 *
 *     normalize_date  _safe_date  _find_date  extract_fields
 *     _line_has_card_signal  parse_paste  _amount_value  _normalize_card
 *
 * It was translated rather than replaced because the parser IS the product's
 * value: it is what turns a forwarded voucher email into rows without typing.
 * A "close enough" reimplementation would silently classify the odd field
 * differently, and the user would only find out when a code was in the notes.
 *
 * Two Python->JS traps this file has already had to step around, both of which
 * produce a parser that looks fine and is wrong:
 *
 *  1. `re.fullmatch` has no JS equivalent. Every fullmatch is anchored with
 *     ^...$ here. Missing one anchor turns an exact-match branch into a
 *     substring match, and "12/2027" starts matching inside "0012/20279".
 *  2. Python's `\b` and JS's `\b` agree, but Python's `re.I` on a character
 *     class built from `_MON_RE` needs the same alternation ordering -
 *     longest-first - or "jan" wins over "january" and the year is eaten as a
 *     day. The sort below is not cosmetic.
 *
 * Dates are resolved against the DEVICE clock, exactly as the desktop resolves
 * them against the PC clock. "tomorrow" in a pasted email means tomorrow from
 * when you paste it, which is the intended reading.
 */

(function (root) {
  "use strict";

  const MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
    october: 10, nov: 11, november: 11, dec: 12, december: 12,
  };
  // Longest first, so "september" is tried before "sep". See trap 2 above.
  const MON_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

  // --- date arithmetic ----------------------------------------------------
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();   // m is 1-based

  function iso(y, m, d) {
    return String(y).padStart(4, "0") + "-" +
           String(m).padStart(2, "0") + "-" +
           String(d).padStart(2, "0");
  }
  function isoOf(dt) { return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); }

  function addDays(dt, n) {
    const d = new Date(dt.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function addMonths(dt, n) {
    const m = dt.getMonth() + n;
    const y = dt.getFullYear() + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    return new Date(y, mm, Math.min(dt.getDate(), daysInMonth(y, mm + 1)));
  }
  function eom(y, m) { return iso(y, m, daysInMonth(y, m)); }

  /** Reject impossible dates ("31 Feb") rather than letting JS roll them over
   *  into March, which is what a naive `new Date(y, m-1, d)` would do and is
   *  how a typo silently becomes a plausible-looking expiry. */
  function safeDate(y, m, d) {
    if (m < 1 || m > 12) return "";
    if (d < 1 || d > daysInMonth(y, m)) return "";
    return iso(y, m, d);
  }

  /** Turn almost any date phrase into 'YYYY-MM-DD', else ''. */
  function normalizeDate(s) {
    if (!s) return "";
    let t = String(s).trim().toLowerCase().replace(/\.+$/, "");
    const today = new Date();
    let m;

    const rel = { today: 0, tdy: 0, tonight: 0, tomorrow: 1, tmrw: 1, tom: 1, yesterday: -1 };
    if (Object.prototype.hasOwnProperty.call(rel, t)) return isoOf(addDays(today, rel[t]));
    if (["eom", "end of month", "end of the month", "month end"].indexOf(t) >= 0) {
      return eom(today.getFullYear(), today.getMonth() + 1);
    }
    if (["eoy", "end of year", "end of the year", "year end"].indexOf(t) >= 0) {
      return iso(today.getFullYear(), 12, 31);
    }

    m = t.match(/^next\s+(week|month|year)$/);
    if (m) {
      if (m[1] === "week") return isoOf(addDays(today, 7));
      if (m[1] === "month") return isoOf(addMonths(today, 1));
      return iso(today.getFullYear() + 1, today.getMonth() + 1, Math.min(today.getDate(), 28));
    }

    m = t.match(/^(?:in\s+)?(\d+)\s*(day|week|month|year)s?(?:\s*(?:from now|later))?$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (m[2] === "day") return isoOf(addDays(today, n));
      if (m[2] === "week") return isoOf(addDays(today, n * 7));
      if (m[2] === "month") return isoOf(addMonths(today, n));
      return isoOf(addMonths(today, n * 12));
    }

    // ISO  YYYY-MM-DD
    m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return safeDate(+m[1], +m[2], +m[3]);

    // DD/MM/YYYY (day-first, Indian) or DD/MM/YY
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
      let d = +m[1], mo = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      if (mo > 12 && d <= 12) { const tmp = d; d = mo; mo = tmp; }   // looks like MM/DD
      return safeDate(y, mo, d);
    }

    // MM/YYYY or MM/YY -> end of that month
    m = t.match(/^(\d{1,2})[-/.](\d{2,4})$/);
    if (m) {
      let mo = +m[1], y = +m[2];
      if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12) return eom(y, mo);
    }

    // "Dec 2027" / "December 2027"
    m = t.match(new RegExp("^(" + MON_RE + ")\\.?\\s+(\\d{4})$"));
    if (m) return eom(+m[2], MONTHS[m[1]]);

    // "Dec 12 2027" / "December 12, 2027" / "Dec 12"
    m = t.match(new RegExp("^(" + MON_RE + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{2,4}))?$"));
    if (m) {
      let y = m[3] ? +m[3] : today.getFullYear();
      if (y < 100) y += 2000;
      return safeDate(y, MONTHS[m[1]], +m[2]);
    }

    // "12 Dec 2027" / "12th December 2027" / "12 Dec"
    m = t.match(new RegExp("^(\\d{1,2})(?:st|nd|rd|th)?\\s+(" + MON_RE + ")\\.?(?:[,\\s]+(\\d{2,4}))?$"));
    if (m) {
      let y = m[3] ? +m[3] : today.getFullYear();
      if (y < 100) y += 2000;
      return safeDate(y, MONTHS[m[2]], +m[1]);
    }

    return "";
  }

  // Locates a date-ish substring inside a larger rough string.
  const DATE_FIND = new RegExp(
    "\\b(?:today|tonight|tomorrow|tmrw|tom|yesterday|eom|eoy" +
    "|end of (?:the )?(?:month|year)" +
    "|next (?:week|month|year)" +
    "|(?:in )?\\d+\\s*(?:day|week|month|year)s?(?: (?:from now|later))?" +
    "|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}" +
    "|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}" +
    "|\\d{1,2}[-/.]\\d{2,4}" +
    "|\\d{1,2}(?:st|nd|rd|th)?\\s*(?:" + MON_RE + ")\\.?(?:\\s*\\d{2,4})?" +
    "|(?:" + MON_RE + ")\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?,?(?:\\s*\\d{2,4})?" +
    "|(?:" + MON_RE + ")\\.?\\s*\\d{4})\\b", "i");

  function findDate(text) {
    const m = DATE_FIND.exec(text);
    if (!m) return ["", null];
    const val = normalizeDate(m[0]);
    return val ? [val, [m.index, m.index + m[0].length]] : ["", null];
  }

  // --- field extraction ---------------------------------------------------
  const URL_RE = /https?:\/\/\S+/i;
  const AMOUNT_KW_RE = /(?:Rs\.?|₹|INR|\$|amount|value|worth|bal(?:ance)?|for)\s*[:\-]?\s*([\d,]+(?:\.\d{1,2})?)/i;
  const CODE_KW_RE = /(?:voucher\s*code|gift\s*card\s*(?:no|number|code)?|card\s*(?:no|number)|code|cardno)\s*[:#\-]?\s*([A-Za-z0-9][A-Za-z0-9\-]{4,})/i;
  const ORDER_RE = /order\s*(?:number|no|id)?\s*[:#\-]?\s*([A-Za-z0-9\-]{5,})/i;
  const PIN_KW_RE = /(?:pin|cvv|security\s*code|secret)\s*[:#\-]?\s*([A-Za-z0-9]{3,8})/i;
  const EXPIRY_KW_RE = /(?:expir\w*|valid\s*(?:till|until|upto|thru)?|validity|exp|use\s*by|good\s*(?:till|until))\s*[:\-]?\s*(.+)/i;

  // Code shapes. Codes never span words, so none of these allow a space
  // except SPACED_DIGITS, which is the deliberate "1234 5678 9012" case.
  const GROUPED_CODE = /\b[A-Za-z0-9]{2,}(?:-[A-Za-z0-9]{2,}){1,}\b/;      // FK-9981-2207-5540
  const SPACED_DIGITS = /\b\d{4}(?: \d{4}){2,}\b/;                          // 1234 5678 9012
  const LONG_DIGITS = /\b\d{10,20}\b/;                                      // 6014870590590208
  const ALNUM_CODE = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,}\b/;  // NYK00091234
  const NUMBER = /\b\d{2,7}\b/;

  const NOISE_WORDS = new Set(["rs", "inr", "code", "pin", "cvv", "amount", "value",
    "worth", "balance", "bal", "expiry", "expires", "expire", "exp", "valid",
    "validity", "till", "until", "upto", "thru", "order", "number", "no",
    "voucher", "gift", "card", "secret", "for", "use", "by", "good", "and",
    "the", "rupees", "rupee", "just", "my", "got", "have", "has", "this", "a",
    "an", "of", "with", "is", "added"]);

  function stripSpan(text, span) {
    return text.slice(0, span[0]) + " " + text.slice(span[1]);
  }

  /** Read one rough description and classify its tokens into card fields.
   *  Returns null when nothing usable was found - the caller drops those, so
   *  a signature block at the bottom of an email does not become a card. */
  function extractFields(chunk, brandHint) {
    let work = " " + String(chunk || "").trim() + " ";
    const f = { brand: "", code: "", pin: "", amount: "", expiry: "",
                order_number: "", redeem_url: "", notes: "", status: "active" };
    let m;

    // 1. URL
    m = URL_RE.exec(work);
    if (m) {
      f.redeem_url = m[0];
      work = stripSpan(work, [m.index, m.index + m[0].length]);
    }

    // 2. labelled fields first (strongest signal). Order matters: an "order
    //    number" would otherwise be claimed by the looser code pattern.
    const labelled = [["order_number", ORDER_RE], ["pin", PIN_KW_RE],
                      ["code", CODE_KW_RE], ["amount", AMOUNT_KW_RE]];
    for (const [key, rx] of labelled) {
      m = rx.exec(work);
      if (m) {
        f[key] = m[1].trim();
        work = stripSpan(work, [m.index, m.index + m[0].length]);
      }
    }

    m = EXPIRY_KW_RE.exec(work);
    if (m) {                                  // take a date out of the tail
      const [val, span] = findDate(m[1]);
      if (val) {
        f.expiry = val;
        // m[1] starts where the whole match ends minus its own length - the
        // Python used m.start(1); JS has no group offsets, so it is derived.
        const g1start = m.index + m[0].length - m[1].length;
        work = work.slice(0, g1start + span[0]) + " " + work.slice(g1start + span[1]);
      }
    }

    // 3. unlabelled date anywhere
    if (!f.expiry) {
      const [val, span] = findDate(work);
      if (val) { f.expiry = val; work = stripSpan(work, span); }
    }

    // 4. unlabelled code
    if (!f.code) {
      for (const rx of [GROUPED_CODE, SPACED_DIGITS, LONG_DIGITS, ALNUM_CODE]) {
        m = rx.exec(work);
        if (m) {
          f.code = m[0].trim();
          work = stripSpan(work, [m.index, m.index + m[0].length]);
          break;
        }
      }
    }

    // 5. unlabelled amount: prefer currency-tagged, else a standalone number
    if (!f.amount) {
      m = /(?:Rs\.?|₹|INR|\$)\s?([\d,]+(?:\.\d{1,2})?)/i.exec(work);
      if (m) {
        f.amount = m[1];
        work = stripSpan(work, [m.index, m.index + m[0].length]);
      } else {
        m = NUMBER.exec(work);
        if (m) {
          f.amount = m[0];
          work = stripSpan(work, [m.index, m.index + m[0].length]);
        }
      }
    }

    // 6. unlabelled PIN: a leftover 3-6 digit number
    if (!f.pin) {
      m = /\b\d{3,6}\b/.exec(work);
      if (m) { f.pin = m[0]; work = stripSpan(work, [m.index, m.index + m[0].length]); }
    }

    // 7. brand = whatever readable words are left
    f.amount = f.amount.replace(/[,\s]/g, "");
    const words = work.split(/[^A-Za-z&]+/).filter((w) => w && !NOISE_WORDS.has(w.toLowerCase()));
    if (words.length) f.brand = words.join(" ").trim();
    if (!f.brand) f.brand = brandHint || "";

    if (!(f.code || f.amount || f.brand || f.expiry)) return null;
    return f;
  }

  function lineHasCardSignal(line) {
    return GROUPED_CODE.test(line) || SPACED_DIGITS.test(line) ||
           LONG_DIGITS.test(line) || ALNUM_CODE.test(line) ||
           /\d{3,}/.test(line) || /(?:Rs\.?|₹|\$)/i.test(line);
  }

  /**
   * Split a rough pasted blob into individual cards and classify each one.
   *   - vouchers_*.txt style ('#N  Rs.XXX' blocks) -> one card per block
   *   - several cards, one rough description per line -> one card per line
   *   - a single multi-line description (e.g. an email) -> one card
   */
  function parsePaste(text, defaultBrand) {
    text = String(text || "").trim();
    if (!text) return [];

    let brandHint = defaultBrand || "";
    const first = text.split(/\r?\n/)[0] || "";
    const bm = first.match(/^([A-Za-z][A-Za-z &]+?)\s+vouchers?\b/i);
    if (bm && !brandHint) brandHint = bm[1].trim();

    // vouchers_*.txt: split on '#N ...' header lines
    const blocks = text.split(/^[ \t]*#\d+\b.*$/m);
    const headers = text.match(/^[ \t]*#\d+\b.*$/gm) || [];
    if (blocks.length > 1) {
      const cards = [];
      for (let i = 0; i < headers.length && i + 1 < blocks.length; i++) {
        // Python captured the text AFTER '#N'; the JS match keeps the whole
        // line. Harmless - '#12' contributes only noise words and a number
        // that the block body always outweighs.
        const c = extractFields(headers[i] + "\n" + blocks[i + 1], brandHint);
        if (c) cards.push(c);
      }
      if (cards.length) return cards;
    }

    // blank-line separated groups
    const groups = text.split(/\n\s*\n/).filter((g) => g.trim());
    const records = [];
    for (const g of groups) {
      const lines = g.split(/\r?\n/).filter((l) => l.trim());
      const signals = lines.reduce((n, l) => n + (lineHasCardSignal(l) ? 1 : 0), 0);
      if (lines.length > 1 && signals >= Math.max(2, Math.floor((lines.length + 1) / 2))) {
        for (const l of lines) records.push(l);      // one card per line
      } else {
        records.push(g);                              // one card for the group
      }
    }

    const cards = [];
    for (const r of records) {
      const c = extractFields(r, brandHint);
      if (c) cards.push(c);
    }
    return cards;
  }

  // --- normalisation ------------------------------------------------------
  /** 'Rs.1,000' -> '1000'. */
  function amountValue(s) {
    return String(s == null ? "" : s).replace(/[^\d.]/g, "");
  }

  const CARD_KEYS = ["brand", "code", "pin", "amount", "balance", "expiry",
                     "order_number", "redeem_url", "notes", "status"];

  function normalizeCard(c) {
    const out = {};
    for (const k of CARD_KEYS) out[k] = String(c[k] == null ? "" : c[k]).trim();
    if (["active", "redeemed", "expired"].indexOf(out.status) < 0) out.status = "active";
    out.amount = amountValue(out.amount);
    out.balance = amountValue(out.balance);
    if (!out.balance) out.balance = out.amount;    // remaining defaults to face value
    // Keep whatever the user typed when it cannot be understood - inventing a
    // date is worse than showing an odd one.
    if (out.expiry) out.expiry = normalizeDate(out.expiry) || out.expiry;
    return out;
  }

  root.parse = { normalizeDate, parsePaste, extractFields, normalizeCard, amountValue };
})(window.YCJ = window.YCJ || {});

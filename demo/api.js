/*
 * api.js - Gift Card Vault's local API.
 *
 * Same shape and same reasoning as Card Vault's: the desktop front end talks
 * to a Python server over localhost, there is no server on a phone, so this
 * answers the identical routes in-process and app.js did not have to change.
 *
 * The only route with real work behind it is /api/parse, which is what turns
 * a pasted voucher email into rows. That logic lives in parse.js, translated
 * from app.py rather than reinvented - see the note at the top of that file.
 */

(function (root) {
  "use strict";

  const store = new root.Store("giftcard-vault");
  const VAULT = new root.Vault(store);
  const P = root.parse;


  // Everything handed out of this module is a COPY.
  //
  // The desktop's Python server serialises its state into an HTTP response, so
  // the front end necessarily works on its own objects and has to write local
  // changes itself - which is exactly what app.js does:
  //
  //     await api.send('/api/cards/' + id, 'PUT', { addon: !card.addon });
  //     card.addon = !card.addon;
  //
  // When this in-process API returned VAULT.items directly, those were the
  // SAME objects, so the PUT already applied the change and the line after it
  // flipped the value straight back. The write reached the file correctly, so
  // the change only became visible after locking and unlocking - which is
  // precisely how it was reported from the device.
  //
  // Copying here restores the semantics app.js was written against, and rules
  // out the whole family of aliasing bugs where the UI mutates vault state
  // without going through save().
  const copy = (v) => JSON.parse(JSON.stringify(v));

  // One spelling per store, at the data layer too - but EXACT matches only
  // ("FLIPKART", "Flipkart Gift Card", "FK"). A typo-level guess is the UI's
  // job, where the user sees it and can undo it; here it would be silent.
  const storeName = (c) => Object.assign({}, c, { brand: root.brands.canonical(c.brand || "", true) });

  // 1.3.11: fields the desktop parser does not know (parse.js stays its
  // line-for-line twin), carried through normalising here instead.
  //   purchased   purchase date, YYYY-MM-DD (B9)
  //   no_expiry   "1" when the user said the card never expires (B9)
  //   tr          when THIS phone's free trial began, ms (C6). Stamped on
  //               every card so an exported file carries it; importing that
  //               file brings the earlier date back (billing.adoptTrialStart).
  const EXTRA = ["purchased", "no_expiry"];
  function card(src) {
    const out = P.normalizeCard(storeName(src));
    EXTRA.forEach((k) => { if (src[k] != null) out[k] = String(src[k]).trim(); });
    out.tr = String(root.billing.trialStart());
    return out;
  }
  /** The earliest trial date among the vault's cards wins (C6). Cards from
   *  before 1.3.11 get this phone's date, once. */
  async function settleTrial() {
    let missing = false, min = 0;
    for (const it of VAULT.items) {
      const t = parseInt(it.tr, 10) || 0;
      if (!t) { missing = true; continue; }
      if (!min || t < min) min = t;
    }
    if (min) root.billing.adoptTrialStart(min);
    if (missing) {
      const mine = String(root.billing.trialStart());
      VAULT.items.forEach((it) => { if (!(parseInt(it.tr, 10) > 0)) it.tr = mine; });
      try { await VAULT.save(); } catch (e) { /* stamped next time */ }
    }
  }

  async function get(path) {
    if (path === "/api/licence") {
      // No licence gate in the store builds. Kept only so a stray caller gets
      // a sane answer; host_platform is what suppresses the Mac Quit control.
      return { state: "ACTIVE", usable: true, read_only: false,
               message: "", machine_id: "", host_platform: platformName() };
    }
    if (path === "/api/status") {
      return { exists: await VAULT.exists(), unlocked: VAULT.unlocked };
    }
    if (path === "/api/cards") {
      if (!VAULT.unlocked) return { error: "locked" };
      return { cards: copy(VAULT.items) };
    }
    if (path === "/api/backups") {
      return { backups: await store.listBackups() };
    }
    return { error: "not found" };
  }

  async function send(path, method, body) {
    body = body || {};
    method = (method || "POST").toUpperCase();

    if (method === "POST" && path === "/api/unlock") {
      const pw = body.password || "";
      if (!pw) return { error: "password required" };
      if (!(await VAULT.exists())) {
        await VAULT.create(pw);
        return { ok: true, created: true, cards: copy(VAULT.items) };
      }
      if (await VAULT.unlock(pw)) { await settleTrial(); return { ok: true, cards: copy(VAULT.items) }; }
      return { error: "wrong password" };
    }

    if (method === "POST" && path === "/api/lock") {
      VAULT.lock();
      return { ok: true };
    }

    // Confirms the master password without changing session state. Gates
    // turning on fingerprint unlock - same route, same full-cost PBKDF2 run
    // as Card Vault's. (Deleting a card deliberately does NOT ask for it in
    // this app - the user's call, 03-Oct-2026.)
    if (method === "POST" && path === "/api/verify") {
      return { ok: await VAULT.verify(body.password || "") };
    }

    // Parsing touches no stored data, so like the desktop it stays available
    // whether or not the vault is open - the preview step runs before a user
    // has committed to anything.
    if (method === "POST" && path === "/api/parse") {
      let cards = [];
      try {
        cards = P.parsePaste(body.text || "", body.brand || "").map(P.normalizeCard);
      } catch (e) {
        cards = [];       // a parser crash must never block the paste screen
      }
      return { cards: cards, count: cards.length };
    }

    if (!VAULT.unlocked) return { error: "locked" };

    // Change master password (1.3.9): re-encrypts the vault in place.
    if (method === "POST" && path === "/api/password") {
      const ok = await VAULT.changePassword(body.current || "", body.next || "");
      return ok ? { ok: true } : { error: "wrong password" };
    }

    if (method === "POST" && path === "/api/cards") {
      return { card: copy(await VAULT.add(card(body))) };
    }

    if (method === "POST" && path === "/api/cards/bulk") {
      const rows = (body.cards || []).map(card);
      const added = await VAULT.addMany(rows);
      return { added: copy(added), count: added.length };
    }

    // 1.3.11 (B7): delete every card of a store in one write, and put them
    // back exactly (same ids, same dates) if the user taps Undo.
    if (method === "POST" && path === "/api/cards/delete-many") {
      const ids = new Set(body.ids || []);
      const gone = VAULT.items.filter((it) => ids.has(it.id));
      if (!gone.length) return { removed: [], count: 0 };
      VAULT.items = VAULT.items.filter((it) => !ids.has(it.id));
      await VAULT.save();
      return { removed: copy(gone), count: gone.length };
    }
    if (method === "POST" && path === "/api/cards/restore") {
      const have = new Set(VAULT.items.map((it) => it.id));
      const back = (body.cards || []).filter((it) => it && it.id && !have.has(it.id)).map(copy);
      back.forEach((it) => VAULT.items.push(it));
      if (back.length) await VAULT.save();
      return { restored: copy(back), count: back.length };
    }

    if (method === "POST" && path === "/api/import") {
      const rows = P.parsePaste(body.text || "", body.brand || "").map(card);
      const added = await VAULT.addMany(rows);
      return { added: copy(added), count: added.length };
    }

    if (path.indexOf("/api/cards/") === 0) {
      const id = path.split("/").pop();
      if (method === "PUT") {
        // The desktop passes the body through unnormalised on PUT, so an edit
        // can set a partial field without the whole record being rebuilt.
        // Matched here deliberately, including the quirk.
        const card = await VAULT.update(id, body);
        return card ? { card: copy(card) } : { error: "not found" };
      }
      if (method === "DELETE") {
        return { ok: await VAULT.remove(id) };
      }
    }

    if (method === "POST" && path === "/api/export") {
      const bytes = await VAULT.exportBytes();
      if (!bytes) return { error: "nothing to export" };
      // 1.3.11: GiftCardVault_<date>_<time>.dat - says what it is and when.
      const t = root.storeHelpers.stamp();             // 20261102-153045
      const name = "GiftCardVault_" + t.slice(0, 4) + "-" + t.slice(4, 6) + "-" + t.slice(6, 8) + "_" + t.slice(9, 13) + ".dat";
      await root.mobile.shareFile(name, bytes, "Gift Card Vault backup");
      return { ok: true, filename: name };
    }

    return { error: "not found" };
  }

  async function importVault(password, bytes, mode) {
    try {
      const res = await VAULT.importBytes(password, bytes, mode);
      await settleTrial();          // the file's trial date comes with it (C6)
      return Object.assign({ ok: true }, res);
    } catch (e) {
      if (e.name === "InvalidToken") {
        return { ok: false, error: "That password does not open this file." };
      }
      if (e.message === "locked") {
        return { ok: false, error: "Unlock this vault before merging into it." };
      }
      return { ok: false, error: "That file is not a Gift Card Vault backup." };
    }
  }

  function platformName() {
    if (window.Capacitor && window.Capacitor.getPlatform) return window.Capacitor.getPlatform();
    return "web";
  }

  root.api = { get, send };
  root.vault = VAULT;
  root.importVault = importVault;
})(window.YCJ = window.YCJ || {});

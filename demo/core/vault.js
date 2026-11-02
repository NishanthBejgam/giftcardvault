/*
 * vault.js - the in-memory vault, ported line-for-line from the desktop's
 * Python `class Vault`. Same states, same rules, same failure behaviour.
 *
 * The important structural point: on the desktop the vault lives in the server
 * process and the browser only ever sees decrypted JSON over localhost. On the
 * phone there is no server, so the vault lives here, inside the WebView, and
 * the front end talks to it through a fetch-shaped shim (see each app's
 * api.js). That shim is why the two apps' UI code is unchanged from the
 * desktop build - it still calls `/api/cards`; the call just never leaves the
 * process now.
 *
 * Two properties are preserved deliberately because they are what the product
 * promises:
 *   1. The master password is never stored, anywhere, in any form. It exists
 *      only long enough to derive keys; `lock()` drops the derived keys too.
 *   2. Nothing is written unencrypted. Ever. Including during import/export.
 */

(function (root) {
  "use strict";

  const Fernet = root.Fernet;

  function Vault(store) {
    this.store = store;
    this.unlocked = false;
    this.items = [];
    this._keys = null;      // derived CryptoKeys, dropped on lock()
    this._salt = null;
  }

  Vault.prototype.exists = function () {
    return this.store.exists();
  };

  /** First run: create a fresh encrypted vault with the chosen password. */
  Vault.prototype.create = async function (password) {
    const sealed = await Fernet.sealFile(password, []);
    this._keys = sealed.keys;
    this._salt = sealed.salt;
    this.items = [];
    this.unlocked = true;
    // No backup on creation: there is nothing yet to protect, and rotating an
    // empty file into the ring is exactly what the desktop refuses to do.
    await this.store.write(sealed.bytes, { backup: false });
  };

  /** Returns true on success, false on a wrong password. Never throws for a
   *  wrong password - the caller shows a message, not a stack trace. */
  Vault.prototype.unlock = async function (password) {
    const bytes = await this.store.read();
    if (!bytes) return false;
    try {
      const opened = await Fernet.openFile(password, bytes);
      this._keys = opened.keys;
      this._salt = opened.salt;
      this.items = Array.isArray(opened.data) ? opened.data : [];
      this.unlocked = true;
      return true;
    } catch (e) {
      if (e.name === "InvalidToken") return false;
      throw e;
    }
  };

  /** Confirm the master password without changing session state. Gates the
   *  one destructive action (deleting a card). Costs a full PBKDF2 run, which
   *  is the point - it must not be cheap to guess against. */
  Vault.prototype.verify = async function (password) {
    const bytes = await this.store.read();
    if (!bytes) return false;
    try {
      await Fernet.openFile(password, bytes);
      return true;
    } catch (e) {
      return false;
    }
  };

  /**
   * Change the master password (Card Vault 1.3.5). The current one is checked
   * against the file on disk, not trusted from the session. The cards are then
   * sealed afresh - new salt, new keys, the same 390k PBKDF2 - so the file is
   * byte-for-byte what a vault created with the new password would be and
   * still opens on the desktop.
   *
   * 1.3.9: the automatic backup ring is then replaced by ONE copy under the
   * new password. Before, its 20 copies kept the OLD password - so a user who
   * changed a password because it had leaked still had files on the phone
   * that the leaked one opened. Exports the user made earlier are theirs and
   * keep the password they were made with (Settings says so). Returns false on
   * a wrong current password.
   */
  Vault.prototype.changePassword = async function (current, next) {
    if (!this.unlocked) throw new Error("locked");
    if (!next) throw new Error("new password required");
    if (!(await this.verify(current))) return false;
    const sealed = await Fernet.sealFile(next, this.items);
    await this.store.write(sealed.bytes);
    this._keys = sealed.keys;
    this._salt = sealed.salt;
    try { await this.store.resetBackups(); } catch (e) { /* best effort, as every backup step */ }
    return true;
  };

  Vault.prototype.lock = function () {
    this.unlocked = false;
    this._keys = null;
    this._salt = null;
    this.items = [];
  };

  Vault.prototype.save = async function () {
    if (!this.unlocked) throw new Error("locked");
    // Reuses the already-derived keys, so a save is milliseconds while the
    // unlock that preceded it was ~1s. Re-deriving here would make every
    // keystroke-triggered save feel broken.
    const bytes = await Fernet.resealFile(this._keys, this._salt, this.items);
    await this.store.write(bytes);
  };

  // --- item operations ----------------------------------------------------
  Vault.prototype.add = async function (item) {
    item.id = randomId();
    item.created_at = Math.floor(Date.now() / 1000);
    this.items.push(item);
    await this.save();
    return item;
  };

  /** Add many without paying the encrypt+write cost per row. The desktop can
   *  afford add()-in-a-loop; a phone importing 200 gift cards cannot. */
  Vault.prototype.addMany = async function (items) {
    const now = Math.floor(Date.now() / 1000);
    const added = items.map((it) => {
      it.id = randomId();
      it.created_at = now;
      this.items.push(it);
      return it;
    });
    if (added.length) await this.save();
    return added;
  };

  Vault.prototype.update = async function (id, fields) {
    for (const it of this.items) {
      if (it.id === id) {
        Object.assign(it, fields);
        await this.save();
        return it;
      }
    }
    return null;
  };

  Vault.prototype.remove = async function (id) {
    const before = this.items.length;
    this.items = this.items.filter((it) => it.id !== id);
    if (this.items.length !== before) {
      await this.save();
      return true;
    }
    return false;
  };

  // --- moving a vault between devices -------------------------------------
  // Export hands back the encrypted file exactly as stored. It is safe to
  // email to yourself or drop in a cloud folder ONLY in the sense that it is
  // useless without the master password - the app still tells the user to
  // treat it as sensitive, because a stolen file plus a guessable password is
  // a real attack and 390k PBKDF2 rounds only buys so much time.
  Vault.prototype.exportBytes = function () {
    return this.store.read();
  };

  /**
   * Import a vault.dat produced by the Windows, Mac or phone app.
   *
   * `mode`:
   *   "replace" - the imported file becomes this device's vault outright.
   *   "merge"   - imported items are appended to the current vault, skipping
   *               ones already present. Requires the vault to be unlocked.
   *
   * Merge identity is the item `id`, which every build generates the same way
   * (16 random hex characters). Two independently-added copies of the same
   * physical card therefore merge as two rows, and that is the correct,
   * conservative behaviour: silently collapsing rows that merely look alike
   * would delete real data. The user can remove a duplicate; they cannot undo
   * a deletion that never asked.
   */
  Vault.prototype.importBytes = async function (password, bytes, mode) {
    const opened = await Fernet.openFile(password, bytes);   // throws InvalidToken
    const incoming = cleanIncoming(opened.data);

    if (mode === "merge") {
      if (!this.unlocked) throw new Error("locked");
      const have = new Set(this.items.map((it) => it.id));
      const fresh = incoming.filter((it) => it && it.id && !have.has(it.id));
      for (const it of fresh) this.items.push(it);
      await this.save();
      return { added: fresh.length, skipped: incoming.length - fresh.length, total: this.items.length };
    }

    // Replace.
    //
    // The imported CARDS replace what is here. The imported PASSWORD does not.
    //
    // The first version wrote the incoming file verbatim and adopted its salt
    // and keys, so restoring a backup from a PC silently changed the phone's
    // master password to the PC's. From the user's side the password they had
    // chosen on this device simply stopped working, with nothing to explain
    // why. The password is a per-device choice; a restore is about the data.
    //
    // So when this vault is already open, the incoming rows are re-encrypted
    // under the EXISTING keys and saved normally. store.write rotates the
    // current file into backups/ first, so a wrong import is recoverable.
    if (this.unlocked && this._keys) {
      this.items = incoming;
      await this.save();
      return { added: incoming.length, skipped: 0, total: incoming.length,
               replaced: true, keptPassword: true };
    }

    // Not open - there is no existing password to keep, so the file's own
    // password becomes this device's. This is the restore-onto-a-fresh-install
    // case, where adopting it is the only thing that can work.
    await this.store.write(bytes);
    this._keys = opened.keys;
    this._salt = opened.salt;
    this.items = incoming;
    this.unlocked = true;
    return { added: incoming.length, skipped: 0, total: incoming.length,
             replaced: true, keptPassword: false };
  };

  // 1.3.9: an imported file can come from anyone ("import my card list,
  // password 12345678"), so its rows are checked before they join this vault:
  // plain objects only, an id made of safe characters (else a fresh one), and
  // no key that could reach an object's prototype. The screen escapes every
  // field as well; this keeps odd input out of the vault file in the first
  // place. Ids every build generates (16 hex) pass unchanged, so merging a
  // file twice still skips what it already added.
  const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  function cleanIncoming(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .filter((it) => it && typeof it === "object" && !Array.isArray(it))
      .map((it) => {
        const out = {};
        for (const k of Object.keys(it)) {
          if (BAD_KEYS.has(k)) continue;
          const v = it[k];
          out[k] = typeof v === "string" ? v.slice(0, 2000) : v;
        }
        let id = typeof out.id === "string" ? out.id : "";
        if (!SAFE_ID.test(id) || seen.has(id)) id = randomId();
        seen.add(id);
        out.id = id;
        return out;
      });
  }

  // 16 hex chars - the same shape as Python's secrets.token_hex(8), so ids
  // generated on a phone and on a PC are interchangeable after a merge.
  function randomId() {
    const b = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }

  root.Vault = Vault;
  root.randomId = randomId;
})(window.YCJ = window.YCJ || {});

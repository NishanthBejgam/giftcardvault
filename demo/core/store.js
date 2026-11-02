/*
 * store.js - where the encrypted vault file physically lives on the phone.
 *
 * One interface, three backends, chosen at runtime:
 *
 *   Capacitor Filesystem   the real app on a device. Directory.Data is the
 *                          app's private sandbox: no other app can read it,
 *                          and on Android it is excluded from cloud backup by
 *                          the manifest (see HANDOVER-ANDROID.md section 4).
 *   localStorage           desktop browser, for developing the UI without a
 *                          device attached. Never ships as the real store.
 *
 * WHY FILESYSTEM AND NOT PREFERENCES/KEYCHAIN
 * The vault file is already encrypted with the user's master password before
 * it reaches this layer, exactly as on the desktop. Putting it in the
 * Keychain/Keystore instead would add OS-level protection but would also make
 * the file non-exportable - and export/import is how a user moves their vault
 * between their PC and their phone, which is a stated requirement. The master
 * password remains the one and only gate, which is also what the desktop
 * product promises. Nothing here ever stores the password itself.
 *
 * Plugin access note: Capacitor's official plugins register themselves
 * natively and are reachable at `Capacitor.Plugins.Filesystem` without any
 * bundler. That is deliberate - this project has no build step beyond
 * `npx cap sync`, which keeps it editable the same way the desktop apps are.
 */

(function (root) {
  "use strict";

  const isNative = () =>
    !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  const FS = () => window.Capacitor.Plugins.Filesystem;
  const DIR = "DATA";           // Directory.Data - app-private, survives updates

  // --- base64 <-> bytes (the Filesystem plugin speaks base64) --------------
  function toB64(bytes) {
    let s = "";
    const CH = 0x8000;          // chunked: String.fromCharCode blows the stack
    for (let i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s);
  }
  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // --- the interface ------------------------------------------------------
  function Store(namespace) {
    this.ns = namespace;                      // e.g. "card-vault"
    this.main = namespace + "/vault.dat";
    this.backupDir = namespace + "/backups";
  }

  Store.prototype.exists = async function () {
    if (!isNative()) return localStorage.getItem(this.main) !== null;
    try {
      await FS().stat({ path: this.main, directory: DIR });
      return true;
    } catch (e) {
      return false;
    }
  };

  Store.prototype.read = async function () {
    if (!isNative()) {
      const v = localStorage.getItem(this.main);
      return v === null ? null : fromB64(v);
    }
    try {
      const r = await FS().readFile({ path: this.main, directory: DIR });
      return fromB64(r.data);
    } catch (e) {
      return null;
    }
  };

  /**
   * Write the vault, then keep a timestamped encrypted copy.
   *
   * The desktop writes to a .tmp and renames, because a half-written vault.dat
   * is total data loss. The Filesystem plugin has no atomic rename, so the
   * protection here comes from the backup ring instead: the previous good file
   * is copied aside BEFORE the new one is written, not after. If the write is
   * interrupted, backups/ still holds the last complete vault.
   */
  Store.prototype.write = async function (bytes, opts) {
    const keepBackup = !opts || opts.backup !== false;

    if (!isNative()) {
      if (keepBackup && !(await this._backedUpToday())) {
        const prev = localStorage.getItem(this.main);
        if (prev) localStorage.setItem(this.backupDir + "/" + stamp() + ".dat", prev);
        Object.keys(localStorage).filter((k) => k.indexOf(this.backupDir + "/") === 0).sort()
          .slice(0, -MAX_BACKUPS).forEach((k) => localStorage.removeItem(k));
      }
      localStorage.setItem(this.main, toB64(bytes));
      return;
    }

    await FS().mkdir({ path: this.ns, directory: DIR, recursive: true }).catch(() => {});
    if (keepBackup && !(await this._backedUpToday())) await this._backupCurrent();
    await FS().writeFile({
      path: this.main, directory: DIR, data: toB64(bytes), recursive: true,
    });
  };

  // Rotate a ring of encrypted copies. Best-effort by design: a failure to
  // keep a backup must never stop the user saving a card. The desktop makes
  // the same call and for the same reason.
  // 1.3.10 (user feedback): ONE automatic copy a day - taken before the first
  // change of the day - and only the last 4 kept. It used to copy on every
  // save and keep 20, so the count in Settings climbed with every edit.
  const MAX_BACKUPS = 4;

  /** Is there already an automatic copy from today? */
  Store.prototype._backedUpToday = async function () {
    const today = stamp().slice(0, 8);
    const names = await this.listBackups();
    return names.some((n) => n.replace(/^.*\//, "").replace(/^vault-/, "").slice(0, 8) === today);
  };

  Store.prototype._backupCurrent = async function () {
    try {
      const cur = await this.read();
      if (!cur || !cur.length) return;        // never let an empty file rotate good backups out
      await FS().mkdir({ path: this.backupDir, directory: DIR, recursive: true }).catch(() => {});
      await FS().writeFile({
        path: this.backupDir + "/vault-" + stamp() + ".dat",
        directory: DIR, data: toB64(cur), recursive: true,
      });
      const list = await FS().readdir({ path: this.backupDir, directory: DIR });
      const names = (list.files || [])
        .map((f) => (typeof f === "string" ? f : f.name))
        .filter((n) => n.indexOf("vault-") === 0 && n.slice(-4) === ".dat")
        .sort();
      for (const old of names.slice(0, Math.max(0, names.length - MAX_BACKUPS))) {
        await FS().deleteFile({ path: this.backupDir + "/" + old, directory: DIR }).catch(() => {});
      }
    } catch (e) {
      /* best effort */
    }
  };

  /** 1.3.9: empty the ring and keep one fresh copy of the current file. Used
   *  after a master-password change, so no automatic copy is still locked
   *  with the old password. Best effort, like every backup step. */
  Store.prototype.resetBackups = async function () {
    if (!isNative()) {
      Object.keys(localStorage)
        .filter((k) => k.indexOf(this.backupDir + "/") === 0)
        .forEach((k) => localStorage.removeItem(k));
      const cur = localStorage.getItem(this.main);
      if (cur) localStorage.setItem(this.backupDir + "/" + stamp() + ".dat", cur);
      return;
    }
    try {
      const list = await FS().readdir({ path: this.backupDir, directory: DIR });
      for (const f of (list.files || [])) {
        const n = typeof f === "string" ? f : f.name;
        await FS().deleteFile({ path: this.backupDir + "/" + n, directory: DIR }).catch(() => {});
      }
    } catch (e) { /* no ring yet */ }
    await this._backupCurrent();
  };

  Store.prototype.listBackups = async function () {
    if (!isNative()) {
      return Object.keys(localStorage)
        .filter((k) => k.indexOf(this.backupDir + "/") === 0)
        .sort().reverse();
    }
    try {
      const list = await FS().readdir({ path: this.backupDir, directory: DIR });
      return (list.files || [])
        .map((f) => (typeof f === "string" ? f : f.name))
        .filter((n) => n.indexOf("vault-") === 0)
        .sort().reverse();
    } catch (e) {
      return [];
    }
  };

  Store.prototype.readBackup = async function (name) {
    if (!isNative()) {
      const v = localStorage.getItem(name.indexOf("/") >= 0 ? name : this.backupDir + "/" + name);
      return v === null ? null : fromB64(v);
    }
    try {
      const r = await FS().readFile({ path: this.backupDir + "/" + name, directory: DIR });
      return fromB64(r.data);
    } catch (e) {
      return null;
    }
  };

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  root.Store = Store;
  root.storeHelpers = { isNative, toB64, fromB64, stamp };
})(window.YCJ = window.YCJ || {});

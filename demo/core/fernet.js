/*
 * fernet.js - the desktop vault's encryption, reimplemented on WebCrypto.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * The Windows and Mac vaults encrypt with Python's `cryptography.fernet`:
 *
 *     vault.dat = salt(16 bytes) || Fernet token
 *     key       = urlsafe_b64( PBKDF2-HMAC-SHA256(password, salt, 390000, 32) )
 *
 * The obvious mobile shortcut would have been "pick any modern AEAD and move
 * on". That was rejected on purpose: if the phone used its own format, a vault
 * could only ever travel one way, and the user's existing desktop vault - the
 * whole point of the product - could never be opened on the phone. Matching
 * the format byte-for-byte means one file works everywhere:
 *
 *     PC  ->  phone     export vault.dat, import it here
 *     phone -> PC       export from here, drop it in the PC's data folder
 *
 * So this is a faithful Fernet implementation, not an approximation.
 *
 * FERNET TOKEN LAYOUT (spec v0x80)
 *     version    1 byte   always 0x80
 *     timestamp  8 bytes  big-endian seconds
 *     iv        16 bytes
 *     ciphertext n bytes  AES-128-CBC, PKCS#7 padded
 *     hmac      32 bytes  HMAC-SHA256 over everything above
 *
 * The 32-byte derived key splits in half: first 16 bytes sign, last 16 encrypt.
 * That split is a Fernet quirk and is easy to get backwards - it is the single
 * most likely place for this file to break, so it is called out here.
 *
 * NOTE ON ITERATIONS. 390,000 PBKDF2 rounds is what the desktop uses and it
 * must not be lowered, because the count is not stored in the file - it is
 * part of the format. On a mid-range phone this costs roughly a second, which
 * is why unlock() is only ever called behind a visible spinner.
 */

(function (root) {
  "use strict";

  const ITERATIONS = 390000;
  const SALT_LEN = 16;

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // --- small byte helpers -------------------------------------------------
  function concat(...parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function b64urlEncode(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
  }

  function b64urlDecode(str) {
    let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Constant-time compare. The HMAC check is the only place an attacker gets
  // to feed us a value and watch how long we take, so it does not early-exit.
  function equalBytes(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  // --- key derivation -----------------------------------------------------
  /**
   * Derive the 32-byte Fernet key material from a master password and salt.
   * Returns { signKey, cryptKey } as imported CryptoKeys, ready to use.
   */
  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
      base, 256
    );
    const material = new Uint8Array(bits);

    // The Fernet halves. Getting these the wrong way round produces a token
    // that this file can read back happily and the desktop app cannot - a bug
    // that would only surface on the user's PC, so it is worth staring at.
    const signBytes = material.slice(0, 16);
    const cryptBytes = material.slice(16, 32);

    const signKey = await crypto.subtle.importKey(
      "raw", signBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
    );
    const cryptKey = await crypto.subtle.importKey(
      "raw", cryptBytes, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]
    );
    return { signKey, cryptKey, material };
  }

  // --- token encrypt / decrypt -------------------------------------------
  /** Encrypt plaintext bytes into a Fernet token (returned base64url, as the
   *  Python library does - the desktop writes exactly these characters). */
  async function encryptToken(keys, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: iv }, keys.cryptKey, plaintext
    ));

    const ts = new Uint8Array(8);
    // Seconds since epoch, big-endian. Fernet's TTL feature reads this; the
    // vault never sets a TTL, but a wrong value here would still be a
    // malformed token to a stricter reader, so it is written properly.
    const secs = Math.floor(Date.now() / 1000);
    new DataView(ts.buffer).setUint32(4, secs >>> 0, false);

    const body = concat(new Uint8Array([0x80]), ts, iv, ct);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", keys.signKey, body));
    return b64urlEncode(concat(body, mac));
  }

  /** Decrypt a Fernet token. Throws InvalidToken on any failure - a wrong
   *  password and a corrupt file are deliberately indistinguishable here, and
   *  the caller decides what to tell the user. */
  async function decryptToken(keys, token) {
    let raw;
    try {
      raw = typeof token === "string" ? b64urlDecode(token) : token;
    } catch (e) {
      throw new InvalidToken("not base64");
    }
    if (raw.length < 1 + 8 + 16 + 32) throw new InvalidToken("too short");
    if (raw[0] !== 0x80) throw new InvalidToken("bad version");

    const body = raw.slice(0, raw.length - 32);
    const mac = raw.slice(raw.length - 32);
    const ok = await crypto.subtle.verify("HMAC", keys.signKey, mac, body);
    if (!ok) throw new InvalidToken("hmac mismatch");

    const iv = body.slice(9, 25);
    const ct = body.slice(25);
    let pt;
    try {
      pt = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: iv }, keys.cryptKey, ct
      ));
    } catch (e) {
      // Unreachable in practice once the HMAC passed, but AES-CBC padding
      // errors are reported this way and must not escape as a raw DOMException.
      throw new InvalidToken("undecryptable");
    }
    return pt;
  }

  function InvalidToken(msg) {
    const e = new Error(msg || "invalid token");
    e.name = "InvalidToken";
    return e;
  }

  // --- whole-file helpers -------------------------------------------------
  // These two are the only functions the rest of the app should need. They
  // speak the on-disk shape (salt || token), so no caller has to know it.

  /** Build a complete vault.dat body from an object. */
  async function sealFile(password, obj, existingSalt) {
    const salt = existingSalt || crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const keys = await deriveKey(password, salt);
    const token = await encryptToken(keys, enc.encode(JSON.stringify(obj)));
    return { bytes: concat(salt, enc.encode(token)), salt: salt, keys: keys };
  }

  /** Open a complete vault.dat body. Throws InvalidToken on a wrong password. */
  async function openFile(password, bytes) {
    if (!bytes || bytes.length <= SALT_LEN) throw new InvalidToken("empty file");
    const salt = bytes.slice(0, SALT_LEN);
    const token = dec.decode(bytes.slice(SALT_LEN));
    const keys = await deriveKey(password, salt);
    const plain = await decryptToken(keys, token);
    return { data: JSON.parse(dec.decode(plain)), salt: salt, keys: keys };
  }

  /** Re-seal with keys already derived, so saving a card does not pay the
   *  390k-round cost again. This is what makes the app feel instant after
   *  the one slow unlock. */
  async function resealFile(keys, salt, obj) {
    const token = await encryptToken(keys, enc.encode(JSON.stringify(obj)));
    return concat(salt, enc.encode(token));
  }

  root.Fernet = {
    ITERATIONS, SALT_LEN,
    deriveKey, encryptToken, decryptToken,
    sealFile, openFile, resealFile,
    b64urlEncode, b64urlDecode, concat, equalBytes,
  };
})(window.YCJ = window.YCJ || {});

/*
 * mobile.js - the handful of behaviours a phone needs that a desktop browser
 * tab does not. Shared by both apps so they cannot drift apart, which is the
 * same reason the Mac line has common/desktop.py.
 *
 * There are five, and each exists because of a specific way the desktop
 * assumptions break on a phone:
 *
 *   1. AUTO-LOCK ON BACKGROUND.  This is the important one. On a PC the vault
 *      sits behind a locked screen in a room you are in. A phone is handed to
 *      people, left on tables, and taken by force. The moment the app leaves
 *      the foreground a grace period starts (default 60s, user-adjustable down
 *      to zero); when it runs out the decrypted vault is dropped from memory
 *      and the lock screen comes back. See setup() for why it is not instant.
 *
 *   2. HARDWARE BACK.  Android's back button closes the WebView by default,
 *      which from a modal would silently exit the whole app. Back now walks
 *      the UI stack - modal, then menu, then lock, then exit.
 *
 *   3. SAFE AREAS.  Notch and gesture bar. Handled in CSS via env(), but the
 *      status-bar colour has to be set from JS.
 *
 *   4. NO SYSTEM TEXT SELECTION on card numbers. Long-press on Android pops a
 *      selection toolbar offering "share" and "web search" over a PAN. Copy is
 *      offered by the app's own button instead, which copies without ever
 *      putting the value in a system UI surface.
 *
 *   5. CLIPBOARD EXPIRY.  A copied card number sitting in the clipboard is
 *      readable by every app on the device. Copies are cleared after 45s.
 *
 * Screenshot blocking (FLAG_SECURE) is NOT done here - it cannot be, it is a
 * native window flag. It is applied in MainActivity; see android-patches/ and
 * HANDOVER-ANDROID.md section 4.
 */

(function (root) {
  "use strict";

  const Plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};

  // --- per-app identity -----------------------------------------------------
  // This file is shared by both apps, but the fingerprint prompt has to say
  // which app is asking, and the secure-store entry has to belong to it. The
  // defaults are Card Vault's EXACT shipped values: changing BIO_SERVER or the
  // key names under an installed Card Vault would silently forget a stored
  // credential and every user's auto-lock choice. Gift Card Vault passes its
  // own through setup(). (On a device each app has its own storage anyway;
  // the prefix matters for the shared dev server, where both apps are one
  // origin.)
  const APP = { name: "Card Vault", bioServer: "com.yourcardjourney.cardvault", keyPrefix: "cv" };

  // --- auto-lock delay ------------------------------------------------------
  // Seconds. 0 means lock the moment the app loses focus.
  const AUTOLOCK_KEY = () => APP.keyPrefix + "-autolock";
  const AUTOLOCK_DEFAULT = 60;
  const AUTOLOCK_CHOICES = [
    // "Immediately" was removed in 1.3.6 (user feedback): it locked the vault
    // on every copy-paste trip and, on iPhone, the moment the Face ID sheet
    // took focus. A saved 0 from an older build reads as 30 seconds.
    { s: 30,  label: "After 30 seconds" },
    { s: 60,  label: "After 1 minute" },
    { s: 120, label: "After 2 minutes" },
    { s: 300, label: "After 5 minutes" },
  ];

  function autoLockSeconds() {
    try {
      const v = localStorage.getItem(AUTOLOCK_KEY());
      if (v === null) return AUTOLOCK_DEFAULT;
      const n = parseInt(v, 10);
      if (isNaN(n)) return AUTOLOCK_DEFAULT;
      return n <= 0 ? 30 : n;
    } catch (e) { return AUTOLOCK_DEFAULT; }
  }
  function setAutoLockSeconds(n) {
    try { localStorage.setItem(AUTOLOCK_KEY(), String(n)); } catch (e) {}
  }
  const autoLockMs = () => autoLockSeconds() * 1000;

  // See holdLock(): the end of a window in which leaving the app for a system
  // sheet the app opened does not start the auto-lock.
  let holdUntil = 0;
  /** The app is about to open a system sheet (photo picker) itself. The next
   *  trip away within `ms` does not lock - used once, then cleared. */
  function holdLock(ms) { holdUntil = Date.now() + (ms || 120000); }

  const isNative = () =>
    !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  /**
   * @param {object} opts
   *   onBackground()  called when the app leaves the foreground - lock here
   *   onBack()        return true if the app consumed the back press
   *   statusBarColor  hex string, the app's primary surface colour
   *   appName, bioServer, keyPrefix   see "per-app identity" above
   */
  function setup(opts) {
    opts = opts || {};
    if (opts.appName) APP.name = opts.appName;
    if (opts.bioServer) APP.bioServer = opts.bioServer;
    if (opts.keyPrefix) APP.keyPrefix = opts.keyPrefix;

    // --- 1. auto-lock, after a grace period --------------------------------
    // This used to lock the instant the app lost focus. That reads well in a
    // threat model and is wrong for this app in practice: its single most
    // common use is copying a card number and pasting it into a browser or
    // another app, and that round trip locked the vault every single time.
    // Users would have re-entered their password on every copy.
    //
    // So: a grace period, default one minute, configurable down to zero for
    // anyone who wants the old behaviour. FLAG_SECURE still blanks the recents
    // thumbnail throughout, so what the window actually exposes is someone
    // physically taking the unlocked phone and returning to the app within the
    // grace period - which is a much narrower risk than it first appears.
    //
    // IMPLEMENTED ON A TIMESTAMP, not only a timer. A backgrounded WebView has
    // its timers throttled or suspended by Android, so a setTimeout alone
    // would fire late or never. The elapsed time is therefore re-checked on
    // resume, and the timer is only a best-effort for the case where the app
    // is still running.
    const lockNeeded = () => { if (typeof opts.onBackground === "function") opts.onBackground(); };
    let bgAt = 0, bgTimer = null;

    const wentAway = () => {
      // A trip the app itself started (the system photo picker) is not the
      // user walking away: skip this one lock, once, within the hold window.
      if (Date.now() < holdUntil) { holdUntil = 0; bgAt = 0; clearTimeout(bgTimer); return; }
      bgAt = Date.now();
      clearTimeout(bgTimer);
      const ms = autoLockMs();
      if (ms <= 0) return lockNeeded();          // "Immediately"
      bgTimer = setTimeout(lockNeeded, ms);
    };
    const cameBack = () => {
      holdUntil = 0;                      // a hold covers one trip, never two
      clearTimeout(bgTimer);
      const ms = autoLockMs();
      if (bgAt && (ms <= 0 || Date.now() - bgAt >= ms)) lockNeeded();
      bgAt = 0;
    };

    if (isNative() && Plugins().App) {
      Plugins().App.addListener("appStateChange", (st) => {
        if (st.isActive) cameBack(); else wentAway();
      });
    } else {
      // Browser development, and the case where the WebView is covered rather
      // than backgrounded. visibilitychange fires for both.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) wentAway(); else cameBack();
      });
    }

    // --- 2. hardware back --------------------------------------------------
    if (isNative() && Plugins().App) {
      Plugins().App.addListener("backButton", () => {
        const handled = typeof opts.onBack === "function" && opts.onBack();
        // Only a deliberate back press at the top of the stack exits, and it
        // exits rather than backgrounding, so the vault is gone from memory.
        if (!handled) Plugins().App.exitApp();
      });
    }

    // --- 3. status bar -----------------------------------------------------
    // Only the icon STYLE is set. setBackgroundColor() is deliberately not
    // called: it wraps Window.setStatusBarColor, which Android 15 deprecated
    // and which does nothing at all once an app targets SDK 35+ and the
    // platform enforces edge-to-edge. Play flags the call as a deprecated
    // edge-to-edge API even though its effect was already gone.
    //
    // Nothing is lost by dropping it. The WebView already draws under the
    // status bar (viewport-fit=cover), and .topbar-inner pads itself by
    // env(safe-area-inset-top), so the header's own background is what fills
    // that strip - which is why the bar already matched the header rather
    // than the colour passed here.
    if (isNative() && Plugins().StatusBar) {
      Plugins().StatusBar.setStyle({ style: opts.statusBarDark ? "DARK" : "LIGHT" }).catch(() => {});
    }

    // --- 4. suppress the system selection toolbar on sensitive values -------
    // Applied by CSS class rather than globally: notes and names still need to
    // be selectable, and a blanket user-select:none would break the whole app.
    document.addEventListener("contextmenu", (e) => {
      if (e.target.closest && e.target.closest(".no-select, .sensitive")) e.preventDefault();
    });

    // --- 5. keep the WebView from bouncing like a web page -----------------
    document.addEventListener("touchmove", (e) => {
      if (e.touches.length > 1) e.preventDefault();     // no pinch-zoom of the chrome
    }, { passive: false });
  }

  // --- clipboard, with an expiry ------------------------------------------
  const CLIP_TTL_MS = 45000;
  let clipTimer = null;

  /**
   * Copy a sensitive value and schedule its removal. Returns true if the value
   * reached the clipboard.
   *
   * The clear is best-effort and deliberately overwrites with a space rather
   * than an empty string: Android's clipboard treats an empty set as a no-op
   * on some OEM skins, leaving the card number in place - which would make
   * this function actively misleading.
   */
  async function copySensitive(text) {
    let ok = false;
    // 1.3.9: the app's own native copy first. Android 13+ marks the clip as
    // sensitive (keyboards and the copy preview show dots, not the number);
    // iOS keeps it off Universal Clipboard and deletes it itself after the
    // TTL - a JS timer cannot, because iOS pauses the app the moment the user
    // switches away to paste. The Capacitor plugin stays as the fallback.
    if (isNative() && Plugins().YcjGuard) {
      try {
        await Plugins().YcjGuard.copy({ text: text, ttlMs: CLIP_TTL_MS });
        ok = true;
      } catch (e) { ok = false; }
    }
    try {
      if (ok) { /* done natively */ }
      else if (isNative() && Plugins().Clipboard) {
        await Plugins().Clipboard.write({ string: text });
        ok = true;
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) {
      ok = false;
    }
    if (!ok) return false;

    clearTimeout(clipTimer);
    clipTimer = setTimeout(async () => {
      try {
        if (isNative() && Plugins().YcjGuard) await Plugins().YcjGuard.clearCopy({ text: text });
        else if (isNative() && Plugins().Clipboard) await Plugins().Clipboard.write({ string: " " });
        else if (navigator.clipboard) await navigator.clipboard.writeText(" ");
      } catch (e) { /* nothing useful to do */ }
    }, CLIP_TTL_MS);
    return true;
  }

  /** Read the clipboard as text, or "" if it is empty or refused. Used for
   *  Gift Card Vault's one-tap "Paste from clipboard". Reading needs no
   *  permission on Android; Android 12+ shows its own "pasted from" toast,
   *  which is the OS being honest about it and is left alone. */
  async function readClipboard() {
    try {
      if (isNative() && Plugins().Clipboard) {
        const r = await Plugins().Clipboard.read();
        return (r && r.value) || "";
      }
      if (navigator.clipboard && navigator.clipboard.readText) return await navigator.clipboard.readText();
    } catch (e) { /* refused or empty */ }
    return "";
  }

  /** Ask the OS to hand the user a file (export). Uses Share on a device so
   *  the vault can go to Drive, mail, or a cable-connected PC - the phone has
   *  no "Downloads folder the user will find" story worth relying on. */
  async function shareFile(filename, bytes, title) {
    const b64 = root.storeHelpers.toB64(bytes);
    if (isNative() && Plugins().Filesystem && Plugins().Share) {
      const path = filename;
      await Plugins().Filesystem.writeFile({ path, directory: "CACHE", data: b64 });
      const uri = await Plugins().Filesystem.getUri({ path, directory: "CACHE" });
      await Plugins().Share.share({ title: title || filename, url: uri.uri });
      return true;
    }
    // Browser fallback, for development only.
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  }

  /** Hand plain text to the OS share sheet (Card Vault's per-card export,
   *  1.3.6). The trip to the chooser and the target app must not trip the
   *  auto-lock, hence holdLock. Returns false if the user backed out. */
  async function shareText(text, title) {
    try {
      if (isNative() && Plugins().Share) {
        holdLock(120000);
        await Plugins().Share.share({ title: title || "", text, dialogTitle: title || "" });
        return true;
      }
      if (navigator.share) { await navigator.share({ title: title || "", text }); return true; }
    } catch (e) { /* cancelled */ }
    return false;
  }

  /** Read a file the user picks. Returns Uint8Array or null if they cancel. */
  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      if (accept) inp.accept = accept;
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        const fr = new FileReader();
        fr.onload = () => resolve(new Uint8Array(fr.result));
        fr.onerror = () => resolve(null);
        fr.readAsArrayBuffer(f);
      };
      // No 'cancel' event exists reliably; the promise simply never settles if
      // the user backs out, and the caller's UI is unchanged. That is fine
      // here because nothing is left in a pending state on screen.
      inp.click();
    });
  }


  /**
   * Pick ONE image through the system picker - Android's Photo Picker where
   * the phone has it. The app sees only the picture the user chose and needs
   * no storage or media permission for it. Resolves to the File, or null.
   */
  function pickImage() {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";          // no `capture`: never opens the camera
      inp.onchange = () => resolve((inp.files && inp.files[0]) || null);
      holdLock(120000);
      inp.click();
    });
  }

  // --- biometric unlock ---------------------------------------------------
  // WHAT THIS IS, AND WHAT IT IS NOT.
  //
  // It is NOT a second lock on the vault. The vault file stays exactly as it
  // was: encrypted with the master password, openable on a PC, with no new way
  // to lose it. All this does is remember the master password inside the
  // phone's own secure store and hand it back after a fingerprint match.
  //
  // That is deliberate, and it is the reason this could ship without the
  // hardware-wrapping change. A key that lives in the security chip cannot be
  // recovered if the chip forgets it - and if such a key were wrapping the
  // vault, "the chip forgot" would mean the vault is gone even with the right
  // password. Here the password path is always there, so the worst case is
  // that the fingerprint stops working and the user types it in, which is what
  // they did before.
  //
  // The real security benefit is indirect but genuine: someone who does not
  // have to type their password twenty times a day will pick a much longer
  // one, and password length is the only thing that helps against an attacker
  // who has extracted the vault file.
  //
  // What it does NOT defend against: an extracted vault.dat attacked offline.
  // Do not let the presence of a fingerprint prompt suggest otherwise.

  const Bio = () => Plugins().NativeBiometric;

  // A wrong method name on a plugin surfaces as "x is not a function" from
  // inside a catch, which is how authenticate() vs verifyIdentity() survived
  // two build cycles behind a friendly error message. This turns that into a
  // statement of fact naming the method, so the next one is a five-second fix
  // rather than an afternoon.
  function bioMethod(name) {
    const p = Bio();
    if (!p) throw new Error("The biometric plugin is not loaded.");
    if (typeof p[name] !== "function") {
      throw new Error("Plugin has no " + name + "() - check the plugin version.");
    }
    return p[name].bind(p);
  }
  const BIO_SERVER = () => APP.bioServer;
  const BIO_FLAG = () => APP.keyPrefix + "-biometric";

  // 1.3.9: the stored password is locked behind the phone's secure chip
  // (Android Keystore / iOS Secure Enclave) and the chip itself releases it
  // only after a real match - AccessControl.BIOMETRY_CURRENT_SET. Before this,
  // the plugin's default (NONE) kept it readable by the app without any
  // biometric, so the prompt was only a screen in front of it. Enrolling a new
  // fingerprint or face wipes the stored copy (by design: nobody can add their
  // own finger to your phone and open the vault). Only STRONG biometrics can
  // guard a key, so weak face unlock on many Android phones no longer counts.
  const BIO_ACCESS_CURRENT_SET = 1;
  const BIO_PROTECTED = "2";     // flag value: stored behind the chip (1.3.9+)
  const BIO_LEGACY = "1";        // flag value: stored by 1.3.8 or earlier

  /** Is there usable STRONG biometric hardware AND an enrolled fingerprint/face? */
  async function bioAvailable() {
    if (!isNative() || !Bio()) return false;
    try {
      const r = await Bio().isAvailable({ useFallback: false });
      // A password stored by an older build on a weak-face-only phone cannot
      // move behind the chip; remove it rather than leave it in the weaker store.
      if (r && r.isAvailable && r.strongBiometryIsAvailable === false && bioEnabled() && !bioProtected()) {
        bioDisable();
      }
      return !!(r && r.isAvailable && r.strongBiometryIsAvailable !== false);
    } catch (e) {
      console.warn("biometric unavailable:", e && e.message);
      return false;
    }
  }

  /**
   * The full availability report, for showing the user WHY it will not turn
   * on. The plugin distinguishes "no hardware" from "hardware but nothing
   * enrolled" from "no device screen lock", and those need different actions
   * from the user - a single "could not enable" tells them nothing.
   */
  async function bioStatus() {
    if (!isNative() || !Bio()) return { ok: false, why: "Not running on a phone." };
    try {
      const r = await Bio().isAvailable({ useFallback: false });
      if (r && r.isAvailable && r.strongBiometryIsAvailable === false) {
        return { ok: false, why: "This phone's face unlock is not secure enough to guard your master password. "
                 + "Add a fingerprint in the phone's Settings to use it here." };
      }
      if (r && r.isAvailable) return { ok: true, why: "", type: r.biometryType };
      // THESE ARE THE PLUGIN'S OWN CODES, not Android's BiometricManager
      // constants. The plugin normalises every platform's error onto one enum
      // of its own (BiometricAuthError) before it reaches JS, and the numbers
      // do not resemble BiometricManager's.
      //
      // This map used to hold BiometricManager constants - 11 for
      // ERROR_NONE_ENROLLED, 12 for ERROR_NO_HARDWARE, 15 for
      // ERROR_SECURITY_UPDATE_REQUIRED. Those are the right numbers for the
      // wrong layer. "Nothing is enrolled" is reported here as 3, so the one
      // message that tells a user what to actually do about it - go and add a
      // fingerprint - could never appear, and every such phone fell through to
      // the generic line with a bare "(code 3)" on the end.
      //
      // Checked against convertBiometricManagerErrorToPluginError in the
      // plugin's NativeBiometric.java, not against its README. From
      // isAvailable() Android can only produce 1, 3 or 0; 2 and 14 are listed
      // because the plugin's iOS side produces them and this file should not
      // have to be re-derived if that ever changes.
      const map = {
        1: "This phone's fingerprint sensor is not available right now.",
        2: "Fingerprint unlock is locked after too many failed attempts. "
           + "Unlock the phone with its PIN once, then try again.",
        3: "No fingerprint or face is set up on this phone. Add one in Settings, then try again.",
        14: "Set a screen lock (PIN, pattern or password) on this phone first.",
      };
      const code = r && r.errorCode;
      // A phone with no screen lock cannot do this at all, and saying so is
      // more use than a number the user can do nothing with.
      const fallback = (r && r.deviceIsSecure === false)
        ? "Set a screen lock (PIN, pattern or password) on this phone first."
        : ("Fingerprint unlock is not available on this phone."
           + (code !== undefined && code !== null ? " (code " + code + ")" : ""));
      return {
        ok: false,
        why: map[code] || fallback,
        deviceIsSecure: r && r.deviceIsSecure,
        code: code,
      };
    } catch (e) {
      return { ok: false, why: "Could not check: " + ((e && e.message) || e) };
    }
  }

  /** Has the user turned it on AND is a credential actually stored? */
  function bioEnabled() {
    try {
      const v = localStorage.getItem(BIO_FLAG());
      return v === BIO_LEGACY || v === BIO_PROTECTED;
    } catch (e) { return false; }
  }
  function bioProtected() {
    try { return localStorage.getItem(BIO_FLAG()) === BIO_PROTECTED; } catch (e) { return false; }
  }

  /** Store the password behind the chip. On Android the plugin shows its own
   *  fingerprint prompt here (the chip will not encrypt without one); on
   *  iOS the Keychain write is silent and only reading needs Face ID. Any old
   *  entry is removed first so the new key is created fresh. */
  async function bioStore(password, title) {
    try { await Bio().deleteCredentials({ server: BIO_SERVER() }); } catch (e) { /* nothing stored */ }
    await bioMethod("setCredentials")({
      username: "vault", password: password, server: BIO_SERVER(),
      accessControl: BIO_ACCESS_CURRENT_SET,
      title: title || ("Turn on fingerprint unlock"),
      subtitle: "", description: "", negativeButtonText: "Cancel",
    });
    localStorage.setItem(BIO_FLAG(), BIO_PROTECTED);
  }

  /**
   * Store the master password behind the OS secure store. Called ONLY right
   * after a successful unlock, so the password is known to be correct - saving
   * an unverified one would lock the user out of their own shortcut.
   */
  async function bioEnable(password) {
    const st = await bioStatus();
    if (!st.ok) return { ok: false, error: st.why };
    try {
      // Prove it is the phone's owner turning this on, not someone holding an
      // unlocked phone they just picked up. Since 1.3.9 that proof IS the
      // store: the chip asks for the fingerprint before it will encrypt, so a
      // separate verifyIdentity() here would only make the user touch twice.
      await bioStore(password, "Enable fingerprint unlock");
      return { ok: true };
    } catch (e) {
      // Report what actually happened. Swallowing this is what let a wrong
      // method name survive a whole build cycle with nothing on screen to
      // debug - and a user who cancelled the prompt deserves a different
      // message from one whose phone has no screen lock.
      const msg = (e && (e.message || e.errorMessage)) || String(e);
      if (/cancel/i.test(msg)) return { ok: false, error: "Cancelled." };
      const st = await bioStatus();
      return { ok: false, error: st.ok ? ("Could not enable it: " + msg) : st.why };
    }
  }

  /** After a master-password change: if fingerprint unlock is on, store the
   *  new password in its place. No second fingerprint prompt - the user has
   *  just typed the current password, which is the stronger proof. Returns
   *  false if it could not be stored (the caller then turns the feature off
   *  rather than leave a credential that no longer opens the vault). */
  async function bioUpdate(password) {
    if (!bioEnabled()) return true;
    try {
      // Android: one fingerprint touch, because the chip must re-encrypt.
      await bioStore(password, "Keep fingerprint unlock");
      return true;
    } catch (e) {
      await bioDisable();
      return false;
    }
  }

  async function bioDisable() {
    try { await Bio().deleteCredentials({ server: BIO_SERVER() }); } catch (e) { /* nothing stored */ }
    try { localStorage.removeItem(BIO_FLAG()); } catch (e) {}
  }

  /**
   * Prompt, and return the stored master password on success.
   * Returns null on ANY failure - cancelled, no match, credential gone after a
   * fingerprint re-enrollment. The caller falls back to the password field
   * rather than showing an error, because every one of those cases is a normal
   * thing that happens to real people.
   */
  async function bioUnlock() {
    if (!bioEnabled() || !(await bioAvailable())) return null;
    const prompt = {
      reason: "Unlock your vault",
      title: "Unlock " + APP.name,
      subtitle: "",
      description: "",
      negativeButtonText: "Use password",
    };
    if (bioProtected()) {
      try {
        // One prompt, and the chip - not this code - decides on the match.
        const c = await bioMethod("getSecureCredentials")(Object.assign({ server: BIO_SERVER() }, prompt));
        return (c && c.password) || null;
      } catch (e) {
        // 21 = nothing stored behind the chip any more: a fingerprint or face
        // was added or removed, which wipes it on purpose. Switch the feature
        // off so the lock screen stops offering a prompt that cannot work.
        if (String(e && e.code) === "21" || /no protected credentials|invalidat/i.test(String(e && e.message))) {
          await bioDisable();
        }
        return null;
      }
    }
    // Stored by 1.3.8 or earlier: open it the old way once, then move it
    // behind the chip. Android asks for the fingerprint one more time for the
    // move (iOS does not); if that is cancelled or fails, the feature is
    // switched off rather than left in the weaker state, and typing the
    // password still works as always.
    try {
      await bioMethod("verifyIdentity")(Object.assign({ useFallback: false }, prompt));
      const c = await bioMethod("getCredentials")({ server: BIO_SERVER() });
      const pw = (c && c.password) || null;
      if (pw) {
        try { await bioStore(pw, "Secure fingerprint unlock"); }
        catch (e) { await bioDisable(); }
      }
      return pw;
    } catch (e) {
      return null;
    }
  }

  root.mobile = { setup, copySensitive, readClipboard, shareFile, shareText, pickFile, pickImage, holdLock, isNative, CLIP_TTL_MS, bioUpdate,
                  bioAvailable, bioStatus, bioEnabled, bioEnable, bioDisable, bioUnlock,
                  autoLockSeconds, setAutoLockSeconds, AUTOLOCK_CHOICES };
})(window.YCJ = window.YCJ || {});

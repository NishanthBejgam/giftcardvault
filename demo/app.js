// Gift Card Vault — frontend logic. Talks only to the local Python server.

const $ = (sel) => document.querySelector(sel);
let CARDS = [];
let filterStatus = "all";
let searchTerm = "";
let sortBy = "recent";
// 1.3.10: the stores ticked in the Stores picker (canonical names); empty =
// every store. Several can be ticked, as on the GiftDeals site.
let storesPicked = new Set();
let storeQuery = "", storeOrder = "az";
// 1.3.10: one tile per store with its total (the "Combine by brand" toggle).
let combine = (() => { try { return localStorage.getItem("gcv-combine") === "1"; } catch (e) { return false; } })();
const SOON_DAYS = 30;

// --------------------------------------------------------------------------- //
// API helpers
// --------------------------------------------------------------------------- //
// On Windows and macOS this was fetch() against a local Python server. A phone
// has no server: api.js answers the same routes in-process. The {ok, status,
// data} shape is preserved so the rest of this file - the desktop UI - did not
// have to change. See HANDOVER-ANDROID.md section 3.
async function api(method, path, body) {
  const data = method === "GET"
    ? await window.YCJ.api.get(path)
    : await window.YCJ.api.send(path, method, body);
  const status = !data.error ? 200 : (data.error === "locked" ? 401 : 400);
  return { ok: !data.error, status, data };
}

// --------------------------------------------------------------------------- //
// Icon system — one cohesive monoline + duotone vector set (inherits currentColor)
// --------------------------------------------------------------------------- //
// The x everywhere (sheet close, pill clear, row remove, field clear): one
// drawn icon in a fixed box, so a large phone font never pushes it out of
// shape the way the "×" character did (1.3.11 feedback).
const X_ICON = '<svg class="x-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';
const X_SMALL = '<svg class="x-ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';
const _SVG = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS = {
  vault: _SVG(`<path d="M12 2.5l7.5 2.7v5.6c0 4.7-3.2 8.1-7.5 9.4-4.3-1.3-7.5-4.7-7.5-9.4V5.2z" fill="currentColor" fill-opacity=".14"/><circle cx="12" cy="10.6" r="2.1"/><path d="M12 12.7v3"/>`),
  card: _SVG(`<rect x="2.75" y="5.5" width="18.5" height="13" rx="2.5" fill="currentColor" fill-opacity=".14"/><path d="M2.75 9.75h18.5"/><path d="M6 14.5h4.5"/>`),
  clock: _SVG(`<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".14"/><path d="M12 7.5V12l3 1.8"/>`),
  hourglass: _SVG(`<path d="M6 3.5h12M6 20.5h12"/><path d="M7.2 3.5v2.6L12 11.5l4.8-5.4V3.5" fill="currentColor" fill-opacity=".14"/><path d="M7.2 20.5v-2.6L12 12.5l4.8 5.4v2.6" fill="currentColor" fill-opacity=".14"/>`),
  check: _SVG(`<circle cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".14"/><path d="M8.4 12.3l2.4 2.4 4.8-5.4"/>`),
  lock: _SVG(`<rect x="4.75" y="10.5" width="14.5" height="9.5" rx="2.5" fill="currentColor" fill-opacity=".14"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/><circle cx="12" cy="15" r="1.2" fill="currentColor"/>`),
  moon: _SVG(`<path d="M20.5 14A8.5 8.5 0 1110 3.5 6.8 6.8 0 0020.5 14z" fill="currentColor" fill-opacity=".14"/>`),
  sun: _SVG(`<circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity=".18"/><path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2 12h2.2M19.8 12H22M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>`),
  copy: _SVG(`<rect x="9" y="9" width="11" height="11" rx="2.5" fill="currentColor" fill-opacity=".14"/><path d="M5.5 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v.5"/>`),
  trash: _SVG(`<path d="M4 7h16"/><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7"/><path d="M6.5 7l.8 11a2 2 0 002 1.9h5.4a2 2 0 002-1.9L17.5 7" fill="currentColor" fill-opacity=".14"/><path d="M10 11v5M14 11v5"/>`),
  redeem: _SVG(`<path d="M3.6 12.4l8-8a2 2 0 011.5-.6l4.9.2a1 1 0 011 1l.2 4.9a2 2 0 01-.6 1.5l-8 8a2 2 0 01-2.8 0l-4.2-4.2a2 2 0 010-2.8z" fill="currentColor" fill-opacity=".14"/><circle cx="15.3" cy="8.7" r="1.4" fill="currentColor"/>`),
  external: _SVG(`<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M19 13.5V19a1.5 1.5 0 01-1.5 1.5h-12A1.5 1.5 0 014 19V6.5A1.5 1.5 0 015.5 5H11"/>`),
  archive: _SVG(`<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M4.75 8.5v9.5a2 2 0 002 2h10.5a2 2 0 002-2V8.5" fill="currentColor" fill-opacity=".14"/><path d="M10 12.5h4"/>`),
  unarchive: _SVG(`<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M4.75 8.5v9.5a2 2 0 002 2h10.5a2 2 0 002-2V8.5" fill="currentColor" fill-opacity=".14"/><path d="M12 17.5v-6M9.5 14l2.5-2.5 2.5 2.5"/>`),
  edit: _SVG(`<path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" fill="currentColor" fill-opacity=".14"/><path d="M14 8l2.5 2.5"/>`),
};
const svgIcon = (name) => `<span class="ico">${ICONS[name] || ""}</span>`;
function paintIcons(root) {
  (root || document).querySelectorAll(".ico[data-icon]").forEach((el) => {
    const n = el.dataset.icon;
    if (ICONS[n]) el.innerHTML = ICONS[n];
  });
}

// --------------------------------------------------------------------------- //
// Theme
// --------------------------------------------------------------------------- //
function applyTheme(t) {
  document.body.dataset.theme = t;
  const tb = document.querySelector("#theme-btn .ico");
  if (tb) { tb.dataset.icon = t === "light" ? "moon" : "sun"; tb.innerHTML = ICONS[tb.dataset.icon]; }
  try { localStorage.setItem("gcv-theme", t); } catch (e) {}
}
(function initTheme() {
  let t = "light";
  try { t = localStorage.getItem("gcv-theme") || "light"; } catch (e) {}
  document.body.dataset.theme = t;
})();

// --------------------------------------------------------------------------- //
// Unlock / lock flow
// --------------------------------------------------------------------------- //
// The desktop opens an ACTIVATION screen ahead of this for the offline
// machine-locked licence. The store builds have no licence gate at all - see
// HANDOVER-ANDROID.md section 2 - so the app goes straight to the password.

async function initLockScreen() {
  wireEyes();
  setupMobileShell();
  wireVaultSheet();
  wireSearch();
  wireBell();
  wireTileClicks();
  wireCombine();
  wireArchiveButton();
  wireGiftMark();
  wirePhoneSheets();
  wireStores();
  wireScan();
  wireIntake();
  wireUseNav();
  wireCheckout();
  wireManageStores();
  wireStoreRules();
  // B6: the eye (or the number itself) hides / shows the total; remembered.
  const flipHide = (e) => { e.stopPropagation(); heroMode.hide = !heroMode.hide; saveHeroMode(); paintVaultValue(); };
  $("#vv-eye").onclick = flipHide;
  $("#vv-amount").onclick = flipHide;
  $("#vv-fold").onclick = (e) => { e.stopPropagation(); heroMode.collapse = !heroMode.collapse; saveHeroMode(); render(); };
  wireShareIn();
  wireBrandFix($("#f-brand"), $("#f-brand-note"));
  storePicker($("#f-brand"), $("#f-brand-sug"));
  storePicker($("#s-brand"), $("#s-brand-sug"));
  storePicker($("#paste-brand"), $("#paste-brand-sug"));
  ["#f-brand", "#f-code", "#f-pin", "#s-brand", "#s-code", "#s-pin"].forEach((x) => addClear($(x)));
  setupMobileLayout();
  wireFrozenHeader();
  applyTextZoom();

  const { data } = await api("GET", "/api/status");
  if (data.unlocked) {
    const res = await api("GET", "/api/cards");
    if (res.ok) { CARDS = res.data.cards || []; showApp(); return; }
  }
  showLock(data.exists, true);
}

// ---- x inside a field (1.3.11, A7 - Card Vault 2.0's) ----------------------
// Shown while the field has text; one tap empties it and keeps the keyboard.
function addClear(input) {
  if (!input || input.dataset.clr) return;
  input.dataset.clr = "1";
  const wrap = document.createElement("span");
  wrap.className = "clr-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const b = document.createElement("button");
  b.type = "button"; b.className = "clr-x hidden"; b.tabIndex = -1;
  b.setAttribute("aria-label", "Clear"); b.innerHTML = X_SMALL;
  wrap.appendChild(b);
  const paint = () => b.classList.toggle("hidden", !input.value);
  input.addEventListener("input", paint);
  input.addEventListener("change", paint);
  b.addEventListener("pointerdown", (e) => e.preventDefault());
  b.onclick = () => { input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true })); paint(); input.focus(); };
  input._paintClear = paint;
}
/** Values set by code (edit, scan review) - the x follows. */
function paintClears() { document.querySelectorAll(".clr-wrap input").forEach((i) => i._paintClear && i._paintClear()); }

// --------------------------------------------------------------------------- //
// Master password: strength, and lockout after wrong guesses
// --------------------------------------------------------------------------- //
// Ported from Card Vault 1.2.1, rules unchanged - read the long note there.
// In short, two defences against two different attacks:
//
//   MIN_LEN + the meter raise the cost of an OFFLINE attack on an extracted
//   vault file. Only entropy in the password helps against that.
//
//   The lockout raises the cost of ONLINE guessing - someone holding the
//   phone, typing into this screen. It does nothing for the offline case.
const MIN_LEN = 8;

// Compared after lowercasing and stripping trailing digits, so "Password1"
// is caught too.
const WEAK_PASSWORDS = [
  "password", "passw0rd", "12345678", "123456789", "qwerty", "qwertyui",
  "abcd", "abcdefg", "letmein", "welcome", "iloveyou", "admin", "master",
  "giftcard", "giftcardvault", "yourcardjourney", "vault", "secret", "monkey", "dragon",
];

function passwordScore(pw) {
  // A blunt "have you done the things that actually help" score, NOT an
  // entropy estimate - those flatter human-chosen passwords.
  if (!pw) return { score: 0, label: "", hint: "" };
  const stripped = pw.toLowerCase().replace(/[0-9]+$/, "");
  if (WEAK_PASSWORDS.indexOf(stripped) >= 0) {
    return { score: 0, label: "Too common", hint: "This is one of the first passwords anyone would try." };
  }
  if (/^(.)\1+$/.test(pw)) {
    return { score: 0, label: "Too simple", hint: "Repeating one character adds nothing." };
  }
  let s = 0;
  if (pw.length >= MIN_LEN) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  // A long passphrase is strong without symbols; saying otherwise pushes
  // people towards a short unmemorable one.
  if (pw.length >= 16) s = Math.max(s, 4);
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Strong"];
  const hints = [
    "Use at least " + MIN_LEN + " characters.",
    "Longer is better than complicated - try a few words.",
    "Add length, or a capital and a digit.",
    "Good. A few more characters would make it stronger.",
    "", "",
  ];
  const i = Math.min(s, 5);
  return { score: i, label: labels[i], hint: hints[i] };
}

function renderStrength(pw) {
  const wrap = $("#pw-strength");
  wrap.classList.toggle("is-idle", !pw);
  if (!pw) { wrap.dataset.score = ""; wrap.querySelectorAll(".pw-seg").forEach((seg) => seg.classList.remove("is-on")); return; }
  const { score, label, hint } = passwordScore(pw);
  wrap.dataset.score = String(score);
  $("#pw-strength-label").textContent = label;
  $("#pw-strength-hint").textContent = hint;
  wrap.querySelectorAll(".pw-seg").forEach((seg, i) => seg.classList.toggle("is-on", score > 0 && i < score));
}

// Eye toggle on every password field (Card Vault 1.3.6; on the create screen
// too since 1.3.9): show or hide what was typed. Buttons carry data-eye with
// the input's id; the two glyphs are drawn here, once.
const PW_EYE_SVG = '<svg class="i-eye" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.7 9.1 1.5 12c1.2 2.9 5 7 10.5 7s9.3-4.1 10.5-7C21.3 9.1 17.5 5 12 5Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>'
  + '<svg class="i-eye-off" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3.3 2 2 3.3l3.2 3.2C3.4 7.9 2.1 9.9 1.5 12c1.2 2.9 5 7 10.5 7 1.9 0 3.6-.5 5-1.3l3.7 3.6 1.3-1.3L3.3 2Zm8.7 14.5A4.5 4.5 0 0 1 7.5 12c0-.8.2-1.5.6-2.1l1.5 1.5a2.5 2.5 0 0 0 3 3l1.5 1.5c-.6.4-1.3.6-2.1.6ZM12 5c-1.3 0-2.6.2-3.7.6l1.7 1.7c.6-.2 1.3-.3 2-.3a4.5 4.5 0 0 1 4.5 4.5c0 .7-.1 1.4-.4 2l2.9 2.9c1.6-1.2 2.8-2.8 3.5-4.4C21.3 9.1 17.5 5 12 5Z"/></svg>';
function setPwVisible(id, on) {
  const input = document.getElementById(id);
  const eye = document.querySelector('[data-eye="' + id + '"]');
  if (!input || !eye) return;
  input.type = on ? "text" : "password";
  eye.setAttribute("aria-pressed", String(on));
  eye.setAttribute("aria-label", on ? "Hide password" : "Show password");
}
function wireEyes() {
  document.querySelectorAll("[data-eye]").forEach((b) => {
    if (b.dataset.wired) return;
    b.dataset.wired = "1";
    b.innerHTML = PW_EYE_SVG;
    // pointerdown keeps the keyboard up: the field does not lose focus.
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.onclick = () => setPwVisible(b.dataset.eye, b.getAttribute("aria-pressed") !== "true");
  });
}

// --- lockout ---------------------------------------------------------------
// Persisted, so force-stopping the app does not reset the counter. A
// reinstall does reset it - and also wipes the vault, so nothing is left.
const LOCKOUT_KEY = "gcv-guard";
// Wrong guesses 1-2 are free; people mistype. Then 5s, growing to 15 min.
const LOCKOUT_STEPS = [0, 0, 5, 15, 30, 60, 120, 300, 600, 900];

function guardRead() {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) || { fails: 0, until: 0 }; }
  catch (e) { return { fails: 0, until: 0 }; }
}
function guardWrite(g) { try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(g)); } catch (e) {} }
function guardClear() { try { localStorage.removeItem(LOCKOUT_KEY); } catch (e) {} }
/** Seconds still to wait, or 0. Device clock: a speed bump, not a guarantee. */
function guardRemaining() {
  return Math.max(0, Math.ceil((guardRead().until - Date.now()) / 1000));
}
function guardFail() {
  const g = guardRead();
  g.fails = (g.fails || 0) + 1;
  const wait = LOCKOUT_STEPS[Math.min(g.fails, LOCKOUT_STEPS.length - 1)];
  g.until = wait ? Date.now() + wait * 1000 : 0;
  guardWrite(g);
  return { fails: g.fails, wait };
}

let guardTimer = null;
/** Show the countdown on the unlock button and tick it down. */
function guardTick() {
  clearInterval(guardTimer);
  const btn = $("#unlock-btn");
  const paint = () => {
    const left = guardRemaining();
    if (left <= 0) {
      clearInterval(guardTimer);
      btn.disabled = false;
      btn.textContent = btn.dataset.label || "Unlock";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Try again in " + left + "s";
  };
  paint();
  if (guardRemaining() > 0) guardTimer = setInterval(paint, 1000);
}

let vaultExists = true;
/** autoOk: this lock screen may start the fingerprint prompt by itself (app
 *  start or the auto-lock) - never right after the user pressed Lock. */
function showLock(exists, autoOk) {
  vaultExists = exists;
  $("#app").classList.add("hidden");
  $("#lock").classList.remove("hidden");
  $("#lock-err").textContent = "";
  $("#pw").value = ""; $("#pw2").value = "";
  setPwVisible("pw", false); setPwVisible("pw2", false);
  $("#pw2-wrap").classList.toggle("hidden", exists);
  // Creating: "off", not "new-password". "new-password" is what makes the
  // phone's password manager offer a generated password - one tap and the
  // vault is created with a password the user never saw (closed-test bug,
  // 1.3.9). The native half is in harden-android.js (autofill excluded).
  $("#pw").setAttribute("autocomplete", exists ? "current-password" : "off");
  $("#lock-title").textContent = exists ? "Welcome back" : "Create your vault";
  $("#lock-terms").classList.toggle("hidden", exists);
  $("#lock-sub").textContent = exists
    ? "Your vault is locked. Unlock to see your gift cards."
    : "Choose a master password, at least " + MIN_LEN + " characters. It encrypts everything on this phone and can't be recovered, so make it memorable.";
  const btn = $("#unlock-btn");
  btn.dataset.label = exists ? "Unlock" : "Create my vault";
  btn.textContent = btn.dataset.label;
  btn.disabled = false;

  // The meter is for CHOOSING a password, not for rating the user's own one
  // back at them every time they open the app. While choosing, its space is
  // kept from the first key (1.3.9): it used to appear on the first
  // character and push the field up under the user's thumb, and the WebView
  // then drew the cursor where the field had been.
  $("#pw-strength").classList.toggle("hidden", exists);
  $("#pw-strength").classList.toggle("is-idle", !exists);
  $("#pw").oninput = exists ? null : (e) => renderStrength(e.target.value);

  // A lockout in progress survives a force-stop, so re-apply it here.
  if (exists) guardTick();
  setupBiometricUnlock(exists, autoOk);
  checkSubscription(exists);
}

// --------------------------------------------------------------------------- //
// Subscription (Play Billing) - see billing.js
// --------------------------------------------------------------------------- //
// 30 days free (run by the app, nothing charged), then ₹150 a year from the
// day the user taps it and confirms - auto-renewed by Google after that, like
// InShot Pro - or ₹300 once for Lifetime (1.3.11). With neither active the
// password form gives way to the two plans; the vault file itself is
// untouched, so paying opens it exactly as before.
let SUB = { active: true, plan: null };

// Not the hourglass: that is already the Expired KPI's icon in the same card.
const PLAN_ICONS = {
  trial: _SVG(`<circle cx="12" cy="13.5" r="7.5" fill="currentColor" fill-opacity=".14"/><path d="M12 9.5v4l2.5 1.5M10 2.5h4M12 2.5v3.5"/>`),
  yearly: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 11H5z"/></svg>`,
  lifetime: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 11H5z"/><circle cx="12" cy="14.5" r="2" fill="#fff" fill-opacity=".85"/></svg>`,
};
// D5 (1.3.11): the trial pill counts the last days down on the home screen.
const TRIAL_NUDGE_DAYS = 5;
const trialDaysLeft = () => SUB.trialEndsAt ? Math.max(1, Math.ceil((SUB.trialEndsAt - Date.now()) / 864e5)) : 0;
const isPaid = () => window.YCJ.billing.isPaid(SUB);

function paintPlan() {
  const plan = SUB.active ? SUB.plan : null;
  const pill = $("#plan-pill"), block = $("#plan-block");
  pill.classList.toggle("hidden", !plan);
  block.classList.toggle("hidden", !plan);
  paintExportLock();
  if (!plan) return;
  const premium = plan !== "trial";
  const left = plan === "trial" ? trialDaysLeft() : 0;
  const nudge = plan === "trial" && left <= TRIAL_NUDGE_DAYS;
  pill.innerHTML = PLAN_ICONS[plan] + '<span class="pp-text">' + (plan === "lifetime" ? "LIFETIME" : premium ? "PREMIUM"
    : nudge ? (left === 1 ? "1 DAY LEFT" : left + " DAYS LEFT") : "FREE TRIAL") + "</span>";
  pill.classList.toggle("is-premium", premium);
  pill.classList.toggle("is-nudge", nudge);
  pill.setAttribute("aria-label", premium ? (plan === "lifetime" ? "Lifetime" : "Premium") + " - open plan settings"
    : "Free trial, " + left + " days left - see plans");

  $("#plan-ico").innerHTML = PLAN_ICONS[plan];
  $("#plan-ico").classList.toggle("is-premium", premium);
  $("#plan-name").textContent = plan === "lifetime" ? "Lifetime" : premium ? "Premium · yearly" : "Free trial";
  $("#plan-note").textContent = plan === "lifetime" ? "Paid once. Yours for good."
    : premium ? "Renews yearly via Google Play"
    : left === 1 ? "Ends tomorrow" : "Ends in " + left + " days";
  // C3: buy during the trial; a yearly plan can move to Lifetime.
  const up = $("#plan-upgrade");
  up.classList.toggle("hidden", plan === "lifetime");
  up.textContent = plan === "yearly" ? "Get Lifetime instead" : "Upgrade";
  // C4: Lifetime bought while the yearly plan still renews.
  $("#plan-both").classList.toggle("hidden", !(plan === "lifetime" && SUB.alsoYearly));
}

// ---- The two plans (1.3.11, C1-C2) -----------------------------------------
// One block of markup, shown in two places: the lock screen once the trial is
// over (#sub-gate) and the plan sheet opened from Settings, the plan pill or a
// Premium lock. Prices are the store's own strings; with no answer from the
// store, no price is printed rather than a guessed one.
let PRICES = null;
function planOptionsHtml(current) {
  const yr = PRICES && PRICES.yearly, lf = PRICES && PRICES.lifetime;
  const yearlyCard = current === "yearly" ? "" : `
    <div class="plan-opt" data-plan="yearly">
      <div class="po-top"><span class="po-name">Yearly</span><span class="po-price">${yr ? esc(yr) + "<small> / year</small>" : ""}</span></div>
      <p class="po-note">Renews each year. Cancel any time in the Play Store.</p>
      <button type="button" class="ghost po-buy" data-buy="yearly">Choose yearly</button>
    </div>`;
  return yearlyCard + `
    <div class="plan-opt is-life" data-plan="lifetime">
      <div class="po-top"><span class="po-name">Lifetime</span><span class="po-price">${lf ? esc(lf) + "<small> once</small>" : ""}</span></div>
      <p class="po-note">Pay once. Never renews, never expires.</p>
      <button type="button" class="primary po-buy" data-buy="lifetime">Choose Lifetime</button>
    </div>`;
}
/** Wires the buy buttons inside `box`; `after(st)` gets the new status. */
function wirePlanButtons(box, msgEl, after) {
  box.querySelectorAll("[data-buy]").forEach((b) => b.onclick = async () => {
    msgEl.textContent = "";
    box.querySelectorAll("[data-buy]").forEach((x) => (x.disabled = true));
    try {
      const B = window.YCJ.billing;
      after(await (b.dataset.buy === "lifetime" ? B.buyLifetime() : B.subscribe()));
    } catch (e) {
      // Backing out of Google's sheet is not an error worth a red line.
      if (!window.YCJ.billing.isCancel(e)) msgEl.textContent = "Google Play could not complete the purchase. Try again.";
    }
    box.querySelectorAll("[data-buy]").forEach((x) => (x.disabled = false));
  });
}
async function loadPrices() {
  if (!PRICES) PRICES = await window.YCJ.billing.prices();
  return PRICES;
}

/** The plan sheet. `why` is a line saying what sent the user here. */
async function openPlans(why) {
  const sh = $("#plan-sheet");
  $("#plan-why").textContent = why || "";
  $("#plan-why").classList.toggle("hidden", !why);
  $("#plan-msg").textContent = "";
  const box = $("#plan-options");
  const paint = () => {
    box.innerHTML = planOptionsHtml(SUB.plan);
    wirePlanButtons(box, $("#plan-msg"), (st) => {
      if (st.active && st.plan !== "trial") {
        SUB = st; paintPlan();
        // The pill takes the new plan with a little hop; the sheet closes.
        const pill = $("#plan-pill"); pill.classList.remove("is-hop"); void pill.offsetWidth; pill.classList.add("is-hop");
        sh.classList.add("hidden");
      } else if (st.pending) $("#plan-msg").textContent = "Your payment is still being processed by Google Play.";
    });
  };
  paint();
  sh.classList.remove("hidden");
  const had = !!PRICES;
  await loadPrices();
  if (!had && !sh.classList.contains("hidden")) paint();
}
function closePlans() { $("#plan-sheet").classList.add("hidden"); }

// The answer of the check running now - the fingerprint unlock waits on it,
// so a lapsed plan can never be opened by a prompt that started early.
let subCheck = Promise.resolve({ active: true });
async function checkSubscription(exists) {
  const form = $("#unlock-form"), gate = $("#sub-gate");
  // Round 2 (feedback): asking Play takes a second or two, and the lock
  // screen used to sit empty meanwhile - so the fingerprint prompt came late.
  // When this phone's own records say the vault is open, the password and
  // fingerprint show at once; Play's answer follows and only a "no" changes it.
  const guess = window.YCJ.billing.likelyActive ? window.YCJ.billing.likelyActive() : false;
  form.classList.toggle("hidden", !guess); gate.classList.add("hidden");
  subCheck = window.YCJ.billing.status();
  SUB = await subCheck;
  paintPlan();
  if (SUB.active) { form.classList.remove("hidden"); if (!guess) setTimeout(tryBioAuto, 0); return; }
  form.classList.add("hidden");

  gate.classList.remove("hidden");
  // Only reached once the 30 free days (or a paid year) are over - a new
  // install goes straight to "Create your vault".
  $("#lock-title").textContent = exists ? "Welcome back" : "Welcome";
  $("#lock-sub").textContent = exists
    ? "Your gift cards are safe on this phone. Pick a plan to open your vault."
    : "Your free month is over. Pick a plan to keep using Gift Card Vault.";
  $("#sub-msg").textContent = SUB.pending ? "Your payment is still being processed by Google Play." : "";

  const after = (st) => {
    SUB = st;
    if (st.active) { paintPlan(); showLock(vaultExists); }
    else $("#sub-msg").textContent = st.pending
      ? "Your payment is still being processed by Google Play."
      : "No purchase found on this Google account.";
  };
  const box = $("#sub-options");
  const paint = () => { box.innerHTML = planOptionsHtml(null); wirePlanButtons(box, $("#sub-msg"), after); };
  paint();
  const had = !!PRICES;
  loadPrices().then(() => { if (!had && !gate.classList.contains("hidden")) paint(); });
  $("#sub-restore").onclick = async () => {
    $("#sub-msg").textContent = "";
    after(await window.YCJ.billing.restore());
  };
}

// ---- Export needs a paid plan (1.3.11, C5) ----------------------------------
// Export -> uninstall -> reinstall -> import was a free month every month.
// The encrypted backup and the brand export are for Yearly and Lifetime;
// importing stays open to everyone. A single card's export/share stays free.
function paintExportLock() {
  const b = $("#vault-export");
  if (!b) return;
  const locked = !isPaid();
  b.classList.toggle("is-locked", locked);
  b.innerHTML = locked
    ? '<span class="ico ico-sm">' + ICONS.lock + '</span>Export backup<span class="prem-tag">Premium</span>'
    : "Export backup";
  $("#export-lock-note").classList.toggle("hidden", !locked);
}
/** true when the action may go ahead; otherwise opens the plans and says why. */
function needsPaid(why) {
  if (isPaid()) return true;
  openPlans(why);
  return false;
}

function unlocked(cards) {
  guardClear();
  clearInterval(guardTimer);
  CARDS = cards || [];
  $("#pw").value = ""; $("#pw2").value = "";
  showApp();
}

// ---- Unsaved card across the auto-lock (1.3.9 - Card Vault 1.3.6's) --------
// Typing a voucher from a shopping app means leaving this one, and the
// auto-lock used to take everything typed with it. The Form (or an edit in
// progress) and the review list are now held IN MEMORY ONLY across a lock and
// put back after the next unlock. Never written to storage - they hold codes
// and PINs in clear - and lost with the app if Android kills it meanwhile.
let sheetDraft = null;
const DRAFT_FIELDS = ["f-brand", "f-amount", "f-code", "f-pin", "f-expiry", "f-purchased", "f-order", "f-url", "f-notes", "f-balance", "paste-text"];
function captureSheetDraft() {
  // Only what is on screen: a closed sheet is not "half-typed".
  if (filtersAreMobile && $("#add-sheet").classList.contains("hidden")) return null;
  const d = { edit: editingId, tab: (document.querySelector(".tab.active") || {}).dataset, f: {}, rows: [] };
  d.tab = d.tab ? d.tab.tab : "scan";
  DRAFT_FIELDS.forEach((id) => { d.f[id] = $("#" + id).value; });
  document.querySelectorAll("#preview-rows .preview-row").forEach((row) => {
    const c = {};
    row.querySelectorAll("input").forEach((i) => { c[i.dataset.k] = i.value; });
    d.rows.push(c);
  });
  if ($("#preview").classList.contains("hidden")) d.rows = [];
  const typed = DRAFT_FIELDS.some((id) => id !== "f-balance" && d.f[id].trim());
  return d.edit || typed || d.rows.length ? d : null;
}
function clearSheet() {
  exitEdit();
  DRAFT_FIELDS.forEach((id) => { $("#" + id).value = ""; });
  $("#preview").classList.add("hidden");
  $("#preview-rows").innerHTML = "";
}
function restoreSheetDraft(d) {
  if (d.edit && CARDS.some((c) => c.id === d.edit)) openEdit(d.edit);
  else {
    document.querySelector('.tab[data-tab="' + (d.rows.length ? "quick" : d.tab === "scan" ? "manual" : d.tab) + '"]').click();
    if (filtersAreMobile) $("#add-sheet").classList.remove("hidden");
  }
  DRAFT_FIELDS.forEach((id) => { if (id !== "f-balance" || d.edit) $("#" + id).value = d.f[id]; });
  if (d.rows.length) renderPreview(d.rows, false);
}

// --------------------------------------------------------------------------- //
// Fingerprint unlock (optional)
// --------------------------------------------------------------------------- //
// See shared/core/mobile.js for what this does and does not protect. It keeps
// a copy of the master password in the phone's secure store and hands it back
// after a fingerprint match. The vault file is unchanged and typing the
// password always works, so nothing here can make a vault unopenable.
async function setupBiometricUnlock(exists, autoOk) {
  const btn = $("#bio-unlock-btn");
  btn.classList.add("hidden");
  bioAutoArmed = false;
  // Only on an EXISTING vault - there is no password to remember before one.
  if (!exists || !window.YCJ.mobile.bioEnabled()) return;
  if (!(await window.YCJ.mobile.bioAvailable())) return;

  btn.classList.remove("hidden");
  bioAutoArmed = !!autoOk && bioAutoOn();
  btn.onclick = async () => {
    const err = $("#lock-err");
    err.textContent = "";
    // The lockout applies here too, or whoever holds the phone could bypass it.
    const left = guardRemaining();
    if (left > 0) { err.textContent = "Too many attempts. Wait " + left + "s."; return; }

    const pw = await window.YCJ.mobile.bioUnlock();
    // A plan that turned out to have lapsed while the prompt was up opens nothing.
    if (pw && !(await subCheck).active) return;
    // Cancelled or no match: ordinary; say nothing and let them type it.
    if (!pw) {
      // 1.3.10: the phone's fingerprints/faces changed, which wipes the copy
      // the secure chip held. Say so once, so the missing button makes sense.
      if (!window.YCJ.mobile.bioEnabled()) {
        btn.classList.add("hidden");
        err.textContent = "Quick unlock was switched off because this phone's fingerprints or face changed. "
          + "Enter your master password, then turn it back on in Settings.";
      }
      return;
    }

    const { ok, data } = await api("POST", "/api/unlock", { password: pw });
    if (ok) { unlocked(data.cards); return; }
    // The stored password no longer opens the vault (a vault with another
    // password was imported over this one). Drop it rather than prompt for a
    // fingerprint that can never work again.
    await window.YCJ.mobile.bioDisable();
    btn.classList.add("hidden");
    err.textContent = "Your master password has changed. Enter it to continue.";
  };

  // NOT offered automatically by default (1.3.9, as Card Vault 1.3.6): the
  // lock screen waits - type the master password, or tap this button -
  // unless the user turned on "when the app opens" in Settings. Round 2: at
  // once, like Card Vault (it was 400 ms, behind the plan check).
  setTimeout(tryBioAuto, 0);
}

// ---- "Unlock with fingerprint when the app opens" (1.3.9, OFF by default) --
// Card Vault 1.3.8's rule: a sub-option of fingerprint unlock; one prompt per
// lock screen, only on app start or after the auto-lock - never right after
// the user pressed Lock - never during a lockout or behind the subscription
// gate. Cancelling leaves the ordinary lock screen. A device setting.
const BIO_AUTO_KEY = "gcv-bio-auto";
let bioAutoArmed = false;
function bioAutoOn() {
  try { return localStorage.getItem(BIO_AUTO_KEY) === "1"; } catch (e) { return false; }
}
function setBioAuto(on) {
  try { on ? localStorage.setItem(BIO_AUTO_KEY, "1") : localStorage.removeItem(BIO_AUTO_KEY); } catch (e) {}
}
function tryBioAuto() {
  const btn = $("#bio-unlock-btn");
  if (!bioAutoArmed || btn.classList.contains("hidden") || $("#lock").classList.contains("hidden")) return;
  if ($("#unlock-form").classList.contains("hidden")) return;     // subscription gate
  if (document.visibilityState !== "visible" || guardRemaining() > 0) return;
  bioAutoArmed = false;
  btn.click();
}
// A lock that happened in the background is shown when the app comes back.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") setTimeout(tryBioAuto, 60);
});
function reflectBioAuto() {
  const row = $("#bio-auto-row"), auto = $("#bio-auto-toggle"), toggle = $("#bio-toggle");
  row.classList.toggle("hidden", !(toggle.checked && !toggle.disabled));
  $("#bio-auto-note").classList.toggle("hidden", !(toggle.checked && !toggle.disabled));
  auto.checked = bioAutoOn();
  auto.onchange = () => setBioAuto(auto.checked);
}

async function wireBiometricToggle() {
  const block = $("#bio-block"), toggle = $("#bio-toggle"), msg = $("#bio-msg");
  const say = (t) => { msg.textContent = t; msg.classList.toggle("hidden", !t); };

  // Shown either way: a documented feature that is simply absent, with no
  // reason given, is how this looked on a device in Card Vault 1.2.1.
  const st = await window.YCJ.mobile.bioStatus();
  block.classList.remove("hidden");
  toggle.disabled = !st.ok;
  if (!st.ok) { toggle.checked = false; say(st.why); reflectBioAuto(); return; }
  say("");
  toggle.checked = window.YCJ.mobile.bioEnabled();
  reflectBioAuto();
  toggle.onchange = async () => {
    say("");
    if (!toggle.checked) {
      await window.YCJ.mobile.bioDisable();
      // The sub-option goes with it: turning unlock back on later starts
      // from the default (off), not from a choice made long ago.
      setBioAuto(false); reflectBioAuto();
      toast("Fingerprint unlock turned off");
      return;
    }
    // Asked for afresh: the app deliberately never keeps the password in
    // memory after opening the vault.
    const pw = await promptMasterPassword("Enable fingerprint unlock",
      "Confirm your master password. It is stored in this phone's secure store and released only on a fingerprint match.",
      "Confirm");
    if (!pw) { toggle.checked = false; return; }
    const v = await api("POST", "/api/verify", { password: pw });
    if (!v.data.ok) { toggle.checked = false; say("That is not your master password."); return; }
    const res = await window.YCJ.mobile.bioEnable(pw);
    if (!res.ok) { toggle.checked = false; say(res.error); return; }
    reflectBioAuto();
    toast("Fingerprint unlock enabled");
  };
}

// --------------------------------------------------------------------------- //
// Auto-lock delay
// --------------------------------------------------------------------------- //
// The grace period lives in mobile.js; this is only its picker. A visible
// setting, because it is a genuine trade and it is the user's to make.
function wireAutoLock() {
  const wrap = $("#lock-choices");
  const M = window.YCJ.mobile;
  const current = M.autoLockSeconds();
  wrap.innerHTML = M.AUTOLOCK_CHOICES.map((c) =>
    '<button type="button" class="lock-choice' + (c.s === current ? " is-on" : "") +
    '" data-sec="' + c.s + '">' + c.label + "</button>").join("");
  wrap.querySelectorAll(".lock-choice").forEach((b) => {
    b.onclick = () => {
      M.setAutoLockSeconds(parseInt(b.dataset.sec, 10));
      wireAutoLock();
      toast("Auto-lock: " + b.textContent.toLowerCase());
    };
  });
}

// --------------------------------------------------------------------------- //
// Text size (1.3.11 round 2)
// --------------------------------------------------------------------------- //
// Four sizes, like the Auto-lock picker. Until the user picks one the app
// follows the phone's own font size, and the matching pill is lit. A pick is
// kept on this phone and applied at every start (the WebView's text zoom,
// through GiftReader). No font choice - size only.
const TEXT_KEY = "gcv-text-zoom";
const TEXT_SIZES = [85, 100, 115, 130];
const nearestSize = (z) => TEXT_SIZES.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
function savedTextZoom() { try { return parseInt(localStorage.getItem(TEXT_KEY) || "0", 10) || 0; } catch (e) { return 0; } }
async function applyTextZoom() {
  await window.YCJ.scan.probeReader();
  const z = savedTextZoom();
  if (z) await window.YCJ.scan.textZoom(z);
}
async function wireTextSize() {
  const r = await window.YCJ.scan.textZoom(-1);          // read only
  const current = savedTextZoom() || nearestSize(r ? r.system : 100);
  document.querySelectorAll("#text-choices [data-zoom]").forEach((b) => {
    b.classList.toggle("is-on", +b.dataset.zoom === current);
    b.onclick = async () => {
      const z = +b.dataset.zoom;
      try { localStorage.setItem(TEXT_KEY, String(z)); } catch (e) {}
      await window.YCJ.scan.textZoom(z);
      document.querySelectorAll("#text-choices [data-zoom]").forEach((x) => x.classList.toggle("is-on", x === b));
      queueFit();
    };
  });
}

// --------------------------------------------------------------------------- //
// Change master password (1.3.9 - Card Vault 1.3.5's, same rules)
// --------------------------------------------------------------------------- //
// Current + new + confirm, the rules of creating a vault (8+ characters, not a
// known-weak one, strength meter). Wrong current passwords count towards the
// unlock screen's lockout: an unlocked phone left on a table must not become
// a free password-guessing machine. Success is said in the section itself,
// not in a pop-up.
function resetPasswordForm() {
  $("#pw-form").classList.add("hidden");
  $("#pw-change-open").classList.remove("hidden");
  ["pw-cur", "pw-new", "pw-new2"].forEach((id) => { $("#" + id).value = ""; setPwVisible(id, false); });
  $("#pw-msg").classList.add("hidden");
  $("#pw-new-strength").classList.add("hidden");
  $("#pw-submit").disabled = false; $("#pw-submit").textContent = "Change password";
}
function renderNewStrength(pw) {
  const wrap = $("#pw-new-strength");
  if (!pw) { wrap.classList.add("hidden"); return; }
  const { score, label, hint } = passwordScore(pw);
  wrap.classList.remove("hidden"); wrap.dataset.score = String(score);
  $("#pw-new-strength-label").textContent = label;
  $("#pw-new-strength-hint").textContent = hint;
  wrap.querySelectorAll(".pw-seg").forEach((seg, i) => seg.classList.toggle("is-on", score > 0 && i < score));
}
function wirePasswordChange() {
  const msg = $("#pw-msg");
  const say = (t) => { msg.textContent = t; msg.classList.remove("hidden"); };
  $("#pw-change-open").onclick = () => {
    $("#pw-done").classList.add("hidden");
    $("#pw-change-open").classList.add("hidden");
    $("#pw-form").classList.remove("hidden");
    setTimeout(() => $("#pw-cur").focus(), 40);
  };
  $("#pw-cancel").onclick = resetPasswordForm;
  $("#pw-new").oninput = (e) => renderNewStrength(e.target.value);
  $("#pw-form").onsubmit = async (e) => {
    e.preventDefault();
    msg.classList.add("hidden");
    const cur = $("#pw-cur").value, next = $("#pw-new").value, again = $("#pw-new2").value;
    const left = guardRemaining();
    if (left > 0) return say("Too many attempts. Wait " + left + "s.");
    if (!cur) return say("Enter your current password.");
    if (next.length < MIN_LEN) return say("Use at least " + MIN_LEN + " characters for the new password.");
    if (passwordScore(next).score === 0) return say(passwordScore(next).hint || "Choose something harder to guess.");
    if (next !== again) return say("The new passwords don't match.");
    if (next === cur) return say("That is the password you already have.");
    const btn = $("#pw-submit");
    btn.disabled = true; btn.textContent = "Re-encrypting…";
    const { ok } = await api("POST", "/api/password", { current: cur, next });
    btn.disabled = false; btn.textContent = "Change password";
    if (!ok) {
      guardFail();
      $("#pw-cur").value = "";
      return say("That is not your current password.");
    }
    guardClear();
    const bioKept = await window.YCJ.mobile.bioUpdate(next);
    resetPasswordForm();
    if (!bioKept) await wireBiometricToggle();
    const done = $("#pw-done");
    done.textContent = bioKept ? "Master password changed." : "Master password changed. Turn fingerprint unlock on again to use it.";
    done.classList.remove("hidden");
  };
}

// --------------------------------------------------------------------------- //
// Confirm-with-password dialog
// --------------------------------------------------------------------------- //
/** Resolves to the typed password, or null if cancelled. One implementation
 *  for every "prove it's you" step (delete, enabling fingerprint). */
function promptMasterPassword(title, body, okLabel, danger) {
  return new Promise((resolve) => {
    $("#modal-box").innerHTML =
      '<form id="mpw-form" class="mpw" autocomplete="off">' +
      '<h3 class="mpw-title">' + esc(title) + "</h3>" +
      (body ? '<p class="mpw-body">' + esc(body) + "</p>" : "") +
      '<input id="mpw-input" type="password" placeholder="Master password" autocomplete="off" />' +
      '<div class="mpw-foot">' +
      '<button type="button" class="ghost" id="mpw-cancel">Cancel</button>' +
      '<button type="submit" class="' + (danger ? "danger" : "primary") + '" id="mpw-ok">' + esc(okLabel || "Confirm") + "</button>" +
      "</div></form>";
    $("#modal").classList.remove("hidden");
    const done = (v) => { $("#modal").classList.add("hidden"); $("#modal").onclose = null; resolve(v); };
    // Closing by hardware back / scrim must settle the promise too.
    $("#modal").onclose = () => done(null);
    $("#mpw-cancel").onclick = () => done(null);
    $("#mpw-form").onsubmit = (e) => { e.preventDefault(); done($("#mpw-input").value || null); };
    setTimeout(() => $("#mpw-input").focus(), 40);
  });
}
function closeModal() {
  const m = $("#modal");
  if (m.onclose) m.onclose(); else m.classList.add("hidden");
}

// --------------------------------------------------------------------------- //
// Mobile shell
// --------------------------------------------------------------------------- //
// The phone behaviours with no desktop equivalent. The substance is in
// shared/core/mobile.js; this only says what Gift Card Vault wants.
function setupMobileShell() {
  const open = (sel) => !$(sel).classList.contains("hidden");
  window.YCJ.mobile.setup({
    // Fingerprint prompt title and secure-store entry belong to THIS app.
    appName: "Gift Card Vault",
    bioServer: "com.yourcardjourney.giftcardvault",
    keyPrefix: "gcv",

    // Called once the auto-lock grace period has run out in the background
    // (Settings > Auto-lock, default one minute - copying a code into a
    // shopping app and back must not cost a password every time). FLAG_SECURE
    // keeps the codes out of the recents thumbnail throughout.
    onBackground: () => { if (window.YCJ.vault.unlocked) lockNow({ quiet: true }); },

    // Walk the UI stack; only an empty stack exits, and an unlocked vault
    // locks first so the last back press never leaves codes decrypted.
    onBack: () => {
      if (open("#modal")) { closeModal(); return true; }
      if (open("#plan-sheet")) { closePlans(); return true; }
      if (open("#ms-sheet")) { $("#ms-sheet").classList.add("hidden"); return true; }
      if (open("#spend-sheet")) { $("#spend-sheet").classList.add("hidden"); return true; }
      if (open("#use-sheet")) { closeUse(); return true; }
      if (open("#filter-sheet")) { $("#filter-sheet").classList.add("hidden"); return true; }
      if (open("#terms-sheet")) { $("#terms-sheet").classList.add("hidden"); return true; }
      if (open("#add-sheet")) { closeAddSheet(); return true; }
      if (open("#lic-modal")) { $("#lic-modal").classList.add("hidden"); return true; }
      if (open("#preview")) { $("#preview").classList.add("hidden"); return true; }
      if (searchOpen()) { closeSearch(); return true; }
      if (window.YCJ.vault.unlocked) { lockNow(); return true; }
      return false;
    },

    // No statusBarColor: Android 15 ignores it and Play flags the call. The
    // header paints that strip itself - see mobile.js section 3.
    statusBarDark: true,
  });
}

/** Lock and return to the password screen. One implementation, shared by the
 *  header button, the hardware back key and the background handler. */
async function lockNow(opts) {
  // A card half-typed when the lock comes is kept for the next unlock.
  sheetDraft = captureSheetDraft();
  clearSheet();
  await api("POST", "/api/lock");
  CARDS = [];
  REVEALED.clear();
  revealUntil.clear();
  if (!storeLocked) storesPicked = new Set();
  storeQuery = "";
  if (filterStatus === "archived") filterStatus = "all";
  closeBell();
  stopCollect();
  hideUndo();
  resetScan();
  window.YCJ.scan.terminate();
  closeModal();
  closeUse();
  ["#lic-modal", "#preview", "#filter-sheet", "#add-sheet", "#spend-sheet", "#terms-sheet", "#bell-sheet", "#plan-sheet", "#ms-sheet"].forEach((s) => $(s).classList.add("hidden"));
  closeSearch();
  showLock(true, !!(opts && opts.quiet));
  if (!opts || !opts.quiet) toast("Vault locked");
}

// --------------------------------------------------------------------------- //
// Backup & transfer
// --------------------------------------------------------------------------- //
// Replaces the desktop's licence panel, and reuses its modal (#lic-modal) so
// the markup and the dismissal wiring at the bottom of this file stay as they
// are. It is the only place in the app that touches a file.
function wireVaultSheet() {
  const btn = $("#vault-btn");
  if (btn) btn.onclick = openVaultSheet;
  wirePasswordChange();
  // Terms & conditions (1.3.9): from Settings, and from Create your vault.
  const terms = $("#terms-sheet");
  const closeTerms = () => terms.classList.add("hidden");
  $("#terms-open").onclick = () => terms.classList.remove("hidden");
  $("#lock-terms-link").onclick = () => terms.classList.remove("hidden");
  $("#terms-close").onclick = closeTerms;
  $("#terms-done").onclick = closeTerms;
  terms.onclick = (e) => { if (e.target.id === "terms-sheet") closeTerms(); };

  $("#vault-export").onclick = async () => {
    const msg = $("#vault-msg");
    msg.textContent = "";
    if (!needsPaid("The encrypted export comes with Yearly or Lifetime.")) return;
    const { data } = await api("POST", "/api/export", {});
    if (data.error) { msg.textContent = "There is nothing saved to export yet."; return; }
    toast("Backup ready to share");
  };

  $("#vault-import").onclick = async () => {
    const msg = $("#vault-msg");
    msg.textContent = "";
    const bytes = await window.YCJ.mobile.pickFile(".dat");
    if (!bytes) return;
    const pw = $("#vault-import-pw").value;
    if (!pw) { msg.textContent = "Enter the master password that file was saved with."; return; }
    const mode = $("#vault-merge").checked ? "merge" : "replace";
    const b = $("#vault-import");
    b.disabled = true; b.textContent = "Opening…";
    const res = await window.YCJ.importVault(pw, bytes, mode);
    b.disabled = false; b.textContent = "Choose a file to import";
    $("#vault-import-pw").value = "";
    if (!res.ok) { msg.textContent = res.error; return; }
    $("#lic-modal").classList.add("hidden");
    // 1.3.11 (C6): the file brought its own trial date; an earlier one may
    // have just ended this phone's free month.
    const st = await window.YCJ.billing.status();
    if (!st.active) { lockNow({ quiet: true }); return; }
    SUB = st; paintPlan();
    CARDS = JSON.parse(JSON.stringify(window.YCJ.vault.items));
    showApp();
    // Say which password applies now - after a restore that is worth stating.
    const n = res.added + (res.added === 1 ? " card" : " cards");
    if (res.replaced && res.keptPassword) toast(n + " restored · your existing password still applies");
    else if (res.replaced) toast(n + " restored · use that file's password from now on");
    else toast(n + " added" + (res.skipped ? " · " + res.skipped + " already here" : ""));
  };
}

async function openVaultSheet() {
  $("#vault-msg").textContent = "";
  $("#vault-import-pw").value = "";
  const { data } = await api("GET", "/api/backups");
  const n = (data.backups || []).length;
  $("#vault-backup-count").textContent = n
    ? n + (n === 1 ? " automatic backup" : " automatic backups") + " on this phone: one a day, the last 4 days."
    : "No automatic backup yet. One is kept each day you change something; the last 4 days are kept.";
  wireAutoLock();
  wireTextSize();
  resetPasswordForm();
  $("#pw-done").classList.add("hidden");
  paintCheckoutSetting();
  renderManageStores();
  await wireBiometricToggle();
  $("#lic-modal").classList.remove("hidden");
  paintVersion();
}

/** Settings > About: version + build - what support asks for first
 *  (1.3.11, A11). The version
 *  is stamped into the page by tools/sync.js, so it shows in every build;
 *  the phone's own answer wins where there is one. */
async function paintVersion() {
  let v = ((document.querySelector('meta[name="app-version"]') || {}).content || "").trim();
  try {
    const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A && A.getInfo) { const i = await A.getInfo(); if (i && i.version) v = i.version + (i.build ? " (" + i.build + ")" : ""); }
  } catch (e) { /* the stamped one stays */ }
  $("#app-ver-num").textContent = v || "-";
}

function showApp() {
  $("#lock").classList.add("hidden");
  $("#app").classList.remove("hidden");
  applyTheme(document.body.dataset.theme || "light");
  render();
  if (window.__gcvPlayMark) window.__gcvPlayMark();   // the gift box hops in
  // A half-typed card from before the lock comes back first; a share that
  // arrived meanwhile then takes the screen, as it always did.
  if (sheetDraft) { const d = sheetDraft; sheetDraft = null; restoreSheetDraft(d); }
  consumeShared();               // a share that arrived while locked
}

$("#unlock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#pw").value, err = $("#lock-err");
  if (!pw) return;
  err.textContent = "";

  if (!vaultExists) {
    // Creating: enforce a password worth having - everything rests on it.
    if (pw.length < MIN_LEN) {
      err.textContent = "Use at least " + MIN_LEN + " characters. This password is the only thing protecting your cards.";
      return;
    }
    if (passwordScore(pw).score === 0) {
      err.textContent = passwordScore(pw).hint || "Choose something harder to guess.";
      return;
    }
    if (pw !== $("#pw2").value) { err.textContent = "Passwords don't match."; return; }
  } else {
    const left = guardRemaining();
    if (left > 0) { err.textContent = "Too many attempts. Wait " + left + "s."; return; }
  }

  const btn = $("#unlock-btn");
  btn.disabled = true; btn.textContent = vaultExists ? "Unlocking…" : "Creating…";
  const { ok, data } = await api("POST", "/api/unlock", { password: pw });
  btn.disabled = false; btn.textContent = btn.dataset.label;
  if (ok) { unlocked(data.cards); return; }

  if (data.error === "wrong password") {
    const { fails, wait } = guardFail();
    guardTick();
    err.textContent = wait
      ? "Wrong password. " + fails + " failed attempts - wait " + wait + "s."
      : "Wrong password. Try again.";
  } else {
    err.textContent = data.error || "Could not unlock.";
  }
});

$("#lock-btn").addEventListener("click", () => lockNow());
// The pill: during the trial it leads to the plans (D5), otherwise to Settings.
$("#plan-pill").addEventListener("click", () => (SUB.plan === "trial" ? openPlans() : $("#vault-btn").click()));
$("#plan-upgrade").addEventListener("click", () => openPlans());
$("#plan-manage").addEventListener("click", () => window.YCJ.billing.manage());
$("#plan-close").addEventListener("click", closePlans);
$("#plan-sheet").addEventListener("click", (e) => { if (e.target.id === "plan-sheet") closePlans(); });

// A subscription can end while the vault sits open (trial over, renewal
// failed, refunded). Re-ask Play whenever the app comes back to the screen.
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || $("#app").classList.contains("hidden")) return;
  const st = await window.YCJ.billing.status();
  if (!st.active && !$("#app").classList.contains("hidden")) { lockNow(); return; }
  SUB = st; paintPlan();
});

$("#theme-btn").addEventListener("click", () => {
  applyTheme(document.body.dataset.theme === "light" ? "dark" : "light");
});

// --------------------------------------------------------------------------- //
// Tabs
// --------------------------------------------------------------------------- //
// ---- Starting from scratch (round 4) -----------------------------------------
// Closing "Add a card" ends that adding: the list, the paste box, the form, the
// collected codes and the scanner all go, so the next + starts at zero - a
// voucher the user removed never comes back. "Start over" (or tapping step 1)
// does the same inside one way in and stays on it. (A vault that LOCKS while
// adding still keeps the half-done work for the unlock - lockNow's draft.)
function clearAddFlow() {
  clearTimeout(pvUndoTimer); pvUndoRow = null; $("#pv-undo").classList.add("hidden");
  $("#preview").classList.add("hidden");
  $("#preview-rows").innerHTML = "";
  pvIdx = 0;
  ["paste-text", "paste-brand", "bulk-brand", "bulk-expiry"].forEach((id) => { $("#" + id).value = ""; });
  if (!editingId) ["f-brand", "f-amount", "f-code", "f-pin", "f-expiry", "f-purchased", "f-order", "f-url", "f-notes"].forEach((id) => { $("#" + id).value = ""; });
  setNoExpiry(false);
  $("#f-exp-rule").classList.add("hidden");
  $("#add-msg").textContent = ""; $("#import-msg").textContent = "";
  if (collect.on) { collect.on = false; paintCollect(); }
  resetScan();
  intakeStatus("");
  paintClears();
}
function closeAddSheet() {
  $("#add-sheet").classList.add("hidden");
  exitEdit();
  clearAddFlow();
  setMode("");
}
/** Start over: this way in, from its first step, nothing kept. */
function startOver() {
  const route = addRoute || "";
  clearAddFlow();
  setMode(route);
  if (route === "collect") startCollect();
}

// ---- The Add sheet's modes (1.3.11 round 2) ---------------------------------
// "" = the ways in (Scan card big, then Upload / Paste / Type it in / Collect
// codes); any other mode folds those into one bar - "Scan card · Other ways"
// - and shows only its own panel. The old tab buttons are still clicked by
// code to open a panel; they map onto these modes.
let addMode = "";
const MODE_PANEL = { scan: "scan", upload: "upload", paste: "quick", form: "manual", collect: "", review: "" };
const MODE_NAME = { scan: "Scan card", upload: "Upload", paste: "Paste", form: "Type it in", collect: "Collect codes", review: "Review" };
const MODE_ICON = { scan: "#in-scan", upload: "#in-upload", paste: "#in-paste", form: "#in-form", collect: "#in-collect", review: "#in-upload" };
let addRoute = "";               // the way in last used - step 1's name
function setMode(m) {
  addMode = m || "";
  if (addMode && addMode !== "review") addRoute = addMode;
  const panel = $("#add-panel");
  panel.dataset.mode = addMode;
  $("#add-launch").classList.toggle("hidden", !!addMode);
  $("#add-nav").classList.toggle("hidden", !addMode);
  ["scan", "manual", "quick", "upload"].forEach((n) => $("#tab-" + n).classList.toggle("hidden", MODE_PANEL[addMode] !== n));
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === MODE_PANEL[addMode]));
  paintModeBar();
}
// One plain line under the steps says what to do now (round 4).
const STEP_HINT = {
  1: (r) => ({
    scan: "Step 1 of 3 - Point the camera at the gift card. Fix or lock any value, then tap Next.",
    upload: "Step 1 of 3 - Pick screenshots, a PDF or a CSV file. Every voucher in them is found.",
    paste: "Step 1 of 3 - Paste or type your vouchers in the box, one per line, then tap Find the vouchers.",
    form: "Step 1 of 3 - Fill in the card's details and tap Save card.",
    collect: "Step 1 of 3 - Copy a code in the other app and come back. Repeat, then tap Done.",
  }[r] || "Step 1 of 3 - Read the vouchers."),
  2: (r, n) => "Step 2 of 3 - Check " + (n === 1 ? "the voucher" : "each of the " + n + " vouchers") + ": store, code, PIN, amount, expiry. Remove any you don't want.",
  3: () => "Step 3 of 3 - Look over the list once more and tap Add.",
};
/** Is anything typed / read in this way in yet (for Start over)? */
function stepHasInput() {
  return !!($("#paste-text").value.trim() || (addMode === "form" && !editingId && ["f-brand", "f-code", "f-pin", "f-amount"].some((id) => $("#" + id).value.trim()))
    || (addMode === "scan" && (cam.on || Object.keys(cam.seen).length)) || collect.n);
}
function paintModeBar() {
  const n = previewRows().filter((r) => !r.classList.contains("is-gone")).length;
  if (addMode) {
    // Step 1 is named after the way in (Scan card, Upload...), step 2 is the
    // check, step 3 the save (lit while the confirmation is up).
    $("#ab-name").textContent = MODE_NAME[addRoute] || "Read";
    const step = $("#modal").dataset.confirm === "1" ? 3 : addMode === "review" ? 2 : 1;
    $("#add-hint").textContent = STEP_HINT[step](addRoute, n);
    $("#add-reset").classList.toggle("hidden", !(n || stepHasInput()));
    document.querySelectorAll("#add-steps li").forEach((li) => {
      const k = +li.dataset.step;
      li.classList.toggle("is-on", k === step);
      li.classList.toggle("is-done", k < step);
    });
  }
  // On the ways in, a list in progress is one tap away.
  const resume = $("#al-resume");
  resume.classList.toggle("hidden", !(n && !addMode));
  resume.textContent = "Back to your list · " + n + (n === 1 ? " voucher" : " vouchers");
}
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    const tab = t.dataset.tab;
    setMode(tab === "scan" ? "scan" : tab === "manual" ? "form" : tab === "upload" ? "upload"
      : collect.on ? "collect" : batchOpen() ? "review" : "paste");
  });
});

// --------------------------------------------------------------------------- //
// Add / import
// --------------------------------------------------------------------------- //
// Parse rough text into an editable preview (does NOT save yet).
$("#preview-btn").addEventListener("click", async () => {
  const text = $("#paste-text").value;
  if (!text.trim()) return;
  const brand = $("#paste-brand").value;
  const { data } = await api("POST", "/api/parse", { text, brand });
  const msg = $("#import-msg");
  if (!data.count) {
    msg.textContent = "Couldn't read any cards from that. Try one card per line.";
    msg.style.color = "var(--amber)";
    setTimeout(() => (msg.textContent = ""), 4000);
    return;
  }
  msg.textContent = "";
  // An open list grows (1.3.9); pasting into an empty one starts it.
  renderPreview(data.cards, batchOpen());
});

// The paste parser takes the store from the words before the code, which for
// a shared email can be its subject - "Your Myntra gift vouchers". When the
// whole phrase is no known store, look for one INSIDE it (exact matches only,
// longest phrase first), so it is still the "Myntra" the user would type.
function storeIn(raw) {
  const B = window.YCJ.brands;
  const whole = B.canonical(raw);
  if (B.match(raw)) return whole;
  const words = String(raw).split(/\s+/).filter(Boolean);
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const m = B.match(words.slice(i, i + n).join(" "));
      if (m && m.how === "exact") return m.store.name;
    }
  }
  return whole;
}

/** The review list. append=true ADDS to the rows already there (1.3.9:
 *  "scan again" used to wipe what had been read), skipping a code that is
 *  already in the list. */
function renderPreview(cards, append) {
  // Round 2: vouchers that came in together (one screenshot, one scan, one
  // message) usually share a store - one with none takes the one most of the
  // others name, marked Check, so a five-card BigBasket screen is BigBasket x5.
  if (cards.length > 1) {
    const st = sharedStore(cards);
    // Only a voucher that names NO store - one that names a store not on the
    // list keeps it, to be picked (it is never quietly made someone else's).
    if (st) cards = cards.map((c) => (String(c.brand || "").trim() ? c : Object.assign({}, c, { brand: st, _guess: (c._guess || []).concat("brand") })));
    // The same for a value or a validity printed once for all of them: when
    // every voucher that has one agrees, the others take it (marked Check).
    ["amount", "expiry"].forEach((f) => {
      const vals = cards.map((c) => String(c[f] || "").trim()).filter(Boolean);
      if (vals.length < 2 || vals.length === cards.length || new Set(vals).size !== 1) return;
      cards = cards.map((c) => (String(c[f] || "").trim() ? c : Object.assign({}, c, { [f]: vals[0], _guess: (c._guess || []).concat(f) })));
    });
  }
  // Correct store names here too, where the user can still see and change it.
  cards = cards.map((c) => {
    const fixed = storeIn(c.brand || "");
    const out = fixed !== (c.brand || "").trim() ? Object.assign({}, c, { brand: fixed, _was: c.brand }) : c;
    // Every way in goes through the same checks (reconcile.js) - unless it
    // has been reconciled already (two reads compared).
    return out._checked ? out : window.YCJ.reconcile.check(out);
  });
  const box = $("#preview-rows");
  if (pvUndoRow) { pvUndoRow.remove(); pvUndoRow = null; clearTimeout(pvUndoTimer); $("#pv-undo").classList.add("hidden"); }
  if (!append) box.innerHTML = "";
  const have = new Set([...box.querySelectorAll('input[data-k="code"]')].map((i) => codeKey(i.value)).filter(Boolean));
  const added = [];
  cards.forEach((c) => {
    const k = codeKey(c.code);
    if (k && have.has(k)) return;
    if (k) have.add(k);
    // A real date gets the calendar (1.3.9); anything else stays as read.
    const iso = isoExpiry(c.expiry || "");
    const dateOk = !c.expiry || !!iso;
    const row = document.createElement("div");
    row.className = "preview-row" + (append ? " is-new" : "");
    row.dataset.guess = (c._guess || []).join(",");
    row.innerHTML = `
      <label class="pr-f pr-brand"><span>Store</span><input data-k="brand" value="${escAttr(c.brand)}" placeholder="Pick a store" autocomplete="off" autocapitalize="words"${c._was ? ` class="fixed" title="Corrected from ${escAttr(c._was)}"` : ""} /><div class="sp-suggest hidden" role="listbox"></div></label>
      <label class="pr-f pr-amount"><span>Amount</span><input data-k="amount" value="${escAttr(c.amount)}" placeholder="Amount" inputmode="decimal" /></label>
      <label class="pr-f pr-code"><span>Code</span><input data-k="code" value="${escAttr(c.code)}" placeholder="Code" autocapitalize="characters" autocorrect="off" spellcheck="false" /></label>
      <label class="pr-f pr-pin"><span>PIN</span><input data-k="pin" value="${escAttr(c.pin)}" placeholder="PIN" inputmode="numeric" autocorrect="off" spellcheck="false" /></label>
      <label class="pr-f pr-expiry"><span>Valid till</span><input data-k="expiry" value="${escAttr(dateOk ? iso : c.expiry)}" ${dateOk ? 'type="date" aria-label="Expiry"' : 'placeholder="Expiry (any format)"'} /></label>
      <button class="prow-x" type="button" aria-label="Remove this voucher">${svgIcon("trash")}<span>Remove this voucher</span></button>`;
    row.querySelector(".prow-x").onclick = () => removeRow(row);
    // Fields the desktop parser does not carry ride on the row (B9, B10).
    if (c.purchased) row.dataset.purchased = c.purchased;
    if (c.no_expiry) row.dataset.noExpiry = "1";
    box.appendChild(row);
    wireRow(row);
    // Round 2: the same type-ahead store list as the Form and the scanner.
    const bi = row.querySelector('input[data-k="brand"]');
    storePicker(bi, row.querySelector(".pr-brand .sp-suggest"));
    const settle = () => { const v = bi.value.trim(); const st = listedStore(v); if (st && st !== v) bi.value = st; paintRow(row); paintPreviewCount(); };
    bi.addEventListener("store-picked", settle);
    bi.addEventListener("change", settle);
    // A store read from the text that is no listed store is cleared to be picked.
    if (bi.value && !listedStore(bi.value)) { row.dataset.readStore = bi.value; bi.value = ""; bi.placeholder = "Pick a store (read: " + row.dataset.readStore.slice(0, 24) + ")"; }
    else if (bi.value) bi.value = listedStore(bi.value);
    paintRow(row);
    added.push(row);
  });
  // The pager opens on the first new voucher.
  if (added.length) pvIdx = previewRows().indexOf(added[0]);
  paintPreviewCount();
  if (filtersAreMobile && addMode !== "collect") setMode("review");
  $("#preview").classList.remove("hidden");
  ($("#preview")).scrollIntoView({ behavior: "smooth", block: "nearest" });
  return added.length;
}
function paintPreviewCount() {
  const rows = previewRows().filter((r) => !r.classList.contains("is-gone"));
  const n = rows.length;
  const fresh = rows.filter((r) => !r.classList.contains("is-dup"));
  const check = fresh.filter((r) => r.classList.contains("is-flagged")).length;
  const dups = n - fresh.length;
  const total = fresh.reduce((t, r) => t + paise(rowValue(r, "amount")), 0);
  $("#preview-count").textContent = `${n} VOUCHER${n === 1 ? "" : "S"} FOUND`;
  // 1.3.11 (E3): "10 vouchers found · ₹5,000 · 1 to check".
  $("#pv-sum").innerHTML = [total ? "<b>" + rupee(total / 100) + "</b>" : "",
    check ? '<span class="pv-check">' + check + " to check</span>" : "",
    dups ? dups + " already saved" : ""].filter(Boolean).join(" · ");
  $("#save-all-btn").textContent = fresh.length ? "Save " + fresh.length : "Save";
  // Round 4: removed down to none - the list is over, nothing pending.
  if (!n && !pvUndoRow && !$("#preview").classList.contains("hidden")) {
    $("#preview").classList.add("hidden");
    if (addMode === "review") setMode(addRoute === "collect" ? "" : addRoute);
  }
  $("#save-all-btn").disabled = !fresh.length;
  $("#bulk-tools").classList.toggle("hidden", n < 2);
  paintPager();
  paintModeBar();
}

// ---- the review, one voucher at a time (1.3.11 round 2) -----------------------
// Ten vouchers from one screenshot were ten rows to scroll through; now one
// shows at a time with ‹ 3 of 10 ›, a dot per voucher (amber = check, grey =
// already saved) to jump, and a sideways swipe moves too. Save saves them all.
let pvIdx = 0;
function paintPager() {
  const rows = previewRows().filter((r) => !r.classList.contains("is-gone"));
  const n = rows.length;
  pvIdx = Math.max(0, Math.min(pvIdx, n - 1));
  rows.forEach((r, i) => r.classList.toggle("is-current", i === pvIdx));
  $("#preview").classList.toggle("is-paged", n > 1);
  $("#pv-pager").classList.toggle("hidden", n < 2);
  // Round 2: "5 gift cards found" over the list, so one scan reading five is
  // never mistaken for one card.
  const pf = $("#pv-found");
  if (n >= 2 && pf.classList.contains("hidden")) { pf.classList.remove("hidden", "is-pop"); void pf.offsetWidth; pf.classList.add("is-pop"); }
  if (n < 2) pf.classList.add("hidden");
  $("#pv-found-n").textContent = n + " gift cards found";
  if (n < 2) return;
  $("#pv-pos").textContent = (pvIdx + 1) + " of " + n;
  $("#pv-prev").disabled = pvIdx === 0;
  $("#pv-next").disabled = pvIdx === n - 1;
  $("#pv-dots").innerHTML = n <= 20 ? rows.map((r, i) => '<i class="' + (i === pvIdx ? "on " : "")
    + (r.classList.contains("is-dup") ? "dup" : r.classList.contains("is-flagged") ? "chk" : "") + '" data-i="' + i + '"></i>').join("") : "";
}
function stepPager(d) {
  const n = previewRows().filter((r) => !r.classList.contains("is-gone")).length;
  const next = pvIdx + d;
  if (next < 0 || next >= n) return;
  pvIdx = next;
  paintPager();
  const cur = previewRows().filter((r) => !r.classList.contains("is-gone"))[pvIdx];
  if (cur) { cur.classList.remove("is-in-l", "is-in-r"); void cur.offsetWidth; cur.classList.add(d > 0 ? "is-in-l" : "is-in-r"); }
}
/** A review list is open with something in it - new reads join it. */
const batchOpen = () => !$("#preview").classList.contains("hidden") && !!document.querySelector("#preview-rows .preview-row");
const showList = () => setMode(collect.on ? "collect" : "review");

$("#edit-cancel").addEventListener("click", () => {
  exitEdit();
  if (filtersAreMobile) $("#add-sheet").classList.add("hidden");
});

$("#cancel-preview-btn").addEventListener("click", () => {
  clearTimeout(pvUndoTimer); pvUndoRow = null; $("#pv-undo").classList.add("hidden");
  $("#preview").classList.add("hidden");
  $("#preview-rows").innerHTML = "";
  stopCollect();
  if (filtersAreMobile) setMode("");
});

$("#save-all-btn").addEventListener("click", () => confirmSave());
/** Step 3 (round 3): nothing reaches the vault before the user has seen the
 *  whole batch once more - store, code, value, expiry of each - and said Add. */
function confirmSave() {
  const live = previewRows().filter((r) => !r.classList.contains("is-gone"));
  const missing = live.findIndex((r) => !r.classList.contains("is-dup") && !settleStore(r.querySelector('input[data-k="brand"]')));
  if (missing >= 0) return saveAll();                         // shows what to pick
  const fresh = live.filter((r) => !r.classList.contains("is-dup"));
  if (!fresh.length) return saveAll();
  const flagged = fresh.filter((r) => r.classList.contains("is-flagged")).length;
  const total = fresh.reduce((t, r) => t + paise(rowValue(r, "amount")), 0);
  const n = fresh.length;
  $("#modal-box").innerHTML = `
    <div class="cf">
      <h3 class="mpw-title">Add ${n} gift card${n === 1 ? "" : "s"} to your vault?</h3>
      <p class="cf-sum">${total ? "<b>" + rupee(total / 100) + "</b> in all" : ""}</p>
      <ol class="cf-list">${fresh.map((r) => {
        const st = rowValue(r, "brand"), exp = rowValue(r, "expiry"), amt = rowValue(r, "amount");
        return '<li' + (r.classList.contains("is-flagged") ? ' class="is-chk"' : "") + '><span class="gc-glyph sm" style="' + window.YCJ.brands.style(st) + '">'
          + esc(window.YCJ.brands.theme(st).g) + '</span><span class="cf-t"><b>' + esc(st) + '</b><small>' + esc(groupCode(rowValue(r, "code")))
          + (rowValue(r, "pin") ? " · PIN ••••" : "") + '</small></span><span class="cf-v">' + (amt ? rupee(num(amt)) : "") + (exp ? "<small>" + esc(fmtExpiry(exp)) + "</small>" : "") + "</span></li>";
      }).join("")}</ol>
      ${flagged ? `<p class="cf-warn">${flagged} marked Check - worth one more look.</p>` : ""}
      <div class="mpw-foot">
        <button type="button" class="ghost" id="cf-back">Back to check</button>
        <button type="button" class="primary" id="cf-go">Add ${n} gift card${n === 1 ? "" : "s"}</button>
      </div>
    </div>`;
  $("#modal").dataset.confirm = "1";
  $("#modal").classList.remove("hidden");
  paintModeBar();
  const done = () => { $("#modal").classList.add("hidden"); $("#modal").onclose = null; delete $("#modal").dataset.confirm; paintModeBar(); };
  $("#modal").onclose = done;
  $("#cf-back").onclick = done;
  $("#cf-go").onclick = () => { done(); saveAll(); };
}
async function saveAll() {
  const live = previewRows().filter((r) => !r.classList.contains("is-gone"));
  const missing = live.findIndex((r) => !r.classList.contains("is-dup") && !settleStore(r.querySelector('input[data-k="brand"]')));
  if (missing >= 0) {
    pvIdx = missing; paintPager(); live.forEach(paintRow); paintPreviewCount();
    const msg = $("#import-msg"); msg.textContent = STORE_MSG; msg.style.color = "var(--amber)";
    intakeStatus(STORE_MSG, true);
    const bi = live[missing].querySelector('input[data-k="brand"]');
    bi.classList.remove("is-flash"); void bi.offsetWidth; bi.classList.add("is-flash");
    return;
  }
  intakeStatus("");
  const rows = [...document.querySelectorAll(".preview-row")].filter((row) => !row.classList.contains("is-gone")).map((row) => {
    const c = {};
    row.querySelectorAll("input[data-k]").forEach((inp) => (c[inp.dataset.k] = inp.value));
    if (row.dataset.purchased) c.purchased = row.dataset.purchased;
    if (row.dataset.noExpiry) c.no_expiry = "1";
    return c;
  });
  if (!rows.length) { $("#cancel-preview-btn").click(); return; }
  // Skip codes already in the vault - and repeats within this batch, which a
  // forwarded email that quotes the original produces.
  const seen = new Set();
  const fresh = rows.filter((r) => {
    const k = codeKey(r.code);
    if (!k || dupOf(r.code) || seen.has(k)) return false;
    seen.add(k); return true;
  });
  const skipped = rows.length - fresh.length;
  if (!fresh.length) {
    const msg = $("#import-msg");
    msg.textContent = "All of these are already in your vault.";
    msg.style.color = "var(--amber)";
    return;
  }
  const { data } = await api("POST", "/api/cards/bulk", { cards: fresh });
  CARDS = (data.added || []).concat(CARDS);
  $("#paste-text").value = "";
  $("#preview").classList.add("hidden");
  $("#preview-rows").innerHTML = "";
  const msg = $("#import-msg");
  msg.textContent = `Saved ${data.count} card${data.count > 1 ? "s" : ""}.` + (skipped ? ` Skipped ${skipped} already in your vault.` : "");
  msg.style.color = "var(--green)";
  setTimeout(() => (msg.textContent = ""), 3000);
  $("#bulk-brand").value = ""; $("#bulk-expiry").value = "";
  stopCollect();
  render();
  // On a phone the form is in a sheet: close it so the new cards are what
  // the user sees - each new tile glows once (1.3.11: no pop-up).
  if (filtersAreMobile) { $("#add-sheet").classList.add("hidden"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  (data.added || []).forEach((c) => flashCard(c.id, true));
}

$("#add-btn").addEventListener("click", async () => {
  if (editingId) { saveEdit(); return; }
  const card = {
    brand: $("#f-brand").value, amount: $("#f-amount").value,
    code: $("#f-code").value, pin: $("#f-pin").value,
    expiry: $("#f-noexp").checked ? "" : $("#f-expiry").value, order_number: $("#f-order").value,
    redeem_url: $("#f-url").value, notes: $("#f-notes").value,
    purchased: $("#f-purchased").value, no_expiry: $("#f-noexp").checked ? "1" : "",
  };
  const msg = $("#add-msg");
  if (!card.code.trim()) {
    msg.textContent = "Card code is required.";
    msg.style.color = "var(--red)";
    return;
  }
  const dup = dupOf(card.code);
  if (dup) {
    msg.textContent = "Already in your vault: " + (dup.brand || "a card") + (dup.amount ? " ₹" + dup.amount : "") + ".";
    msg.style.color = "var(--red)";
    return;
  }
  card.brand = settleStore($("#f-brand"));
  if (!card.brand) {
    msg.textContent = STORE_MSG;
    msg.style.color = "var(--red)";
    return;
  }
  const { data } = await api("POST", "/api/cards", card);
  CARDS.unshift(data.card);
  ["f-brand", "f-amount", "f-code", "f-pin", "f-expiry", "f-purchased", "f-order", "f-url", "f-notes"]
    .forEach((id) => ($("#" + id).value = ""));
  setNoExpiry(false);
  paintClears();
  msg.textContent = "Saved.";
  msg.style.color = "var(--green)";
  setTimeout(() => (msg.textContent = ""), 2500);
  render();
  if (filtersAreMobile) { $("#add-sheet").classList.add("hidden"); toast("Card saved"); }
});

// --------------------------------------------------------------------------- //
// Edit a saved card (1.3.9)
// --------------------------------------------------------------------------- //
// Closed-test request: a voucher added without its store had no way back. The
// Form tab doubles as the editor - same fields, same store picker and
// autocorrect - with the other tabs hidden, "Save changes" and a Cancel, and a
// Balance field that only an existing card has. Leaving the sheet any other
// way (close, back, opening Add) drops the edit; nothing is saved until
// "Save changes".
let editingId = null;
const EDIT_FIELDS = ["brand", "amount", "code", "pin", "expiry", "purchased", "order", "url", "notes"];
const EDIT_KEY = { brand: "brand", amount: "amount", code: "code", pin: "pin", expiry: "expiry", purchased: "purchased", order: "order_number", url: "redeem_url", notes: "notes" };

/** A stored expiry as the calendar wants it (YYYY-MM-DD), or "" if it was
 *  never a date. The odd ones ("Mar 2027") are converted, not lost. */
function isoExpiry(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = parseExpiry(v);
  if (!d) return "";
  const p2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

function openEdit(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  closeUse();
  if ($("#gt-menu")) $("#gt-menu").classList.add("hidden");
  editingId = id;
  EDIT_FIELDS.forEach((k) => { $("#f-" + k).value = c[EDIT_KEY[k]] || ""; });
  $("#f-expiry").value = isoExpiry(c.expiry);
  $("#f-purchased").value = isoExpiry(c.purchased || "");
  setNoExpiry(c.no_expiry === "1");
  $("#f-balance").value = String(balanceOf(c) || "");
  $("#f-balance").dataset.was = $("#f-balance").value;
  $("#f-brand").dataset.keep = $("#f-brand").value;       // what was saved is never "corrected"
  $("#f-brand-note").classList.add("hidden");
  $("#f-balance-wrap").classList.remove("hidden");
  $("#add-panel").classList.add("is-editing");
  $("#add-btn").textContent = "Save changes";
  $("#edit-cancel").classList.remove("hidden");
  $("#add-title").textContent = "Edit card";
  $("#add-msg").textContent = "";
  paintClears();
  document.querySelector('.tab[data-tab="manual"]').click();
  if (filtersAreMobile) $("#add-sheet").classList.remove("hidden");
  else $("#add-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitEdit() {
  if (!editingId) return;
  editingId = null;
  EDIT_FIELDS.forEach((k) => { $("#f-" + k).value = ""; });
  $("#f-balance").value = "";
  setNoExpiry(false);
  delete $("#f-brand").dataset.keep;
  $("#f-balance-wrap").classList.add("hidden");
  $("#add-panel").classList.remove("is-editing");
  $("#add-btn").textContent = "Save card";
  $("#edit-cancel").classList.add("hidden");
  $("#add-title").textContent = "Add a card";
  paintClears();
}

async function saveEdit() {
  const c = CARDS.find((x) => x.id === editingId);
  const msg = $("#add-msg");
  const say = (t) => { msg.textContent = t; msg.style.color = "var(--red)"; };
  if (!c) { exitEdit(); return; }
  if ($("#f-brand")._fixBrand) $("#f-brand")._fixBrand();
  const v = {};
  EDIT_FIELDS.forEach((k) => { v[EDIT_KEY[k]] = $("#f-" + k).value.trim(); });
  v.brand = settleStore($("#f-brand"));
  if (!v.brand) return say(STORE_MSG);
  if (!v.code) return say("Card code is required.");
  const twin = CARDS.find((x) => x.id !== c.id && codeKey(x.code) === codeKey(v.code));
  if (twin) return say("Already in your vault" + (twin.archived ? " (archived)" : "") + ": " + (twin.brand || "a card") + (twin.amount ? " ₹" + twin.amount : "") + ".");
  if (v.amount && !(num(v.amount) > 0)) return say("The amount should be a number, like 1000.");

  // Balance: what the user typed; but an untouched balance on an unused card
  // follows a corrected face value (₹500 typed as ₹50 is fixed in one place).
  let bal = $("#f-balance").value.trim();
  const unused = num(balanceOf(c)) === num(c.amount);
  if (bal === $("#f-balance").dataset.was && unused) bal = v.amount;
  if (bal !== "" && num(v.amount) && num(bal) > num(v.amount)) return say("The balance can't be more than the amount.");
  const n = window.YCJ.parse.normalizeCard(Object.assign({}, c, v, {
    balance: bal, brand: window.YCJ.brands.canonical(v.brand, true) }));
  const fields = {};
  ["brand", "code", "pin", "amount", "balance", "expiry", "order_number", "redeem_url", "notes"].forEach((k) => { fields[k] = n[k]; });
  // B9: not in the desktop's card shape, so set here, not by normalizeCard.
  fields.purchased = v.purchased || "";
  fields.no_expiry = $("#f-noexp").checked ? "1" : "";
  if (fields.no_expiry) fields.expiry = "";
  // Spent to nothing is redeemed; money put back on a redeemed card is not.
  if (bal !== "" && num(fields.balance) === 0 && num(fields.amount) > 0) fields.status = "redeemed";
  else if (c.status === "redeemed" && num(fields.balance) > 0) fields.status = "active";

  const { ok } = await api("PUT", "/api/cards/" + c.id, fields);
  if (!ok) return say("Couldn't save - is the vault still unlocked?");
  Object.assign(c, fields);
  exitEdit();
  render();
  flashCard(c.id);
  if (filtersAreMobile) $("#add-sheet").classList.add("hidden");
}

/** The card that just changed glows once in the list - instead of a pop-up
 *  saying so. */
function flashCard(id, noScroll) {
  requestAnimationFrame(() => {
    const el = document.querySelector('.card[data-id="' + id + '"]');
    if (!el) return;
    el.classList.remove("is-flash"); void el.offsetWidth; el.classList.add("is-flash");
    if (!noScroll) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

// --------------------------------------------------------------------------- //
// Archive (1.3.9)
// --------------------------------------------------------------------------- //
// One tap takes a card out of the list - a used-up voucher kept for its
// order number, say - and one tap in the Archived view brings it back.
// Archived cards count in nothing (vault value, tiles, stores, the nudge),
// but the duplicate check still knows them.
async function toggleArchive(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  const archived = !c.archived;
  const el = document.querySelector('.card[data-id="' + id + '"]');
  const { ok } = await api("PUT", "/api/cards/" + id, { archived });
  if (!ok) { toast("Couldn't save — is the vault still unlocked?"); return; }
  c.archived = archived;
  // Let the tile slide away first, so the eye follows where it went.
  if (el) { el.classList.add("is-leaving"); setTimeout(render, 220); }
  else render();
}

// --------------------------------------------------------------------------- //
// Search, sort, filters (pills + KPI tiles)
// --------------------------------------------------------------------------- //
$("#sort").addEventListener("change", (e) => {
  sortBy = e.target.value;
  render();
  // On a phone, picking an option is the whole point of opening the sheet.
  if (filtersAreMobile) $("#filter-sheet").classList.add("hidden");
});

// --- search, in the header ------------------------------------------------
// An icon that expands over the header's own contents. Closing it clears the
// query on purpose: a filter the user cannot see is how cards go "missing".
const searchOpen = () => $("#topbar") && $("#topbar").classList.contains("is-searching");
function openSearch() {
  $("#topbar").classList.add("is-searching");
  $("#top-search").classList.remove("hidden");
  setTimeout(() => $("#search").focus(), 30);
}
function closeSearch() {
  const bar = $("#topbar");
  if (!bar) return;
  bar.classList.remove("is-searching");
  $("#top-search").classList.add("hidden");
  $("#search-clear").classList.add("hidden");
  $("#search").value = "";
  if (searchTerm) { searchTerm = ""; render(); }
}
function wireSearch() {
  $("#search-btn").onclick = openSearch;
  $("#search-back").onclick = closeSearch;
  $("#search").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    $("#search-clear").classList.toggle("hidden", !e.target.value);
    render();
  });
  $("#search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();          // hide the keyboard, keep results
    if (e.key === "Escape") closeSearch();
  });
  $("#search-clear").onclick = () => {
    $("#search").value = ""; searchTerm = "";
    $("#search-clear").classList.add("hidden");
    $("#search").focus();
    render();
  };
}

// --- phone layout ----------------------------------------------------------
// The desktop page is: value hero, a long Add form, then the inventory. At
// 393px that put the first gift card two full screens down. Card Vault 1.3.1's
// rule - "the list is the app" - applied here:
//
//   * the Add panel moves into a bottom sheet behind a + in the header;
//   * the status chips and the sort select move into a Filter sheet, summarised
//     by one slim row of pills;
//   * the hero compacts (mobile.css).
//
// The desktop controls are MOVED, not reimplemented, so every listener above
// keeps working and the two layouts cannot drift. Above 720px nothing moves.
const MOBILE_Q = "(max-width: 720px)";
let filtersAreMobile = false;

function setupMobileLayout() {
  const sheetClose = (id) => {
    $(id).onclick = (e) => { if (e.target.id === id.slice(1)) $(id).classList.add("hidden"); };
  };
  $("#filter-close").onclick = () => $("#filter-sheet").classList.add("hidden");
  $("#add-close").onclick = closeAddSheet;
  sheetClose("#filter-sheet");
  $("#add-sheet").onclick = (e) => { if (e.target.id === "add-sheet") closeAddSheet(); };
  $("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };

  if (!window.matchMedia(MOBILE_Q).matches) return;
  filtersAreMobile = true;

  // 1.3.10 (feedback #2): three independent filters. Each pill opens the
  // sheet on its OWN section only - Status, Stores (A-Z, only the stores
  // this user has), Sort - so none of them turns into a long mixed list.
  const fb = $("#filter-sheet-body");
  const sec = (name, title, el) => {
    const d = document.createElement("div"); d.className = "fs-sec"; d.dataset.sec = name;
    const h = document.createElement("h3"); h.className = "vault-h"; h.textContent = title;
    d.appendChild(h); d.appendChild(el); fb.appendChild(d);
  };
  sec("status", "Status", $("#filters"));
  sec("sort", "Sort by", $("#sort-wrap"));
  // Sort labels carry a "Sort by:" prefix for the desktop's lone select; the
  // sheet already has that heading.
  [...$("#sort").options].forEach((o) => { o.textContent = o.textContent.replace(/^Sort by:\s*/, ""); });

  // 1.3.11 round 2: the sheet opens on the ways in only, nothing focused.
  setMode("");
  const panel = $("#add-panel");
  panel.querySelector(".panel-head").classList.add("hidden");   // the sheet has a title
  $("#add-sheet-body").appendChild(panel);
  $("#add-open-btn").classList.remove("hidden");
  $("#add-open-btn").onclick = () => {
    exitEdit();
    // Round 4: always from scratch - the ways in, nothing left over.
    clearAddFlow();
    setMode("");
    intakeStatus("");
    $("#add-sheet").classList.remove("hidden");
    const a = document.activeElement; if (a && a.blur) a.blur();
    $("#add-sheet .lic-body").scrollTop = 0;
  };

  $("#mfilter-bar").classList.remove("hidden");
}

const STATUS_LABEL = { all: "Status", active: "Active", expiring: "Expiring soon", expired: "Expired", redeemed: "Redeemed", archived: "Archived" };
const SHEET_TITLE = { status: "Status", store: "Stores", sort: "Sort by" };
function openFilterSheet(section) {
  const sh = $("#filter-sheet");
  sh.dataset.section = section;
  $("#filter-title").textContent = SHEET_TITLE[section] || "Filter";
  sh.classList.remove("hidden");
}
const SORT_LABEL = { recent: "Recent", expiry: "Expiry", amount: "Value", brand: "Brand A–Z" };

function renderMobileFilterBar(count) {
  if (!filtersAreMobile) return;
  const caret = '<svg class="mfp-caret" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="m7 10 5 5 5-5z"/></svg>';
  const set = filterStatus !== "all" && filterStatus !== "archived";
  $("#mfilter-bar").innerHTML =
    '<button class="mfilter-pill' + (set ? " is-set" : "") + '" id="m-status-pill" type="button">'
    + '<span class="mfp-text">' + STATUS_LABEL[set ? filterStatus : "all"] + "</span>"
    + '<span class="mfp-count">' + count + "</span>"
    + (set ? '<span class="mfp-clear" data-clear="1" role="button" aria-label="Show all cards">' + X_SMALL + '</span>' : caret)
    + "</button>"
    + (storesPicked.size
        ? '<button class="mfilter-pill is-set' + (storesPicked.size === 1 ? ' is-store" style="' + window.YCJ.brands.style([...storesPicked][0]) + '"' : '"')
          + ' id="m-store-pill" type="button">'
          + (storeLocked ? '<span class="mfp-lockico" aria-hidden="true">' + LOCK_SVG + '</span>' : "")
          + '<span class="mfp-text">' + esc(storesPicked.size === 1 ? [...storesPicked][0] : storesPicked.size + " stores") + '</span>'
          + '<span class="mfp-clear" data-clear-store="1" role="button" aria-label="' + (storeLocked ? "Unlock and show every store" : "Show every store") + '">' + X_SMALL + '</span></button>'
          // B3: lock the store (one store only).
          + (storesPicked.size === 1
            ? '<button class="mfilter-pill mfp-icon' + (storeLocked ? " is-on" : "") + '" id="m-store-lock" type="button" aria-pressed="' + storeLocked
              + '" aria-label="' + (storeLocked ? "Unlock this store" : "Lock this store") + '">' + (storeLocked ? LOCK_SVG : UNLOCK_SVG) + '</button>'
            : "")
        : '<button class="mfilter-pill" id="m-store-pill" type="button"><span class="mfp-text">Stores</span>' + caret + '</button>')
    + '<button class="mfilter-pill" id="m-sort-pill" type="button">'
    + '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>'
    + '<span class="mfp-text">' + SORT_LABEL[sortBy] + "</span>" + caret
    + "</button>";
  const clear = $("#mfilter-bar [data-clear]");
  // Inside the pill, so its click must not also open the sheet.
  if (clear) clear.onclick = (e) => { e.stopPropagation(); setFilter("all"); };
  $("#m-status-pill").onclick = () => openFilterSheet("status");
  $("#m-sort-pill").onclick = () => openFilterSheet("sort");
  $("#m-store-pill").onclick = () => openFilterSheet("store");
  const cs = $("#mfilter-bar [data-clear-store]");
  // B3: closing a locked store unlocks and clears in one step.
  if (cs) cs.onclick = (e) => { e.stopPropagation(); storeLocked = false; setStore(""); };
  const lk = $("#m-store-lock");
  if (lk) lk.onclick = () => { storeLocked = !storeLocked; render(); };
}

function setFilter(status) {
  filterStatus = status;
  document.querySelectorAll(".filter").forEach((x) => x.classList.toggle("active", x.dataset.status === status));
  document.querySelectorAll(".kpi").forEach((x) => x.classList.toggle("selected", x.dataset.status === status));
  render();
  if (filtersAreMobile) $("#filter-sheet").classList.add("hidden");
}
document.querySelectorAll(".filter").forEach((f) => f.addEventListener("click", () => setFilter(f.dataset.status)));
document.querySelectorAll(".kpi").forEach((k) => k.addEventListener("click", () => setFilter(k.dataset.status)));

// --------------------------------------------------------------------------- //
// Expiry intelligence
// --------------------------------------------------------------------------- //
function parseExpiry(s) {
  if (!s) return null;
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)))      // YYYY-MM-DD
    return new Date(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {  // DD/MM/YYYY
    let y = +m[3]; if (y < 100) y += 2000;
    return new Date(y, +m[2] - 1, +m[1]);
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{2,4})$/))) {               // MM/YYYY -> end of month
    let y = +m[2]; if (y < 100) y += 2000;
    return new Date(y, +m[1], 0);
  }
  const d = new Date(s);                                          // "Mar 2027" etc.
  return isNaN(d.getTime()) ? null : d;
}

/** "2026-10-07" -> "7 Oct 2026" for display. The stored value is untouched
 *  (it has to stay what the desktop and the parser write); anything that does
 *  not parse is shown exactly as typed. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtExpiry(s) {
  const d = parseExpiry(s);
  return d ? d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() : String(s || "");
}

function daysLeft(card) {
  const d = parseExpiry(card.expiry);
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// Effective status used for KPIs & filters.
function effStatus(card) {
  if (card.status === "redeemed") return "redeemed";
  const dl = daysLeft(card);
  if (card.status === "expired" || (dl !== null && dl < 0)) return "expired";
  if (dl !== null && dl <= SOON_DAYS) return "expiring";
  return "active";
}
const isHeld = (s) => s === "active" || s === "expiring"; // usable value

// --------------------------------------------------------------------------- //
// Card operations
// --------------------------------------------------------------------------- //
async function setStatus(id, status) {
  const { ok } = await api("PUT", "/api/cards/" + id, { status });
  if (!ok) { toast("Couldn't save — is the vault still unlocked?"); return; }
  const c = CARDS.find((x) => x.id === id);
  if (c) c.status = status;
  render();
}

// --------------------------------------------------------------------------- //
// Spending from a card - a bottom sheet, not prompt()
// --------------------------------------------------------------------------- //
// The desktop asked with window.prompt(): a system dialog with a text keyboard
// and a blank field meaning "all of it". On a phone that is the moment right
// after paying, one-handed, often standing at a till. So: the number keypad,
// the balance that will be left shown as you type, and "Used it all" as its
// own button instead of an empty field doing double duty.
let spendId = null;
function redeem(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  spendId = id;
  const bal = num(balanceOf(c));
  $("#spend-title").textContent = (c.brand || "Gift card") + " · " + rupee(bal) + " left";
  $("#spend-amount").value = "";
  $("#spend-err").textContent = "";
  paintSpendLeft();
  $("#use-sheet").classList.add("hidden");
  $("#spend-sheet").classList.remove("hidden");
  setTimeout(() => $("#spend-amount").focus(), 60);
}
function paintSpendLeft() {
  const c = CARDS.find((x) => x.id === spendId);
  if (!c) return;
  const bal = num(balanceOf(c)), used = num($("#spend-amount").value);
  const left = Math.max(0, bal - used);
  $("#spend-left").textContent = used > bal
    ? "That is more than the " + rupee(bal) + " on this card."
    : (used ? rupee(left) + " will be left" + (left === 0 ? " · the card will be marked redeemed" : "") : "Enter what you spent");
  $("#spend-left").classList.toggle("is-warn", used > bal);
  $("#spend-save").disabled = !(used > 0 && used <= bal);
}
async function saveSpend(all) {
  const c = CARDS.find((x) => x.id === spendId);
  if (!c) return;
  const bal = num(balanceOf(c));
  const newBal = all ? 0 : Math.max(0, bal - num($("#spend-amount").value));
  const fields = { balance: String(newBal) };
  if (newBal === 0) fields.status = "redeemed";
  const { ok } = await api("PUT", "/api/cards/" + c.id, fields);
  if (!ok) { $("#spend-err").textContent = "Couldn't save - is the vault still unlocked?"; return; }
  Object.assign(c, fields);
  $("#spend-sheet").classList.add("hidden");
  toast(newBal === 0 ? "Marked redeemed" : rupee(newBal) + " left on " + (c.brand || "this card"));
  render();
}
/** The balance as stored. `balance || amount` would read a numeric 0 as
 *  "never used" and resurrect a spent card's face value. */
function balanceOf(c) {
  return (c.balance === undefined || c.balance === null || c.balance === "") ? c.amount : c.balance;
}

// --------------------------------------------------------------------------- //
// Checkout view - the code, big, for the till or the payment page
// --------------------------------------------------------------------------- //
// Tapping a card opens this. It is the phone's main job for this app: someone
// at a counter reading a code aloud, or flicking between a shopping app and
// this one. The code is large, grouped in fours like the card prints it, each
// value copies with one tap, and the screen is asked to stay awake while it
// is open (Wake Lock, where the WebView offers it - silently skipped if not).
let useId = null, wakeLock = null;
function groupCode(v) {
  const t = String(v || "").replace(/\s+/g, "");
  // A code that brings its own hyphens (Amazon's AQ7K-2M9X-...) is shown as
  // printed; only an unbroken run is grouped in fours like a card number.
  if (t.indexOf("-") >= 0) return t;
  return t.length > 6 ? t.replace(/(.{4})(?=.)/g, "$1 ") : t;
}
async function openUse(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  useId = id;
  const s = effStatus(c), dl = daysLeft(c);
  $("#use-brand").textContent = c.brand || "Gift card";
  // The checkout view is drawn as the store's own card: its colours, its glyph.
  $("#use-sheet .use-dialog").setAttribute("style", window.YCJ.brands.style(c.brand));
  $("#use-glyph").textContent = window.YCJ.brands.theme(c.brand).g;
  $("#use-balance").textContent = rupee(num(balanceOf(c)));
  $("#use-face").textContent = num(c.amount) && num(balanceOf(c)) < num(c.amount) ? "of " + rupee(num(c.amount)) : "balance";
  $("#use-code").textContent = groupCode(c.code);
  $("#use-pin-row").classList.toggle("hidden", !c.pin);
  $("#use-pin").textContent = c.pin || "";
  $("#use-expiry").textContent = c.expiry
    ? "Expires " + fmtExpiry(c.expiry) + (dl === null ? "" : dl < 0 ? " · expired " + -dl + "d ago" : " · " + dl + "d left")
    : c.no_expiry === "1" ? "No expiry" : "No expiry recorded";
  $("#use-expiry").className = "use-expiry" + (s === "expired" ? " is-bad" : s === "expiring" ? " is-warn" : "");
  $("#use-redeem").classList.toggle("hidden", s === "redeemed");
  const link = $("#use-link");
  link.classList.toggle("hidden", !c.redeem_url);
  if (c.redeem_url) link.href = c.redeem_url;
  paintUseNav();
  paintCheckoutArt(c);
  const was = !$("#use-sheet").classList.contains("hidden");
  $("#use-sheet").classList.remove("hidden");
  if (!was) { try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { wakeLock = null; } }
}
function closeUse() {
  const was = !$("#use-sheet").classList.contains("hidden");
  $("#use-sheet").classList.add("hidden");
  useId = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  if (was && checkoutOn()) window.YCJ.scan.setBrightness(-1);
}

// --------------------------------------------------------------------------- //
// Hidden codes
// --------------------------------------------------------------------------- //
// On the desktop the list shows every code in full - fine on a PC in a room.
// A phone is read on a bus, in a queue, held next to someone. A code is money
// to whoever reads it, so the list shows only the last four; the eye shows
// one card, the checkout view shows it big, and Copy never needs either.
// Cleared on every lock.
const REVEALED = new Set();
// 1.3.10: a shown code hides itself again after 45 s, so it is never left on
// an unattended screen; the Hide control counts down (Card Vault 1.3.9).
const REVEAL_MS = 45000;
const revealUntil = new Map();   // card id -> time it hides
let revealTick = null;
const revealLeft = (id) => Math.max(0, Math.ceil(((revealUntil.get(id) || 0) - Date.now()) / 1000));
function toggleReveal(id) {
  if (REVEALED.has(id)) { REVEALED.delete(id); revealUntil.delete(id); }
  else { REVEALED.add(id); revealUntil.set(id, Date.now() + REVEAL_MS); }
  render();
  startRevealTick();
}
function startRevealTick() {
  if (revealTick) return;
  revealTick = setInterval(() => {
    let expired = false;
    for (const id of [...revealUntil.keys()]) {
      if (!REVEALED.has(id)) { revealUntil.delete(id); continue; }
      const left = revealLeft(id);
      if (left <= 0) { REVEALED.delete(id); revealUntil.delete(id); expired = true; continue; }
      // the countdown is updated in place - a re-render would replay the tile entrance
      const el = document.querySelector(`.gtile[data-id="${CSS.escape(id)}"] .rv-left`);
      if (el) el.textContent = left + "s";
    }
    if (expired) render();
    if (!revealUntil.size) { clearInterval(revealTick); revealTick = null; }
  }, 1000);
}
function masked(v) {
  // The last four LETTERS AND DIGITS - "TCLQ-7781-0042-XZ" shows "•••• 42XZ",
  // not "•••• 2-XZ", which read as a broken code.
  const t = String(v || "").replace(/[^A-Za-z0-9]/g, "");
  return t.length > 4 ? "•••• " + t.slice(-4).toUpperCase() : "••••";
}

/** Copy one field of one card. By id, so the code itself never has to be
 *  written into an onclick attribute (it used to be - and a code containing
 *  an apostrophe broke the button). */
function copyField(id, key, btn) {
  const c = CARDS.find((x) => x.id === id);
  if (c && c[key]) copy(String(c[key]), btn, key);
}

async function deleteCard(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!confirm(`Delete this ${c && c.brand ? c.brand + " " : ""}card permanently?`)) return;
  const { ok } = await api("DELETE", "/api/cards/" + id);
  if (!ok) { toast("Couldn't delete — is the vault still unlocked?"); return; }
  CARDS = CARDS.filter((x) => x.id !== id);
  toast("Card deleted");
  render();
}

function copy(text, btn, key) {
  // mobile.copySensitive also schedules the clipboard to be overwritten. A
  // gift card code is bearer money; leaving it readable by every other app on
  // the device indefinitely is a real leak the desktop never had.
  window.YCJ.mobile.copySensitive(text).then((ok) => {
    const secs = Math.round(window.YCJ.mobile.CLIP_TTL_MS / 1000);
    if (!ok) return toast("Could not copy");
    // 1.3.10: the tapped control confirms it (green tick), no pop-up.
    if (btn) return markCopied(btn, key, secs);
    toast("Copied — clears in " + secs + "s");
  });
}
const ICON_TICK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
function markCopied(btn, key, secs) {
  const tile = btn.closest(".gtile");
  const targets = [btn];
  if (key === "code" && tile) {
    [tile.querySelector('.mini-copy[data-key="code"]'), tile.querySelector(".gt-code .num")]
      .forEach((x) => x && !targets.includes(x) && targets.push(x));
  }
  targets.forEach((el) => {
    if (el._copyTimer) clearTimeout(el._copyTimer);
    else el._copyHTML = el.innerHTML;
    el.classList.add("is-copied");
    el.title = "Copied — clears from the clipboard in " + secs + "s";
    if (el.classList.contains("mini-copy")) el.innerHTML = ICON_TICK;
    else if (el.classList.contains("num")) el.textContent = "Copied · clears in " + secs + "s";
    else el.innerHTML = ICON_TICK + "<span>Copied</span>";
    el._copyTimer = setTimeout(() => {
      el.classList.remove("is-copied");
      el.innerHTML = el._copyHTML; el._copyTimer = null;
    }, 2500);
  });
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._t);
  // Long enough to read: "3 cards restored · your existing password still
  // applies" vanished at the old flat 1.4s.
  t._t = setTimeout(() => t.classList.add("hidden"), Math.max(1400, msg.length * 55));
}

// --------------------------------------------------------------------------- //
// Render
// --------------------------------------------------------------------------- //
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escAttr(s) { return esc(s); }
function num(v) { const n = parseFloat(String(v).replace(/[^\d.]/g, "")); return isNaN(n) ? 0 : n; }
// Money is added up in whole paise (1.3.10), so ₹199.99 x 3 is ₹599.97 and
// not 599.9699999; shown in Indian grouping, paise only when there are some.
const paise = (v) => Math.round(num(v) * 100);
function rupee(n) {
  const p = Math.round(Number(n || 0) * 100);
  const frac = p % 100 !== 0;
  return "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
}

function render() {
  const showArchived = filterStatus === "archived";
  // Archived cards are out of every count and total (1.3.9).
  const all = CARDS.map((c) => ({ c, s: effStatus(c) }));
  const eff = all.filter(({ c }) => !c.archived);

  // KPIs + vault value
  const counts = { active: 0, expiring: 0, expired: 0, redeemed: 0 };
  let value = 0;
  eff.forEach(({ c, s }) => {
    if (s === "expiring") { counts.active++; counts.expiring++; }
    else counts[s]++;
    if (isHeld(s)) value += paise(balanceOf(c));
  });
  paintVaultValue(value);
  $("#vv-sub").textContent = `across ${counts.active} active card${counts.active === 1 ? "" : "s"}`;
  $("#kpi-active").textContent = counts.active;
  $("#kpi-expiring").textContent = counts.expiring;
  $("#kpi-expired").textContent = counts.expired;
  $("#kpi-redeemed").textContent = counts.redeemed;

  // filter
  let list = (showArchived ? all.filter(({ c }) => c.archived) : eff).filter(({ c, s }) => {
    if (storesPicked.size && !storesPicked.has(storeOf(c))) return false;
    if (filterStatus === "all" || showArchived) return true;
    if (filterStatus === "active") return isHeld(s);
    return s === filterStatus;
  });
  if (searchTerm) {
    // Every word must match somewhere, so "amazon 500" finds the ₹500 Amazon
    // card rather than every Amazon card and every ₹500 one.
    const tokens = searchTerm.split(/\s+/).filter(Boolean);
    list = list.filter(({ c }) => {
      const hay = [c.brand, c.code, c.notes, c.order_number, c.amount, c.expiry].join(" ").toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  // sort - usable cards first, then expired, then redeemed at the bottom
  // (1.3.9: a used-up card stays visible, greyed, but out of the way); the
  // chosen order applies within each group.
  const RANK = { active: 0, expiring: 0, expired: 1, redeemed: 2 };
  list.sort((a, b) => {
    const r = RANK[a.s] - RANK[b.s];
    if (r) return r;
    if (sortBy === "amount") return paise(balanceOf(b.c)) - paise(balanceOf(a.c));
    if (sortBy === "brand") return (a.c.brand || "").localeCompare(b.c.brand || "");
    if (sortBy === "expiry") {
      const da = daysLeft(a.c), db = daysLeft(b.c);
      if (da === null) return 1; if (db === null) return -1; return da - db;
    }
    return (b.c.created_at || 0) - (a.c.created_at || 0); // recent
  });

  // Live summary of the filtered view — only while a search/filter narrows things down.
  const groups = combine && !showArchived ? combineByBrand(list, filterStatus) : null;
  // Round 2: Combine by brand alone adds no summary - the vault value above
  // already says the total; each brand tile says its own.
  const filtering = searchTerm !== "" || filterStatus !== "all" || storesPicked.size > 0;
  const summary = $("#filter-summary");
  if (filtering) {
    const filteredValue = groups
      ? groups.reduce((sum, g) => sum + g.paise, 0)
      : list.reduce((sum, { c }) => sum + paise(balanceOf(c)), 0);
    const nCards = groups ? groups.reduce((n, g) => n + g.count, 0) : list.length;
    $("#fs-count").textContent = (groups ? `${groups.length} brand${groups.length === 1 ? "" : "s"} · ` : "")
      + `${nCards} card${nCards === 1 ? "" : "s"}`;
    $("#fs-value").textContent = rupee(filteredValue / 100);
    summary.classList.remove("hidden");
    paintIcons(summary);
  } else {
    summary.classList.add("hidden");
  }

  const shown = groups ? groups.length : list.length;
  $("#empty").classList.toggle("hidden", shown !== 0);
  $("#empty").textContent = showArchived
    ? "No archived cards. Cards you archive show up here, and can be brought back from here."
    : groups ? "No usable gift cards in this view."
    : "No cards in this view. Add a card or paste some text above to get started.";
  // B2: the open card's next / previous follow exactly this order.
  VISIBLE_IDS = groups ? [] : list.map(({ c }) => c.id);
  $("#cards").classList.toggle("is-combined", !!groups);
  $("#cards").innerHTML = groups
    ? groups.map(renderBrandTile).join("")
    : list.map(({ c, s }) => renderCard(c, s)).join("");
  document.body.classList.toggle("is-archive-view", showArchived);
  $("#archive-btn").setAttribute("aria-pressed", String(showArchived));
  $("#combine-toggle").checked = combine;
  $(".combine-toggle").classList.toggle("is-disabled", showArchived);
  renderMobileFilterBar(groups ? groups.length : list.length);
  paintHeroMode();
  renderBell(eff);
  renderStores(eff);
  queueFit();
}

// --------------------------------------------------------------------------- //
// Store names: autocorrect with a visible Undo
// --------------------------------------------------------------------------- //
// brands.js decides what a typed name means. Here the correction is SHOWN:
// "Corrected from 'Flipcart' · Undo". An Undo is respected until the field is
// edited again, so a genuinely new store called "Flipcart" can still be saved.
function wireBrandFix(input, note) {
  const fix = () => {
    const v = input.value.trim();
    if (!v || input.dataset.keep === v) return;
    const m = window.YCJ.brands.match(v);
    // Already the right name: leave the note alone. Tapping "Undo" blurs the
    // field first, and hiding the note here made Undo vanish under the finger.
    if (!m || m.store.name === v) return;
    input.value = m.store.name;
    note.innerHTML = 'Corrected from “' + esc(v) + '” <button type="button" class="linkish">Undo</button>';
    note.classList.remove("hidden");
    note.querySelector("button").onclick = () => {
      input.value = v; input.dataset.keep = v;
      note.classList.add("hidden");
    };
  };
  input.addEventListener("change", fix);
  input.addEventListener("blur", fix);
  input.addEventListener("input", () => { delete input.dataset.keep; note.classList.add("hidden"); });
  input._fixBrand = fix;
}

// --------------------------------------------------------------------------- //
// Store picker - type-ahead, not a dropdown
// --------------------------------------------------------------------------- //
// 340 stores in a dropdown is a wall nobody reads. Instead: type "Ama" and the
// few best matches appear under the field, each in its own colours, to tap.
// A store that is not known yet ("Kalyan Sweets") gets one last row:
// "+ Add Kalyan Sweets as a new store", which saves it to this phone's list
// and gives it its own colours and pattern (brands.js, family "mine").
function storePicker(input, box) {
  let items = [], active = -1;
  const close = () => { box.classList.add("hidden"); box.innerHTML = ""; items = []; active = -1; };
  const choose = (name) => {
    input.value = name;
    input.dataset.keep = name;            // a deliberate pick is never autocorrected
    const note = input.parentElement.querySelector(".fix-note");
    if (note) note.classList.add("hidden");
    close();
    input.dispatchEvent(new Event("store-picked"));
  };
  const paint = () => {
    const q = input.value.trim();
    if (!q) return close();
    const used = [...new Set(CARDS.map((c) => c.brand).filter(Boolean))];
    const list = window.YCJ.brands.suggest(q, used, 5);
    // "+ Add" is offered for anything that is not EXACTLY a listed store or
    // alias (1.3.9). It used to hide whenever the matcher could read the
    // text as a store, so "Amazon Pay" (read as Amazon) could never be added.
    const exact = list.some((x) => x.name.toLowerCase() === q.toLowerCase())
      || window.YCJ.brands.isListedName(q);
    items = list.map((x) => ({ kind: "pick", name: x.name, html:
      '<span class="gc-glyph sm" style="' + x.style + '">' + esc(x.g) + '</span><span class="sp-name">' + esc(x.name) + '</span>'
      + (x.custom ? '<span class="sp-tag">Your store</span>' : "") }));
    if (!exact && q.length >= 2) items.push({ kind: "add", name: q, html:
      '<span class="sp-add-ico">+</span><span class="sp-name">Add <b>' + esc(q) + '</b> as a new store</span>' });
    if (!items.length) return close();
    active = -1;
    box.innerHTML = items.map((it, i) => '<button type="button" class="sp-item' + (it.kind === "add" ? " is-add" : "")
      + '" role="option" data-i="' + i + '">' + it.html + '</button>').join("");
    box.classList.remove("hidden");
    // pointerdown, not click: a click lands after the field's blur, by which
    // time the box would already have closed under the finger.
    box.querySelectorAll(".sp-item").forEach((b) => b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const it = items[+b.dataset.i];
      if (it.kind === "add") {
        const saved = window.YCJ.brands.addCustom(it.name);
        choose(saved);
        toast(saved === it.name ? saved + " added to your stores" : "That's " + saved + " - already listed");
      } else choose(it.name);
    }));
  };
  input.addEventListener("input", paint);
  input.addEventListener("focus", paint);
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (box.classList.contains("hidden")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      box.querySelectorAll(".sp-item").forEach((b, i) => b.classList.toggle("is-active", i === active));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      box.querySelectorAll(".sp-item")[active].dispatchEvent(new Event("pointerdown"));
    } else if (e.key === "Escape") close();
  });
}

// ---- Stores: only listed ones (1.3.11 round 2) --------------------------------
// Every way a voucher comes in - Form, scan review, the review list fed by
// Collect / Paste / CSV / screenshots / PDF / multi-card scans - takes its
// store from the store list (341 stores + the user's own). A typo is
// corrected to the store it means; anything else must be picked, or added on
// purpose with "+ Add ... as a new store" (which puts it on the list).
const storeKnown = (v) => window.YCJ.brands.isListedName(String(v || "").trim());
/** The listed spelling of what was typed, or "" if it is no listed store. */
function listedStore(v) {
  v = String(v || "").trim();
  if (!v) return "";
  const B = window.YCJ.brands;
  if (B.isListedName(v)) return B.canonical(v, true) || v;
  const m = B.match(v);
  return m ? m.store.name : "";
}
/** Settle a store field before saving: correct it to a listed store; a name
 *  the user deliberately kept (Undo on the correction) becomes their own
 *  store. -> the store name, or "" when it still needs picking. */
function settleStore(input) {
  const v = input.value.trim();
  if (!v) return "";
  if (input.dataset.keep === v && !storeKnown(v)) return window.YCJ.brands.addCustom(v);
  const s = listedStore(v);
  if (s && s !== v) input.value = s;
  return s;
}
const STORE_MSG = "Pick the store from the list - start typing its name - or tap \"+ Add ... as a new store\".";

/** Codes compare without spaces, hyphens or case - "AQ7K-2M9X" and
 *  "aq7k 2m9x" are the same voucher. */
const codeKey = (v) => String(v || "").replace(/[\s\-]/g, "").toUpperCase();
const dupOf = (code) => { const k = codeKey(code); return k ? CARDS.find((c) => codeKey(c.code) === k) : null; };

// --------------------------------------------------------------------------- //
// Stores: filter the list to one store
// --------------------------------------------------------------------------- //
// The filter sheet lists every store with its usable total; picking one
// shows only that store's cards, and the summary chips above the list give
// their count and combined value. (A "Paying ₹___" bill planner was tried
// here and removed at the user's request, 03-Oct-2026.)
const storeOf = (c) => window.YCJ.brands.canonical(c.brand || "") || "Gift card";

function storeTotals(eff) {
  const by = new Map();
  eff.forEach(({ c, s }) => {
    const k = storeOf(c);
    const t = by.get(k) || { name: k, count: 0, usable: 0, value: 0 };
    t.count++;
    if (isHeld(s)) { t.usable++; t.value += num(balanceOf(c)); }
    by.set(k, t);
  });
  return [...by.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/**
 * The Stores picker (1.3.10, feedback #2) - the GiftDeals site's brand picker:
 * a search box, the user's own stores grouped under letters A-Z with a count
 * per letter, a rail of letters down the side to jump to (empty ones greyed so
 * it never shifts), several stores can be ticked, and an A-Z / Value order.
 * Only stores this user actually has are listed - never the full catalogue.
 */
function renderStores(eff) {
  const box = $("#store-chips");
  if (!box) return;
  const all = storeTotals(eff);
  const q = storeQuery.trim().toLowerCase();
  const shown = all.filter((t) => !q || t.name.toLowerCase().includes(q));
  const byValue = storeOrder === "value";
  shown.sort((a, b) => byValue ? b.value - a.value || a.name.localeCompare(b.name)
                               : a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const groups = new Map();
  shown.forEach((t) => {
    const g = byValue ? "By value" : (/^[a-z]/i.test(t.name) ? t.name[0].toUpperCase() : "#");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  });
  const keys = [...groups.keys()].sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b));
  const top = box.scrollTop;
  box.innerHTML = keys.length ? keys.map((k, gi) =>
    '<section class="st-group" id="stg-' + gi + '">' + (byValue ? "" : '<h4>' + esc(k) + '<span>' + groups.get(k).length + '</span></h4>')
    + groups.get(k).map((t) => {
      const on = storesPicked.has(t.name);
      return '<button type="button" class="st-row' + (on ? " is-on" : "") + '" data-store="' + esc(t.name) + '" role="checkbox" aria-checked="' + on
        + '" style="' + window.YCJ.brands.style(t.name) + '"><span class="st-tick" aria-hidden="true"></span>'
        + '<span class="gc-glyph sm">' + esc(window.YCJ.brands.theme(t.name).g) + '</span>'
        + '<span class="st-nm">' + esc(t.name) + '</span>'
        + '<span class="st-n">' + t.count + (t.count === 1 ? " card" : " cards") + '</span>'
        + '<span class="st-val' + (t.value ? "" : " none") + '">' + (t.value ? rupee(t.value) : "–") + '</span></button>';
    }).join("") + '</section>').join("")
    : '<p class="st-empty">' + (all.length ? "No store matches “" + esc(storeQuery) + "”." : "Add a gift card and its store shows up here.") + '</p>';
  box.scrollTop = top;
  const rail = $("#store-rail");
  rail.classList.toggle("hidden", byValue);
  rail.innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("").map((k) => {
    const gi = keys.indexOf(k);
    return '<button type="button" data-jump="' + gi + '"' + (gi < 0 ? " disabled" : "") + '>' + k + '</button>';
  }).join("");
  $("#store-count").textContent = storesPicked.size ? storesPicked.size + " picked" : all.length + (all.length === 1 ? " store" : " stores");
  document.querySelectorAll("#store-order button").forEach((x) => x.classList.toggle("is-on", x.dataset.order === storeOrder));
}

/** One store only (a combined tile, the tests), or "" for every store.
 *  B1 (1.3.11): clearing returns to the full list where the user was before
 *  the store was picked. */
let scrollBeforeStore = 0;
function setStore(name) {
  const was = storesPicked.size;
  if (name && !was) scrollBeforeStore = window.scrollY;
  storesPicked = name ? new Set([name]) : new Set();
  if (!name) storeLocked = false;
  render();
  if (filtersAreMobile) $("#filter-sheet").classList.add("hidden");
  if (!name && was) requestAnimationFrame(() => window.scrollTo(0, scrollBeforeStore));
}
function toggleStore(name) {
  if (!storesPicked.size) scrollBeforeStore = window.scrollY;
  if (storesPicked.has(name)) storesPicked.delete(name); else storesPicked.add(name);
  if (storesPicked.size !== 1) storeLocked = false;
  render();                       // the sheet stays open: tick several, then Done
}
function wireStores() {
  // The Stores section lives in the filter sheet; built once, filled by render.
  const body = $("#filter-sheet-body");
  const d = document.createElement("div"); d.className = "fs-sec st-picker"; d.dataset.sec = "store";
  d.innerHTML = '<div class="st-head">'
    + '<label class="st-find"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9.5 3a6.5 6.5 0 0 1 5.2 10.4l5 5-1.3 1.3-5-5A6.5 6.5 0 1 1 9.5 3Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>'
    + '<input id="store-q" type="search" placeholder="Find a store" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Find a store" /></label>'
    + '<div class="st-order seg" id="store-order"><button type="button" data-order="az">A–Z</button><button type="button" data-order="value">Value</button></div></div>'
    + '<div class="st-body"><div class="st-list" id="store-chips"></div><div class="st-rail" id="store-rail" aria-label="Jump to a letter"></div></div>'
    + '<div class="st-foot"><span id="store-count" class="st-count"></span>'
    + '<button type="button" class="ghost" id="store-clear">Clear</button><button type="button" class="primary" id="store-done">Done</button></div>';
  body.insertBefore(d, body.firstChild);
  $("#store-q").addEventListener("input", (e) => { storeQuery = e.target.value; renderStores(effNow()); });
  d.addEventListener("click", (e) => {
    const row = e.target.closest(".st-row");
    if (row) return toggleStore(row.dataset.store);
    const ord = e.target.closest("[data-order]");
    if (ord) { storeOrder = ord.dataset.order; renderStores(effNow()); $("#store-chips").scrollTop = 0; return; }
    const jump = e.target.closest("[data-jump]");
    if (jump) { const g = $("#stg-" + jump.dataset.jump); if (g) $("#store-chips").scrollTo({ top: g.offsetTop, behavior: "smooth" }); return; }
    if (e.target.closest("#store-clear")) { storesPicked = new Set(); storeLocked = false; render(); return; }
    if (e.target.closest("#store-done")) $("#filter-sheet").classList.add("hidden");
  });
}

// --------------------------------------------------------------------------- //
// Scan - a live camera, not a photo
// --------------------------------------------------------------------------- //
// The camera stays open and every ~half second the visible frame is read
// (scan.js). Values do not jump around as OCR flickers: a field is LOCKED only
// when two separate frames read the same value (one frame is enough for the
// store, which is matched against a known list). Locked values fill the panel
// under the viewfinder with a tick; the user taps Use these details (1.3.11:
// it no longer closes by itself) and the review screen opens - prefilled,
// editable, nothing saved until the user taps Save.
//
// The camera runs ONLY while the Scan tab is on screen: switching tab, closing
// the sheet, locking the vault or leaving the app all stop it at once.
const CAM_OK = "gcv-cam-ok";
const VOTES_NEEDED = { brand: 1, code: 2, pin: 2, amount: 2, expiry: 1 };
const cam = { gen: 0, flip: false, rot: 0, miss: 0, cams: [], camIdx: 0, stream: null, on: false, busy: false, votes: {}, locked: {}, seen: {}, pinned: {}, edits: new Map(), frames: 0, startedAt: 0, last: null, lastText: "" };
let scanHow = {};

function camShow(which) {
  ["#cam-intro", "#cam-live", "#cam-error", "#scan-review"].forEach((x) => $(x).classList.toggle("hidden", x !== which));
}
function resetScan() {
  stopCamera();
  cam.votes = {}; cam.locked = {}; cam.seen = {}; cam.frames = 0; cam.last = null; cam.lastText = "";
  cam.many = null; camView = 0; cam.pinned = {}; cam.edits = new Map();
  $("#lf-pager").classList.add("hidden"); $("#lf-found").classList.add("hidden"); $("#cam-use").textContent = "Use these details";
  cam.busy = false;     // a read left hanging by an earlier session never blocks this one
  $("#scan-thumb2").removeAttribute("src");
  $("#scan-err").textContent = "";
  ["brand", "code", "pin", "amount", "expiry"].forEach((k) => {
    const el = $("#lf-" + k); el.textContent = "—"; el.parentElement.className = "lf";
  });
  $("#cam-use").disabled = true;
  shotStatus("");
  camShow("#cam-intro");
}
function setScanType(t) {
  document.querySelectorAll("#scan-type [data-type]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.type === t)));
  $("#s-pin-wrap").classList.toggle("hidden", t !== "pin");
  $("#scan-type").dataset.value = t;
}
function flag(id, how, value) {
  const el = $("#sf-" + id);
  el.className = "flag" + (how === "guess" ? " is-guess" : !value ? " is-missing" : "");
  el.textContent = how === "guess" ? "Check" : !value ? "Not found" : "";
}

// ---- Lens choice (1.3.11, Card Vault 2.0's) ---------------------------------
// Android often hands getUserMedia the ULTRA-WIDE lens for "environment" -
// the blurry-scan complaint in Card Vault. Once the camera is allowed the
// lens names are readable, so the main back lens is picked by name; the lens
// button walks the other back lenses and the choice is remembered.
const LENS_KEY = "gcv-scan-lens";
/** Lower is better for a card held 10-15 cm away. */
function lensRank(label) {
  const l = String(label || "").toLowerCase();
  if (/front|user|facing front/.test(l)) return 99;
  if (/triple camera/.test(l)) return 0;
  if (/dual wide camera/.test(l)) return 1;
  if (/dual camera/.test(l)) return 2;
  if (/^back camera$|^rear camera$/.test(l)) return 3;
  if (/ultra|wide angle|telephoto|tele|macro|depth|infrared/.test(l)) return 60;
  const m = /camera2? (\d+)/.exec(l);
  if (m) return 10 + parseInt(m[1], 10);
  if (/back|rear|environment/.test(l)) return 30;
  return 50;
}
async function chooseLens(gen) {
  let cams = [];
  try {
    cams = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === "videoinput" && lensRank(d.label) < 99)
      .sort((a, b) => lensRank(a.label) - lensRank(b.label));
  } catch (e) { cams = []; }
  cam.cams = cams;
  if (!cams.length || gen !== cam.gen) return;
  let saved = "";
  try { saved = localStorage.getItem(LENS_KEY) || ""; } catch (e) {}
  cam.camIdx = Math.max(0, cams.findIndex((d) => d.deviceId === saved));
  await openLens(cams[cam.camIdx].deviceId, gen);
}
/** Swap the running stream for the lens with this id (no-op if it is the one). */
async function openLens(deviceId, gen) {
  const cur = cam.stream && cam.stream.getVideoTracks()[0];
  const curId = cur && cur.getSettings ? cur.getSettings().deviceId : "";
  if (!deviceId || curId === deviceId) return;
  let next;
  try {
    next = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) { return; }                                  // keep the one that works
  if (gen !== cam.gen) { next.getTracks().forEach((t) => t.stop()); return; }
  if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
  cam.stream = next;
}
/** Continuous autofocus where offered; torch and lens buttons only where
 *  there is a torch / a second back lens. */
function tuneTrack() {
  const t = cam.stream && cam.stream.getVideoTracks()[0];
  const caps = t && t.getCapabilities ? t.getCapabilities() : {};
  if (t && caps.focusMode && caps.focusMode.indexOf("continuous") >= 0) {
    t.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  }
  $("#cam-torch").classList.toggle("hidden", !caps.torch);
  $("#cam-torch").setAttribute("aria-pressed", "false");
  $("#cam-lens").classList.toggle("hidden", (cam.cams || []).length < 2);
}
async function nextLens() {
  if ((cam.cams || []).length < 2 || !cam.on) return;
  const gen = cam.gen;
  cam.camIdx = (cam.camIdx + 1) % cam.cams.length;
  const id = cam.cams[cam.camIdx].deviceId;
  try { localStorage.setItem(LENS_KEY, id); } catch (e) {}
  await openLens(id, gen);
  if (gen !== cam.gen) return;
  const v = $("#cam-video");
  v.srcObject = cam.stream;
  try { await v.play(); } catch (e) {}
  tuneTrack();
}

async function startCamera() {
  if (cam.on) return;
  // A ticket for this start. Android can take a second to hand over the
  // camera; if the user leaves Scan in that second, stopCamera() bumps
  // cam.gen and the late stream is shut off on arrival instead of running
  // unseen behind the Form tab (a race the suite caught).
  const gen = ++cam.gen;
  camShow("#cam-live");
  $("#cam-tip").textContent = "Starting the camera…";
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("no camera API"), { name: "NotSupportedError" });
    cam.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    cam.stream = null;
    if (gen !== cam.gen) return;
    const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
    $("#cam-error-text").textContent = denied
      ? "Camera access is off for Gift Card Vault. Turn it on in Android Settings > Apps > Gift Card Vault > Permissions, or type the card in."
      : "The camera could not be started" + (e && e.name === "NotFoundError" ? " - this phone reports no camera." : ".") + " You can type the card in instead.";
    camShow("#cam-error");
    return;
  }
  if (gen !== cam.gen) { cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; return; }
  try { localStorage.setItem(CAM_OK, "1"); } catch (e) {}
  await chooseLens(gen);
  if (gen !== cam.gen) { if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; return; }
  const v = $("#cam-video");
  v.srcObject = cam.stream;
  try { await v.play(); } catch (e) {}
  // ...and again after play(), the second wait: leaving Scan here once left
  // cam.on stuck true with no stream, so coming back never restarted it.
  if (gen !== cam.gen) return;
  cam.on = true; cam.startedAt = Date.now(); cam.rot = 0; cam.miss = 0;
  $("#cam-tip").textContent = "Hold the card inside the frame";
  tuneTrack();
  await window.YCJ.scan.probeReader();
  if (gen !== cam.gen) return;
  if (!window.YCJ.scan.nativeReader()) window.YCJ.scan.preload().catch(() => {});
  camLoop();
}
function stopCamera() {
  cam.on = false;
  cam.gen++;
  if (cam.stream) { cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; }
  const v = $("#cam-video");
  if (v) v.srcObject = null;
}

async function camLoop() {
  if (!cam.on) return;
  // 1.3.9 (Card Vault 1.3.8): this loop belongs to ONE camera session. A read
  // still running from an earlier one (scan stopped, vault locked) must not
  // vote into this one, nor hold "busy" for it.
  const gen = cam.gen;
  const v = $("#cam-video");
  if (!cam.busy && v.readyState >= 2) {
    cam.busy = true;
    try {
      const S = window.YCJ.scan;
      // 1.3.11: the phone's own reader takes the colour frame as it is; a
      // card held sideways is tried turned both ways after two empty frames.
      // Tesseract (no plugin) gets the greyscale frame and flips polarity.
      const native = !!S.nativeReader();
      const frame = native ? S.grabColor(v, $("#cam-view"), cam.rot) : S.grab(v, $("#cam-view"), cam.flip);
      if (frame) {
        const text = native ? await S.readNative(frame) : await S.readCanvas(frame);
        if (!cam.on || gen !== cam.gen) return;
        cam.frames++;
        const r = S.extract(text);
        const card = r.multi ? r.cards[0] : r.card;
        const how = r.multi ? { brand: card.brand ? "label" : "", code: "label", pin: card.pin ? "label" : "", amount: card.amount ? "label" : "", expiry: card.expiry ? "label" : "" } : r.how;
        if (r.multi) voteMany(r.cards);
        if (vote(card, how)) { cam.last = frame; cam.lastText = text; cam.miss = 0; }
        else if (native) { if (++cam.miss >= 2) { cam.miss = 0; cam.rot = cam.rot === 0 ? 90 : cam.rot === 90 ? 270 : 0; } }
        // Nothing usable in this frame? Try the other polarity on the next one.
        else cam.flip = !cam.flip;
        paintLive();
        // 1.3.11 (A4, Card Vault 2.0): the scanner never closes by itself -
        // the values lock with a tick and the user taps Use these details.
        if (readyToReview()) $("#cam-tip").textContent = "All read - check it, then tap Use these details";
        else hintIfStuck();
      }
    } catch (e) {
      // One bad frame (or a read that timed out) must not end the scan; the
      // next one is half a second away.
    } finally { if (gen === cam.gen) cam.busy = false; }
  }
  if (gen === cam.gen) setTimeout(camLoop, 250);
}

/** Count what this frame read; lock a value once enough frames agree.
 *  Returns true if this frame contributed anything. */
function vote(card, how) {
  let any = false;
  if (card.code) card = Object.assign({}, card, { code: window.YCJ.reconcile.normCode(card.code) });
  ["brand", "code", "pin", "amount", "expiry"].forEach((k) => {
    const v = card[k];
    if (!v) return;
    if (cam.pinned[k]) { any = true; return; }      // the user's value stays
    any = true;
    cam.seen[k] = v;
    if (k === "code" && how.code === "guess") return;   // an unlabelled guess can show, never lock
    const t = (cam.votes[k] = cam.votes[k] || {});
    t[v] = (t[v] || 0) + 1;
    if (t[v] >= VOTES_NEEDED[k] && cam.locked[k] !== v) {
      // A later value only replaces a locked one when it has MORE votes -
      // one misread frame cannot overturn two good ones.
      const cur = cam.locked[k];
      if (!cur || t[v] > (t[cur] || 0)) cam.locked[k] = v;
    }
  });
  return any;
}
// Several vouchers in one frame (an order page with three e-vouchers): each
// is voted on by its code, frame after frame; a voucher counts once its code
// was read the same in two frames. The panel shows one at a time (‹ 2 of 3 ›)
// and the viewfinder never changes size.
let camView = 0;
function voteMany(cards) {
  cam.many = cam.many || new Map();
  cards.forEach((c) => {
    const code = window.YCJ.reconcile.normCode(c.code);
    const k = codeKey(code);
    if (k.length < 6) return;
    const e = cam.many.get(k) || { n: 0, f: {} };
    e.n++;
    ["brand", "pin", "amount", "expiry"].forEach((f) => { if (c[f]) { const t = (e.f[f] = e.f[f] || {}); t[c[f]] = (t[c[f]] || 0) + 1; } });
    e.code = code;
    cam.many.set(k, e);
  });
}
/** The vouchers seen in two frames or more, each with its most-read values. */
function camVouchers() {
  if (!cam.many) return [];
  return [...cam.many.entries()].filter(([, e]) => e.n >= 2).map(([key, e]) => {
    const c = { _key: key, code: e.code, brand: "", pin: "", amount: "", expiry: "", _guess: [], _pinned: [] };
    ["brand", "pin", "amount", "expiry"].forEach((f) => {
      const t = e.f[f] || {}, best = Object.keys(t).sort((a, b) => t[b] - t[a])[0];
      if (best) { c[f] = best; if (t[best] < 2) c._guess.push(f); }
    });
    // what the user typed or locked on this voucher wins
    const ed = cam.edits.get(key) || {};
    Object.keys(ed).forEach((f) => { c[f] = ed[f]; c._pinned.push(f); c._guess = c._guess.filter((x) => x !== f); });
    return c;
  }).map((c, _, all) => {
    // Round 2: a voucher whose own lines name no store takes the store the
    // other vouchers on this screen were read with (most of them), else the
    // store the whole frame showed - marked Check either way.
    if (!c.brand) {
      const st = sharedStore(all) || listedStore(cam.pinned.brand || cam.locked.brand || cam.seen.brand || "");
      if (st) { c.brand = st; c._guess.push("brand"); }
    }
    return c;
  });
}
/** The listed store most of these vouchers carry, or "". */
function sharedStore(cards) {
  const n = new Map();
  cards.forEach((c) => { const st = listedStore(c.brand); if (st) n.set(st, (n.get(st) || 0) + 1); });
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])[0] || "";
}
function paintLive() {
  const show = { brand: (v) => v, code: groupCode, pin: (v) => v, amount: (v) => String(v).replace(/,/g, ""), expiry: (v) => isoExpiry(v) || v };
  const many = camVouchers();
  const paged = many.length >= 2;
  $("#lf-pager").classList.toggle("hidden", !paged);
  const fb = $("#lf-found");
  if (paged && fb.classList.contains("hidden")) { fb.classList.remove("hidden", "is-pop"); void fb.offsetWidth; fb.classList.add("is-pop"); }
  if (!paged) fb.classList.add("hidden");
  $("#lf-found-n").textContent = many.length + " gift cards found";
  const put = (k, v, state) => {
    const el = $("#lf-" + k), row = el.parentElement;
    if (document.activeElement !== el) el.value = v ? show[k](v) : "";
    row.className = "lf" + (state === "pin" ? " is-pinned" : state === "lock" ? " is-locked" : v ? " is-reading" : "");
    const pin = row.querySelector(".lf-pin");
    pin.disabled = !v && state !== "pin";
    pin.setAttribute("aria-pressed", String(state === "pin"));
  };
  if (paged) {
    camView = Math.min(camView, many.length - 1);
    const c = many[camView];
    $("#lf-pos").textContent = (camView + 1) + " of " + many.length + " vouchers";
    $("#lf-prev").disabled = camView === 0;
    $("#lf-next").disabled = camView === many.length - 1;
    ["brand", "code", "pin", "amount", "expiry"].forEach((k) =>
      put(k, c[k], c._pinned.includes(k) ? "pin" : c[k] && !c._guess.includes(k) ? "lock" : ""));
    $("#cam-use").disabled = false;
    $("#cam-use").textContent = "Next: check these " + many.length + " vouchers";
    $("#cam-tip").textContent = many.length + " vouchers in view - check each, then tap Next";
    return;
  }
  $("#cam-use").textContent = "Next: check this voucher";
  ["brand", "code", "pin", "amount", "expiry"].forEach((k) => {
    const v = cam.pinned[k] || cam.locked[k] || cam.seen[k];
    put(k, v, cam.pinned[k] ? "pin" : cam.locked[k] ? "lock" : "");
  });
  $("#cam-use").disabled = !(cam.pinned.code || cam.locked.code || cam.seen.code);
  if (cam.locked.code || cam.pinned.code) $("#cam-tip").textContent = "Got the code - hold still for the rest";
}
/** The user corrected or locked a value on the scanner screen. */
function pinLive(k, value) {
  const many = camVouchers();
  if (many.length >= 2) {
    const c = many[Math.min(camView, many.length - 1)];
    const ed = cam.edits.get(c._key) || {};
    if (value === null) delete ed[k]; else ed[k] = value;
    cam.edits.set(c._key, ed);
  } else if (value === null) delete cam.pinned[k];
  else cam.pinned[k] = value;
  paintLive();
}
function wireLiveFields() {
  document.querySelectorAll("#live-fields .lf-v").forEach((el) => {
    const k = el.dataset.k;
    el.addEventListener("change", () => {
      let v = el.value.trim();
      if (k === "code") v = window.YCJ.reconcile.normCode(v);
      if (k === "brand") v = listedStore(v) || v;
      pinLive(k, v || null);
    });
    if (k === "brand") el.addEventListener("store-picked", () => pinLive("brand", el.value.trim()));
  });
  storePicker($("#lf-brand"), $("#lf-brand-sug"));
  document.querySelectorAll("#live-fields .lf-pin").forEach((b) => b.onclick = () => {
    const k = b.dataset.pin;
    if (b.getAttribute("aria-pressed") === "true") return pinLive(k, null);
    const v = $("#lf-" + k).value.trim();
    if (v) pinLive(k, k === "code" ? window.YCJ.reconcile.normCode(v) : v);
  });
}
function readyToReview() {
  const g = (k) => cam.pinned[k] || cam.locked[k];
  return !!g("code") && !!(g("pin") || g("expiry"));
}
function hintIfStuck() {
  const secs = (Date.now() - cam.startedAt) / 1000;
  if (cam.locked.code) return;
  if (secs > 12) $("#cam-tip").textContent = "Move closer, keep it flat" + ($("#cam-torch").classList.contains("hidden") ? "" : ", or try the torch");
}

/** Freeze what was read into the review screen. The thumbnail is the last
 *  frame that read something - in memory only, for comparing by eye. */
function goReview() {
  const many = camVouchers();
  if (many.length >= 2) {
    if (cam.last) { try { $("#scan-thumb2").src = cam.last.toDataURL("image/jpeg", 0.7); } catch (e) {} }
    const append = batchOpen();
    stopCamera(); resetScan(); showList();
    renderPreview(many, append);
    return;
  }
  const P = cam.pinned, L = cam.locked, S = cam.seen;
  const pick = (k) => P[k] || L[k] || S[k] || "";
  const c = { brand: pick("brand"), code: pick("code"), pin: pick("pin"), amount: pick("amount"), expiry: pick("expiry"),
    _guess: ["brand", "code", "pin", "amount", "expiry"].filter((k) => !P[k] && !L[k] && S[k]) };
  // Round 3: one voucher or five, the camera hands over to the same review
  // (step 2) as every other way in.
  const append = batchOpen();
  stopCamera(); resetScan();
  renderPreview([c], append);
}

/** The review screen, whichever way the card was read (camera or picture). */
function fillReview(c, hows, text, guessHint) {
  scanHow = hows;
  $("#s-brand").value = c.brand; $("#s-code").value = c.code; $("#s-pin").value = c.pin;
  $("#s-amount").value = c.amount; $("#s-expiry").value = c.expiry;
  $("#scan-text").textContent = text || "(no text)";
  delete $("#s-brand").dataset.keep;
  $("#s-brand-note").classList.add("hidden");
  setScanType(c.pin ? "pin" : "code");
  ["brand", "code", "pin", "amount", "expiry"].forEach((k) => flag(k, scanHow[k], c[k]));
  const guessed = Object.values(scanHow).filter((x) => x === "guess").length;
  $("#scan-hint").textContent = guessed
    ? guessHint
    : "Compare with the card, then save. Nothing is saved until you do.";
  $("#scan-err").textContent = "";
  camShow("#scan-review");
  paintClears();
}

async function saveScan() {
  const err = $("#scan-err");
  $("#s-brand")._fixBrand();
  const type = $("#scan-type").dataset.value;
  const card = {
    brand: $("#s-brand").value.trim(), code: $("#s-code").value.trim(),
    pin: type === "pin" ? $("#s-pin").value.trim() : "",
    amount: $("#s-amount").value.trim(), expiry: $("#s-expiry").value,
  };
  // The checks that matter for a voucher, in the order a person would fix them.
  card.brand = settleStore($("#s-brand"));
  if (!card.brand) { err.textContent = STORE_MSG; return; }
  if (codeKey(card.code).length < 6) { err.textContent = "The code looks too short - check it against the picture."; return; }
  if (type === "pin" && !/^\d{4,8}$/.test(card.pin)) { err.textContent = "Enter the PIN (4 to 8 digits), or switch to Code only."; return; }
  if (card.amount && !(num(card.amount) > 0)) { err.textContent = "The amount should be a number, like 1000."; return; }
  const dup = dupOf(card.code);
  if (dup) { err.textContent = "Already in your vault: " + (dup.brand || "a card") + (dup.amount ? " ₹" + dup.amount : "") + "."; return; }
  if (card.expiry) {
    const dl = daysLeft({ expiry: card.expiry });
    if (dl !== null && dl < 0 && !$("#scan-save").dataset.ok) {
      err.textContent = "This date has already passed. Tap Save again to keep it anyway.";
      $("#scan-save").dataset.ok = "1";
      return;
    }
  }
  delete $("#scan-save").dataset.ok;
  const { ok, data } = await api("POST", "/api/cards", card);
  if (!ok) { err.textContent = "Couldn't save - is the vault still unlocked?"; return; }
  CARDS.unshift(data.card);
  resetScan();
  render();
  if (filtersAreMobile) $("#add-sheet").classList.add("hidden");
  toast((data.card.brand || "Card") + " saved");
}
// --------------------------------------------------------------------------- //
// From a screenshot - a voucher bought in another app on this phone
// --------------------------------------------------------------------------- //
// The camera can't be pointed at the phone's own screen, so the user takes a
// screenshot and picks it (Android's photo picker - no storage permission, the
// app sees only that one picture), or shares it straight in from another app.
// The same reader as the camera; one picture instead of many frames, so
// nothing is "locked" by votes - unlabelled guesses are flagged Check instead.
let shotBusy = false;

function shotStatus(msg, isErr) {
  const el = $("#shot-status");
  el.textContent = msg || "";
  el.classList.toggle("is-err", !!isErr);
  // Picked from the list (1.3.9): say it under the list, where the user is.
  if (!$("#tab-quick").classList.contains("hidden")) {
    const m = $("#import-msg");
    m.textContent = msg || "";
    m.style.color = isErr ? "var(--amber)" : "var(--muted)";
  }
}

async function scanFromPicker() {
  resetScan();
  shotBusy = true;
  const files = await pickImages();
  if (!files.length) { shotBusy = false; return; }
  await scanImages(files);
}

/** src: a File from the picker, or a data: URL shared in from another app. */
const scanImage = (src) => scanImages([src]);

/**
 * One or many pictures (1.3.11, E1-E2): screenshots picked together, shared
 * together, or the pages of a PDF. Read as one text, so a list split over two
 * screenshots is one list. Several vouchers go to the review list; one
 * voucher from one picture goes to the single-card review as before.
 */
async function scanImages(list, noun) {
  const batch = batchOpen();
  const n = list.length;
  noun = noun || "screenshot";
  shotBusy = true;
  resetScan();
  document.querySelectorAll(".js-shot, .js-shot-multi").forEach((b) => (b.disabled = true));
  $("#cam-start").disabled = true;
  intakeStatus(n > 1 ? "Reading " + noun + " 1 of " + n + "…" : "Reading the " + noun + "…");
  try {
    const { text, result, second, canvas } = await window.YCJ.scan.readImages(list,
      (done, total) => { if (done < total) intakeStatus("Reading " + noun + " " + (done + 1) + " of " + total + "…"); });
    // Several vouchers in one picture - an order summary, or three codes kept
    // in a notes app (1.3.9: those used to come back as ONE card). The voucher
    // reader finds labelled lists; the paste reader also finds one-per-line
    // lists without labels. Either way: one editable row per voucher.
    // The paste reader is lenient (an order ID can look like a code), so it
    // only gets a say when the voucher reader found no LABELLED code, and
    // only with two or more distinct, code-shaped rows.
    let parsed = [];
    if (result.multi || result.how.code !== "label") {
      const seen = new Set();
      parsed = ((await api("POST", "/api/parse", { text, brand: "" })).data.cards || []).filter((c) => {
        const k = codeKey(c.code);
        if (k.length < 6 || !/\d/.test(k) || seen.has(k)) return false;
        seen.add(k); return true;
      });
    }
    // The voucher reader keeps each voucher's own store; the paste reader is
    // the fallback for lists it could not split.
    let many = result.multi ? (result.cards.length >= parsed.length ? result.cards : parsed) : parsed.length >= 2 ? parsed : null;
    // Read twice on a phone: compare the two reads field by field.
    if (many && second) {
      const b = second.multi ? second.cards : (second.card.code ? [second.card] : []);
      many = window.YCJ.reconcile.reconcile(many, b).map((c) => Object.assign(c, { _checked: true }));
    }
    if (many) {
      intakeStatus("");
      if (!batch) $("#paste-text").value = text;
      showList();
      renderPreview(many, batch);
      return;
    }
    if (!result.card.code) {
      intakeStatus("No voucher code found in " + (n > 1 ? "those pictures" : "that picture") + ". Try a screenshot that shows the code clearly, or type it in.", true);
      return;
    }
    intakeStatus("");
    let one = Object.assign({ _guess: Object.keys(result.how).filter((k) => result.how[k] === "guess") }, result.card);
    if (second) {
      const b = second.multi ? second.cards : (second.card.code ? [second.card] : []);
      one = Object.assign(window.YCJ.reconcile.reconcile([one], b)[0], { _checked: true });
    }
    // Round 3: one voucher goes to the same review (step 2) as many.
    renderPreview([one], batch);
  } catch (e) {
    intakeStatus("That picture couldn't be read. Try another screenshot, or type the card in.", true);
  } finally {
    shotBusy = false;
    document.querySelectorAll(".js-shot, .js-shot-multi").forEach((b) => (b.disabled = false));
    $("#cam-start").disabled = false;
  }
}

// --------------------------------------------------------------------------- //
// Share to Gift Card Vault
// --------------------------------------------------------------------------- //
// Android's Share menu lists the app (MainActivity's SEND intent filters, see
// tools/harden-android.js step 7). Text - a voucher email from Gmail, an SMS -
// opens in the Paste tab's preview; a picture goes through the screenshot
// reader. Either way nothing is saved until the user checks it and taps Save.
// A share that arrives while the vault is locked waits for the unlock.
let SHARED = null;

function wireShareIn() {
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ShareIn;
  if (!P) return;
  const take = () => P.take().then((d) => {
    if (d && (d.text || d.image || d.images || d.pdf)) { SHARED = d; consumeShared(); }
  }).catch(() => {});
  take();                                   // cold start: the share launched the app
  P.addListener("shared", take);            // already running: a new share came in
}

function consumeShared() {
  if (!SHARED || $("#app").classList.contains("hidden")) return;
  const d = SHARED;
  SHARED = null;
  closeUse();
  if (filtersAreMobile) $("#add-sheet").classList.remove("hidden");
  if (d.pdf) {
    document.querySelector('.tab[data-tab="quick"]').click();
    openPdfBytes(String(d.pdf).split(",")[1] || "");
  } else if (d.images || d.image) {
    shotBusy = true;                        // keep the camera from starting
    const list = d.images && d.images.length ? d.images : [d.image];
    setMode("upload");
    scanImages(list);
  } else {
    document.querySelector('.tab[data-tab="quick"]').click();
    $("#paste-text").value = d.text;
    $("#preview-btn").click();
  }
}

function wireScan() {
  $("#cam-start").onclick = startCamera;
  $("#cam-retry").onclick = startCamera;
  $("#cam-stop").onclick = resetScan;
  $("#cam-use").onclick = goReview;
  $("#cam-to-form").onclick = () => { resetScan(); document.querySelector('.tab[data-tab="manual"]').click(); };
  $("#cam-lens").onclick = nextLens;
  $("#cam-torch").onclick = async () => {
    const track = cam.stream && cam.stream.getVideoTracks()[0];
    if (!track) return;
    const on = $("#cam-torch").getAttribute("aria-pressed") !== "true";
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); $("#cam-torch").setAttribute("aria-pressed", String(on)); } catch (e) {}
  };
  $("#scan-again").onclick = () => { resetScan(); startCamera(); };
  document.querySelectorAll(".js-shot, .js-shot-multi").forEach((b) => (b.onclick = scanFromPicker));
  $("#scan-save").onclick = saveScan;
  // Keep the card under review in the list and go for the next one (1.3.9).
  $("#scan-to-list").onclick = () => {
    $("#s-brand")._fixBrand();
    const type = $("#scan-type").dataset.value;
    const card = {
      brand: $("#s-brand").value.trim(), code: $("#s-code").value.trim(),
      pin: type === "pin" ? $("#s-pin").value.trim() : "",
      amount: $("#s-amount").value.trim(), expiry: $("#s-expiry").value,
    };
    if (codeKey(card.code).length < 6) { $("#scan-err").textContent = "The code looks too short - check it against the picture."; return; }
    const append = batchOpen();
    resetScan();
    showList();
    renderPreview([card], append);
  };
  $("#batch-scan").onclick = () => document.querySelector('.tab[data-tab="scan"]').click();
  document.querySelectorAll("#scan-type [data-type]").forEach((b) => b.onclick = () => setScanType(b.dataset.type));
  ["#s-code", "#s-pin", "#s-amount", "#s-expiry"].forEach((x) => $(x).addEventListener("input", () => {
    $("#scan-err").textContent = ""; delete $("#scan-save").dataset.ok;
    const id = x.slice(3); $("#sf-" + id).className = "flag"; $("#sf-" + id).textContent = "";
  }));
  wireBrandFix($("#s-brand"), $("#s-brand-note"));
  $("#s-brand").addEventListener("input", () => { $("#sf-brand").className = "flag"; $("#sf-brand").textContent = ""; });

  // The camera must never run out of sight. One observer on the Scan tab and
  // the add sheet covers every way they get hidden (tab switch, close button,
  // scrim tap, back key, save, lock) without each of them remembering to.
  const visibleNow = () => !$("#tab-scan").classList.contains("hidden") && !$("#tab-scan").closest(".hidden");
  const watch = new MutationObserver(() => {
    if (!visibleNow()) {
      // Out of sight mid-scan: reset completely, not just stop - a stopped
      // camera left in the live layout came back as a frozen viewfinder that
      // never restarted (found by the suite). A review in progress is kept,
      // so closing the sheet never throws away what the user was checking.
      if (cam.on || !$("#cam-live").classList.contains("hidden") || !$("#cam-error").classList.contains("hidden")) resetScan();
      return;
    }
    // Back on Scan: once the user has allowed the camera, open it straight
    // away - that is what "point the camera at the card" means. The very first
    // time, the Start button explains what is about to happen instead.
    let ok = false; try { ok = localStorage.getItem(CAM_OK) === "1"; } catch (e) {}
    if (ok && !cam.on && !shotBusy && !$("#cam-intro").classList.contains("hidden")) startCamera();
  });
  [$("#tab-scan"), $("#add-sheet"), $("#app")].forEach((el) => watch.observe(el, { attributes: true, attributeFilter: ["class"] }));
  document.addEventListener("visibilitychange", () => { if (document.hidden && cam.on) resetScan(); });
}

// --------------------------------------------------------------------------- //
// The list and its header (1.3.11, issue #2: B1-B9)
// --------------------------------------------------------------------------- //
let VISIBLE_IDS = [];            // the list as last drawn - next / previous follow it (B2)
let storeLocked = false;         // B3: the picked store stays through scrolling, cards, auto-lock
const LOCK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z"/></svg>';
const UNLOCK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H9V7a3 3 0 0 1 5.8-1.1l1.9-.7A5 5 0 0 0 12 2Zm-6 10h12v8H6v-8Z"/></svg>';
const MORE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>';

// ---- B4 / A10: the brand mark is Home --------------------------------------
// From anything on top (a card, a sheet, search) the first tap comes back to
// the list; on the list it scrolls smoothly to the first card; at the top it
// clears the status filter and an UNLOCKED store filter. A locked store stays.
function goHome() {
  const tops = ["#use-sheet", "#add-sheet", "#filter-sheet", "#lic-modal", "#bell-sheet", "#plan-sheet", "#spend-sheet", "#terms-sheet"]
    .filter((x) => !$(x).classList.contains("hidden"));
  if (tops.length || searchOpen() || !$("#modal").classList.contains("hidden")) {
    closeUse(); closeModal(); closeBell(); closePlans(); closeSearch();
    tops.forEach((x) => $(x).classList.add("hidden"));
    if (tops.includes("#add-sheet")) closeAddSheet();
    return;
  }
  if (window.scrollY > 4) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  let changed = false;
  if (filterStatus !== "all") { filterStatus = "all"; changed = true;
    document.querySelectorAll(".filter").forEach((x) => x.classList.toggle("active", x.dataset.status === "all"));
    document.querySelectorAll(".kpi").forEach((x) => x.classList.remove("selected")); }
  if (!storeLocked && storesPicked.size) { storesPicked = new Set(); changed = true; }
  if (changed) render();
}

// ---- B2: next / previous inside an open card ---------------------------------
function paintUseNav() {
  const i = VISIBLE_IDS.indexOf(useId), n = VISIBLE_IDS.length;
  const show = i >= 0 && n > 1;
  $("#use-nav").classList.toggle("hidden", !show);
  if (!show) return;
  $("#use-pos").textContent = (i + 1) + " of " + n;
  $("#use-prev").disabled = i === 0;
  $("#use-next").disabled = i === n - 1;
}
function stepUse(dir) {
  const i = VISIBLE_IDS.indexOf(useId);
  const next = VISIBLE_IDS[i + dir];
  if (i < 0 || !next) return;
  const d = $("#use-sheet .use-dialog");
  d.classList.remove("is-step-l", "is-step-r"); void d.offsetWidth;
  d.classList.add(dir > 0 ? "is-step-l" : "is-step-r");
  openUse(next);
}
function wireUseNav() {
  $("#use-prev").onclick = () => stepUse(-1);
  $("#use-next").onclick = () => stepUse(1);
  // A sideways swipe on the card moves too; a vertical drag still scrolls.
  const d = $("#use-sheet .use-dialog");
  let x0 = 0, y0 = 0, on = false;
  d.addEventListener("pointerdown", (e) => { if (e.target.closest("button, a")) return; x0 = e.clientX; y0 = e.clientY; on = true; });
  d.addEventListener("pointerup", (e) => {
    if (!on) return;
    on = false;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) stepUse(dx < 0 ? 1 : -1);
  });
  d.addEventListener("pointercancel", () => { on = false; });
}

// ---- B6: hide the value, fold the card ----------------------------------------
// The eye beside the total (or a tap on the total) hides it as ₹ •••• or shows
// it; the arrow on the card folds it to one slim bar or opens it. Both are
// remembered on this phone exactly as left - hidden stays hidden after a lock
// or a restart, shown stays shown.
const HERO_KEY = "gcv-hero";
let heroMode = (() => { try { return Object.assign({ hide: false, collapse: false }, JSON.parse(localStorage.getItem(HERO_KEY) || "{}")); } catch (e) { return { hide: false, collapse: false }; } })();
let lastValue = 0;
function saveHeroMode() { try { localStorage.setItem(HERO_KEY, JSON.stringify(heroMode)); } catch (e) {} }
function paintVaultValue(value) {
  if (value !== undefined) lastValue = value;
  const masked = !!heroMode.hide;
  $("#vv-amount").textContent = masked ? "₹ ••••" : rupee(lastValue / 100);
  $("#vv-amount").classList.toggle("is-masked", masked);
  const eye = $("#vv-eye");
  eye.setAttribute("aria-pressed", String(masked));
  eye.setAttribute("aria-label", masked ? "Show vault value" : "Hide vault value");
}
function paintHeroMode() {
  $(".hero").classList.toggle("is-collapsed", !!heroMode.collapse);
  const f = $("#vv-fold");
  f.setAttribute("aria-expanded", String(!heroMode.collapse));
  f.setAttribute("aria-label", heroMode.collapse ? "Expand the vault card" : "Collapse the vault card");
  paintVaultValue();
}
/** Open the shared ⋯ menu under `anchor`. */
function placeMenu(m, anchor) {
  const r = anchor.getBoundingClientRect();
  m.classList.remove("hidden");
  m.style.top = Math.round(r.bottom + window.scrollY + 4) + "px";
  m.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))) + "px";
}

// ---- B5: the frozen header -------------------------------------------------------
// Header, vault card and the filter row stay put; only the cards scroll. The
// sticky offsets follow the real heights (font size, a collapsed card).
function wireFrozenHeader() {
  if (!filtersAreMobile || !window.ResizeObserver) return;
  document.body.classList.add("is-frozen");
  const root = document.documentElement.style;
  const ro = new ResizeObserver(() => {
    root.setProperty("--tb-h", $("#topbar").offsetHeight + "px");
    root.setProperty("--hero-h", $(".hero").offsetHeight + "px");
  });
  ro.observe($("#topbar")); ro.observe($(".hero"));
}

// ---- B7: delete every card of one or more stores ---------------------------------
// From a combined brand tile (its bin, beside Export): the 5-to-0 countdown.
// From Settings > Delete stores (tick several): the countdown AND the
// fingerprint / master password - only there (user's rule, 1.3.11 round 2).
// Either way Undo for 10 seconds puts every card back, same ids.
const DELETE_COUNTDOWN = 5;
function storeCards(store) { return CARDS.filter((c) => storeOf(c) === store); }
function confirmDeleteStores(stores, needAuth) {
  const set = new Set(stores);
  const cards = CARDS.filter((c) => set.has(storeOf(c)));
  if (!cards.length) return;
  const usable = cards.filter((c) => !c.archived && isHeld(effStatus(c)));
  const total = usable.reduce((t, c) => t + paise(balanceOf(c)), 0);
  const archived = cards.filter((c) => c.archived).length;
  const one = stores.length === 1 ? stores[0] : "";
  $("#modal-box").innerHTML = `
    <div class="del-store">
      ${one ? `<span class="ds-glyph gc-glyph" style="${window.YCJ.brands.style(one)}">${esc(window.YCJ.brands.theme(one).g)}</span>`
            : `<span class="ds-glyph ds-many">${stores.length}</span>`}
      <h3 class="mpw-title">${one ? "Delete all " + esc(one) + " cards?" : "Delete the cards of " + stores.length + " stores?"}</h3>
      ${one ? "" : `<p class="ds-names">${stores.map(esc).join(", ")}</p>`}
      <p class="ds-facts"><b>${cards.length}</b> card${cards.length === 1 ? "" : "s"}${archived ? ` (${archived} archived)` : ""} · <b>${rupee(total / 100)}</b> usable value</p>
      <p class="mpw-body">They are deleted from this phone, codes and PINs included.${needAuth ? " You confirm with your fingerprint or master password." : ""} You can undo it for 10 seconds.</p>
      <div class="mpw-foot">
        <button type="button" class="ghost" id="ds-cancel">Cancel</button>
        <button type="button" class="danger ds-go" id="ds-go" disabled><span class="ds-fill"></span><span class="ds-label">Delete in ${DELETE_COUNTDOWN}</span></button>
      </div>
    </div>`;
  $("#modal").classList.remove("hidden");
  // The red button counts 5 to 0 before it works: a second look, not a second dialog.
  let left = DELETE_COUNTDOWN;
  const go = $("#ds-go");
  go.style.setProperty("--ds-secs", DELETE_COUNTDOWN + "s");
  go.classList.add("is-counting");
  const tick = setInterval(() => {
    left--;
    if (left > 0) { go.querySelector(".ds-label").textContent = "Delete in " + left; return; }
    clearInterval(tick);
    go.disabled = false;
    go.classList.remove("is-counting");
    go.querySelector(".ds-label").textContent = "Delete " + cards.length + " card" + (cards.length === 1 ? "" : "s");
  }, 1000);
  const done = () => { clearInterval(tick); $("#modal").classList.add("hidden"); $("#modal").onclose = null; };
  $("#modal").onclose = done;
  $("#ds-cancel").onclick = done;
  go.onclick = async () => {
    done();
    if (needAuth && !(await confirmIdentity("Delete " + cards.length + " card" + (cards.length === 1 ? "" : "s")))) return;
    await deleteStores(stores);
  };
}
/** Fingerprint if it is on, else the master password. true = it is you. */
async function confirmIdentity(title) {
  const M = window.YCJ.mobile;
  if (M.bioEnabled() && (await M.bioAvailable())) {
    const pw = await M.bioUnlock();
    if (pw && (await api("POST", "/api/verify", { password: pw })).data.ok) return true;
  }
  const pw = await promptMasterPassword(title, "Enter your master password to delete these cards.", "Delete", true);
  if (!pw) return false;
  if ((await api("POST", "/api/verify", { password: pw })).data.ok) return true;
  guardFail();
  return false;
}
let undoTimer = null, undoCards = null;
async function deleteStores(stores) {
  const set = new Set(stores);
  const ids = CARDS.filter((c) => set.has(storeOf(c))).map((c) => c.id);
  const { ok, data } = await api("POST", "/api/cards/delete-many", { ids });
  if (!ok) return;
  const gone = new Set(ids);
  CARDS = CARDS.filter((c) => !gone.has(c.id));
  stores.forEach((st) => storesPicked.delete(st));
  if (storesPicked.size !== 1) storeLocked = false;
  render();
  const n = data.count || 0;
  showUndo(data.removed || [], n + " " + (stores.length === 1 ? stores[0] + " " : "") + "card" + (n === 1 ? "" : "s") + " deleted");
}
const deleteStore = (store) => deleteStores([store]);
function showUndo(cards, text) {
  undoCards = cards;
  clearTimeout(undoTimer);
  const bar = $("#undo-bar");
  $("#undo-text").textContent = text;
  bar.classList.remove("hidden", "is-run"); void bar.offsetWidth; bar.classList.add("is-run");
  undoTimer = setTimeout(hideUndo, 10000);
}
function hideUndo() { clearTimeout(undoTimer); undoCards = null; $("#undo-bar").classList.add("hidden"); }
async function undoDelete() {
  const cards = undoCards;
  hideUndo();
  if (!cards || !cards.length) return;
  const { ok, data } = await api("POST", "/api/cards/restore", { cards });
  if (!ok) return;
  CARDS = CARDS.concat(data.restored || []);
  render();
  (data.restored || []).forEach((c) => flashCard(c.id, true));
}
/** Settings > Delete stores: every store with a tick box and its card count. */
const msPicked = new Set();
function renderManageStores() {
  const box = $("#ms-list");
  if (!box) return;
  const by = new Map();
  CARDS.forEach((c) => { const k = storeOf(c); by.set(k, (by.get(k) || 0) + 1); });
  const names = [...by.keys()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  [...msPicked].forEach((n) => { if (!by.has(n)) msPicked.delete(n); });
  box.innerHTML = names.length ? names.map((n) => '<li><button type="button" class="st-row ms-row' + (msPicked.has(n) ? " is-on" : "") + '" role="checkbox" aria-checked="' + msPicked.has(n)
    + '" data-store="' + esc(n) + '" style="' + window.YCJ.brands.style(n) + '"><span class="st-tick" aria-hidden="true"></span>'
    + '<span class="gc-glyph sm">' + esc(window.YCJ.brands.theme(n).g) + '</span>'
    + '<span class="st-nm">' + esc(n) + '</span><span class="st-n">' + by.get(n) + (by.get(n) === 1 ? " card" : " cards") + '</span></button></li>').join("")
    : '<li class="ms-empty">No stores yet.</li>';
  const k = msPicked.size, cards = CARDS.filter((c) => msPicked.has(storeOf(c))).length;
  $("#ms-sum").textContent = k ? k + (k === 1 ? " store · " : " stores · ") + cards + (cards === 1 ? " card" : " cards") : "Nothing picked";
  $("#ms-delete").disabled = !k;
}
function wireManageStores() {
  $("#ms-open").onclick = () => { msPicked.clear(); renderManageStores(); $("#lic-modal").classList.add("hidden"); $("#ms-sheet").classList.remove("hidden"); };
  const close = () => $("#ms-sheet").classList.add("hidden");
  $("#ms-close").onclick = close;
  $("#ms-sheet").addEventListener("click", (e) => {
    if (e.target.id === "ms-sheet") return close();
    const row = e.target.closest(".ms-row");
    if (!row) return;
    const n = row.dataset.store;
    if (msPicked.has(n)) msPicked.delete(n); else msPicked.add(n);
    renderManageStores();
  });
  $("#ms-delete").onclick = () => { const list = [...msPicked]; close(); confirmDeleteStores(list, true); };
  $("#undo-btn").onclick = undoDelete;
}

// ---- B8: export every card of a brand (Premium) -----------------------------------
function brandExport(store) {
  if (!needsPaid("Exporting a whole brand at once comes with Yearly or Lifetime.")) return;
  // The same cards the combined tile adds up: usable ones, or exactly the
  // status box that is picked.
  const cards = CARDS.filter((c) => !c.archived && storeOf(c) === store).filter((c) => {
    const s = effStatus(c);
    if (filterStatus === "all") return isHeld(s);
    if (filterStatus === "active") return isHeld(s);
    return s === filterStatus;
  });
  if (!cards.length) return;
  const total = cards.reduce((t, c) => t + paise(balanceOf(c)), 0);
  const text = store + " · " + cards.length + " gift card" + (cards.length === 1 ? "" : "s") + " · " + rupee(total / 100)
    + "\n\n" + cards.map(giftAsText).join("\n\n");
  const secs = Math.round(window.YCJ.mobile.CLIP_TTL_MS / 1000);
  $("#modal-box").innerHTML = `
    <div class="lic-head"><h2>Export ${esc(store)} cards</h2></div>
    <div class="lic-body">
      <pre class="export-text" id="ex-text">${esc(text)}</pre>
      <p class="fineprint">Includes every full code and PIN. A copy clears from the clipboard after ${secs}s; anything you share stays wherever you send it.</p>
      <div class="modal-foot">
        <button type="button" class="ghost" id="ex-close">Close</button>
        <button type="button" class="ghost" id="ex-share">Share</button>
        <button type="button" class="primary" id="ex-copy">Copy</button>
      </div>
    </div>`;
  $("#modal").classList.remove("hidden");
  $("#ex-close").onclick = closeModal;
  $("#ex-copy").onclick = async (e) => {
    const ok = await window.YCJ.mobile.copySensitive(text);
    if (ok) markCopied(e.currentTarget, "export", secs);
    setTimeout(closeModal, 900);
  };
  $("#ex-share").onclick = async () => { closeModal(); await window.YCJ.mobile.shareText(text, store + " gift cards"); };
}

// ---- B9: purchase date, the store's validity rule, No expiry -----------------------
// Amazon's gift cards are valid for a year from purchase, so a purchase date
// fills the expiry (shown, editable). Google Play cards do not expire.
const VALIDITY_DAYS = (store) => /^amazon\b/i.test(store || "") ? 365 : 0;
const NEVER_EXPIRES = (store) => /^google play\b/i.test(store || "");
function setNoExpiry(on) {
  $("#f-noexp").checked = !!on;
  $("#f-expiry").disabled = !!on;
  if (on) $("#f-expiry").value = "";
}
function plusDays(iso, n) {
  const d = parseExpiry(iso);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return isoExpiry(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"));
}
function applyStoreRule() {
  const store = window.YCJ.brands.canonical($("#f-brand").value.trim());
  const note = $("#f-exp-rule");
  const say = (t) => { note.textContent = t; note.classList.toggle("hidden", !t); };
  if (NEVER_EXPIRES(store) && !$("#f-expiry").value && !$("#f-noexp").checked) {
    setNoExpiry(true);
    return say(store + " gift cards do not expire, so No expiry is ticked. Untick it if yours has a date.");
  }
  const days = VALIDITY_DAYS(store), bought = $("#f-purchased").value;
  if (days && bought && !$("#f-noexp").checked && (!$("#f-expiry").value || $("#f-expiry").dataset.auto === $("#f-expiry").value)) {
    $("#f-expiry").value = plusDays(bought, days);
    $("#f-expiry").dataset.auto = $("#f-expiry").value;
    return say("Expiry filled in: purchase date + " + days + " days, " + store + "'s validity. Change it if your card says otherwise.");
  }
  if (!days || !bought) say("");
}
function wireStoreRules() {
  $("#f-purchased").addEventListener("change", applyStoreRule);
  $("#f-brand").addEventListener("store-picked", applyStoreRule);
  $("#f-brand").addEventListener("change", applyStoreRule);
  $("#f-noexp").addEventListener("change", () => { setNoExpiry($("#f-noexp").checked); $("#f-exp-rule").classList.add("hidden"); });
  $("#f-expiry").addEventListener("input", () => { delete $("#f-expiry").dataset.auto; });
}

// --------------------------------------------------------------------------- //
// Checkout mode (1.3.11, D2) - off by default
// --------------------------------------------------------------------------- //
// Settings > Checkout mode. When on, the checkout view also draws the code as a
// barcode (Code 128) or a QR code (codes.js, offline) and turns this window to
// full brightness while it is open, so a shop's scanner can read the phone.
// A device setting; the brightness goes back the moment the view closes.
const CHECKOUT_KEY = "gcv-checkout";
const CHECKOUT_KIND_KEY = "gcv-checkout-kind";
const checkoutOn = () => { try { return localStorage.getItem(CHECKOUT_KEY) === "1"; } catch (e) { return false; } };
function checkoutKind() { try { return localStorage.getItem(CHECKOUT_KIND_KEY) === "qr" ? "qr" : "bar"; } catch (e) { return "bar"; } }
function paintCheckoutSetting() {
  const t = $("#checkout-toggle");
  t.checked = checkoutOn();
  t.onchange = () => { try { t.checked ? localStorage.setItem(CHECKOUT_KEY, "1") : localStorage.removeItem(CHECKOUT_KEY); } catch (e) {} };
}
function paintCheckoutArt(c) {
  const box = $("#use-scan");
  const on = checkoutOn() && !!(c && c.code);
  box.classList.toggle("hidden", !on);
  if (!on) return;
  const kind = checkoutKind();
  box.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.kind === kind)));
  const code = String(c.code).replace(/\s+/g, "");
  let svg = "";
  try { svg = kind === "qr" ? window.YCJ.codes.qrSvg(code) : window.YCJ.codes.barcodeSvg(code); } catch (e) { svg = ""; }
  $("#use-scan-art").innerHTML = svg;
  $("#use-scan-art").classList.toggle("is-qr", kind === "qr");
  $("#use-scan-note").textContent = svg ? "Hold the screen flat under the shop's scanner." : "This code can't be drawn as a " + (kind === "qr" ? "QR code" : "barcode") + ". Read it out instead.";
  window.YCJ.scan.probeReader().then(() => { if (!$("#use-sheet").classList.contains("hidden")) window.YCJ.scan.setBrightness(1); });
}
function wireCheckout() {
  $("#use-scan").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]");
    if (!b) return;
    try { localStorage.setItem(CHECKOUT_KIND_KEY, b.dataset.kind); } catch (err) {}
    paintCheckoutArt(CARDS.find((x) => x.id === useId));
  });
}

// --------------------------------------------------------------------------- //
// Bringing vouchers in (1.3.11, E1-E8)
// --------------------------------------------------------------------------- //
// Every way in lands in the ONE review list (#preview), and Save makes each
// voucher its own tile. Email, WhatsApp and SMS arrive by Share (text,
// pictures, PDFs) or by copy + Paste; a voucher that never leaves the app it
// was bought in arrives as screenshots - or, where that app blocks them, by
// Collect mode. Nothing here reads an inbox or SMS by itself: that would need
// internet and a sign-in (inbox), or a permission Google Play gives only to
// SMS apps.

/** Status under the intake buttons (and under the list, where the user is). */
function intakeStatus(msg, isErr) {
  const el = $("#intake-status");
  el.textContent = msg || "";
  el.classList.toggle("is-err", !!isErr);
  shotStatus(msg, isErr);
}

/** Pick one or more pictures through the system picker (Android's Photo
 *  Picker: no storage permission, the app sees only what was chosen). */
function pickImages() {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";          // no `capture`: never opens the camera
    inp.multiple = true;
    inp.onchange = () => resolve([...(inp.files || [])].slice(0, 12));
    window.YCJ.mobile.holdLock(120000);
    inp.click();
  });
}

// ---- E6: one tap Paste --------------------------------------------------------
/** Round 4: Paste opens the big box and reads NOTHING by itself - an old
 *  clipboard kept bringing back vouchers the user had already removed. */
function openPaste() {
  setMode("paste");
  intakeStatus("");
}
/** "Paste from clipboard" inside the box: fills the box; Find the vouchers
 *  is the user's own tap. */
async function pasteFromClipboard() {
  const text = await window.YCJ.mobile.readClipboard();
  setMode("paste");
  if (!text || !text.trim()) {
    intakeStatus("The clipboard is empty. Copy the voucher message or email first - or type it in the box.", true);
    return;
  }
  intakeStatus("");
  const box = $("#paste-text");
  box.value = box.value.trim() ? box.value.replace(/\s*$/, "\n") + text : text;
}

// ---- E5: a voucher PDF ----------------------------------------------------------
async function openPdfBytes(b64) {
  const S = window.YCJ.scan;
  await S.probeReader();
  if (!S.reader.pdf) { intakeStatus("Reading a PDF needs the phone app. Take a screenshot of it and upload that instead.", true); return; }
  intakeStatus("Opening the PDF…");
  let pages = [];
  try { pages = await S.pdfPages(b64, 8); }
  catch (e) {
    intakeStatus(e && e.code === "locked"
      ? "This PDF is password-protected. Open it, take a screenshot, and upload that."
      : "This PDF could not be opened. Take a screenshot of it and upload that instead.", true);
    return;
  }
  if (!pages.length) { intakeStatus("That PDF has no pages to read.", true); return; }
  await scanImages(pages, "page");
}
async function pickPdf() {
  const bytes = await window.YCJ.mobile.pickFile("application/pdf,.pdf");
  if (!bytes) return;
  await openPdfBytes(window.YCJ.storeHelpers.toB64(bytes));
}

// ---- B10: a CSV file --------------------------------------------------------------
/** CSV text -> rows of cells. Quotes, doubled quotes, CRLF; ; or tab
 *  separated files too (Excel in some locales saves those). */
function parseCsv(text) {
  text = String(text || "").replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => first.split(ch).length - 1;
  const sep = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const CSV_COLS = [
  ["brand", /^(store|brand|merchant|retailer|shop|gift\s*card)$/],
  ["code", /^(code|card(\s*(no|number|code))?|voucher(\s*(no|number|code))?|claim\s*code|gift\s*card\s*(no|number|code)|number)$/],
  ["pin", /^(pin|card\s*pin|security\s*code)$/],
  ["amount", /^(amount|value|denomination|face\s*value|worth|balance|rs|inr|₹)$/],
  ["expiry", /^(expiry|expires|expiry\s*date|valid(ity)?|valid\s*(till|until|upto)|exp)$/],
  ["purchased", /^(purchase(d)?(\s*date)?|bought(\s*on)?|date\s*of\s*purchase|order\s*date)$/],
  ["order_number", /^(order(\s*(no|number|id))?)$/],
  ["notes", /^(notes?|remarks?|comments?)$/],
];
function csvCards(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((c) => c.trim().toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " "));
  const map = head.map((h) => { const hit = CSV_COLS.find(([, re]) => re.test(h)); return hit ? hit[0] : ""; });
  const hasHead = map.filter(Boolean).length >= 2 && map.includes("code");
  // No header row: store, code, PIN, amount, expiry, purchase date.
  const cols = hasHead ? map : ["brand", "code", "pin", "amount", "expiry", "purchased"];
  return (hasHead ? rows.slice(1) : rows).map((r) => {
    const c = {};
    cols.forEach((k, i) => { if (k && r[i] != null) c[k] = r[i].trim(); });
    if (c.purchased) c.purchased = isoExpiry(window.YCJ.parse.normalizeDate(c.purchased) || c.purchased) || "";
    // B9: the store's validity rule for a file with purchase dates only.
    const days = VALIDITY_DAYS(window.YCJ.brands.canonical(c.brand || ""));
    if (!c.expiry && c.purchased && days) c.expiry = plusDays(c.purchased, days);
    return c;
  }).filter((c) => codeKey(c.code).length >= 4);
}
async function pickCsv() {
  const bytes = await window.YCJ.mobile.pickFile(".csv,text/csv,text/comma-separated-values,text/plain");
  if (!bytes) return;
  const cards = csvCards(new TextDecoder("utf-8").decode(bytes));
  if (!cards.length) { intakeStatus("No gift cards found in that file. The first row can name the columns: store, code, PIN, amount, expiry.", true); return; }
  intakeStatus("");
  showList();
  renderPreview(cards, batchOpen());
}

// ---- E7: Collect mode ---------------------------------------------------------------
// For apps that block screenshots: the user copies a code there and switches
// back; each new clipboard text that holds a code joins the list. The trip
// away does not lock the vault while collecting (one hold per trip), but a
// trip longer than COLLECT_MAX_MS does, and ends collecting.
const COLLECT_MAX_MS = 10 * 60000;
const collect = { on: false, last: "", n: 0, hiddenAt: 0 };
function paintCollect(msg) {
  $("#collect-bar").classList.toggle("hidden", !collect.on);
  if (!collect.on) return;
  $("#collect-text").textContent = msg || (collect.n
    ? collect.n + (collect.n === 1 ? " code" : " codes") + " collected. Copy the next one, then come back."
    : "Collecting: copy a code in the other app, then come back here.");
}
async function startCollect() {
  collect.on = true; collect.n = 0;
  // Round 4: whatever is already on the clipboard is old - it brought back
  // codes the user had removed. Only what is copied from now on counts.
  collect.last = (await window.YCJ.mobile.readClipboard()) || "";
  window.YCJ.mobile.holdLock(COLLECT_MAX_MS);
  paintCollect();
}
function stopCollect() {
  const was = collect.on;
  collect.on = false; paintCollect();
  if (was && addMode === "collect") setMode(batchOpen() ? "review" : "");
}
async function collectCheck() {
  if (!collect.on || document.hidden) return;
  const text = await window.YCJ.mobile.readClipboard();
  if (!collect.on || !text || !text.trim() || text === collect.last) return;
  collect.last = text;
  // The paste reader first (one voucher per line, labels); the voucher
  // reader for a lone code with no label.
  let cards = ((await api("POST", "/api/parse", { text, brand: "" })).data.cards || [])
    .filter((c) => codeKey(c.code).length >= 6 && /\d/.test(c.code));
  if (!cards.length) {
    const r = window.YCJ.scan.extract(text);
    cards = (r.multi ? r.cards : [r.card]).filter((c) => codeKey(c.code).length >= 6);
  }
  if (!cards.length) { paintCollect("That was not a voucher code. Copy the code itself, then come back."); return; }
  showList();
  collect.n += renderPreview(cards, batchOpen());
  paintCollect();
}
document.addEventListener("visibilitychange", () => {
  if (!collect.on) return;
  if (document.hidden) { collect.hiddenAt = Date.now(); return; }
  if (collect.hiddenAt && Date.now() - collect.hiddenAt > COLLECT_MAX_MS) { stopCollect(); if (window.YCJ.vault.unlocked) lockNow({ quiet: true }); return; }
  window.YCJ.mobile.holdLock(COLLECT_MAX_MS);       // the next trip is covered too
  setTimeout(collectCheck, 350);                    // Android reads the clipboard only once focused
});
window.addEventListener("focus", () => { if (collect.on) setTimeout(collectCheck, 150); });

// ---- E3: the bulk review --------------------------------------------------------------
// renderPreview() builds the rows; these keep the summary, the flags and the
// duplicate marks true as the user edits, and wire the "for all" setters.
function previewRows() { return [...document.querySelectorAll("#preview-rows .preview-row")]; }
function rowValue(row, k) { const i = row.querySelector('input[data-k="' + k + '"]'); return i ? i.value.trim() : ""; }
/** Flags for one row: a missing store, a code too short to be one, a date
 *  already gone, and what the reader only guessed (data-guess). */
function paintRow(row) {
  const code = rowValue(row, "code");
  const dup = !!dupOf(code);
  row.classList.toggle("is-dup", dup);
  const guess = (row.dataset.guess || "").split(",").filter(Boolean);
  const exp = rowValue(row, "expiry");
  const dl = exp ? daysLeft({ expiry: exp }) : null;
  const check = {
    brand: !storeKnown(rowValue(row, "brand")) || guess.includes("brand"),
    code: codeKey(code).length < 6 || guess.includes("code"),
    pin: guess.includes("pin"),
    expiry: dl !== null && dl < 0,
  };
  row.querySelectorAll("input[data-k]").forEach((i) => i.classList.toggle("is-check", !dup && !!check[i.dataset.k]));
  const flagged = !dup && Object.values(check).some(Boolean);
  row.classList.toggle("is-flagged", flagged);
  let badge = row.querySelector(".prow-badge");
  if (!badge) { badge = document.createElement("span"); badge.className = "prow-badge"; row.appendChild(badge); }
  badge.textContent = dup ? "Already saved" : flagged ? (!storeKnown(rowValue(row, "brand")) ? "Pick a store" : check.expiry && !check.code ? "Date has passed" : "Check") : "";
  badge.classList.toggle("hidden", !dup && !flagged);
}
function wireRow(row) {
  row.querySelectorAll("input[data-k]").forEach((i) => i.addEventListener("input", () => {
    // An edited field is the user's now, not a guess.
    row.dataset.guess = (row.dataset.guess || "").split(",").filter((k) => k && k !== i.dataset.k).join(",");
    paintRow(row); paintPreviewCount();
  }));
  // A sideways swipe goes to the next / previous voucher (round 2); x removes
  // one. Only a clearly sideways drag counts, so editing a field is left alone.
  let x0 = 0, y0 = 0, dx = 0, on = false, dead = false;
  row.addEventListener("pointerdown", (e) => { if (e.target.closest(".prow-x")) return; x0 = e.clientX; y0 = e.clientY; dx = 0; on = true; dead = false; });
  row.addEventListener("pointermove", (e) => {
    if (!on || dead) return;
    dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) dead = true;
  });
  const end = () => {
    if (!on) return;
    on = false;
    if (!dead && Math.abs(dx) > 60) stepPager(dx < 0 ? 1 : -1);
  };
  row.addEventListener("pointerup", end);
  row.addEventListener("pointercancel", end);
}
// Round 3: a removed voucher is hidden, with Undo for 6 s, then gone.
let pvUndoTimer = null, pvUndoRow = null;
function removeRow(row) {
  if (pvUndoRow && pvUndoRow !== row) pvUndoRow.remove();
  row.classList.add("is-gone");
  pvUndoRow = row;
  clearTimeout(pvUndoTimer);
  const u = $("#pv-undo");
  const code = rowValue(row, "code");
  $("#pv-undo-text").textContent = "Removed " + (rowValue(row, "brand") || "voucher") + (code ? " · " + masked(code) : "");
  u.classList.remove("hidden");
  pvUndoTimer = setTimeout(() => { if (pvUndoRow) pvUndoRow.remove(); pvUndoRow = null; u.classList.add("hidden"); paintPreviewCount(); }, 6000);
  paintPreviewCount();
}
function undoRemove() {
  clearTimeout(pvUndoTimer);
  $("#pv-undo").classList.add("hidden");
  if (!pvUndoRow) return;
  const row = pvUndoRow; pvUndoRow = null;
  row.classList.remove("is-gone");
  pvIdx = previewRows().filter((r) => !r.classList.contains("is-gone")).indexOf(row);
  paintPreviewCount();
}
function wirePager() {
  $("#pv-prev").onclick = () => stepPager(-1);
  $("#pv-next").onclick = () => stepPager(1);
  $("#pv-dots").addEventListener("click", (e) => { const d = e.target.closest("[data-i]"); if (d) { pvIdx = +d.dataset.i; paintPager(); } });
  $("#lf-prev").onclick = () => { camView = Math.max(0, camView - 1); paintLive(); };
  $("#lf-next").onclick = () => { camView = Math.min(camVouchers().length - 1, camView + 1); paintLive(); };
}
function wireBulkTools() {
  storePicker($("#bulk-brand"), $("#bulk-brand-sug"));
  const setAll = (k, v) => {
    if (!v) return;
    previewRows().forEach((row) => {
      if (row.classList.contains("is-dup")) return;
      const i = row.querySelector('input[data-k="' + k + '"]');
      if (!i) return;
      if (k === "expiry" && i.type !== "date") { i.type = "date"; i.removeAttribute("placeholder"); }
      i.value = v;
      row.dataset.guess = (row.dataset.guess || "").split(",").filter((x) => x && x !== k).join(",");
      i.classList.remove("is-flash"); void i.offsetWidth; i.classList.add("is-flash");
      paintRow(row);
    });
    paintPreviewCount();
  };
  $("#bulk-brand").addEventListener("store-picked", () => setAll("brand", $("#bulk-brand").value.trim()));
  $("#bulk-brand").addEventListener("change", () => setAll("brand", listedStore($("#bulk-brand").value)));
  $("#bulk-expiry").addEventListener("change", () => setAll("expiry", $("#bulk-expiry").value));
}

function wireIntake() {
  // Scan card: the camera opens straight away once it has been allowed; the
  // very first time the Scan tab explains itself before Android asks.
  $("#in-scan").onclick = () => { intakeStatus(""); setMode("scan"); };
  $("#in-upload").onclick = () => { intakeStatus(""); setMode("upload"); };
  $("#in-paste").onclick = openPaste;
  $("#in-form").onclick = () => { intakeStatus(""); setMode("form"); };
  $("#in-collect").onclick = () => { intakeStatus(""); setMode("collect"); startCollect(); };
  $("#paste-clip").onclick = () => { intakeStatus(""); pasteFromClipboard(); };
  $("#in-pdf").onclick = pickPdf;
  $("#in-csv").onclick = pickCsv;
  $("#collect-stop").onclick = stopCollect;
  // The bar: back to the ways in (the camera stops; a list stays).
  $("#add-bar").onclick = () => { if (collect.on) stopCollect(); setMode(""); };
  $("#add-reset").onclick = startOver;
  // The steps can be tapped: 1 starts this way in over, 2 is the check, 3 the save.
  $("#add-steps").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-step]");
    if (!li) return;
    const k = +li.dataset.step, n = previewRows().filter((r) => !r.classList.contains("is-gone")).length;
    if (k === 1) startOver();
    else if (k === 2 && n) setMode("review");
    else if (k === 3 && n) confirmSave();
  });
  ["input", "change"].forEach((ev) => $("#add-panel").addEventListener(ev, () => { if (addMode) paintModeBar(); }));
  $("#al-resume").onclick = () => setMode("review");
  wireBulkTools();
  wirePager();
  wireLiveFields();
  $("#pv-undo-btn").onclick = undoRemove;
  // Tap any empty part of the sheet to put the keyboard away (A6).
  $("#add-sheet").addEventListener("pointerdown", (e) => {
    if (e.target.closest("input, textarea, select, button, label, a, .sp-suggest")) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur();
  });
}

// --------------------------------------------------------------------------- //
// Expiry alerts behind the bell (1.3.10, feedback #2)
// --------------------------------------------------------------------------- //
// The banner over the list is gone: with many cards it shouted "100 cards
// expire" every time the app opened. The bell lists each usable card that is
// expiring soon; a dismissed alert never comes back (it is remembered per
// card AND per expiry date, so an edited date is a new alert).
// Read like Mini Statement's saved tray: one plain line per alert, a short
// date column, dashed rules, "N / 10", remove marks only after Edit - and at
// most 10 alerts (the soonest), with a note when there are more.
const BELL_KEY = "gcv-bell-dismissed";
const BELL_MAX = 10;
function bellDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(BELL_KEY) || "[]")); } catch (e) { return new Set(); }
}
function bellSave(set) { try { localStorage.setItem(BELL_KEY, JSON.stringify([...set])); } catch (e) {} }
const bellKey = (c) => c.id + "|" + (c.expiry || "");
function bellAlerts(eff) {
  const gone = bellDismissed();
  return eff
    .filter(({ c, s }) => s === "expiring" && !gone.has(bellKey(c)))
    .sort((a, b) => (daysLeft(a.c) ?? 1e9) - (daysLeft(b.c) ?? 1e9));
}
function renderBell(eff) {
  const n = Math.min(bellAlerts(eff).length, BELL_MAX);
  const badge = $("#bell-badge");
  badge.textContent = String(n);
  badge.classList.toggle("hidden", n === 0);
  $("#bell-btn").setAttribute("aria-label", n ? n + " expiry alert" + (n === 1 ? "" : "s") : "Expiry alerts");
  if (!$("#bell-sheet").classList.contains("hidden")) paintBell(eff);
}
const SHORT_MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function paintBell(eff) {
  const all = bellAlerts(eff);
  const items = all.slice(0, BELL_MAX);
  $("#bell-count").textContent = items.length + " / " + BELL_MAX;
  $("#bell-edit").classList.toggle("hidden", !items.length);
  if (!items.length) { $("#bell-sheet").classList.remove("editing"); $("#bell-edit").textContent = "Edit"; }
  $("#bell-full").classList.toggle("hidden", all.length <= BELL_MAX);
  $("#bell-end").classList.toggle("hidden", !items.length);
  $("#bell-list").innerHTML = items.length ? items.map(({ c }) => {
    const d = parseExpiry(c.expiry), dl = daysLeft(c);
    const when = dl <= 0 ? "expires today" : dl === 1 ? "expires tomorrow" : "expires in " + dl + " days";
    return '<li class="bell-row" data-id="' + esc(c.id) + '"><div class="bell-open" role="button" tabindex="0" data-act="bell-open">'
      + '<span class="bd">' + (d ? d.getDate() + " " + SHORT_MON[d.getMonth()] : "") + '</span>'
      + '<span class="bt">' + esc(c.brand || "Gift card") + " " + rupee(paise(balanceOf(c)) / 100) + " " + when + '</span>'
      + '<button type="button" class="bell-x" data-act="bell-x" aria-label="Remove this alert">' + X_SMALL + '</button></div></li>';
  }).join("") : '<li class="bell-none">No alerts. A gift card shows up here when it is ' + SOON_DAYS + ' days or less from expiring.</li>';
}
const effNow = () => CARDS.map((c) => ({ c, s: effStatus(c) })).filter(({ c }) => !c.archived);
function openBell() { paintBell(effNow()); $("#bell-sheet").classList.remove("hidden"); }
function closeBell() {
  const b = $("#bell-sheet");
  if (!b) return;
  b.classList.add("hidden"); b.classList.remove("editing");
  if ($("#bell-edit")) $("#bell-edit").textContent = "Edit";
}
function wireBell() {
  $("#bell-btn").onclick = openBell;
  $("#bell-close").onclick = closeBell;
  $("#bell-edit").onclick = () => {
    const on = $("#bell-sheet").classList.toggle("editing");
    $("#bell-edit").textContent = on ? "Done" : "Edit";
  };
  $("#bell-sheet").onclick = (e) => {
    if (e.target.id === "bell-sheet") return closeBell();
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".bell-row").dataset.id;
    const c = CARDS.find((x) => x.id === id);
    if (!c) return;
    if (btn.dataset.act === "bell-x") {
      e.stopPropagation();
      const set = bellDismissed(); set.add(bellKey(c)); bellSave(set);
      render(); paintBell(effNow());
    } else if (!$("#bell-sheet").classList.contains("editing")) { closeBell(); openUse(id); }
  };
}

// --------------------------------------------------------------------------- //
// Sheets added for the phone (checkout, spend, paste)
// --------------------------------------------------------------------------- //
function wirePhoneSheets() {
  $("#use-close").onclick = closeUse;
  $("#use-sheet").onclick = (e) => { if (e.target.id === "use-sheet") closeUse(); };
  $("#use-copy-code").onclick = (e) => copyField(useId, "code", e.currentTarget);
  $("#use-copy-pin").onclick = (e) => copyField(useId, "pin", e.currentTarget);
  $("#use-redeem").onclick = () => { const id = useId; closeUse(); redeem(id); };
  $("#use-link").onclick = (e) => { e.preventDefault(); openExternal($("#use-link").getAttribute("href")); };

  $("#spend-close").onclick = () => $("#spend-sheet").classList.add("hidden");
  $("#spend-sheet").onclick = (e) => { if (e.target.id === "spend-sheet") $("#spend-sheet").classList.add("hidden"); };
  $("#spend-amount").oninput = paintSpendLeft;
  $("#spend-form").onsubmit = (e) => { e.preventDefault(); if (!$("#spend-save").disabled) saveSpend(false); };
  $("#spend-all").onclick = () => saveSpend(true);

  // One tap Paste lives in the intake row now (1.3.11, E6): wireIntake().
}

// --------------------------------------------------------------------------- //
// One gift card - Card Vault's tile, in the store's own colours
// --------------------------------------------------------------------------- //
// The same anatomy as Card Vault's bank tile, so the two apps read as one
// family: a tall header in the store's two-tone gradient with a generic
// illustration (never a logo), a glyph chip and the store name, the BALANCE as
// the title (it is what a gift card is for), a white code strip straddling the
// header and the body, label/value details, and a quiet row of chip actions.
/**
 * The header art: a gift RIBBON on every card - a vertical band and a band
 * across the bottom, crossing under the code strip like a wrapped present,
 * with a bow on the vertical band - over a faint pattern. Twelve variations
 * (ribbon position x bow style x pattern) chosen by the store's seed, so
 * stores that share a colour still look different, and every card reads as a
 * gift card at a glance. Generic shapes only; no store artwork.
 */
function storeIllustration(seed) {
  // A whole number 0..11. famStore() used a SIGNED shift on an unsigned hash, so
  // a third of store names got a negative seed and a ribbon at x = NaN (no
  // band, no bow) - fixed there (>>>), and never trusted here again.
  seed = Math.abs(Math.trunc(seed || 0)) % 12;
  const W = "rgba(255,255,255,", X = "var(--gc-x)";
  const vx = [214, 248, 186][seed % 3];                  // where the ribbon runs
  const pat = [
    `<g fill="${W}.07)"><circle cx="40" cy="20" r="3"/><circle cx="90" cy="48" r="3"/><circle cx="150" cy="16" r="3"/><circle cx="300" cy="60" r="3"/><circle cx="120" cy="80" r="3"/><circle cx="60" cy="70" r="3"/></g>`,
    `<g stroke="${W}.06)" stroke-width="10"><path d="M-20 120L120 -20"/><path d="M60 140L200 0"/><path d="M260 140L400 0"/></g>`,
    `<g fill="${W}.08)"><rect x="40" y="14" width="10" height="4" rx="2" transform="rotate(30 45 16)"/><rect x="120" y="60" width="10" height="4" rx="2" transform="rotate(-25 125 62)"/><rect x="170" y="20" width="9" height="4" rx="2" transform="rotate(60 174 22)"/><rect x="300" y="18" width="10" height="4" rx="2" transform="rotate(-40 305 20)"/><circle cx="80" cy="40" r="2.5"/><circle cx="290" cy="74" r="2.5"/></g>`,
    `<path d="M0 70q40-24 80 0t80 0t80 0t80 0v40H0z" fill="${W}.06)"/>`,
  ][Math.floor(seed / 3) % 4];
  // Bow: two loops and a knot, or loops with trailing tails.
  const bow = seed % 2 === 0
    ? `<g fill="none" stroke="${X}" stroke-width="5" opacity=".9"><ellipse cx="${vx - 12}" cy="40" rx="13" ry="8" transform="rotate(-24 ${vx - 12} 40)"/><ellipse cx="${vx + 12}" cy="40" rx="13" ry="8" transform="rotate(24 ${vx + 12} 40)"/></g><circle cx="${vx}" cy="42" r="5.5" fill="${X}"/>`
    : `<g fill="none" stroke="${X}" stroke-width="5" opacity=".9" stroke-linecap="round"><ellipse cx="${vx - 11}" cy="38" rx="12" ry="7.5" transform="rotate(-30 ${vx - 11} 38)"/><ellipse cx="${vx + 11}" cy="38" rx="12" ry="7.5" transform="rotate(30 ${vx + 11} 38)"/><path d="M${vx - 2} 44l-9 18M${vx + 2} 44l9 18"/></g><circle cx="${vx}" cy="41" r="5" fill="${X}"/>`;
  return `<svg class="illus" viewBox="0 0 320 110" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">${pat}`
    + `<rect x="${vx - 7}" y="-4" width="14" height="120" fill="${W}.16)"/><rect x="-4" y="84" width="330" height="12" fill="${W}.12)"/>`
    + `${bow}</svg>`;
}

const ICON_COPY16 = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>';

function renderCard(c, s) {
  const shown = REVEALED.has(c.id);
  const th = window.YCJ.brands.theme(c.brand);
  const face = num(c.amount), bal = num(balanceOf(c));
  const dl = daysLeft(c);
  const pillLabel = { active: "Active", expiring: "Expiring soon", expired: "Expired", redeemed: "Redeemed" }[s];

  // Title: the balance. Subtitle only when it says something new.
  const sub = !face || bal >= face ? "" : bal === 0 ? `Used up · was ${rupee(face)}` : `${rupee(bal)} left of ${rupee(face)}`;
  // The header only shouts about time when time is short; the date itself is
  // in the body (showing it in both was noise).
  const expiryTag = !c.expiry || dl === null || dl > SOON_DAYS ? "" :
    dl < 0 ? `Expired ${-dl}d ago` : dl === 0 ? "Expires today" : `${dl} day${dl === 1 ? "" : "s"} left`;

  return `
  <article class="card gtile ${esc(s)}${c.archived ? " is-archived" : ""}" data-id="${esc(c.id)}" style="${window.YCJ.brands.style(c.brand)}">
    <div class="card-main" data-act="open">
      <div class="gt-head">
        ${storeIllustration(th.seed)}
        <div class="gt-row">
          <span class="gt-store"><span class="glyph">${esc(th.g)}</span><span class="card-brand">${esc(c.brand) || "Gift card"}</span></span>
          <span class="gt-right">
            ${c.archived ? `<span class="gt-pill archived">Archived</span>`
              : s === "redeemed" ? `<span class="gt-pill redeemed">${pillLabel}</span>`
              : s !== "active" ? `<span class="gt-pill ${esc(s)}">${expiryTag || pillLabel}</span>` : ""}
            <button class="icon-btn gt-menu-btn" type="button" aria-label="More actions" data-act="menu">${ICON_MORE}</button>
          </span>
        </div>
        <h3 class="gt-title">${face || bal ? rupee(bal) : "Gift card"}</h3>
        ${sub ? `<div class="gt-sub card-balance">${sub}</div>` : ""}
      </div>

      <div class="gt-code">
        <span class="num${shown ? "" : " is-masked"}" data-act="copy" data-key="code" role="button" tabindex="0" title="Tap to copy code">${esc(shown ? groupCode(c.code) : masked(c.code))}</span>
        <button class="mini-copy copy" type="button" title="Copy code" data-act="copy" data-key="code">${ICON_COPY16}</button>
        <button class="mini-copy" type="button" title="Export card details" aria-label="Export card details" data-act="export">${ICON_EXPORT}</button>
      </div>

      <div class="gt-body">
        ${c.pin
          ? `<div class="detail"><div class="k">PIN</div><div class="v secret">${shown ? esc(c.pin) : "••••"}<button class="mini-copy" type="button" title="Copy PIN" data-act="copy" data-key="pin">${ICON_COPY16}</button></div></div>`
          : `<div class="detail"><div class="k">Face value</div><div class="v">${face ? rupee(face) : "—"}</div></div>`}
        <div class="detail">
          <div class="k">Expiry</div>
          <div class="v">${c.expiry ? esc(fmtExpiry(c.expiry)) : c.no_expiry === "1" ? "No expiry" : "—"}</div>
        </div>
        ${c.purchased ? `<div class="detail"><div class="k">Bought</div><div class="v small">${esc(fmtExpiry(c.purchased))}</div></div>` : ""}
        ${c.order_number ? `<div class="detail wide"><div class="k">Order</div><div class="v small">${esc(c.order_number)}</div></div>` : ""}
      </div>
      ${c.notes ? `<p class="gt-notes">${esc(c.notes)}</p>` : ""}
    </div>

    <div class="gt-foot">
      <button class="chip-btn reveal" type="button" aria-pressed="${shown}" data-act="reveal">${shown ? EYE_OFF : EYE}<span>${shown ? "Hide" : "Show"}</span>${shown ? `<span class="rv-left">${revealLeft(c.id)}s</span>` : ""}</button>
      <span class="spacer"></span>
      ${s !== "redeemed" && !c.archived ? `<button class="chip-btn btn-redeem" type="button" data-act="spend">${svgIcon("redeem")}<span>Spend</span></button>` : ""}
      ${c.redeem_url && !c.archived ? `<a class="chip-btn ext-link" href="${esc(c.redeem_url)}" data-act="link" rel="noopener">${svgIcon("external")}<span>Redeem</span></a>` : ""}
      <button class="chip-btn btn-archive" type="button" aria-label="${c.archived ? "Unarchive" : "Archive"}" data-act="archive">${svgIcon(c.archived ? "unarchive" : "archive")}<span>${c.archived ? "Unarchive" : "Archive"}</span></button>
      <button class="chip-btn btn-del" type="button" aria-label="Delete" data-act="delete">${svgIcon("trash")}<span>Delete</span></button>
    </div>
  </article>`;
}

// --------------------------------------------------------------------------- //
// Fit to the screen (1.3.9 - Card Vault 1.3.6's)
// --------------------------------------------------------------------------- //
// Android hands the system font size and "Screen zoom" to the WebView, so a
// 393px phone can lay out like a 320px one and a width breakpoint never
// notices. So MEASURE: if any of these is cut short, step down to the compact
// layout (html.fit-narrow), and if that is still not enough, to the tightest
// (html.fit-tiny). The matching rules are at the end of mobile.css.
const FIT_PROBES = ".tabs .tab, .mfilter-pill .mfp-text, .gt-foot, .kpi-label";
let fitQueued = false;
function queueFit() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => { fitQueued = false; fitToScreen(); });
}
function labelsCut() {
  return [...document.querySelectorAll(FIT_PROBES)]
    .some((el) => el.offsetParent && el.scrollWidth > el.clientWidth + 1);
}
function fitToScreen() {
  const root = document.documentElement;
  root.classList.remove("fit-narrow", "fit-tiny");
  if (!labelsCut()) return;
  root.classList.add("fit-narrow");
  if (labelsCut()) root.classList.add("fit-tiny");
}
window.addEventListener("resize", queueFit);

/** The one floating menu (a card's ⋯, a store's ⋯, the vault-card view). */
function ensureMenu() {
  let m = $("#gt-menu");
  if (!m) {
    m = document.createElement("div"); m.id = "gt-menu"; m.className = "gt-menu"; m.setAttribute("role", "menu");
    document.body.appendChild(m);
    document.addEventListener("click", (ev) => { if (!ev.target.closest("#gt-menu")) m.classList.add("hidden"); });
  }
  return m;
}
/** The status menu (Card Vault keeps the rarer actions behind ⋯ too). */
function cardMenu(e, id, anchor) {
  e.stopPropagation();
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  const m = ensureMenu();
  const opt = (v, label) => `<button type="button" role="menuitemradio" aria-checked="${(c.status || "active") === v}" data-v="${v}">${label}</button>`;
  m.innerHTML = '<button type="button" class="gt-menu-act" data-act="edit">' + svgIcon("edit") + '<span>Edit card</span></button>'
    + '<div class="gt-menu-h">Mark as</div>' + opt("active", "Active") + opt("redeemed", "Redeemed") + opt("expired", "Expired")
    + '<div class="gt-menu-sep"></div>'
    + '<button type="button" class="gt-menu-act" data-act="archive">' + svgIcon(c.archived ? "unarchive" : "archive")
    + '<span>' + (c.archived ? "Unarchive" : "Archive") + '</span></button>';
  m.querySelectorAll("[data-v]").forEach((bt) => bt.onclick = () => { m.classList.add("hidden"); setStatus(id, bt.dataset.v); });
  m.querySelector('[data-act="edit"]').onclick = () => { m.classList.add("hidden"); openEdit(id); };
  m.querySelector('[data-act="archive"]').onclick = () => { m.classList.add("hidden"); toggleArchive(id); };
  const r = (anchor || e.currentTarget).getBoundingClientRect();
  m.classList.remove("hidden");
  m.style.top = Math.round(r.bottom + window.scrollY + 4) + "px";
  m.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth))) + "px";
}

const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3.3 2 2 3.3l3.1 3.1C3.5 7.7 2.5 9.4 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3l3.9 3.9 1.3-1.3L3.3 2ZM12 16.5a4.5 4.5 0 0 1-4.1-6.3l1.7 1.7a2.2 2.2 0 0 0 2.5 2.5l1.7 1.7c-.6.3-1.2.4-1.8.4ZM12 5c5 0 9 4.5 10 7-.5 1.3-1.6 3-3.2 4.4l-3-3A4.5 4.5 0 0 0 10.6 7.6L8.3 5.3C9.5 5.1 10.7 5 12 5Z"/></svg>';

/** A tap on the card body opens the checkout view - but not when the tap was
 *  on one of the card's own buttons or links. */
function cardTap(e, id) {
  if (e.target.closest("button, a, select, input, [data-act=copy]")) return;
  openUse(id);
}

// --------------------------------------------------------------------------- //
// One click handler for every tile (1.3.10)
// --------------------------------------------------------------------------- //
// The tiles used to carry onclick="..." attributes. The Content-Security-
// Policy now forbids inline script, so every button says what it is
// (data-act) and this one listener does the work.
function wireTileClicks() {
  $("#cards").addEventListener("click", (e) => {
    const brand = e.target.closest(".brand-tile");
    if (brand && e.target.closest('[data-act="brand-export"]')) { e.stopPropagation(); return brandExport(brand.dataset.store); }
    if (brand && e.target.closest('[data-act="brand-delete"]')) { e.stopPropagation(); return confirmDeleteStores([brand.dataset.store], false); }
    if (brand) return openBrand(brand.dataset.store);
    const tile = e.target.closest(".gtile");
    if (!tile) return;
    const id = tile.dataset.id;
    const el = e.target.closest("[data-act]");
    const act = el ? el.dataset.act : "";
    if (act === "open") return cardTap(e, id);
    e.stopPropagation();
    if (act === "menu") return cardMenu(e, id, el);
    if (act === "copy") return copyField(id, el.dataset.key, el);
    if (act === "export") return openExport(id);
    if (act === "reveal") return toggleReveal(id);
    if (act === "spend") return redeem(id);
    if (act === "archive") return toggleArchive(id);
    if (act === "delete") return deleteCard(id);
    if (act === "link") { e.preventDefault(); return openExternal(el.getAttribute("href")); }
  });
}

/** A store's redeem page is the one link the app opens on purpose - always
 *  by this code, with the card's own saved address, never by page script.
 *  On a phone the native guard opens it in the browser (the app itself has
 *  no internet); http(s) only. */
function openExternal(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) return;
  const g = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.YcjGuard;
  if (g && g.openUrl) { window.YCJ.mobile.holdLock(120000); g.openUrl({ url }).catch(() => {}); }
  else window.open(url, "_blank", "noopener");
}

// --------------------------------------------------------------------------- //
// Export one gift card as text (1.3.10, Card Vault's per-card export)
// --------------------------------------------------------------------------- //
const ICON_EXPORT = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3 7.5 7.5l1.4 1.4L11 6.8V15h2V6.8l2.1 2.1 1.4-1.4L12 3ZM5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6h-2v6H7v-6H5Z"/></svg>';
function giftAsText(c) {
  // The PIN is always included when the card has one: a gift card is often
  // passed on whole (user decision, 22-Oct-2026).
  return [
    ["Store", c.brand || "Gift card"],
    ["Code", groupCode(c.code)],
    ["PIN", c.pin],
    ["Value", (c.amount || balanceOf(c)) ? rupee(paise(balanceOf(c)) / 100) : ""],
    ["Expiry", c.expiry ? fmtExpiry(c.expiry) : ""],
  ].filter(([, v]) => v).map(([k, v]) => k + ": " + v).join("\n");
}
function openExport(id) {
  const c = CARDS.find((x) => x.id === id);
  if (!c) return;
  const text = giftAsText(c);
  const secs = Math.round(window.YCJ.mobile.CLIP_TTL_MS / 1000);
  $("#modal-box").innerHTML = `
    <div class="lic-head"><h2>Export gift card</h2></div>
    <div class="lic-body">
      <pre class="export-text" id="ex-text">${esc(text)}</pre>
      <p class="fineprint">Includes the full code${c.pin ? " and PIN" : ""}. A copy clears from the clipboard after ${secs}s; anything you share stays wherever you send it.</p>
      <div class="modal-foot">
        <button type="button" class="ghost" id="ex-close">Close</button>
        <button type="button" class="ghost" id="ex-share">Share</button>
        <button type="button" class="primary" id="ex-copy">Copy</button>
      </div>
    </div>`;
  $("#modal").classList.remove("hidden");
  $("#ex-close").onclick = closeModal;
  $("#ex-copy").onclick = async (e) => {
    const ok = await window.YCJ.mobile.copySensitive(text);
    if (ok) markCopied(e.currentTarget, "export", secs); else toast("Could not copy");
    setTimeout(closeModal, 900);
  };
  $("#ex-share").onclick = async () => { closeModal(); await window.YCJ.mobile.shareText(text, (c.brand || "Gift card") + " gift card"); };
}

// --------------------------------------------------------------------------- //
// Combine by brand (1.3.10)
// --------------------------------------------------------------------------- //
// One tile per store with its total - no codes, no PINs. Pure function of the
// list the filters have already produced, so Status, Stores, Search and Sort
// all apply first. Rules (agreed 22-Oct-2026, tests in test-giftcard-1310.py):
//   amount per card  = remaining balance if entered, else the face value;
//   status "all"     = only usable cards (Active + Expiring soon) count;
//   a status picked  = exactly that status (the box already narrowed `list`);
//   archived         = never (the caller never passes them);
//   a store with nothing left = no tile.
function combineByBrand(list, status) {
  const by = new Map();
  list.forEach(({ c, s }) => {
    if (c.archived) return;
    if (status === "all" && !isHeld(s)) return;
    const k = storeOf(c);
    const g = by.get(k) || { store: k, brand: c.brand, count: 0, paise: 0, soonest: null, newest: 0 };
    g.count++;
    g.paise += paise(balanceOf(c));
    const dl = daysLeft(c);
    if (dl !== null && (g.soonest === null || dl < g.soonest)) g.soonest = dl;
    g.newest = Math.max(g.newest, c.created_at || 0);
    by.set(k, g);
  });
  const out = [...by.values()];
  const byName = (a, b) => a.store.localeCompare(b.store);
  out.sort((a, b) => {
    if (sortBy === "amount") return b.paise - a.paise || byName(a, b);
    if (sortBy === "brand") return byName(a, b);
    if (sortBy === "expiry") {
      if (a.soonest === null && b.soonest === null) return byName(a, b);
      if (a.soonest === null) return 1; if (b.soonest === null) return -1;
      return a.soonest - b.soonest || byName(a, b);
    }
    return b.newest - a.newest || byName(a, b);     // recent
  });
  return out;
}
window.combineByBrand = combineByBrand;   // for the tests

function renderBrandTile(g) {
  // 1.3.10 feedback round 3: a short ribbon band, one per row - the store's
  // colours and ribbon on the left, the total and card count on a soft wash of
  // the brand colour on the right. Value and count only, no expiry.
  const th = window.YCJ.brands.theme(g.store);
  const n = g.count, cards = `${n} card${n === 1 ? "" : "s"}`;
  const stack = Array.from({ length: Math.min(n, 5) }, () => "<i></i>").join("");
  return `
  <article class="card gtile brand-tile" data-store="${esc(g.store)}" style="${window.YCJ.brands.style(g.store)}" role="button" tabindex="0" aria-label="${esc(g.store)}: ${rupee(g.paise / 100)} in ${cards}">
    <div class="bt-left">
      <svg class="illus" viewBox="0 0 160 72" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
        <rect x="-4" y="44" width="170" height="10" fill="rgba(255,255,255,.18)"/><rect x="123" y="-4" width="10" height="80" fill="rgba(255,255,255,.16)"/>
        <g fill="none" stroke="var(--gc-x)" stroke-width="4.5" opacity=".95"><ellipse cx="117" cy="47" rx="11" ry="6.5" transform="rotate(-24 117 47)"/><ellipse cx="139" cy="47" rx="11" ry="6.5" transform="rotate(24 139 47)"/></g><circle cx="128" cy="49" r="5" fill="var(--gc-x)"/>
      </svg>
      <span class="gt-store"><span class="glyph">${esc(th.g)}</span><span class="card-brand">${esc(g.store)}</span></span>
    </div>
    <div class="bt-right">
      <h3 class="gt-title">${rupee(g.paise / 100)}</h3>
      <span class="bt-meta"><span class="bt-stack" aria-hidden="true">${stack}</span><span class="bt-count" aria-label="${cards}">${n}</span>
        <span class="bt-acts">
          <button class="bt-export" type="button" data-act="brand-export" aria-label="Export all ${esc(g.store)} cards">${ICON_EXPORT}</button>
          <button class="bt-del" type="button" data-act="brand-delete" aria-label="Delete all ${esc(g.store)} cards">${svgIcon("trash")}</button>
        </span></span>
    </div>
  </article>`;
}
/** A combined tile opens that store's own cards: toggle off, store picked. */
function openBrand(store) {
  combine = false;
  try { localStorage.setItem("gcv-combine", "0"); } catch (e) {}
  setStore(store);
}
function wireCombine() {
  $("#combine-toggle").addEventListener("change", (e) => {
    combine = e.target.checked;
    try { localStorage.setItem("gcv-combine", combine ? "1" : "0"); } catch (err) {}
    render();
  });
}

// --------------------------------------------------------------------------- //
// Archived: a header button, as in Card Vault (1.3.10, feedback #2)
// --------------------------------------------------------------------------- //
function wireArchiveButton() {
  $("#archive-btn").onclick = () => setFilter(filterStatus === "archived" ? "all" : "archived");
}

// The gift box in the corner opens its lid when the app comes up and when it
// is tapped (feedback #2: it never moved on a phone - it only animated on
// hover, and a phone has no hover).
function wireGiftMark() {
  const m = document.querySelector(".brand .gk-mark");
  if (!m) return;
  const play = () => { m.classList.remove("is-playing"); void m.offsetWidth; m.classList.add("is-playing"); };
  m.parentElement.addEventListener("click", () => { play(); goHome(); });
  m.addEventListener("animationend", () => m.classList.remove("is-playing"));
  play.now = play;
  window.__gcvPlayMark = play;
}

// (1.3.10: no inline handlers are left; these stay for the desktop build and
// for the tests that drive the app.)
window.setStatus = setStatus;
window.redeem = redeem;
window.deleteCard = deleteCard;
window.copy = copy;
window.copyField = copyField;
window.toggleReveal = toggleReveal;
window.cardTap = cardTap;
window.cardMenu = cardMenu;
window.toggleArchive = toggleArchive;
window.openEdit = openEdit;

// Vault sheet dismissal (wired once). The sheet reuses #lic-modal, which is
// where the desktop's licence panel lived.
$("#lic-close").onclick = () => $("#lic-modal").classList.add("hidden");
$("#lic-modal").onclick = (e) => {
  if (e.target.id === "lic-modal") $("#lic-modal").classList.add("hidden");
};

paintIcons();
initLockScreen();

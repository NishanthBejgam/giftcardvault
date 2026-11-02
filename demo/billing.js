/*
 * billing.js - Gift Card Vault's 30-day free trial, ₹150 yearly plan and
 * (1.3.11) ₹300 Lifetime.
 *
 * Pricing (05-Oct-2026 and 02-Nov-2026, the user's rules):
 *
 *   * 30 DAYS FREE, run by the app itself. No card, no Google sign-up, and
 *     nothing is ever charged automatically - the clock starts the first time
 *     the app opens.
 *   * Then ₹150 a year, starting only when the user taps it and confirms on
 *     Google's sheet - the trial never turns into a charge by itself. From
 *     then on it is an ordinary AUTO-RENEWING yearly plan, like InShot Pro:
 *     Google renews it each year (reminder email first) and the user cancels
 *     in Play Store -> Payments & subscriptions. If they cancel or a renewal
 *     payment fails for good, the app locks again at the end of the year.
 *   * Or ₹300 once, for good (1.3.11): a one-time Play product. It never
 *     renews and never expires; only a refund takes it away.
 *   * Both can be bought during the trial too (Settings > Your plan > Upgrade)
 *     - since 1.3.11 the encrypted export is a paid-plan feature.
 *
 * Play Console (Monetize -> Products):
 *
 *   subscription   giftcardvault_yearly
 *   base plan      yearly             AUTO-RENEWING, 1 year, ₹150 (no offers -
 *                                     the trial is the app's, not Google's)
 *   in-app product giftcardvault_lifetime   one-time, ₹300 (1.3.11)
 *
 * Prices on the plan screen come from the store (getProducts), never typed in
 * here; when the store can't be asked, the screen shows no price at all.
 *
 * NO INTERNET. The app still has no INTERNET permission. A purchase is handed
 * to the Play Store app over IPC and the Play Store does the network side; the
 * permission billing drags in exists only for Google's own logging, and
 * harden-android.js strips it. getPurchases() answers from the Play Store's
 * cache, so the check works offline too.
 *
 * The trial and reinstalls (1.3.11). Clearing the app's data or reinstalling
 * restarts the 30 days - Google can't track a card-less trial - and also
 * deletes the vault. The loophole that left - export, reinstall, import the
 * file, another free month - is closed twice: export needs a paid plan, and
 * every saved card carries the date this phone's trial began (field `tr`, see
 * api.js), so importing a file brings the EARLIER date back with it
 * (adoptTrialStart).
 *
 * Where the plugin is absent (the browser dev server, the test harness) the
 * app is treated as paid with no plan pill, so nothing else has to know about
 * billing; a test can pretend otherwise through YCJ.billing._fake.
 */
(function (root) {
  "use strict";

  const PRODUCT = "giftcardvault_yearly";
  const PLAN = "yearly";
  const LIFETIME = "giftcardvault_lifetime";
  const TRIAL_DAYS = 30;
  const DAY = 864e5;

  const TRIAL_KEY = "gcv-trial-start";  // ms timestamp of the first open
  // If Play can't be asked at all (Play Store disabled, a broken update), keep
  // the vault usable for a week after the last confirmed subscription rather
  // than lock someone out of their codes at a shop counter.
  const OK_KEY = "gcv-sub-ok";          // ms timestamp of the last confirmation
  const GRACE_MS = 7 * DAY;
  // Lifetime confirmed on this phone (1.3.11). It never runs out: while Play
  // can't be asked it stays open for good, and only a confirmed answer
  // WITHOUT it (a refund) clears this.
  const LIFE_KEY = "gcv-life-ok";
  // Latest time this phone has ever reported. Winding the clock back cannot
  // shorten the elapsed trial or stretch the offline grace past this.
  const SEEN_KEY = "gcv-sub-seen";
  // The first day the app ran - before 1.3.11 nothing older can be real.
  const EPOCH = Date.UTC(2026, 8, 1);

  const P = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativePurchases;
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const num = (k) => parseInt(get(k) || "0", 10) || 0;

  /** The phone's time, but never earlier than any time it has shown before. */
  function honestNow() {
    const now = Date.now(), seen = num(SEEN_KEY);
    if (now > seen) { set(SEEN_KEY, String(now)); return { now, wound: false }; }
    return { now: seen, wound: now < seen - 60 * 60e3 };   // > 1h back = wound
  }

  /** When this phone's trial began (set on the very first open). */
  function trialStart() {
    let start = num(TRIAL_KEY);
    if (!start) { start = honestNow().now; set(TRIAL_KEY, String(start)); }
    return start;
  }

  /** An imported vault knows when ITS trial began; the earlier date wins, so
   *  a reinstall plus an old export is not a fresh month. Returns true when
   *  the date moved. */
  function adoptTrialStart(ts) {
    ts = Number(ts) || 0;
    if (ts < EPOCH || ts > honestNow().now) return false;     // nonsense in a file
    if (ts >= trialStart()) return false;
    set(TRIAL_KEY, String(ts));
    return true;
  }

  function trial(now) {
    const endsAt = trialStart() + TRIAL_DAYS * DAY;
    return now < endsAt ? { active: true, plan: "trial", trialEndsAt: endsAt } : null;
  }

  // A completed purchase. iOS has no purchaseState: a transaction it still
  // lists is a valid one (an expired subscription says isActive false).
  const paid = (p) => p.purchaseState === undefined || p.purchaseState === null
    ? p.isActive !== false
    : String(p.purchaseState) === "1";

  // Google refunds a purchase the app has not ACKNOWLEDGED within 3 days. The
  // plugin acknowledges only purchases completed inside purchaseProduct(); a
  // UPI payment that was pending and completed later, or a purchase whose app
  // was killed mid-flow, arrives here unacknowledged - so acknowledge it here,
  // on every check, or the money goes back and the user keeps the access.
  async function acknowledgeAll(NP, purchases) {
    for (const p of purchases) {
      if (String(p.purchaseState) === "1" && p.isAcknowledged === false && p.purchaseToken && NP.acknowledgePurchase) {
        try { await NP.acknowledgePurchase({ purchaseToken: p.purchaseToken }); } catch (e) { /* retried next check */ }
      }
    }
  }

  /** -> { active, plan: "trial"|"yearly"|"lifetime"|null, trialEndsAt,
   *       alsoYearly, pending, offline, dev } */
  async function status() {
    const NP = P();
    if (!NP) {
      const f = root.billing && root.billing._fake;
      if (f) return Object.assign({ active: true }, f);
      return { active: true, plan: null, dev: true };
    }
    const { now, wound } = honestNow();
    const free = trial(now);
    try {
      // Play answers with ACTIVE purchases only: paid, in a payment-retry
      // grace period, or cancelled-but-not-yet-expired, plus the one-time
      // Lifetime. Expired, on hold, paused or refunded ones are simply absent
      // - absent means not paid. No productType: both kinds in one answer.
      const { purchases } = await NP.getPurchases({});
      const mine = (purchases || []).filter((p) => p.productIdentifier === PRODUCT || p.productIdentifier === LIFETIME);
      await acknowledgeAll(NP, mine);
      const life = mine.some((p) => p.productIdentifier === LIFETIME && paid(p));
      const year = mine.some((p) => p.productIdentifier === PRODUCT && paid(p));
      set(LIFE_KEY, life ? String(now) : "0");
      if (life) return { active: true, plan: "lifetime", alsoYearly: year };
      if (year) { set(OK_KEY, String(now)); return { active: true, plan: "yearly" }; }
      set(OK_KEY, "0");                    // a confirmed "no" ends any grace
      if (free) return free;
      return { active: false, plan: null, trialOver: true, pending: mine.some((p) => String(p.purchaseState) === "2" || String(p.purchaseState) === "0") };
    } catch (e) {
      // The plugin REJECTS when Play can't answer (it never fakes an empty
      // list), so this is "unknown", not "unsubscribed".
      if (num(LIFE_KEY)) return { active: true, plan: "lifetime", offline: true };
      if (free) return free;
      const last = num(OK_KEY);
      if (!wound && last && now - last < GRACE_MS) return { active: true, plan: "yearly", offline: true };
      return { active: false, plan: null, trialOver: true, error: String((e && e.message) || e) };
    }
  }

  /** A quick answer from this phone's own records, with no call to Play:
   *  is the vault almost certainly open? (trial still running, Lifetime
   *  remembered, or a yearly plan Play confirmed within its year). The lock
   *  screen shows the password / fingerprint at once on this, and status()
   *  - which asks Play and can take a second or two - confirms behind it. */
  function likelyActive() {
    if (!P()) return true;
    const now = Date.now();
    if (num(LIFE_KEY)) return true;
    const start = num(TRIAL_KEY);
    if (start && now < start + TRIAL_DAYS * DAY) return true;
    const ok = num(OK_KEY);
    return !!(ok && now - ok < 370 * DAY);
  }

  /** Paid plan (yearly or lifetime) - what the export needs. The plugin-less
   *  dev build counts as paid. */
  const isPaid = (st) => !!(st && st.active && (st.dev || st.plan === "yearly" || st.plan === "lifetime"));

  /** The two prices as the store shows them, or "" each when it can't say. */
  async function prices() {
    const NP = P();
    const out = { yearly: "", lifetime: "" };
    if (!NP) return out;
    try {
      const { products } = await NP.getProducts({ productIdentifiers: [PRODUCT], productType: "subs" });
      const base = (products || []).find((p) => p.identifier === PLAN && !p.offerId) || (products || [])[0];
      if (base && base.priceString) out.yearly = base.priceString;
    } catch (e) { /* no price shown */ }
    try {
      const { products } = await NP.getProducts({ productIdentifiers: [LIFETIME], productType: "inapp" });
      const p = (products || [])[0];
      if (p && p.priceString) out.lifetime = p.priceString;
    } catch (e) { /* no price shown */ }
    return out;
  }

  /** Opens Google's purchase sheet for the yearly plan. Resolves to status(). */
  async function subscribe() {
    const NP = P();
    if (!NP) return status();
    // Only the base plan should exist, but pass its token explicitly so an
    // offer added in the Console later (e.g. a Google free trial, which would
    // charge automatically when it ends) can never be picked instead.
    let base = null;
    try {
      const { products } = await NP.getProducts({ productIdentifiers: [PRODUCT], productType: "subs" });
      base = (products || []).find((p) => p.identifier === PLAN && !p.offerId) || null;
    } catch (e) { /* purchaseProduct reports the real error */ }
    try {
      await NP.purchaseProduct({
        productIdentifier: PRODUCT,
        planIdentifier: PLAN,
        productType: "subs",
        offerToken: base && base.offerToken,
      });
    } catch (e) {
      // A UPI/bank payment still being approved is not a failure: Play holds
      // it as PENDING and status() unlocks (and acknowledges) once it clears.
      if (/pending/i.test(errText(e))) return Object.assign(await status(), { pending: true });
      throw e;
    }
    return status();
  }

  /** Opens Google's purchase sheet for Lifetime (one-time). Resolves to status(). */
  async function buyLifetime() {
    const NP = P();
    if (!NP) return status();
    try {
      await NP.purchaseProduct({ productIdentifier: LIFETIME, productType: "inapp" });
    } catch (e) {
      if (/pending/i.test(errText(e))) return Object.assign(await status(), { pending: true });
      throw e;
    }
    return status();
  }

  /** The store's own subscriptions page - where a yearly plan is cancelled
   *  (the app cannot cancel it; 1.3.11 C4). */
  async function manage() {
    const NP = P();
    if (!NP || !NP.manageSubscriptions) return false;
    try {
      if (root.mobile && root.mobile.holdLock) root.mobile.holdLock(180000);
      await NP.manageSubscriptions();
      return true;
    } catch (e) { return false; }
  }

  const errText = (e) => String((e && e.code) || "") + " " + String((e && e.message) || e);
  // The plugin rejects a backed-out sheet as "Purchase is not purchased" with
  // code USER_CANCELED - the message alone never says "cancel".
  const isCancel = (e) => /USER_CANCELED|cancel/i.test(errText(e));

  async function restore() {
    const NP = P();
    if (NP && NP.restorePurchases) { try { await NP.restorePurchases(); } catch (e) {} }
    return status();
  }

  root.billing = { status, likelyActive, subscribe, buyLifetime, restore, manage, prices, isCancel, isPaid,
    trialStart, adoptTrialStart, PRODUCT, PLAN, LIFETIME, TRIAL_DAYS, _fake: null };
})(window.YCJ = window.YCJ || {});

/*
 * demo-giftcard-data.js - DEV ONLY (never shipped: sync.js copies web/ and
 * shared/core/, not tools/). The one source of Gift Card Vault's demo data:
 * tools/demo-giftcard.html loads it to fill a browser vault, and
 * tools/make-store-assets-giftcard.py loads it so the store screenshots show
 * exactly the same cards. Deterministic: every call builds the same set.
 *
 *     window.GCV_DEMO.build() -> { rows, meta }   rows = cards to add,
 *                                                 meta[i] = { kind, created }
 */
(function () {
  // Deterministic, so every run makes the same vault and the numbers below
  // can be checked against the app.
  let seed = 20261022;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const code = (p, n) => p + Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rnd() * 32)]).join("");

  // [store, how many cards, typical face values, code prefix, has PIN]
  const STORES = [
    ["Amazon", 14, [500, 1000, 2000, 5000, 10000], "AQ", false], ["Flipkart", 10, [500, 1000, 2500, 5000], "FK", true],
    ["Myntra", 9, [250, 500, 1000, 2000], "MYN", true], ["Ajio", 6, [500, 1000, 2000], "AJ", true],
    ["Tanishq", 5, [10000, 25000, 50000], "TQ", true], ["Croma", 6, [1000, 5000, 10000], "CR", true],
    ["Reliance Digital", 4, [2000, 5000, 10000], "RD", true], ["Nykaa", 6, [500, 1000, 1500], "NY", true],
    ["Zomato", 5, [250, 500, 1000], "ZO", false], ["Swiggy", 5, [250, 500, 1000], "SW", false],
    ["BigBasket", 4, [500, 1000, 2000], "BB", true], ["Blinkit", 3, [250, 500], "BL", false],
    ["Lifestyle", 4, [1000, 2000, 3000], "LS", true], ["Westside", 3, [1000, 2000], "WS", true],
    ["Pantaloons", 3, [500, 1000, 2000], "PT", true], ["Shoppers Stop", 4, [1000, 2000, 5000], "SS", true],
    ["Decathlon", 3, [1000, 2000, 3000], "DC", true], ["IKEA", 3, [2000, 5000, 10000], "IK", true],
    ["MakeMyTrip", 4, [2000, 5000, 10000, 20000], "MMT", true], ["Yatra", 2, [2000, 5000], "YT", true],
    ["Uber", 3, [250, 500, 1000], "UB", false], ["PVR", 4, [500, 1000], "PV", true],
    ["BookMyShow", 4, [250, 500, 1000], "BMS", true], ["Starbucks", 3, [500, 1000], "SB", true],
    ["Domino's", 3, [250, 500], "DM", true], ["Pizza Hut", 2, [250, 500], "PH", true],
    ["Titan", 3, [2000, 5000, 10000], "TI", true], ["Lenskart", 3, [1000, 2000], "LK", true],
    ["FirstCry", 3, [500, 1000], "FC", true], ["Bata", 2, [1000, 2000], "BA", true],
    ["Pepperfry", 2, [2000, 5000], "PF", true], ["Urban Company", 3, [500, 1000, 2000], "UC", true],
    ["Apple", 2, [5000, 10000], "AP", false], ["Google Play", 4, [100, 500, 1000], "GP", false],
    ["Amazon Pay", 6, [500, 1000, 2000, 5000], "APY", false], ["Amazon Fresh", 3, [500, 1000], "AFR", false],
    ["Cleartrip", 2, [2000, 5000], "CT", true], ["Taj Hotels", 2, [10000, 25000], "TJ", true],
    ["Marks & Spencer", 2, [2000, 5000], "MS", true], ["Joyalukkas", 2, [10000, 20000], "JL", true],
    ["Spencer's", 2, [500, 1000], "SP", true], ["Hamleys", 2, [1000, 2000], "HM", true],
  ];
  // Spelling as people type it - these must still land on one store.
  const VARIANT = { Amazon: ["amazon", "AMAZON", "Amazon.in"], Myntra: ["myntra", "MYNTRA"], Flipkart: ["flipkart"] };

  function build() {
    seed = 20261022;               // same data on every call
    const rows = [], meta = [];
    STORES.forEach(([store, n, faces, pre, pin], si) => {
      for (let i = 0; i < n; i++) {
        let face = pick(faces);
        if (rnd() < 0.08) face = Math.round((face - 0.01 - Math.floor(rnd() * 50) / 100) * 100) / 100;   // a few with paise
        const r = rnd();
        // the mix: 55% active, 15% expiring soon, 12% expired, 10% redeemed, 8% archived
        const kind = r < 0.55 ? "active" : r < 0.70 ? "expiring" : r < 0.82 ? "expired" : r < 0.92 ? "redeemed" : "archived";
        const expiry = kind === "expiring" ? day(1 + Math.floor(rnd() * 29))
          : kind === "expired" ? day(-(5 + Math.floor(rnd() * 200)))
          : rnd() < 0.1 ? "" : day(40 + Math.floor(rnd() * 600));
        let balance = String(face);
        if (kind !== "redeemed" && rnd() < 0.25) balance = String(Math.round(face * (0.2 + rnd() * 0.6)));
        const brand = VARIANT[store] && rnd() < 0.35 ? pick(VARIANT[store]) : store;
        rows.push({
          brand, amount: String(face), balance, code: code(pre, 12), pin: pin ? String(1000 + Math.floor(rnd() * 9000)) : "",
          expiry, status: kind === "redeemed" ? "redeemed" : "active",
          order_number: rnd() < 0.4 ? "40" + Math.floor(rnd() * 1e8) : "",
          notes: rnd() < 0.12 ? pick(["Diwali gift from office", "Cashback voucher", "Bought on GiftDeals 7% off", "Birthday gift"]) : "",
        });
        meta.push({ kind, created: Math.floor(Date.now() / 1000) - Math.floor(rnd() * 200 * 86400) - si * 60 - i });
      }
    });
    return { rows, meta };
  }

  window.GCV_DEMO = { build, STORES, PASSWORD: "Demo-Vault-2026!" };
})();

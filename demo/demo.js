/* Gift Card Vault - live demo bootstrap (glance page only, never in the app).
 * Fresh demo vault on every open, then the real app on top of it. */
(function () {
  "use strict";
  var PW = "Demo-Vault-2026!";
  var Y = window.YCJ;
  Y.billing._fake = { plan: "lifetime" };          // every paid screen opens

  var veil = document.createElement("div");
  veil.id = "demo-veil";
  veil.innerHTML = '<div class="dv-box"><span class="dv-spin"></span><b>Opening the demo vault</b><small>165 sample gift cards, made-up codes</small></div>';
  document.body.appendChild(veil);

  function boot() {
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    try { localStorage.setItem("gcv-checkout", "1"); } catch (e) {}
    var P = Y.parse, built = window.GCV_DEMO.build();
    var items = built.rows.map(function (r) {
      return P.normalizeCard(Object.assign({}, r, { brand: Y.brands.canonical(r.brand, true) }));
    });
    var vault = new Y.Vault(new Y.Store("giftcard-vault"));
    return vault.create(PW)
      .then(function () { return vault.addMany(items); })
      .then(function () {
        vault.items.forEach(function (c, i) {
          c.created_at = built.meta[i].created;
          if (built.meta[i].kind === "archived") c.archived = true;
        });
        return vault.save();
      });
  }

  function guard() {
    // Delete is off in the demo: refuse the routes even if a button shows up.
    var real = window.api;
    window.api = function (method, path, body) {
      if ((method === "DELETE" && /^\/api\/cards\//.test(path)) || path === "/api/cards/delete-many") {
        return Promise.resolve({ ok: false, status: 403, data: {} });
      }
      return real(method, path, body);
    };
  }

  function unlock() {
    var pw = document.getElementById("pw"), btn = document.getElementById("unlock-btn");
    if (!pw || !btn) return;
    pw.value = PW;
    btn.click();
  }

  // Locked again later (the Lock button, or the auto-lock): the password is
  // filled in and the note says so - one tap opens it.
  function watchLock() {
    var lock = document.getElementById("lock");
    var note = document.createElement("p");
    note.className = "demo-note";
    note.textContent = "Demo vault - the password is filled in. Tap Unlock.";
    var err = document.getElementById("lock-err");
    if (err && err.parentNode) err.parentNode.insertBefore(note, err);
    new MutationObserver(function () {
      if (!lock.classList.contains("hidden")) {
        var pw = document.getElementById("pw");
        if (pw && !pw.value) pw.value = PW;
      }
    }).observe(lock, { attributes: true, attributeFilter: ["class"] });
  }

  boot().then(function () {
    var s = document.createElement("script");
    s.src = document.querySelector('meta[name="demo-app"]').content;
    s.onload = function () {
      guard();
      watchLock();
      // initLockScreen() is async; the button is ready once the screen shows.
      var tries = 0;
      (function wait() {
        var lock = document.getElementById("lock");
        if (lock && !lock.classList.contains("hidden")) {
          unlock();
          var t0 = Date.now();
          (function gone() {
            var app = document.getElementById("app");
            if ((app && !app.classList.contains("hidden")) || Date.now() - t0 > 15000) veil.remove();
            else setTimeout(gone, 120);
          })();
        } else if (tries++ < 200) setTimeout(wait, 50);
        else veil.remove();
      })();
    };
    document.body.appendChild(s);
  }).catch(function (e) {
    veil.querySelector("small").textContent = "Could not open the demo here: " + (e && e.message || e);
  });
})();

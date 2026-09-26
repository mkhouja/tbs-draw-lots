"use strict";

/* ======================================================================
   1. PASTE YOUR FIREBASE CONFIG HERE
   ----------------------------------------------------------------------
   Firebase Console -> Project settings (gear icon) -> General ->
   "Your apps" -> Web app -> the config object shown there. See the
   setup instructions that came with this file for the full walkthrough.
   ====================================================================== */
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbV5JEV3VCzHPcTy2rCzAmDTit_nq4Hf4",
  authDomain: "tbs-draw-lots.firebaseapp.com",
  databaseURL: "https://tbs-draw-lots-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "tbs-draw-lots",
  storageBucket: "tbs-draw-lots.firebasestorage.app",
  messagingSenderId: "1095319902429",
  appId: "1:1095319902429:web:49d27a2ef7d433b62de334"
};

/* ======================================================================
   2. ROUND ID
   ----------------------------------------------------------------------
   All claims for one activity live under /claims/<ROUND_ID> in the
   database. To run this again later for a different class or a
   different week WITHOUT mixing up the draw pool, just change this
   string (e.g. "week2-section-b", "week2-2026-fall") and redeploy —
   old rounds' data stays in Firebase untouched, just ignored.
   ====================================================================== */
var ROUND_ID = "week2-explain-it-back";
var ROUND_TITLE = "Week 2 — Explain It Back";

/* ======================================================================
   3. THE SNIPPETS
   ----------------------------------------------------------------------
   Edit this list to reuse the tool for a different activity. Each
   snippet needs a short unique id, a label shown as the heading, and
   the exact code (as a JS string) shown in the result card.
   ====================================================================== */
var SNIPPETS = [
  {
    id: "A",
    label: "Snippet A — Broken Nesting",
    code: '<div class="intro">\n  <p>Welcome to our bakery.\n</div>\n</p>'
  },
  {
    id: "B",
    label: "Snippet B — Missing Closing Tag",
    code: '<ul>\n  <li>Cakes</li>\n  <li>Breads\n  <li>Pastries</li>\n</ul>'
  },
  {
    id: "C",
    label: "Snippet C — Duplicate <main>",
    code: '<body>\n  <main>\n    <h1>About Us</h1>\n  </main>\n  <main>\n    <h2>Our Team</h2>\n  </main>\n</body>'
  },
  {
    id: "D",
    label: "Snippet D — Misplaced Content",
    code: '<footer>\n  <nav>\n    <a href="#">Home</a>\n    <a href="#">Contact</a>\n  </nav>\n  <h1>Welcome to Our Site</h1>\n</footer>'
  },
  {
    id: "E",
    label: "Snippet E — Attribute Typos",
    code: '<a herf="https://example.com">Shop Now</a>\n<img source="hero.jpg">'
  },
  {
    id: "F",
    label: "Snippet F — Inconsistent Table Structure",
    code: '<table>\n  <tr>\n    <td>Service</td><td>Price</td>\n  </tr>\n  <tr>\n    <td>Haircut</td>\n  </tr>\n</table>'
  }
];

/* ======================================================================
   Everything below this line is the tool's logic — no need to edit it.
   ====================================================================== */

(function () {

  function isConfigured() {
    return Object.keys(FIREBASE_CONFIG).every(function (k) {
      return String(FIREBASE_CONFIG[k]).indexOf("PASTE_YOUR") === -1;
    });
  }

  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, val) { try { localStorage.setItem(key, val); } catch (e) {} }

  function getClientId() {
    var id = safeGet("drawlots-client-id");
    if (!id) {
      id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      safeSet("drawlots-client-id", id);
    }
    return id;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function snippetById(id) {
    return SNIPPETS.find(function (s) { return s.id === id; });
  }

  var app = document.getElementById("app");
  var toastEl = document.getElementById("toast");
  var clientId = getClientId();
  var claimsRef = null;
  var latestClaims = {};   // pushId -> { clientId, pairName, snippetId, claimedAt }
  var drawing = false;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  function myClaim() {
    var found = null;
    Object.keys(latestClaims).forEach(function (key) {
      if (latestClaims[key].clientId === clientId) found = latestClaims[key];
    });
    return found;
  }

  function tally() {
    var counts = {};
    SNIPPETS.forEach(function (s) { counts[s.id] = 0; });
    Object.keys(latestClaims).forEach(function (key) {
      var c = latestClaims[key];
      counts[c.snippetId] = (counts[c.snippetId] || 0) + 1;
    });
    return counts;
  }

  // Pick the least-claimed snippet so far, breaking ties at random. Since
  // pairs claim independently and asynchronously (no transactions on a
  // plain Realtime Database write), this keeps the class distribution
  // balanced without needing one.
  function pickSnippet() {
    var counts = tally();
    var min = Infinity;
    SNIPPETS.forEach(function (s) { if (counts[s.id] < min) min = counts[s.id]; });
    var candidates = SNIPPETS.filter(function (s) { return counts[s.id] === min; });
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function renderTally() {
    var counts = tally();
    return '<div class="tally">' + SNIPPETS.map(function (s) {
      return '<span class="tally-chip">' + escapeHtml(s.id) + " &middot; <b>" + (counts[s.id] || 0) + "</b></span>";
    }).join("") + "</div>";
  }

  function renderStudentPanel() {
    var mine = myClaim();
    var canWrite = claimsRef && !mine && !drawing;
    var resultHtml = "";
    if (mine) {
      var snip = snippetById(mine.snippetId);
      var label = snip ? snip.label : mine.snippetId;
      var code = snip ? snip.code : "";
      resultHtml = '<div class="result-card">' +
        '<p class="kicker">Your assignment</p>' +
        '<p class="snippet-name">' + escapeHtml(label) + "</p>" +
        (mine.pairName ? '<p class="for-pair">' + escapeHtml(mine.pairName) + "</p>" : "") +
        '<pre class="code-block">' + escapeHtml(code) + "</pre>" +
        '<p class="task-note">Read it line by line, find the bug, and explain it in your own words before checking with AI.</p>' +
        "</div>";
    }
    return '<div class="panel">' +
      '<div class="claim-zone">' +
      (mine
        ? '<p class="lead">You’re all set</p><p class="lead-sub">This is the snippet your pair is working on. Revisiting this page on this device will always show the same one.</p>'
        : '<p class="lead">Get your snippet</p><p class="lead-sub">One click, one fair random draw — the tool keeps every snippet balanced across the class.</p>' +
          '<div class="field">' +
          '<label for="pair-name">Your pair (optional)</label>' +
          '<input type="text" id="pair-name" placeholder="e.g. Ali &amp; Sami" maxlength="60">' +
          "</div>" +
          '<button id="draw-btn"' + (canWrite ? "" : " disabled") + ">" + (drawing ? "Drawing…" : "Draw my snippet") + "</button>") +
      resultHtml +
      "</div>" +
      '<div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--border);text-align:center;">' +
      '<p class="hint" style="margin-bottom:8px;">How the class is doing so far:</p>' +
      renderTally() +
      "</div>" +
      "</div>";
  }

  function renderSetupBanner() {
    return '<div class="banner warn">This page isn’t connected to a database yet. Open <code>script.js</code> and paste in your Firebase config at the top of the file, then redeploy. See the setup instructions that came with this file.</div>';
  }

  function renderOfflineBanner() {
    return '<div class="banner warn">Couldn’t reach the shared database. Check your internet connection and reload the page.</div>';
  }

  var connectionFailed = false;

  function render() {
    var banner = "";
    if (!isConfigured()) banner = renderSetupBanner();
    else if (connectionFailed) banner = renderOfflineBanner();

    app.innerHTML =
      banner +
      '<p class="round-title-wrap"><span class="round-title">Round: <b>' + escapeHtml(ROUND_TITLE) + "</b></span></p>" +
      renderStudentPanel();

    var drawBtn = document.getElementById("draw-btn");
    if (drawBtn) drawBtn.addEventListener("click", onDraw);
  }

  function onDraw() {
    if (drawing || myClaim() || !claimsRef) return;
    var nameInput = document.getElementById("pair-name");
    var pairName = nameInput ? nameInput.value.trim() : "";
    var snip = pickSnippet();
    if (!snip) { showToast("No snippets are set up yet."); return; }

    drawing = true;
    render();

    claimsRef.push({
      clientId: clientId,
      pairName: pairName,
      snippetId: snip.id,
      claimedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(function () {
      drawing = false;
      // The live listener (onValue) will already have delivered this
      // write and re-rendered; this just clears the "Drawing..." state
      // in case the listener update hasn't landed yet.
      render();
    }).catch(function (err) {
      drawing = false;
      showToast("Could not save that — check your connection and try again.");
      render();
      console.error("Draw Lots: write failed", err);
    });
  }

  function boot() {
    render();

    if (!isConfigured()) return; // setup banner already shown by render()

    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      claimsRef = firebase.database().ref("claims/" + ROUND_ID);

      claimsRef.on("value", function (snapshot) {
        latestClaims = snapshot.val() || {};
        connectionFailed = false;
        render();
      }, function (err) {
        connectionFailed = true;
        render();
        console.error("Draw Lots: database read failed", err);
      });
    } catch (e) {
      connectionFailed = true;
      render();
      console.error("Draw Lots: Firebase init failed", e);
    }
  }

  boot();
})();

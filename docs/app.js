(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage can be blocked */ } },
  };

  let CARDS = [], CR = null, RULINGS = null, hay = [], DATA_DATE = "";
  const byNorm = new Map();
  const card = (n) => byNorm.get(MTGDeck.norm(n));
  const anCache = new Map();
  const state = {
    ci: new Set(), type: "", legal: false, gc: false, shown: 50,
    picked: store.get("picked", []),
    deck: store.get("deck", null), pane: "list", importNote: "", suggestions: null,
  };
  const TITLES = { search: "Search", interact: "Interact", decks: "Decks", sets: "Sets", rules: "Rules" };
  const ART = { W: "#cdbf9a", U: "#3d6a8f", B: "#4a3f4f", R: "#9a3d24", G: "#3f6b3a" };
  const artColor = (c) => (c.ci.length === 1 ? ART[c.ci] : c.ci.length ? "#8a6d2b" : "#6b6b6b");

  // ---------- text helpers ----------
  function mana(s) {
    return esc(s).replace(/\{([^}]+)\}/g, (m, x) => {
      x = x.toUpperCase();
      return '<i class="ms ' + (/^[WUBRGC]$/.test(x) ? x : "") + '">' + esc(x.replace("/", "")) + "</i>";
    });
  }
  function linkRules(html) {
    return html.replace(/\b(rules?\s+)?(\d{3}(?:\.\d+[a-z]?)?)\b/g, (m, pre, num) => {
      if (!CR || !CR.rules[num] || (!pre && !num.includes("."))) return m;
      return (pre || "") + '<a class="rl" data-rule="' + num + '">' + num + "</a>";
    });
  }
  const ruleChip = (n) => '<button class="chip rule" data-rule="' + esc(n) + '">CR ' + esc(n) + "</button>";
  const cites = (a) => (a || []).map(ruleChip).join(" ");

  // Images: any element with data-img="name" and data-kind="art|small|normal" gets its picture when Scryfall answers.
  function hydrate(root) {
    (root || document).querySelectorAll("[data-img]:not([data-done])").forEach((el) => {
      el.dataset.done = "1";
      Scry.get(el.dataset.img, (img) => { if (img && img[el.dataset.kind || "art"]) el.style.backgroundImage = "url(\"" + img[el.dataset.kind || "art"] + "\")"; });
    });
  }

  // 3D tilt that follows a mouse, pen or finger.
  function tilt(el) {
    const move = (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ty", x * 26 + "deg"); el.style.setProperty("--tx", -y * 26 + "deg");
      el.style.boxShadow = -x * 20 + "px " + (16 - y * 20) + "px 36px rgba(0,0,0,.6)" + (el.classList.contains("focus") ? ",0 0 0 1px rgba(208,106,38,.5),0 0 34px rgba(208,106,38,.2)" : "");
    };
    const reset = () => { el.style.setProperty("--ty", "0deg"); el.style.setProperty("--tx", "0deg"); el.style.boxShadow = ""; };
    el.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch" || e.buttons) move(e); });
    el.addEventListener("pointerdown", move);
    ["pointerleave", "pointerup", "pointercancel"].forEach((t) => el.addEventListener(t, reset));
  }

  // Full-screen card preview. Any element with data-zoom="name" opens it; without a picture it opens the card page instead.
  function zoom(name) {
    const c = card(name);
    Scry.get(name, (img) => {
      if (!img) { if (c) openSheet({ type: "card", card: c }); return; }
      lightbox(img.large || img.normal, img.normal, name, "");
    });
  }
  function lightbox(url, fallback, name, sub) {
    {
      const lb = document.createElement("div");
      lb.className = "lightbox";
      lb.innerHTML = '<div class="lb-card" role="img" aria-label="' + esc(name) + '" style="background-image:url(&quot;' + esc(url) + '&quot;),url(&quot;' + esc(fallback || url) + '&quot;)"></div><div class="lb-cap"><b>' + esc(name) + "</b>" + (sub ? esc(sub) + "<br>" : "") + "Tap anywhere to close</div>";
      document.body.appendChild(lb);
      navPush({ lb: 1 });
      const el = lb.firstChild;
      const move = (e) => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.setProperty("--ry", (x - 0.5) * 30 + "deg"); el.style.setProperty("--rx", (0.5 - y) * 30 + "deg");
        el.style.setProperty("--gx", x * 100 + "%"); el.style.setProperty("--gy", y * 100 + "%");
      };
      el.addEventListener("pointermove", move); el.addEventListener("pointerdown", move);
      ["pointerleave", "pointercancel"].forEach((t) => el.addEventListener(t, () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); }));
      let downAt = 0;
      lb.addEventListener("pointerdown", () => { downAt = Date.now(); });
      lb.addEventListener("click", () => { if (Date.now() - downAt < 400 || !downAt) history.back(); });
      const esc2 = (e) => { if (e.key === "Escape") { document.removeEventListener("keydown", esc2); if (document.contains(lb)) history.back(); } };
      document.addEventListener("keydown", esc2);
    }
  }
  document.addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]");
    if (z && Scry.state.enabled) { e.stopPropagation(); e.preventDefault(); zoom(z.dataset.zoom); }
  }, true);

  const setHH = () => document.documentElement.style.setProperty("--hh", $("header.top").offsetHeight + "px");
  window.addEventListener("resize", setHH); setHH();
  if (window.ResizeObserver) new ResizeObserver(setHH).observe($("header.top"));

  // ---------- loading ----------
  async function load() {
    try {
      const [c, r] = await Promise.all([fetch("data/cards.json").then((x) => x.json()), fetch("data/cr.json").then((x) => x.json())]);
      CARDS = c; CR = r;
      CARDS.forEach((cd, i) => { byNorm.set(MTGDeck.norm(cd.n), cd); hay[i] = (cd.n + " " + cd.t + " " + cd.o).toLowerCase(); });
      $("#status").textContent = CARDS.length.toLocaleString() + " cards";
      fetch("data/built-at.txt").then((x) => (x.ok ? x.text() : "")).then((t) => {
        const d = new Date(t.trim()); if (isNaN(d)) return;
        $("#status").innerHTML = CARDS.length.toLocaleString() + ' cards<span class="upd"> · updated ' + esc(d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + "</span>";
      }).catch(() => {});
      initSearch(); initInteract(); initDecks(); initRules();
      renderResults(); renderInteract(); renderDeck(); rulesSearch();
      if (curTab === "sets") ensureSets();
      await restoreNav();
      fetch("data/rulings.json").then((x) => x.json()).then((j) => { RULINGS = j; renderAnalysis(); }).catch(() => {});
      fetch("data/source-date.txt").then((x) => (x.ok ? x.text() : "")).then((t) => { DATA_DATE = t.trim(); }).catch(() => {});
    } catch (e) {
      $("#status").textContent = "";
      $("#results").innerHTML = '<div class="panel item">Could not load the data files. Open this page from its web address instead of as a saved file.</div>';
    }
  }

  // ---------- tabs ----------
  let curTab = null;
  function showTab(t, opts) {
    opts = opts || {};
    const changed = curTab !== t;
    curTab = t;
    document.querySelectorAll("nav.tabbar [data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    Object.keys(TITLES).forEach((x) => { $("#tab-" + x).classList.toggle("hidden", x !== t); $("#tb-" + x).classList.toggle("hidden", x !== t); });
    $("#title").textContent = TITLES[t];
    $("#homeBtn").classList.toggle("hidden", t === "search");
    if (t === "interact") requestAnimationFrame(updateCarousel);
    if (t === "sets" && CR) ensureSets();
    if (changed && !opts.silent) navPush();
    if (changed) window.scrollTo(0, 0);
    saveNav();
  }
  document.querySelectorAll("nav.tabbar [data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("#homeBtn").addEventListener("click", () => showTab("search"));

  // ---------- navigation history: phone back gestures and Safari's back button step back one level ----------
  function navPush(extra) { history.pushState(Object.assign({ m: 1, tab: curTab, depth: stack.length }, extra || {}), ""); }
  window.addEventListener("popstate", (e) => {
    const lb = document.querySelector(".lightbox"); if (lb) { lb.remove(); return; }
    const st = e.state || { tab: "search", depth: 0 };
    if (st.tab && st.tab !== curTab) showTab(st.tab, { silent: true });
    if (stack.length > (st.depth || 0)) { stack.length = st.depth || 0; if (stack.length) drawSheet(); else closeLocal(); }
    saveNav();
  });

  // Where you are (tab, search, filters, open pages) survives a reload, such as Safari's pull-to-refresh.
  function readNav() { try { return JSON.parse(sessionStorage.getItem("nav") || "null"); } catch (e) { return null; } }
  function saveNav() {
    if (!CR) return;
    const ser = (v) => (v.type === "card" ? { type: "card", n: v.card.n } : { type: v.type, rule: v.rule, code: v.code, i: v.i, year: v.year, view: v.view, sort: v.sort });
    try {
      sessionStorage.setItem("nav", JSON.stringify({ tab: curTab, q: $("#q").value, ci: [...state.ci], type: state.type, legal: state.legal, gc: state.gc, kw: state.kw || "", theme: state.theme || "",
        sheets: stack.filter((v) => v.type !== "settings").map(ser) }));
    } catch (e) { /* storage blocked: nothing to restore later */ }
  }
  async function restoreNav() {
    const n = readNav();
    if (!n) return;
    $("#q").value = n.q || "";
    (n.ci || []).forEach((c) => { state.ci.add(c); const b = $('#filters [data-ci="' + c + '"]'); if (b) b.classList.add("on"); });
    state.type = n.type || ""; $("#type").value = state.type;
    state.legal = !!n.legal; $("#legal").classList.toggle("on", state.legal);
    state.gc = !!n.gc; $("#gc").classList.toggle("on", state.gc);
    state.kw = n.kw || ""; $("#kwsel").value = state.kw;
    state.theme = n.theme || ""; $("#themesel").value = state.theme;
    renderResults();
    for (const sv of n.sheets || []) {
      if (["set", "deck", "sld"].includes(sv.type)) await ensureSets();
      const v = sv.type === "card" ? (card(sv.n) ? { type: "card", card: card(sv.n) } : null) : sv;
      if (v) { stack.push(v); navPush(); }
    }
    if (stack.length) drawSheet();
  }
  showTab((readNav() || {}).tab || "search", { silent: true });
  history.replaceState({ m: 1, tab: curTab, depth: 0 }, "");

  // ---------- sheet ----------
  const stack = [];
  function openSheet(v) { stack.push(v); drawSheet(); navPush(); saveNav(); }
  // Close every open page; goes back through history so the back gesture stays in step.
  function closeSheet() { if (stack.length) history.go(-stack.length); }
  function closeLocal() { stack.length = 0; $("#sheet-root").innerHTML = ""; document.body.classList.remove("locked"); }
  // Close pages before jumping somewhere else in the app.
  function leaveSheets() { closeLocal(); history.replaceState({ m: 1, tab: curTab, depth: 0 }, ""); saveNav(); }
  let sheetSeq = 0;
  const VIEWS = {
    card: [(v) => v.card.n, (v) => cardView(v.card) + printingsHTML()],
    settings: [() => "Settings", settingsView],
    keywords: [() => "Keywords & themes", keywordsView],
    set: [(v) => (SETS.data.byCode.get(v.code) || {}).n || "Set", setView],
    sld: [(v) => "Secret Lair · " + v.year, sldView],
    deck: [(v) => SETS.data.precons[v.i].n, deckView],
    rule: [(v) => (v.rule.startsWith("gloss:") ? "Glossary" : "Rule " + v.rule), (v) => ruleView(v.rule)],
  };
  function drawSheet() {
    const v = stack[stack.length - 1];
    if (!v) return closeLocal();
    v.id = v.id || ++sheetSeq;
    const prev = $("#sheet-root .sheet");
    const keep = prev && +prev.dataset.vid === v.id ? prev.scrollTop : 0;
    const [title, body] = VIEWS[v.type];
    const under = stack[stack.length - 2];
    const backTo = under ? VIEWS[under.type][0](under) : TITLES[curTab];
    $("#sheet-root").innerHTML = '<div class="sheet-bg"><div class="sheet" data-vid="' + v.id + '"><div class="grabzone"><div class="grab"></div></div><div class="sheet-top">' +
      '<button class="btn small backbtn" data-act="back" aria-label="Back to ' + esc(backTo) + '">‹ ' + esc(backTo) + '</button><div class="t">' + esc(title(v)) + '</div><button class="btn small" data-act="close" aria-label="Close">✕</button></div>' + body(v) + "</div></div>";
    document.body.classList.add("locked");
    const sheet = $("#sheet-root .sheet");
    swipeClose(sheet);
    sheet.scrollTop = keep;
    hydrate(sheet);
    lazyPrints(sheet);
    const img = $("#sheet-root .cardimg"); if (img) tiltFlat(img);
    if (v.type === "card") loadPrintings(v);
    if (v.type === "deck") deckValue(v);
    saveNav();
  }
  // Drag the top bar down to go back one level.
  function swipeClose(sheet) {
    let y0 = null, dy = 0;
    [sheet.querySelector(".grabzone"), sheet.querySelector(".sheet-top")].forEach((z) => {
      z.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; y0 = e.clientY; dy = 0; sheet.style.transition = "none"; try { z.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
      z.addEventListener("pointermove", (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = "translateY(" + dy + "px)"; });
      const end = () => {
        if (y0 == null) return;
        y0 = null; sheet.style.transition = "";
        if (dy > 90) { sheet.style.transform = "translateY(100%)"; setTimeout(() => history.back(), 160); } else sheet.style.transform = "";
      };
      z.addEventListener("pointerup", end); z.addEventListener("pointercancel", end);
    });
  }
  function tiltFlat(el) {
    el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = "perspective(900px) rotateY(" + x * 24 + "deg) rotateX(" + -y * 24 + "deg)"; el.style.boxShadow = -x * 24 + "px " + (22 - y * 22) + "px 44px rgba(0,0,0,.65)"; });
    ["pointerleave", "pointerup", "pointercancel"].forEach((t) => el.addEventListener(t, () => { el.style.transform = ""; el.style.boxShadow = ""; }));
  }
  $("#sheet-root").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("sheet-bg")) return closeSheet();
    const a = t.closest("[data-act]");
    if (a) {
      const act = a.dataset.act, n = a.dataset.name;
      if (act === "close") return closeSheet();
      if (act === "back") return history.back();
      if (act === "interact") { addPicks([n]); leaveSheets(); showTab("interact"); return; }
      if (act === "deck-add") { deckAdd(n, 1); return drawSheet(); }
      if (act === "deck-sub") { deckAdd(n, -1); return drawSheet(); }
      if (act === "deck-cmd") { setCommander(n); return drawSheet(); }
      if (act === "images") { Scry.setEnabled(!Scry.state.enabled); drawSheet(); return; }
      if (act === "test") return runTest();
      const v = stack[stack.length - 1];
      if (act === "kw") { leaveSheets(); showTab("search"); setKeyword(a.dataset.v); return; }
      if (act === "theme") { leaveSheets(); showTab("search"); setTheme(a.dataset.v); return; }
      if (act === "pfin") { v.fin = a.dataset.v; store.set("fin", v.fin); return renderPrintings(v, printCache.get(v.card.n) || []); }
      if (act === "pzoom") { if (a.dataset.url) lightbox(a.dataset.url, a.dataset.url, v.card.n, a.dataset.cap); return; }
      if (act === "view") { v.view = a.dataset.v; store.set("gridview", v.view); return drawSheet(); }
      if (act === "match") { v.all = !v.all; return drawSheet(); }
      if (act === "more") { v.limit = (v.limit || 90) + 90; return drawSheet(); }
      if (act === "copydeck") return copyPrecon(v.i);
    }
    const dk = t.closest("[data-deck]"); if (dk) return openSheet({ type: "deck", i: +dk.dataset.deck });
    const r = t.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
    const cd = t.closest("[data-card]"); if (cd && card(cd.dataset.card)) return openSheet({ type: "card", card: card(cd.dataset.card) });
    const g = t.closest("[data-gloss]"); if (g) return openSheet({ type: "rule", rule: "gloss:" + g.dataset.gloss });
  });
  $("#sheet-root").addEventListener("change", (e) => {
    const t = e.target, v = stack[stack.length - 1];
    if (t.dataset.act === "psort") { v.psort = t.value; renderPrintings(v, printCache.get(v.card.n) || []); }
    if (t.dataset.act === "ssort") { v.sort = t.value; drawSheet(); }
  });
  $("#settingsBtn").addEventListener("click", () => openSheet({ type: "settings" }));

  // ---------- printings and prices (Scryfall, on this device) ----------
  const printCache = new Map();
  const FIN = { nonfoil: ["Non-foil", "usd"], foil: ["Foil", "usd_foil"], etched: ["Etched", "usd_etched"] };
  const priceOf = (p, fin) => { const x = p.prices[FIN[fin][1]]; return x ? +x : null; };
  const money = (x) => "$" + (x >= 100 ? Math.round(x).toLocaleString() : x.toFixed(2));
  function printingsHTML() {
    return '<section class="block"><h2>Printings &amp; prices</h2><div id="prints">' + (Scry.state.enabled ? '<div class="d">Loading printings and prices from Scryfall…</div>' : '<div class="d">Turn on card images in Settings to see printings and prices.</div>') + "</div></section>";
  }
  async function loadPrintings(v) {
    if (!Scry.state.enabled) return;
    let list = printCache.get(v.card.n);
    if (!list) {
      try { list = await Scry.printings(v.card.n); printCache.set(v.card.n, list); }
      catch (e) { const el = $("#prints"); if (el && stack[stack.length - 1] === v) el.innerHTML = '<div class="d">Could not load printings: ' + esc(e.message || e) + "</div>"; return; }
    }
    if (stack[stack.length - 1] === v) { renderTopSwipe(v, list); renderPrintings(v, list); }
  }
  // Swipe the big picture to see every printing, with its set and prices underneath.
  function renderTopSwipe(v, list) {
    const el = $("#pswipe"), shown = list.filter((p) => p.img);
    if (!el || !shown.length) return;
    el.innerHTML = shown.map((p) => '<div class="pslide"><div class="cardimg" data-act="pzoom" data-url="' + esc(p.img.large) + '" data-cap="' + esc(p.setName + " · #" + p.num) + '" data-bg="' + esc(p.img.normal) + '"></div></div>').join("");
    const imgs = [...el.querySelectorAll(".cardimg")];
    imgs.forEach(tiltFlat);
    let last = -1;
    const update = () => {
      const i = Math.max(0, Math.min(shown.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
      for (const j of [i - 1, i, i + 1]) if (imgs[j] && imgs[j].dataset.bg) { imgs[j].style.backgroundImage = 'url("' + imgs[j].dataset.bg + '")'; delete imgs[j].dataset.bg; }
      if (i === last) return;
      last = i;
      const p = shown[i];
      const prices = Object.keys(FIN).filter((f) => p.finishes.includes(f)).map((f) => { const x = priceOf(p, f); return x == null ? "" : '<span class="price">' + money(x) + "</span> " + FIN[f][0].toLowerCase(); }).filter(Boolean).join(" · ");
      $("#pcap").innerHTML = "<b>" + esc(p.setName) + "</b> · #" + esc(p.num) + " · " + esc((p.date || "").slice(0, 4)) + " · " + (i + 1) + " of " + shown.length + "<br>" + (prices || "no price") + (shown.length > 1 && i === 0 ? ' · <span style="opacity:.7">swipe for more ›</span>' : "");
    };
    el.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    update();
  }
  function renderPrintings(v, list) {
    const el = $("#prints"); if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="d">Scryfall has no paper printings for this card.</div>'; return; }
    const avail = Object.keys(FIN).filter((f) => list.some((p) => p.finishes.includes(f)));
    v.fin = avail.includes(v.fin) ? v.fin : avail.includes(store.get("fin", "nonfoil")) ? store.get("fin", "nonfoil") : avail[0];
    v.psort = v.psort || "new";
    const rows = list.filter((p) => p.finishes.includes(v.fin));
    if (v.psort === "low") rows.sort((a, b) => (priceOf(a, v.fin) ?? 1e9) - (priceOf(b, v.fin) ?? 1e9));
    if (v.psort === "high") rows.sort((a, b) => (priceOf(b, v.fin) ?? -1) - (priceOf(a, v.fin) ?? -1));
    const priced = rows.map((p) => priceOf(p, v.fin)).filter((x) => x != null);
    const lo = priced.length ? Math.min(...priced) : null, hi = priced.length ? Math.max(...priced) : null;
    let h = '<div class="pctl">' + avail.map((f) => '<button class="chip' + (f === v.fin ? " on" : "") + '" data-act="pfin" data-v="' + f + '">' + FIN[f][0] + " · " + list.filter((p) => p.finishes.includes(f)).length + "</button>").join("") +
      '<select class="sel" data-act="psort"><option value="new"' + (v.psort === "new" ? " selected" : "") + '>Newest</option><option value="low"' + (v.psort === "low" ? " selected" : "") + '>Cheapest</option><option value="high"' + (v.psort === "high" ? " selected" : "") + ">Priciest</option></select></div>";
    h += '<div class="d">' + rows.length + " " + FIN[v.fin][0].toLowerCase() + " printing" + (rows.length === 1 ? "" : "s") + (lo != null ? " · " + money(lo) + (hi > lo ? " to " + money(hi) : "") : "") + "</div>";
    h += '<div class="pcar">' + rows.map((p) => {
      const pr = priceOf(p, v.fin);
      return '<div class="ptile" data-act="pzoom" data-url="' + esc(p.img ? p.img.large : "") + '" data-cap="' + esc(p.setName + " · #" + p.num) + '"><div class="im" style="background-image:url(&quot;' + esc(p.img ? p.img.normal : "") + '&quot;)"></div>' +
        '<div class="cap"><b>' + esc(p.setName) + "</b>#" + esc(p.num) + " · " + esc((p.rarity || "?")[0].toUpperCase()) + " · " + esc((p.date || "").slice(0, 4)) + (p.frame ? " · " + esc(p.frame) : "") +
        '<br><span class="price' + (pr == null ? " none" : "") + '">' + (pr == null ? "no price" : money(pr)) + "</span>" + (p.prices.eur && v.fin === "nonfoil" ? " · €" + esc(p.prices.eur) : "") + (p.prices.tix ? " · " + esc(p.prices.tix) + " tix" : "") + "</div></div>";
    }).join("") + "</div>";
    h += '<div class="d" style="font-size:12px">From Scryfall: USD is the TCGplayer market price, EUR is Cardmarket, tix is MTGO. Updated about once a day. These are market prices, not what a store will pay.</div>';
    el.innerHTML = h;
  }

  // Grid tiles with data-print="set/number" get the exact printing's picture when they scroll into view.
  function lazyPrints(root) {
    const els = root.querySelectorAll("[data-print]:not([data-done])");
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target; io.unobserve(el); el.dataset.done = "1";
        const [set, num] = el.dataset.print.split("/");
        const apply = (img) => { if (img) { el.style.backgroundImage = "url(\"" + img.normal + "\")"; el.classList.add("loaded"); } };
        Scry.getPrint(set, num, (p) => (p && p.img ? apply(p.img) : Scry.get(el.dataset.card, apply)));
      }
    }, { root: root.classList.contains("sheet") ? root : null, rootMargin: "300px" });
    els.forEach((el) => io.observe(el));
  }

  function flags(c) {
    return (c.s ? '<span class="badge ' + (c.s === "banned" ? "bad" : "warn") + '">' + esc(c.s.replace(/_/g, " ")) + "</span>" : "") + (c.g ? '<span class="badge warn">Game Changer</span>' : "");
  }
  function cardView(c) {
    let h = Scry.state.enabled ? '<div class="pswipe" id="pswipe"><div class="pslide"><div class="cardimg" data-img="' + esc(c.n) + '" data-kind="normal" data-zoom="' + esc(c.n) + '"></div></div></div><div class="pcap" id="pcap"></div>' : "";
    h += '<div class="panel item"><h3 style="margin:0">' + esc(c.n) + " " + (c.m ? mana(c.m) : "") + "</h3>" + flags(c) +
      '<div class="d">' + esc(c.t) + (c.pt ? " · " + esc(c.pt) : "") + (c.ly ? " · loyalty/defense " + esc(c.ly) : "") + " · identity " + (mana([...c.ci].map((x) => "{" + x + "}").join("")) || "colorless") + (c.f ? " · " + esc(c.f.join(" // ")) : "") + "</div>" +
      '<div class="oracle">' + linkRules(mana(c.o)) + "</div></div>";
    const inDeck = state.deck && (state.deck.cards.find((x) => x.n === c.n) || state.deck.commanders.includes(c.n));
    h += '<div class="chips"><button class="btn primary small" data-act="interact" data-name="' + esc(c.n) + '">Add to Interact</button>' +
      '<button class="btn small" data-act="deck-add" data-name="' + esc(c.n) + '">' + (inDeck ? "+1 in deck" : "Add to deck") + "</button>" +
      (inDeck ? '<button class="btn small" data-act="deck-sub" data-name="' + esc(c.n) + '">Remove one</button>' : "") +
      (/Legendary/.test(c.t) && /Creature|Planeswalker/.test(c.t) || /can be your commander/i.test(c.o) ? '<button class="btn small" data-act="deck-cmd" data-name="' + esc(c.n) + '">Make commander</button>' : "") + "</div>";
    if (c.k && c.k.length) h += '<section class="block"><h2>Keywords, from the rules</h2><div class="chips" style="flex-wrap:wrap">' + c.k.map((k) => {
      const n = CR.kw[k.toLowerCase()];
      return n ? '<button class="chip rule" data-rule="' + n + '">' + esc(k) + " → CR " + n + "</button>" : '<span class="chip">' + esc(k) + "</span>";
    }).join("") + "</div></section>";
    const w = MTGEngine.wording([c], { cr: CR });
    if (w.length) h += '<section class="block"><h2>Said · not said</h2>' + w.map(wordItem).join("") + "</section>";
    h += '<section class="block"><h2>Official rulings</h2>';
    if (!RULINGS) h += '<div class="d">Rulings are still loading…</div>';
    else {
      const list = (RULINGS.by[c.n] || []).slice().sort((a, b) => (a[0] < b[0] ? 1 : -1));
      h += list.length ? list.map(([d, i]) => '<div class="panel item"><div class="d">' + esc(d) + "</div>" + linkRules(mana(RULINGS.texts[i])) + "</div>").join("") : '<div class="d">No official rulings for this card.</div>';
    }
    return h + "</section>";
  }
  const wordItem = (w) => '<div class="panel item"><span class="tag ' + (w.said ? "said" : "not") + '">' + (w.said ? "SAYS" : "DOESN'T SAY") + "</span><b>" + esc(w.title) + '</b><div class="d">' + esc(w.card) + " · " + esc(w.detail) + "</div>" + (w.cites.length ? '<div style="margin-top:6px">' + cites(w.cites) + "</div>" : "") + "</div>";

  function ruleView(id) {
    if (id.startsWith("gloss:")) {
      const t = id.slice(6);
      return '<div class="panel item"><h3 style="margin:0 0 6px">' + esc(t) + "</h3>" + linkRules(esc(CR.glossary[t] || "").replace(/\u2028/g, "<br>")) + "</div>";
    }
    if (!CR.rules[id]) return '<div class="panel item">Rule ' + esc(id) + " not found.</div>";
    const section = /^\d{3}$/.test(id), sub = /[a-z]$/.test(id);
    const items = section ? CR.order.filter((n) => n === id || (/^\d{3}\.\d+$/.test(n) && n.startsWith(id + ".")))
      : CR.order.filter((n) => n === id || (n.startsWith(id) && /^[a-z]+$/.test(n.slice(id.length))));
    let h = items.map((n) => {
      const r = CR.rules[n], depth = /[a-z]$/.test(n) && n !== id ? 1 : 0;
      return '<div class="rule-item" style="--d:' + depth + '"><a class="rl n" data-rule="' + n + '">' + n + "</a>" + linkRules(esc(r.t)) +
        (r.ex ? r.ex.map((x) => '<div class="ex">Example: ' + linkRules(esc(x)) + "</div>").join("") : "") + "</div>";
    }).join("");
    const parent = sub ? id.replace(/[a-z]+$/, "") : "";
    if (parent) h += '<div class="chips"><button class="chip rule" data-rule="' + parent + '">Whole rule ' + parent + "</button></div>";
    if (id.length > 3) { const up = id.slice(0, 3); h += '<div class="chips"><button class="chip rule" data-rule="' + up + '">Section ' + up + (CR.rules[up] ? " · " + esc(CR.rules[up].t) : "") + "</button></div>"; }
    return h;
  }

  function settingsView() {
    const s = Scry.state;
    return '<div class="panel toggle"><div><b>Card images</b><div class="d">Pictures load from Scryfall on this device. Card text always comes from this app\'s own data.</div></div><button class="switch ' + (s.enabled ? "on" : "") + '" data-act="images" aria-label="Card images"></button></div>' +
      '<div class="panel item" style="margin-top:10px"><b>Scryfall connection</b><div class="d" id="testout">' + (s.failed ? "Last attempt failed: " + esc(s.lastError) : "Not tested yet.") + '</div><div class="chips"><button class="btn small" data-act="test">Test connection</button></div><div id="testimg"></div></div>' +
      '<section class="block"><h2>About</h2><div class="panel item">MTGSME is a pocket Commander rules tool. Card text, rulings and rules come from the open-source mtg.wtf data (github.com/taw/magic-search-engine), built into this site; the rules are effective ' + esc(CR.effective) + "." + (DATA_DATE ? " Card data is from mtg.wtf as of " + esc(DATA_DATE) + ", and is checked for updates daily." : "") + "<br><br>" +
      '<b>Limits.</b> The Interact tab reads card wording with fixed patterns. It is a fast first pass, not a judge, so check the card text it shows. Commander legality is approximate. Magic: The Gathering belongs to Wizards of the Coast.<br><br>Source: github.com/cpt-jason-burke/mtgsme</div></section>';
  }
  async function runTest() {
    const out = $("#testout"); if (!out) return;
    out.textContent = "Testing…";
    try {
      const r = await Scry.test();
      out.innerHTML = '<span style="color:var(--good)">Connected.</span> Scryfall answered in ' + r.ms + " ms.";
      if (r.img) $("#testimg").innerHTML = '<img alt="Sol Ring" src="' + esc(r.img.small) + '" style="width:120px;border-radius:6px;margin-top:8px">';
    } catch (e) { out.innerHTML = '<span style="color:var(--bad)">Could not reach Scryfall.</span> ' + esc(e.message || e) + ". Text features still work; only pictures are affected."; }
  }

  // ---------- search ----------
  function rowHTML(c, extra, why) {
    return '<div class="panel row" data-card="' + esc(c.n) + '"><div class="thumb" style="--cc:' + artColor(c) + '" data-img="' + esc(c.n) + '" data-kind="art" data-zoom="' + esc(c.n) + '"></div><div class="body"><h4>' + esc(c.n) + " " + (c.m ? mana(c.m) : "") + flags(c) + '</h4><div class="ty">' + esc(c.t) + (c.pt ? " · " + esc(c.pt) : "") + "</div>" + (why ? '<div class="why">' + esc(why) + "</div>" : "") + '<div class="tx">' + mana(c.o).replace(/\n/g, " · ") + "</div></div>" + (extra || "") + "</div>";
  }
  // Themes span several keywords or plain wording.
  const THEMES = {
    poison: ["Poison counters", (c) => (c.k || []).some((k) => /^(infect|toxic|poisonous)$/.test(k)) || /poison counter/i.test(c.o)],
    counters: ["+1/+1 counters", (c) => /\+1\/\+1 counter/i.test(c.o)],
    tokens: ["Tokens", (c) => /\bcreate[^.]*\btokens?\b/i.test(c.o)],
    lands: ["Lands matter", (c) => (c.k || []).includes("landfall") || /\bwhenever (?:a|one or more) lands?\b|play an additional land|land cards? (?:from your graveyard )?onto the battlefield/i.test(c.o)],
    sacrifice: ["Sacrifice", (c) => /\bsacrifices? (?:a|an|another|one or more)\b/i.test(c.o)],
    graveyard: ["Graveyard", (c) => /\bfrom (?:your|a|their) graveyard\b/i.test(c.o)],
    lifegain: ["Life gain", (c) => /\b(?:you )?gains? (?:\d+|x|that much)?\s*life\b|whenever you gain life/i.test(c.o) || (c.k || []).includes("lifelink")],
    draw: ["Card draw", (c) => /\bdraws? (?:a|two|three|four|x|that many) cards?\b/i.test(c.o)],
    spells: ["Instants & sorceries", (c) => /\binstant or sorcery\b/i.test(c.o)],
    blink: ["Blink", (c) => /\bexile [^.]*\bthen return\b|\breturn (?:it|that card|them|those cards) to the battlefield\b/i.test(c.o)],
    voltron: ["Equipment & auras", (c) => /\b(?:equipped|enchanted) creature\b/i.test(c.o)],
    wheels: ["Wheels & discard", (c) => /\beach player discards their hand\b|\bdiscards? (?:their|your) hand\b/i.test(c.o)],
  };
  const KW_GROUPS = {
    Evasion: ["flying", "menace", "trample", "shadow", "horsemanship", "fear", "intimidate", "skulk", "forestwalk", "islandwalk", "swampwalk", "mountainwalk", "plainswalk", "landwalk"],
    Combat: ["first strike", "double strike", "deathtouch", "vigilance", "lifelink", "reach", "haste", "defender", "flanking", "bushido", "exalted", "battle cry", "annihilator", "myriad", "melee", "provoke", "afflict"],
    Protection: ["hexproof", "shroud", "ward", "protection", "indestructible", "regenerate"],
    "Poison & counters": ["infect", "toxic", "poisonous", "proliferate", "wither", "persist", "undying", "modular", "evolve", "adapt", "bolster", "outlast", "graft", "fabricate", "training", "mentor", "backup"],
    Graveyard: ["flashback", "unearth", "escape", "dredge", "delve", "embalm", "eternalize", "jump-start", "aftermath", "retrace", "disturb", "scavenge", "encore", "mill", "surveil"],
    Casting: ["flash", "cycling", "kicker", "multikicker", "convoke", "affinity", "cascade", "storm", "madness", "suspend", "foretell", "evoke", "emerge", "overload", "miracle", "prowess", "discover", "plot", "spree"],
    Lands: ["landfall", "earthbend", "domain", "landcycling"],
    "Tokens & bodies": ["changeling", "populate", "investigate", "amass", "incubate", "partner"],
  };
  const KW = new Map();   // keyword -> count
  const title = (s) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  function initSearch() {
    for (const c of CARDS) for (const k of c.k || []) KW.set(k, (KW.get(k) || 0) + 1);
    const types = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle", "Legendary"];
    const kws = [...KW.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    $("#filters").innerHTML = ["W", "U", "B", "R", "G", "C"].map((c) => '<button class="chip" data-ci="' + c + '" aria-label="' + c + '"><i class="ms ' + c + '">' + c + "</i></button>").join("") +
      '<select class="sel" id="type"><option value="">Any type</option>' + types.map((t) => "<option>" + t + "</option>").join("") + "</select>" +
      '<select class="sel" id="kwsel"><option value="">Any keyword</option>' + kws.map(([k, n]) => '<option value="' + esc(k) + '">' + esc(title(k)) + " (" + n.toLocaleString() + ")</option>").join("") + "</select>" +
      '<select class="sel" id="themesel"><option value="">Any theme</option>' + Object.entries(THEMES).map(([k, v]) => '<option value="' + k + '">' + esc(v[0]) + "</option>").join("") + "</select>" +
      '<button class="chip" id="legal">Commander legal</button><button class="chip" id="gc">Game Changer</button><button class="chip" id="kwbrowse">Browse keywords</button>';
    let timer;
    $("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.shown = 50; renderResults(); }, 160); });
    $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#q").blur(); });
    $("#filtbtn").addEventListener("click", () => $("#filters").classList.toggle("hidden"));
    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "kwbrowse") return openSheet({ type: "keywords" });
      if (b.dataset.ci) { const c = b.dataset.ci; state.ci.has(c) ? state.ci.delete(c) : state.ci.add(c); b.classList.toggle("on"); }
      if (b.id === "legal") { state.legal = !state.legal; b.classList.toggle("on", state.legal); }
      if (b.id === "gc") { state.gc = !state.gc; b.classList.toggle("on", state.gc); }
      state.shown = 50; renderResults();
    });
    $("#type").addEventListener("change", (e) => { state.type = e.target.value; state.shown = 50; renderResults(); });
    $("#kwsel").addEventListener("change", (e) => { setKeyword(e.target.value); });
    $("#themesel").addEventListener("change", (e) => { state.theme = e.target.value; state.shown = 50; renderResults(); });
    $("#results").addEventListener("click", (e) => {
      if (e.target.closest("[data-more]")) { state.shown += 50; return renderResults(); }
      const r = e.target.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
      const d = e.target.closest("[data-card]"); if (d) openSheet({ type: "card", card: card(d.dataset.card) });
    });
  }
  function filterLabel() {
    const n = state.ci.size + (state.type ? 1 : 0) + (state.kw ? 1 : 0) + (state.theme ? 1 : 0) + (state.legal ? 1 : 0) + (state.gc ? 1 : 0);
    $("#filtbtn").textContent = n ? "Filters · " + n : "Filters";
    $("#filtbtn").classList.toggle("on", !!n);
  }
  function setKeyword(k) { state.kw = k; $("#kwsel").value = k; state.shown = 50; renderResults(); }
  function setTheme(k) { state.theme = k; $("#themesel").value = k; state.shown = 50; renderResults(); }
  // Text search plus kw:flying and theme:poison (use quotes or _ for spaces: kw:"first strike", kw:first_strike).
  function parseQuery(q) {
    const opt = {};
    q = q.replace(/\b(kw|keyword|theme):(?:"([^"]+)"|(\S+))/gi, (m, key, a, b) => { const v = (a || b).replace(/_/g, " ").toLowerCase(); if (/^theme$/i.test(key)) opt.theme = v; else opt.kw = v; return " "; });
    return { text: q, ...opt };
  }
  function filterCards(q, opt) {
    const pq = parseQuery(q);
    const kw = pq.kw || opt.kw, theme = THEMES[pq.theme || opt.theme];
    const terms = pq.text.toLowerCase().split(/\s+/).filter(Boolean);
    const inc = terms.filter((t) => !t.startsWith("-")), exc = terms.filter((t) => t.startsWith("-") && t.length > 1).map((t) => t.slice(1));
    const out = [];
    for (let i = 0; i < CARDS.length; i++) {
      const c = CARDS[i];
      if (opt.legal && c.s) continue;
      if (opt.gc && !c.g) continue;
      if (opt.type && !c.t.includes(opt.type)) continue;
      if (kw && !(c.k || []).includes(kw)) continue;
      if (theme && !theme[1](c)) continue;
      if (opt.ci && opt.ci.size) {
        const colors = [...opt.ci].filter((x) => x !== "C");
        if (!colors.length) { if (c.ci !== "") continue; } else if ([...c.ci].some((ch) => !opt.ci.has(ch))) continue;
      }
      if (opt.within != null && [...c.ci].some((ch) => !opt.within.includes(ch))) continue;
      const h = hay[i];
      if (inc.some((t) => !h.includes(t)) || exc.some((t) => h.includes(t))) continue;
      out.push(c);
    }
    const qq = inc.join(" ");
    if (qq) out.sort((a, b) => rank(a, qq) - rank(b, qq));
    return out;
  }
  function rank(c, q) { const n = c.n.toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3; }
  // The rules definition of a keyword, shown above its cards.
  function kwBox(k) {
    const num = CR.kw[k];
    if (!num) return '<div class="panel kwbox"><b>' + esc(title(k)) + '</b><div class="d">An ability word or keyword without its own rule. It has no rules meaning by itself; read each card.</div></div>';
    const sub = CR.order.find((n) => n.startsWith(num) && /^[a-z]$/.test(n.slice(num.length)));
    return '<div class="panel kwbox"><b>' + esc(title(k)) + "</b> " + ruleChip(num) + '<div class="d" style="margin-top:6px">' + linkRules(esc(sub ? CR.rules[sub].t : CR.rules[num].t)) + "</div></div>";
  }
  function renderResults() {
    const q = $("#q").value.trim();
    const el = $("#results");
    const pq = parseQuery(q);
    if (!q && !state.ci.size && !state.type && !state.gc && !state.kw && !state.theme) {
      $("#count").textContent = "";
      filterLabel();
      el.innerHTML = '<div class="empty"><div class="big">⌕</div>Search by name, type or rules text.<br>Try <b>landfall</b>, <b>kw:infect</b>, <b>theme:poison</b>, or <b>-creature sacrifice</b> to exclude words.</div>';
      return;
    }
    const out = filterCards(q, state);
    const kw = pq.kw || state.kw;
    filterLabel();
    $("#count").textContent = out.length.toLocaleString() + " card" + (out.length === 1 ? "" : "s");
    el.innerHTML = (kw ? kwBox(kw) : "") + out.slice(0, state.shown).map((c) => rowHTML(c)).join("") + (out.length > state.shown ? '<div class="chips"><button class="btn" data-more>Show more</button></div>' : "");
    hydrate(el);
    saveNav();
  }
  function keywordsView() {
    let h = '<div class="d" style="margin-bottom:6px">Tap a keyword to see every card that has it, with its rules definition. A keyword filter only finds cards that have the keyword, not cards that just mention it.</div>';
    h += '<section class="block"><h2>Themes</h2><div class="chips" style="padding-top:0">' + Object.entries(THEMES).map(([k, v]) => '<button class="chip" data-act="theme" data-v="' + k + '">' + esc(v[0]) + "</button>").join("") + "</div></section>";
    for (const [g, list] of Object.entries(KW_GROUPS)) {
      const have = list.filter((k) => KW.has(k));
      if (have.length) h += '<section class="block"><h2>' + esc(g) + '</h2><div class="chips" style="padding-top:0">' + have.map((k) => '<button class="chip" data-act="kw" data-v="' + esc(k) + '">' + esc(title(k)) + ' <span style="color:var(--mute)">' + KW.get(k).toLocaleString() + "</span></button>").join("") + "</div></section>";
    }
    h += '<section class="block"><h2>All keywords A–Z</h2><div class="chips" style="padding-top:0">' + [...KW.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => '<button class="chip" data-act="kw" data-v="' + esc(k) + '">' + esc(title(k)) + ' <span style="color:var(--mute)">' + n.toLocaleString() + "</span></button>").join("") + "</div></section>";
    return h;
  }

  // ---------- interact ----------
  const EXAMPLES = [["Elemental Teachings", "Abandoned Air Temple", "Toph, Earthbending Master"], ["Sheoldred, the Apocalypse", "Rhystic Study"], ["Nekusar, the Mindrazer", "Wheel of Fortune"]];
  function initInteract() {
    $("#pick").addEventListener("input", () => {
      const q = $("#pick").value.toLowerCase().trim();
      if (!q || q.includes("+")) { $("#sug").innerHTML = ""; return; }
      const m = CARDS.filter((c) => c.n.toLowerCase().includes(q) && !state.picked.includes(c.n)).sort((a, b) => rank(a, q) - rank(b, q)).slice(0, 7);
      $("#sug").innerHTML = m.length ? '<div class="panel sug">' + m.map((c) => '<div data-name="' + esc(c.n) + '">' + esc(c.n) + ' <span class="ty" style="color:var(--mute);font-size:13px">' + esc(c.t) + "</span></div>").join("") + "</div>" : "";
    });
    $("#sug").addEventListener("click", (e) => { const d = e.target.closest("[data-name]"); if (d) { addPicks([d.dataset.name]); $("#pick").value = ""; $("#sug").innerHTML = ""; } });
    const submit = () => {
      const raw = $("#pick").value.trim();
      if (!raw) return say("Type a card name first.", true);
      const names = [], missing = [];
      for (const part of raw.split(/\s*\+\s*|\s*;\s*|\n/).map((x) => x.trim()).filter(Boolean)) {
        const q = part.toLowerCase();
        const best = card(part) || CARDS.filter((c) => c.n.toLowerCase().includes(q)).sort((a, b) => rank(a, q) - rank(b, q))[0];
        if (best) names.push(best.n); else missing.push(part);
      }
      $("#pick").value = ""; $("#sug").innerHTML = "";
      addPicks(names);
      say((names.length ? "Added: " + names.join(", ") + ". " : "") + (missing.length ? "No card found for: " + missing.join(", ") + ". Check the spelling." : ""), !!missing.length);
    };
    $("#pick").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); $("#pick").blur(); } });
    $("#addbtn").addEventListener("click", submit);
    $("#carouselWrap").addEventListener("click", (e) => {
      const x = e.target.closest("[data-rm]"); if (x) { e.stopPropagation(); state.picked = state.picked.filter((n) => n !== x.dataset.rm); savePicks(); return; }
      if (e.target.closest(".addslot")) { $("#pick").focus(); return; }
      const ex = e.target.closest("[data-ex]"); if (ex) { state.picked = EXAMPLES[ex.dataset.ex].filter((n) => card(n)); savePicks(); return; }
      const c = e.target.closest("[data-card]"); if (c) openSheet({ type: "card", card: card(c.dataset.card) });
    });
    $("#analysis").addEventListener("click", (e) => {
      const r = e.target.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
      const c = e.target.closest("[data-card]"); if (c) openSheet({ type: "card", card: card(c.dataset.card) });
    });
  }
  function say(msg, bad) { const el = $("#pickmsg"); el.textContent = msg; el.style.color = bad ? "var(--bad)" : "var(--good)"; }
  function addPicks(names) { for (const n of names) if (!state.picked.includes(n)) state.picked.push(n); savePicks(); }
  function savePicks() { store.set("picked", state.picked); renderInteract(); }

  function frame(c) {
    return '<div class="mcard" data-card="' + esc(c.n) + '" style="--cc:' + artColor(c) + '"><button class="mc-x" data-rm="' + esc(c.n) + '" aria-label="Remove ' + esc(c.n) + '">✕</button>' +
      '<div class="mc-head"><b>' + esc(c.n) + "</b><span>" + mana(c.m || "") + '</span></div><div class="mc-art" data-img="' + esc(c.n) + '" data-kind="art" data-zoom="' + esc(c.n) + '"></div><div class="mc-type">' + esc(c.t) +
      '</div><div class="mc-text">' + mana(c.o).replace(/\n/g, "<br>") + "</div>" + (c.pt ? '<div class="mc-pt">' + esc(c.pt) + "</div>" : "") + "</div>";
  }
  function renderInteract() {
    const cards = state.picked.map(card).filter(Boolean);
    const wrap = $("#carouselWrap");
    if (!cards.length) {
      wrap.innerHTML = '<div class="empty"><div class="big">⧉</div>Add two or more cards to see how they interact.<div class="chips" style="justify-content:center;flex-wrap:wrap">' +
        EXAMPLES.map((e, i) => '<button class="chip" data-ex="' + i + '">' + esc(e.map((n) => n.split(",")[0]).join(" + ")) + "</button>").join("") + "</div></div>";
      $("#analysis").innerHTML = "";
      return;
    }
    wrap.innerHTML = '<div class="carousel" id="car">' + cards.map(frame).join("") + '<div class="addslot" aria-label="Add a card">+</div></div><div class="dots">' + cards.map(() => "<i></i>").join("") + "</div>";
    const car = $("#car");
    car.querySelectorAll(".mcard").forEach(tilt);
    car.addEventListener("scroll", () => requestAnimationFrame(updateCarousel), { passive: true });
    hydrate(wrap);
    requestAnimationFrame(updateCarousel);
    renderAnalysis();
  }
  function updateCarousel() {
    const car = $("#car"); if (!car) return;
    const mid = car.getBoundingClientRect().left + car.clientWidth / 2;
    let best = -1, bestD = 1e9;
    car.querySelectorAll(".mcard").forEach((el, i) => {
      const r = el.getBoundingClientRect(), o = (r.left + r.width / 2 - mid) / r.width;
      el.style.setProperty("--ry", Math.max(-26, Math.min(26, -o * 18)) + "deg");
      el.style.setProperty("--s", 1 - Math.min(Math.abs(o), 1.5) * 0.07);
      if (Math.abs(o) < bestD) { bestD = Math.abs(o); best = i; }
    });
    car.querySelectorAll(".mcard").forEach((el, i) => el.classList.toggle("focus", i === best));
    document.querySelectorAll(".dots i").forEach((d, i) => d.classList.toggle("on", i === best));
  }

  function renderAnalysis() {
    const cards = state.picked.map(card).filter(Boolean);
    const el = $("#analysis");
    if (!cards.length || !CR) { el.innerHTML = ""; return; }
    const r = MTGEngine.analyze(cards, { cr: CR, rulings: RULINGS });
    const words = MTGEngine.wording(cards, { cr: CR });
    let h = "";
    if (cards.length < 2) h += '<div class="panel item">Add a second card to see how they interact. Below is what this card\'s wording says.</div>';
    else h += '<div class="verdict"><small>Bottom line</small><p>' + MTGEngine.summary(r).map(esc).join("<br>") + "</p></div>";
    if (cards.length > 1) {
      h += '<section class="block"><h2>How they connect</h2>';
      h += r.connections.length ? r.connections.map((c) => '<div class="panel item"><div class="chain"><span class="n" data-card="' + esc(c.from) + '">' + esc(c.from) + '</span><span class="e' + (c.replacement ? " repl" : "") + '">→ ' + esc(c.eventLabel) + ' →</span><span class="n" data-card="' + esc(c.to) + '">' + esc(c.to) + "</span></div>" +
        '<div class="d" style="margin-top:8px">' + (c.replacement ? "A replacement effect: it changes the event as it happens and never uses the stack." : c.optional ? "An optional trigger: it goes on the stack, and its controller decides as it resolves." : "A trigger: it goes on the stack and can be responded to.") + "</div>" +
        '<div class="d" style="margin-top:6px">' + mana(c.src) + "<br>→ " + mana(c.dst) + '</div><div style="margin-top:8px">' + cites(c.cites) + "</div></div>").join("")
        : '<div class="panel item"><div class="d">No trigger or replacement links found in the wording. That does not prove they never interact, so check the wording notes below.</div></div>';
      h += "</section>";
    }
    if (words.length) h += '<section class="block"><h2>Said · not said</h2>' + words.map(wordItem).join("") + "</section>";
    if (r.loops.length) h += '<section class="block"><h2>Possible loops</h2>' + r.loops.map((l) => '<div class="panel item">' + l.chain.map(mana).join("<br>→ ") + '<div class="d" style="margin-top:6px">' + (l.optional ? "Has an optional step, so nobody is forced to keep going." : "Every step looks mandatory. A loop of only mandatory actions is a draw.") + '</div><div style="margin-top:8px">' + cites(l.cites) + "</div></div>").join("") + "</section>";
    if (r.layers.length) h += '<section class="block"><h2>Layers, if effects overlap</h2>' + r.layers.map((l) => '<div class="panel item"><b>' + esc(l.card) + "</b> · " + esc(l.why) + " " + ruleChip(l.rule) + '<div class="d">' + mana(l.text) + "</div></div>").join("") + "</section>";
    if (r.keywords.length) h += '<section class="block"><h2>Keywords, from the rules</h2><div class="chips" style="flex-wrap:wrap">' + r.keywords.map((k) => '<button class="chip rule" data-rule="' + k.rule + '">' + esc(k.card.split(",")[0]) + ": " + esc(k.keyword) + " → CR " + k.rule + "</button>").join("") + "</div></section>";
    if (r.rulingLinks.length) h += '<section class="block"><h2>Official rulings that mention both</h2>' + r.rulingLinks.map((x) => '<div class="panel item"><div class="d">' + esc(x.date) + " · on " + esc(x.about) + "</div>" + linkRules(mana(x.text)) + "</div>").join("") + "</section>";
    if (r.gotchas.length) h += '<section class="block"><h2>Watch out</h2>' + r.gotchas.map((g) => '<div class="panel item">' + esc(g.text) + '<div style="margin-top:8px">' + cites(g.cites) + "</div></div>").join("") + "</section>";
    h += '<div class="d" style="margin:18px 2px 0;color:var(--mute);font-size:13px">' + esc(r.confidence) + "</div>";
    el.innerHTML = h;
  }

  // ---------- decks ----------
  function initDecks() {
    $("#seg").addEventListener("click", (e) => { const b = e.target.closest("[data-pane]"); if (b) { state.pane = b.dataset.pane; showPane(); } });
    showPane();
    $("#pane-list").addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (a) {
        const act = a.dataset.act;
        if (act === "import") return doImport();
        if (act === "new") { state.deck = { commanders: [], cards: [] }; saveDeck(); return; }
        if (act === "replace") { state.deck = null; state.importNote = ""; saveDeck(); return; }
        if (act === "export") return doExport(a);
        if (act === "clear") { if (confirm("Clear this deck from this device?")) { state.deck = null; state.importNote = ""; saveDeck(); } return; }
      }
      const c = e.target.closest("[data-card]"); if (c) openSheet({ type: "card", card: card(c.dataset.card) });
    });
    let timer;
    $("#dq").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(renderDeckSearch, 160); });
    $("#dq").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#dq").blur(); });
    $("#pane-add").addEventListener("click", (e) => {
      const p = e.target.closest("[data-plus]"); if (p) { e.stopPropagation(); deckAdd(p.dataset.plus, 1); p.textContent = "Added"; p.disabled = true; return; }
      if (e.target.closest("[data-act=suggest]")) return runSuggest();
      const c = e.target.closest("[data-card]"); if (c) openSheet({ type: "card", card: card(c.dataset.card) });
    });
  }
  function showPane() {
    document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.pane === state.pane));
    $("#pane-list").classList.toggle("hidden", state.pane !== "list");
    $("#pane-add").classList.toggle("hidden", state.pane !== "add");
    if (state.pane === "add") { renderDeckSearch(); renderSuggest(); }
  }
  function saveDeck() { store.set("deck", state.deck); state.suggestions = null; renderDeck(); if (state.pane === "add") { renderDeckSearch(); renderSuggest(); } }
  function deckAdd(name, d) {
    if (!state.deck) state.deck = { commanders: [], cards: [] };
    const dk = state.deck;
    if (d < 0 && dk.commanders.includes(name)) dk.commanders = dk.commanders.filter((n) => n !== name);
    else {
      const x = dk.cards.find((y) => y.n === name);
      if (x) { x.q += d; if (x.q <= 0) dk.cards = dk.cards.filter((y) => y !== x); } else if (d > 0) dk.cards.push({ n: name, q: d });
    }
    saveDeck();
  }
  function setCommander(name) {
    if (!state.deck) state.deck = { commanders: [], cards: [] };
    const dk = state.deck;
    dk.cards = dk.cards.filter((x) => x.n !== name);
    if (!dk.commanders.includes(name)) dk.commanders = dk.commanders.length && /partner|background|friends forever/i.test((card(name) || {}).o || "") ? dk.commanders.concat(name).slice(-2) : [name];
    saveDeck();
  }
  function doImport() {
    const text = $("#deckText").value;
    if (!text.trim()) return;
    const parsed = MTGDeck.parse(text, card);
    if (!parsed.commanders.length) {
      const leg = parsed.cards.find((x) => { const c = card(x.n); return c && /Legendary/.test(c.t) && /Creature/.test(c.t); });
      if (leg && parsed.cards.length > 90) { parsed.commanders.push(leg.n); parsed.cards = parsed.cards.filter((x) => x !== leg); parsed.guessed = leg.n; }
    }
    state.deck = { commanders: parsed.commanders, cards: parsed.cards };
    state.importNote = (parsed.unknown.length ? "Not found (" + parsed.unknown.length + "): " + parsed.unknown.slice(0, 8).join("; ") + (parsed.unknown.length > 8 ? "…" : "") + ". " : "") +
      (parsed.guessed ? "No commander was marked, so I picked " + parsed.guessed + ". Open any legendary creature and tap Make commander to change it. " : "") +
      (parsed.skipped ? parsed.skipped + " sideboard or maybeboard cards were skipped." : "");
    saveDeck();
  }
  function doExport(btn) {
    const text = MTGDeck.exportText(state.deck);
    const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy list"), 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt("Copy your list:", text)); else prompt("Copy your list:", text);
  }
  function renderDeck() {
    const el = $("#pane-list");
    const dk = state.deck;
    if (!dk) {
      el.innerHTML = '<section class="block" style="margin-top:14px"><h2>Import a deck</h2><div class="panel item"><div class="d" style="margin-bottom:10px">Paste a list from Moxfield (Export → Text), Archidekt (Export → Text) or any “1 Card Name” list. Mark the commander with a “Commander” heading or *CMDR*.</div>' +
        '<textarea id="deckText" placeholder="Commander&#10;1 Toph, Earthbending Master&#10;&#10;Deck&#10;1 Sol Ring&#10;1 Cultivate&#10;30 Forest"></textarea><div class="chips"><button class="btn primary" data-act="import">Import</button><button class="btn" data-act="new">Start empty</button></div></div></section>';
      return;
    }
    const chk = MTGDeck.check(dk, card);
    const cmd = dk.commanders.map(card).filter(Boolean);
    const lead = cmd[0];
    let h = '<div class="panel dhead" style="margin-top:14px">' + (lead ? '<div class="art" style="--cc:' + artColor(lead) + '" data-img="' + esc(lead.n) + '" data-kind="art" data-zoom="' + esc(lead.n) + '"></div>' : '<div class="art" style="--cc:#444"></div>') +
      "<div><h3>" + (cmd.length ? cmd.map((c) => esc(c.n)).join(" + ") : "No commander yet") + '</h3><div class="d">' + (chk.identity ? mana([...chk.identity].map((x) => "{" + x + "}").join("")) + " identity" : "Open a legendary creature and tap Make commander") + "</div></div></div>";
    h += '<div class="stats"><div class="panel stat"><b' + (chk.total !== 100 ? ' style="color:var(--warn)"' : "") + ">" + chk.total + "</b><span>of 100 cards</span></div>" +
      '<div class="panel stat"><b>' + chk.avg + '</b><span>avg mana value</span></div><div class="panel stat"><b>' + chk.gameChangers.length + "</b><span>Game Changers</span></div></div>";
    const warn = [];
    if (state.importNote) warn.push(esc(state.importNote));
    if (chk.offColor.length) warn.push("Outside your commander's colors: " + chk.offColor.map(esc).join(", ") + ' <a class="rl" data-rule="903.5c">903.5c</a>');
    if (chk.duplicates.length) warn.push("More than one copy: " + chk.duplicates.map(esc).join(", ") + ' <a class="rl" data-rule="903.5b">903.5b</a>');
    if (chk.banned.length) warn.push("Banned in Commander: " + chk.banned.map(esc).join(", "));
    if (chk.gameChangers.length) warn.push("Game Changers (" + chk.gameChangers.length + "): " + chk.gameChangers.map(esc).join(", "));
    if (warn.length) h += '<section class="block"><h2>Check</h2>' + warn.map((w) => '<div class="panel item warnline">' + w + "</div>").join("") + "</section>";
    const max = Math.max(1, ...chk.curve);
    h += '<section class="block"><h2>Mana curve</h2><div class="panel"><div class="curve">' + chk.curve.map((n) => '<div style="height:' + Math.round((n / max) * 100) + '%"><span>' + (n || "") + "</span></div>").join("") +
      '</div><div class="curvel">' + ["0", "1", "2", "3", "4", "5", "6", "7+"].map((x) => "<span>" + x + "</span>").join("") + "</div></div></section>";
    const groups = {};
    for (const x of dk.cards) { const c = card(x.n); if (!c) continue; const t = MTGDeck.mainType(c.t); (groups[t] = groups[t] || []).push([x, c]); }
    for (const t of MTGDeck.TYPE_ORDER.concat("Other")) {
      const g = groups[t]; if (!g) continue;
      g.sort((a, b) => MTGDeck.manaValue(a[1].m) - MTGDeck.manaValue(b[1].m) || a[1].n.localeCompare(b[1].n));
      h += '<div class="grp">' + t + " · " + g.reduce((s, [x]) => s + x.q, 0) + "</div>" + g.map(([x, c]) => {
        const bad = chk.offColor.includes(c.n) || chk.duplicates.includes(c.n) || c.s === "banned";
        return '<div class="panel row" data-card="' + esc(c.n) + '"' + (bad ? ' style="border-color:rgba(224,162,74,.45)"' : "") + '><div class="thumb" style="--cc:' + artColor(c) + '" data-img="' + esc(c.n) + '" data-kind="art" data-zoom="' + esc(c.n) + '"></div><div class="body"><h4>' + (x.q > 1 ? '<span class="qty">' + x.q + "×</span>" : "") + esc(c.n) + " " + (c.m ? mana(c.m) : "") + flags(c) + '</h4><div class="ty">' + esc(c.t) + "</div></div></div>";
      }).join("");
    }
    if (!dk.cards.length) h += '<div class="empty">Empty deck. Switch to <b>Add cards</b> to search, or open any card and tap Add to deck.</div>';
    h += '<div class="chips" style="flex-wrap:wrap;margin-top:16px"><button class="btn small" data-act="export">Copy list</button><button class="btn small" data-act="replace">Import another</button><button class="btn small" data-act="clear">Clear deck</button></div>';
    el.innerHTML = h;
    hydrate(el);
  }
  function deckIdentity() {
    const dk = state.deck; if (!dk || !dk.commanders.length) return null;
    return dk.commanders.map(card).filter(Boolean).map((c) => c.ci).join("");
  }
  function renderDeckSearch() {
    const q = $("#dq").value.trim(), el = $("#dresults"), within = deckIdentity();
    $("#dq").placeholder = within != null ? "Search within " + (within || "colorless") + " · Commander legal" : "Search Commander-legal cards";
    if (!q) { $("#dcount").textContent = ""; el.innerHTML = ""; return; }
    const out = filterCards(q, { legal: true, within });
    $("#dcount").textContent = out.length.toLocaleString() + " card" + (out.length === 1 ? "" : "s") + (within != null ? " in your colors" : "");
    const inDeck = new Set(state.deck ? state.deck.cards.map((x) => x.n).concat(state.deck.commanders) : []);
    el.innerHTML = out.slice(0, 40).map((c) => rowHTML(c, '<button class="btn small act" data-plus="' + esc(c.n) + '"' + (inDeck.has(c.n) && !/\bBasic\b/.test(c.t) ? " disabled>In deck" : ">+ Add") + "</button>")).join("");
    hydrate(el);
  }
  function renderSuggest() {
    const el = $("#suggest");
    if (!state.deck || (!state.deck.cards.length && !state.deck.commanders.length)) { el.innerHTML = '<div class="panel item"><div class="d">Import or start a deck first. Suggestions read your list and look for cards that trigger on what your deck does, or do what your deck triggers on.</div></div>'; return; }
    if (!state.suggestions) { el.innerHTML = '<div class="panel item"><div class="d">Reads your list for what it does (lands entering, drawing, tokens, counters…) and finds cards in your colors that use it. Based on card wording only, not popularity.</div><div class="chips"><button class="btn primary small" data-act="suggest">Find suggestions</button></div></div>'; return; }
    const s = state.suggestions;
    const inDeck = new Set(state.deck.cards.map((x) => x.n));
    el.innerHTML = s.items.length ? s.items.map((x) => { const c = card(x.n); return c ? rowHTML(c, '<button class="btn small act" data-plus="' + esc(c.n) + '"' + (inDeck.has(c.n) ? " disabled>In deck" : ">+ Add") + "</button>", x.why) : ""; }).join("")
      : '<div class="panel item"><div class="d">No clear synergies found in the wording yet. Add more cards and try again.</div></div>';
    hydrate(el);
  }
  function runSuggest() {
    $("#suggest").innerHTML = '<div class="panel item"><div class="d">Reading your deck…</div></div>';
    setTimeout(() => { state.suggestions = MTGDeck.suggest(state.deck, CARDS, card, MTGEngine, anCache, { limit: 30 }); renderSuggest(); }, 30);
  }

  // ---------- sets timeline ----------
  const SETS = { data: null, loading: false, f: { kinds: new Set(["main", "commander", "secret", "reprint", "jumpstart", "draft", "other"]), ci: new Set(), type: "", mv: "", rar: new Set(), hidden: false } };
  const KINDS = { main: "Main", commander: "Commander", secret: "Secret Lair", reprint: "Reprint", jumpstart: "Jumpstart", draft: "Horizons & draft", other: "Other" };
  const RAR = ["L", "C", "U", "R", "M", "S"], RAR_NAME = ["Basic", "Common", "Uncommon", "Rare", "Mythic", "Special"];
  const TODAY = new Date().toISOString().slice(0, 10);
  const symbol = (code) => '<div class="sym"><img loading="lazy" alt="" src="https://svgs.scryfall.io/sets/' + esc(code) + '.svg" onerror="this.style.display=\'none\'"></div>';
  let MV = null;
  function ensureSets() {
    if (!SETS.promise) SETS.promise = loadSets();
    return SETS.promise;
  }
  async function loadSets() {
    try {
      const [sets, setcards, precons] = await Promise.all(["sets", "setcards", "precons"].map((f) => fetch("data/" + f + ".json").then((x) => x.json())));
      const precBySet = new Map();
      precons.forEach((p, i) => { p.i = i; if (p.y === "cmd") { if (!precBySet.has(p.s)) precBySet.set(p.s, []); precBySet.get(p.s).push(p); } });
      SETS.data = { sets, setcards, precons, precBySet, byCode: new Map(sets.map((s) => [s.c, s])) };
      MV = CARDS.map((c) => MTGDeck.manaValue(c.m));
      initSetFilters(); renderTimeline();
    } catch (e) { $("#timeline").innerHTML = '<div class="panel item">Could not load the set data.</div>'; SETS.promise = null; }
  }
  function initSetFilters() {
    const f = SETS.f;
    $("#setfilters").innerHTML = '<button class="chip" id="sfbtn">Filters</button><div class="chips hidden" id="sfbody" style="width:100%">' + Object.entries(KINDS).map(([k, v]) => '<button class="chip on" data-kind="' + k + '">' + v + "</button>").join("") +
      ["W", "U", "B", "R", "G", "C"].map((c) => '<button class="chip" data-ci="' + c + '" aria-label="' + c + '"><i class="ms ' + c + '">' + c + "</i></button>").join("") +
      '<select class="sel" id="stype"><option value="">Any type</option>' + MTGDeck.TYPE_ORDER.concat("Legendary").map((t) => "<option>" + t + "</option>").join("") + "</select>" +
      '<select class="sel" id="smv"><option value="">Any mana value</option>' + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => '<option value="' + n + '">MV ' + (n === 7 ? "7+" : n) + "</option>").join("") + "</select>" +
      RAR.slice(1, 5).map((r, i) => '<button class="chip" data-rar="' + (i + 1) + '">' + RAR_NAME[i + 1] + "</button>").join("") +
      '<button class="chip" id="shidden">Promos &amp; extras</button></div>';
    $("#setfilters").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "sfbtn") { $("#sfbody").classList.toggle("hidden"); return; }
      if (b.dataset.kind) { const k = b.dataset.kind; f.kinds.has(k) ? f.kinds.delete(k) : f.kinds.add(k); b.classList.toggle("on", f.kinds.has(k)); }
      if (b.dataset.ci) { const c = b.dataset.ci; f.ci.has(c) ? f.ci.delete(c) : f.ci.add(c); b.classList.toggle("on", f.ci.has(c)); }
      if (b.dataset.rar) { const r = +b.dataset.rar; f.rar.has(r) ? f.rar.delete(r) : f.rar.add(r); b.classList.toggle("on", f.rar.has(r)); }
      if (b.id === "shidden") { f.hidden = !f.hidden; b.classList.toggle("on", f.hidden); }
      renderTimeline();
    });
    $("#stype").addEventListener("change", (e) => { f.type = e.target.value; renderTimeline(); });
    $("#smv").addEventListener("change", (e) => { f.mv = e.target.value; renderTimeline(); });
    $("#timeline").addEventListener("click", (e) => {
      const s = e.target.closest("[data-set]"); if (s) return openSheet({ type: "set", code: s.dataset.set, view: store.get("gridview", "grid") });
      const y = e.target.closest("[data-sld]"); if (y) openSheet({ type: "sld", year: y.dataset.sld });
    });
  }
  const filterOn = () => { const f = SETS.f; return !!(f.ci.size || f.type || f.mv !== "" || f.rar.size); };
  function matches(i, r) {
    const f = SETS.f, c = CARDS[i];
    if (f.rar.size && !f.rar.has(r)) return false;
    if (f.type && !c.t.includes(f.type)) return false;
    if (f.mv !== "" && (+f.mv === 7 ? MV[i] < 7 : MV[i] !== +f.mv)) return false;
    if (f.ci.size) {
      const colors = [...f.ci].filter((x) => x !== "C");
      if (!colors.length) { if (c.ci !== "") return false; } else if ([...c.ci].some((ch) => !f.ci.has(ch))) return false;
    }
    return true;
  }
  function renderTimeline() {
    const D = SETS.data, f = SETS.f, on = filterOn();
    const active = f.ci.size + f.rar.size + (f.type ? 1 : 0) + (f.mv !== "" ? 1 : 0) + (7 - f.kinds.size) + (f.hidden ? 1 : 0);
    $("#sfbtn").textContent = active ? "Filters · " + active + " on" : "Filters";
    $("#sfbtn").classList.toggle("on", !!active);
    const items = D.sets.filter((s) => (!s.h || f.hidden) && f.kinds.has(s.k)).map((s) => ({ ...s, set: true }));
    if (f.kinds.has("secret")) {   // Secret Lair drops are grouped by year
      const byYear = new Map();
      for (const p of D.precons) if (p.y === "sld") { const y = p.d.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(p); }
      for (const [y, drops] of byYear) items.push({ sld: y, d: drops[0].d, n: "Secret Lair drops", k: "secret", drops, t: drops.reduce((a, p) => a + (p.main || []).reduce((b, r) => b + r[0], 0), 0) });
    }
    items.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
    let h = "", year = null, shown = 0;
    const groups = new Map();
    for (const it of items) {
      if (on) it.m = it.set ? D.setcards[it.c].reduce((a, [i, , r]) => a + (matches(i, r) ? 1 : 0), 0) : it.drops.reduce((a, p) => a + (p.main || []).filter((r) => matches(r[1], 3)).length, 0);
      const y = (it.d || "????").slice(0, 4);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(it);
    }
    for (const [y, list] of groups) {
      const cmdCount = list.filter((s) => s.k === "commander" || s.cm).length;
      h += '<div class="year"><b>' + esc(y) + "</b><span>" + list.length + " release" + (list.length === 1 ? "" : "s") + (cmdCount ? " · " + cmdCount + " with Commander decks" : "") + "</span></div>";
      for (const it of list) {
        shown++;
        const decks = it.set ? (D.precBySet.get(it.k === "commander" ? it.c : it.cm) || []).length : 0;
        const cls = "panel set k-" + it.k + (it.cm ? " hascm" : "") + (on && !it.m ? " dim" : "");
        const tags = (it.set && it.d > TODAY ? '<span class="ktag up">Upcoming</span>' : "") + (decks ? '<span class="ktag cmd">Commander ×' + decks + "</span>" : "") + (it.k !== "main" && it.k !== "commander" ? '<span class="ktag">' + esc(KINDS[it.k]) + "</span>" : "");
        h += '<div class="' + cls + '" ' + (it.set ? 'data-set="' + esc(it.c) + '"' : 'data-sld="' + esc(it.sld) + '"') + ">" + symbol(it.set ? it.c : "sld") +
          '<div class="body"><h4>' + esc(it.n) + tags + '</h4><div class="ty">' + esc(it.d) + (it.set ? " · " + esc(it.c.toUpperCase()) : " · " + it.drops.length + " drops") + "</div></div>" +
          '<div class="n">' + (on ? "<b>" + it.m + "</b>of " + it.t : "<b>" + it.t + "</b>cards") + "</div></div>";
      }
    }
    $("#timeline").innerHTML = shown ? h : '<div class="empty">No releases match these filters.</div>';
  }
  function sortRows(rows, how) {
    const ty = (c) => { const t = MTGDeck.mainType(c.t); const i = MTGDeck.TYPE_ORDER.indexOf(t); return i < 0 ? 99 : i; };
    const col = (c) => (c.ci.length > 1 ? 10 : c.ci === "" ? 11 : "WUBRG".indexOf(c.ci));
    const by = { name: (a, b) => a.c.n.localeCompare(b.c.n), type: (a, b) => ty(a.c) - ty(b.c) || a.c.n.localeCompare(b.c.n), mv: (a, b) => MTGDeck.manaValue(a.c.m) - MTGDeck.manaValue(b.c.m) || a.c.n.localeCompare(b.c.n),
      color: (a, b) => col(a.c) - col(b.c) || a.c.n.localeCompare(b.c.n) }[how];
    return by ? rows.slice().sort(by) : rows;
  }
  function cardsBlock(v, rows) {
    const sortSel = '<select class="sel" data-act="ssort">' + [["num", v.type === "set" ? "Collector #" : "Deck order"], ["name", "Name"], ["type", "Card type"], ["mv", "Mana value"], ["color", "Color"]].map(([k, l]) => '<option value="' + k + '"' + ((v.sort || "num") === k ? " selected" : "") + ">" + l + "</option>").join("") + "</select>";
    let h = '<div class="pctl"><button class="chip' + (v.view !== "list" ? " on" : "") + '" data-act="view" data-v="grid">Grid</button><button class="chip' + (v.view === "list" ? " on" : "") + '" data-act="view" data-v="list">List</button>' + sortSel +
      (v.type === "set" && filterOn() ? '<button class="chip' + (v.all ? "" : " on") + '" data-act="match">Only matching filters</button>' : "") + "</div>";
    rows = sortRows(rows, v.sort);
    const lim = v.limit || 90, part = rows.slice(0, lim);
    h += v.view === "list" ? '<div style="margin-top:10px">' + part.map((r) => rowHTML(r.c, r.q > 1 ? '<span class="qty" style="align-self:center">' + r.q + "×</span>" : "")).join("") + "</div>"
      : '<div class="cgrid">' + part.map((r) => '<div class="ctile" data-card="' + esc(r.c.n) + '" data-print="' + esc(r.set + "/" + r.num) + '">' + (r.q > 1 ? '<b class="q">' + r.q + "×</b>" : "") + "<span>" + esc(r.c.n) + "</span></div>").join("") + "</div>";
    if (rows.length > lim) h += '<div class="chips"><button class="btn" data-act="more">Show more (' + (rows.length - lim) + " left)</button></div>";
    return h;
  }
  function deckTile(p) {
    const lead = p.cmd ? CARDS[p.cmd[0][1]] : CARDS[(p.main || [[0, 0]])[0][1]];
    const ci = p.cmd ? [...new Set(p.cmd.flatMap((r) => [...CARDS[r[1]].ci]))].join("") : "";
    const n = (p.cmd || []).length + (p.main || []).reduce((a, r) => a + r[0], 0);
    return '<div class="panel decktile" data-deck="' + p.i + '"><div class="thumb" style="--cc:' + artColor(lead) + '" data-img="' + esc(lead.n) + '" data-kind="art"></div><div class="body"><h4 style="margin:0">' + esc(p.n) + "</h4>" +
      '<div class="ty" style="color:var(--mute);font-size:13px">' + (p.cmd ? esc(p.cmd.map((r) => CARDS[r[1]].n).join(" + ")) + " · " + (mana([...ci].map((x) => "{" + x + "}").join("")) || "colorless") + " · " : "") + n + " cards · " + esc(p.d) + "</div></div></div>";
  }
  function setView(v) {
    const D = SETS.data, s = D.byCode.get(v.code);
    v.view = v.view || store.get("gridview", "grid");
    const decks = D.precBySet.get(s.k === "commander" ? s.c : s.cm) || [];
    let h = '<div class="panel set k-' + s.k + (s.cm ? " hascm" : "") + '" style="cursor:default">' + symbol(s.c) + '<div class="body"><h4>' + esc(s.n) + '</h4><div class="ty">' + esc(s.d) + " · " + esc(s.c.toUpperCase()) + " · " + esc(KINDS[s.k]) + (s.d > TODAY ? " · upcoming" : "") + '</div></div><div class="n"><b>' + s.t + "</b>cards</div></div>";
    if (decks.length) h += '<section class="block"><h2>Commander decks · ' + decks.length + "</h2>" + decks.map(deckTile).join("") + "</section>";
    let rows = D.setcards[s.c].map(([i, num, r]) => ({ c: CARDS[i], i, set: s.c, num, r, q: 1 }));
    if (filterOn() && !v.all) rows = rows.filter((x) => matches(x.i, x.r));
    h += '<section class="block"><h2>Cards · ' + rows.length + "</h2>" + cardsBlock(v, rows) + "</section>";
    return h;
  }
  function sldView(v) {
    const drops = SETS.data.precons.filter((p) => p.y === "sld" && p.d.startsWith(v.year));
    return '<div class="d" style="margin-bottom:10px">' + drops.length + " Secret Lair drops released in " + esc(v.year) + ". Tap a drop to see its cards and value.</div>" + drops.map(deckTile).join("");
  }
  function deckRows(p) { return (p.cmd || []).map((r) => ({ q: r[0], c: CARDS[r[1]], set: r[2], num: r[3], cmd: true })).concat((p.main || []).map((r) => ({ q: r[0], c: CARDS[r[1]], set: r[2], num: r[3] }))); }
  function deckView(v) {
    const p = SETS.data.precons[v.i];
    v.view = v.view || store.get("gridview", "grid");
    const rows = deckRows(p);
    let h = deckTile(p).replace('data-deck="' + p.i + '"', 'style="cursor:default"');
    h += '<div class="panel item" id="dval"><div class="d">Adding up prices…</div></div>';
    if (p.y === "cmd") h += '<div class="chips"><button class="btn primary small" data-act="copydeck">Copy to Decks</button></div>';
    if (p.cmd) h += '<section class="block"><h2>Commander</h2><div class="cgrid">' + rows.filter((r) => r.cmd).map((r) => '<div class="ctile" data-card="' + esc(r.c.n) + '" data-print="' + esc(r.set + "/" + r.num) + '"><span>' + esc(r.c.n) + "</span></div>").join("") + "</div></section>";
    h += '<section class="block"><h2>' + (p.cmd ? "The 99" : "Cards") + "</h2>" + cardsBlock(v, rows.filter((r) => !r.cmd)) + "</section>";
    return h;
  }
  function deckValue(v) {
    const p = SETS.data.precons[v.i], rows = deckRows(p);
    let done = 0, total = 0, priced = 0;
    for (const r of rows) Scry.getPrint(r.set, r.num, (x) => {
      done++;
      const usd = x && (x.prices.usd || x.prices.usd_foil || x.prices.usd_etched);
      if (usd) { total += +usd * r.q; priced++; }
      if (done === rows.length) {
        const el = $("#dval"); if (!el || stack[stack.length - 1] !== v) return;
        el.innerHTML = priced ? '<b style="font-size:20px;color:var(--ember-hi)">≈ ' + money(total) + '</b> <span class="d">market value of these exact printings · ' + priced + " of " + rows.length + " cards priced · Scryfall, updated daily</span>" : '<div class="d">No prices available' + (Scry.state.enabled ? "." : ": turn on card images in Settings.") + "</div>";
      }
    });
  }
  function copyPrecon(i) {
    const p = SETS.data.precons[i];
    if (state.deck && (state.deck.cards.length || state.deck.commanders.length) && !confirm("Replace the deck in Decks with " + p.n + "?")) return;
    const cards = [];
    for (const r of p.main || []) { const n = CARDS[r[1]].n, x = cards.find((y) => y.n === n); if (x) x.q += r[0]; else cards.push({ n, q: r[0] }); }
    state.deck = { commanders: (p.cmd || []).map((r) => CARDS[r[1]].n), cards };
    state.importNote = "Copied from the " + p.n + " precon (" + p.sn + ").";
    saveDeck(); leaveSheets(); showTab("decks");
  }

  // ---------- rules ----------
  const PARTS = { 1: "Game Concepts", 2: "Parts of a Card", 3: "Card Types", 4: "Zones", 5: "Turn Structure", 6: "Spells, Abilities, and Effects", 7: "Additional Rules", 8: "Multiplayer Rules", 9: "Casual Variants" };
  function initRules() {
    let timer;
    $("#rq").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(rulesSearch, 160); });
    $("#rq").addEventListener("keydown", (e) => { if (e.key === "Enter") { rulesSearch(); $("#rq").blur(); } });
    $("#rresults").addEventListener("click", (e) => {
      const r = e.target.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
      const g = e.target.closest("[data-gloss]"); if (g) openSheet({ type: "rule", rule: "gloss:" + g.dataset.gloss });
    });
  }
  function rulesSearch() {
    const q = $("#rq").value.trim().toLowerCase(), el = $("#rresults");
    if (!q) {
      el.innerHTML = Object.keys(PARTS).map((p) => '<section class="block"><h2>' + p + " · " + PARTS[p] + '</h2><div class="chips" style="flex-wrap:wrap;padding-top:0">' +
        CR.order.filter((n) => /^\d{3}$/.test(n) && n[0] === p).map((n) => '<button class="chip" data-rule="' + n + '"><b style="color:var(--ember-hi)">' + n + "</b> " + esc(CR.rules[n].t) + "</button>").join("") + "</div></section>").join("");
      return;
    }
    if (/^\d{3}(\.\d+[a-z]?)?$/.test(q) && CR.rules[q]) { openSheet({ type: "rule", rule: q }); return; }
    const terms = q.split(/\s+/);
    const gl = Object.keys(CR.glossary).filter((k) => terms.every((t) => k.toLowerCase().includes(t))).slice(0, 8);
    const hits = [];
    for (const n of CR.order) { const t = CR.rules[n].t.toLowerCase(); if (terms.every((x) => t.includes(x))) { hits.push(n); if (hits.length >= 40) break; } }
    el.innerHTML = (gl.length ? '<section class="block"><h2>Glossary</h2>' + gl.map((k) => '<div class="panel row" data-gloss="' + esc(k) + '"><div class="body"><h4>' + esc(k) + '</h4><div class="tx">' + esc(CR.glossary[k].replace(/\u2028/g, " ")) + "</div></div></div>").join("") + "</section>" : "") +
      '<section class="block"><h2>Rules</h2>' + (hits.length ? hits.map((n) => '<div class="panel row" data-rule="' + n + '"><div class="body"><h4 style="color:var(--ember-hi)">' + n + '</h4><div class="tx">' + esc(snippet(CR.rules[n].t, terms[0])) + "</div></div></div>").join("") : '<div class="d">No rules match.</div>') + "</section>";
  }
  function snippet(t, term) { const i = t.toLowerCase().indexOf(term); const s = Math.max(0, i - 60); return (s ? "…" : "") + t.slice(s, s + 220) + (t.length > s + 220 ? "…" : ""); }

  load();
})();

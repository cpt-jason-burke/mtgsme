(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage can be blocked */ } },
  };

  let CARDS = [], CR = null, RULINGS = null, byName = new Map(), hay = [];
  const state = { ci: new Set(), type: "", legal: false, gc: false, shown: 60, picked: store.get("picked", []) };

  // ---------- text helpers ----------
  function mana(s) {
    return esc(s).replace(/\{([^}]+)\}/g, (m, x) => {
      x = x.toUpperCase();
      const c = /^[WUBRGC]$/.test(x) ? x : "";
      return '<span class="ms ' + c + '">' + esc(x.replace("/", "")) + "</span>";
    });
  }
  function linkRules(html) {
    return html.replace(/\b(rules?\s+)?(\d{3}(?:\.\d+[a-z]?)?)\b/g, (m, pre, num) => {
      if (!CR || !CR.rules[num] || (!pre && !num.includes("."))) return m;
      return (pre || "") + '<a class="rl" data-rule="' + num + '">' + num + "</a>";
    });
  }
  const ruleChip = (n) => '<button class="chip rule" data-rule="' + esc(n) + '">CR ' + esc(n) + "</button>";

  // ---------- loading ----------
  async function load() {
    const status = $("#status");
    status.textContent = "loading…";
    try {
      const [c, r] = await Promise.all([fetch("data/cards.json").then((x) => x.json()), fetch("data/cr.json").then((x) => x.json())]);
      CARDS = c; CR = r;
      CARDS.forEach((card, i) => { byName.set(card.n.toLowerCase(), card); hay[i] = (card.n + " " + card.t + " " + card.o).toLowerCase(); });
      status.textContent = CARDS.length.toLocaleString() + " cards · CR " + CR.effective;
      initSearch(); initInteract(); initRules(); initAbout(); renderResults(); renderPicked(); analyzePicked();
      fetch("data/rulings.json").then((x) => x.json()).then((j) => { RULINGS = j; analyzePicked(); }).catch(() => {});
    } catch (e) {
      status.textContent = "";
      $("#results").innerHTML = '<div class="note">Could not load the data files. Open this page from its web address instead of as a saved file.</div>';
    }
  }

  // ---------- tabs ----------
  function showTab(t) {
    document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    ["search", "interact", "rules", "about"].forEach((x) => $("#tab-" + x).classList.toggle("hidden", x !== t));
    store.set("tab", t);
  }
  document.querySelectorAll("nav [data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  showTab(store.get("tab", "search"));

  // ---------- sheet (card and rule viewer with back history) ----------
  const sheetStack = [];
  function openSheet(view) { sheetStack.push(view); drawSheet(); }
  function closeSheet() { sheetStack.length = 0; $("#sheet-root").innerHTML = ""; }
  function drawSheet() {
    const v = sheetStack[sheetStack.length - 1];
    if (!v) return closeSheet();
    const body = v.type === "card" ? cardView(v.card) : ruleView(v.rule);
    $("#sheet-root").innerHTML = '<div class="sheet-bg"><div class="sheet"><div class="sheet-top">' +
      (sheetStack.length > 1 ? '<button class="btn" data-act="back">Back</button>' : "") +
      '<div class="t">' + esc(v.type === "card" ? v.card.n : v.rule.startsWith("gloss:") ? "Glossary" : "Rule " + v.rule) + '</div><button class="btn" data-act="close">Close</button></div>' + body + "</div></div>";
  }
  $("#sheet-root").addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList.contains("sheet-bg")) return closeSheet();
    const act = t.closest("[data-act]");
    if (act && act.dataset.act === "close") return closeSheet();
    if (act && act.dataset.act === "back") { sheetStack.pop(); return drawSheet(); }
    if (act && act.dataset.act === "add") { addPick(act.dataset.name); closeSheet(); showTab("interact"); return; }
    const r = t.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
    const cd = t.closest("[data-card]"); if (cd) return openSheet({ type: "card", card: byName.get(cd.dataset.card.toLowerCase()) });
    const g = t.closest("[data-gloss]"); if (g) return openSheet({ type: "rule", rule: "gloss:" + g.dataset.gloss });
  });

  function cardBlock(c, big) {
    const flags = (c.s ? '<span class="badge ' + (c.s === "banned" ? "bad" : "warn") + '">' + esc(c.s.replace(/_/g, " ")) + "</span>" : '<span class="badge good">Commander legal</span>') +
      (c.g ? '<span class="badge warn">Game Changer</span>' : "");
    return "<h3>" + esc(c.n) + " " + (c.m ? mana(c.m) : "") + flags + "</h3>" +
      '<div class="sub">' + esc(c.t) + (c.pt ? " · " + esc(c.pt) : "") + (c.ly ? " · loyalty/defense " + esc(c.ly) : "") + " · identity " + (esc(c.ci) || "colorless") + (c.f ? " · faces: " + esc(c.f.join(" // ")) : "") + "</div>" +
      '<div class="oracle">' + linkRules(mana(c.o)) + "</div>";
  }
  function cardView(c) {
    let h = '<div class="card">' + cardBlock(c) + "</div>";
    h += '<div class="row"><button class="btn primary" data-act="add" data-name="' + esc(c.n) + '">Add to Interact</button></div>';
    if (c.k && c.k.length) {
      h += "<h2>Keywords</h2><div class=\"row\">" + c.k.map((k) => {
        const n = CR.kw[k.toLowerCase()];
        return n ? '<button class="chip rule" data-rule="' + n + '">' + esc(k) + " → CR " + n + "</button>" : '<span class="chip">' + esc(k) + "</span>";
      }).join("") + "</div>";
    }
    h += "<h2>Official rulings</h2>";
    if (!RULINGS) h += '<div class="sub">Rulings are still loading…</div>';
    else {
      const list = (RULINGS.by[c.n] || []).slice().sort((a, b) => (a[0] < b[0] ? 1 : -1));
      h += list.length ? '<ul class="clean">' + list.map(([d, i]) => '<li><span class="sub">' + esc(d) + "</span><br>" + linkRules(mana(RULINGS.texts[i])) + "</li>").join("") + "</ul>" : '<div class="sub">No official rulings for this card.</div>';
    }
    return h;
  }
  function ruleView(id) {
    if (id.startsWith("gloss:")) {
      const t = id.slice(6);
      return '<div class="card"><h3>' + esc(t) + "</h3><div>" + linkRules(esc(CR.glossary[t] || "").replace(/\u2028/g, "<br>")) + "</div></div>";
    }
    if (!CR.rules[id]) return '<div class="note">Rule ' + esc(id) + " not found.</div>";
    const section = /^\d{3}$/.test(id), sub = /[a-z]$/.test(id);
    const items = section ? CR.order.filter((n) => n === id || (/^\d{3}\.\d+$/.test(n) && n.startsWith(id + ".")))
      : CR.order.filter((n) => n === id || (n.startsWith(id) && /^[a-z]+$/.test(n.slice(id.length))));
    const item = (n) => {
      const r = CR.rules[n], depth = /[a-z]$/.test(n) && n !== id ? 1 : 0;
      return '<div class="rule-item" style="--d:' + depth + '"><a class="rl n" data-rule="' + n + '">' + n + "</a>" + linkRules(esc(r.t)) +
        (r.ex ? r.ex.map((x) => '<div class="ex">Example: ' + linkRules(esc(x)) + "</div>").join("") : "") + "</div>";
    };
    let h = items.map(item).join("");
    const parent = sub ? id.replace(/[a-z]+$/, "") : "";
    if (parent) h += '<div class="row"><button class="chip rule" data-rule="' + parent + '">Whole rule ' + parent + "</button></div>";
    if (id.length > 3) { const up = id.slice(0, 3); h += '<div class="row"><button class="chip rule" data-rule="' + up + '">Section ' + up + (CR.rules[up] ? " · " + esc(CR.rules[up].t) : "") + "</button></div>"; }
    return h;
  }

  // ---------- search tab ----------
  function initSearch() {
    $("#ci").innerHTML = ["W", "U", "B", "R", "G", "C"].map((c) => '<button class="chip" data-ci="' + c + '"><span class="ms ' + c + '">' + c + "</span></button>").join("") +
      '<span class="sub" style="align-self:center">identity within</span>';
    const types = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land", "Battle", "Legendary"];
    $("#type").innerHTML = '<option value="">Any type</option>' + types.map((t) => "<option>" + t + "</option>").join("");
    let timer;
    $("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { state.shown = 60; renderResults(); }, 150); });
    $("#ci").addEventListener("click", (e) => {
      const b = e.target.closest("[data-ci]"); if (!b) return;
      const c = b.dataset.ci; state.ci.has(c) ? state.ci.delete(c) : state.ci.add(c);
      b.classList.toggle("on"); state.shown = 60; renderResults();
    });
    $("#type").addEventListener("change", (e) => { state.type = e.target.value; state.shown = 60; renderResults(); });
    $("#legal").addEventListener("click", (e) => { state.legal = !state.legal; e.currentTarget.classList.toggle("on", state.legal); state.shown = 60; renderResults(); });
    $("#gc").addEventListener("click", (e) => { state.gc = !state.gc; e.currentTarget.classList.toggle("on", state.gc); state.shown = 60; renderResults(); });
    $("#results").addEventListener("click", (e) => {
      if (e.target.closest("[data-more]")) { state.shown += 60; return renderResults(); }
      const d = e.target.closest("[data-card]"); if (d) openSheet({ type: "card", card: byName.get(d.dataset.card.toLowerCase()) });
    });
  }
  function renderResults() {
    const terms = $("#q").value.toLowerCase().split(/\s+/).filter(Boolean);
    const inc = terms.filter((t) => !t.startsWith("-")), exc = terms.filter((t) => t.startsWith("-") && t.length > 1).map((t) => t.slice(1));
    const out = [];
    for (let i = 0; i < CARDS.length; i++) {
      const c = CARDS[i];
      if (state.legal && c.s) continue;
      if (state.gc && !c.g) continue;
      if (state.type && !c.t.includes(state.type)) continue;
      if (state.ci.size) {
        const colors = [...state.ci].filter((x) => x !== "C");
        if (!colors.length) { if (c.ci !== "") continue; }
        else if ([...c.ci].some((ch) => !state.ci.has(ch))) continue;
      }
      const h = hay[i];
      if (inc.some((t) => !h.includes(t)) || exc.some((t) => h.includes(t))) continue;
      out.push(c);
    }
    // exact and prefix name matches first
    const q = terms.join(" ");
    if (q) out.sort((a, b) => rank(a, q) - rank(b, q));
    $("#count").textContent = out.length.toLocaleString() + " card" + (out.length === 1 ? "" : "s");
    $("#results").innerHTML = out.slice(0, state.shown).map((c) =>
      '<div class="card click" data-card="' + esc(c.n) + '"><h4>' + esc(c.n) + " " + (c.m ? mana(c.m) : "") + (c.s ? '<span class="badge ' + (c.s === "banned" ? "bad" : "warn") + '">' + esc(c.s.replace(/_/g, " ")) + "</span>" : "") + (c.g ? '<span class="badge warn">GC</span>' : "") + "</h4>" +
      '<div class="sub">' + esc(c.t) + (c.pt ? " · " + esc(c.pt) : "") + '</div><div class="oracle">' + mana(c.o.length > 220 ? c.o.slice(0, 220) + "…" : c.o) + "</div></div>").join("") +
      (out.length > state.shown ? '<div class="row"><button class="btn" data-more>Show more</button></div>' : "");
  }
  function rank(c, q) { const n = c.n.toLowerCase(); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3; }

  // ---------- interact tab ----------
  const EXAMPLES = [["Elemental Teachings", "Abandoned Air Temple"], ["Sheoldred, the Apocalypse", "Rhystic Study"], ["Nekusar, the Mindrazer", "Wheel of Fortune"], ["Toph, Earthbending Master", "Elemental Teachings"]];
  function initInteract() {
    $("#examples").innerHTML = '<span class="sub" style="align-self:center">Try:</span>' + EXAMPLES.map((e, i) => '<button class="chip" data-ex="' + i + '">' + esc(e.join(" + ")) + "</button>").join("");
    $("#examples").addEventListener("click", (e) => { const b = e.target.closest("[data-ex]"); if (b) { state.picked = EXAMPLES[b.dataset.ex].filter((n) => byName.has(n.toLowerCase())); save(); } });
    $("#pick").addEventListener("input", () => {
      const q = $("#pick").value.toLowerCase().trim();
      if (!q) { $("#sug").innerHTML = ""; return; }
      const m = CARDS.filter((c) => c.n.toLowerCase().includes(q) && !state.picked.includes(c.n)).sort((a, b) => rank(a, q) - rank(b, q)).slice(0, 8);
      $("#sug").innerHTML = m.length ? '<div class="sug">' + m.map((c) => '<div data-name="' + esc(c.n) + '">' + esc(c.n) + ' <span class="sub">' + esc(c.t) + "</span></div>").join("") + "</div>" : "";
    });
    $("#sug").addEventListener("click", (e) => { const d = e.target.closest("[data-name]"); if (d) addPick(d.dataset.name); });
    $("#picked").addEventListener("click", (e) => { const d = e.target.closest("[data-rm]"); if (d) { state.picked = state.picked.filter((n) => n !== d.dataset.rm); save(); } });
    $("#analysis").addEventListener("click", (e) => {
      const r = e.target.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
      const c = e.target.closest("[data-card]"); if (c) openSheet({ type: "card", card: byName.get(c.dataset.card.toLowerCase()) });
    });
  }
  function addPick(name) { if (!state.picked.includes(name)) state.picked.push(name); $("#pick").value = ""; $("#sug").innerHTML = ""; save(); }
  function save() { store.set("picked", state.picked); renderPicked(); analyzePicked(); }
  function renderPicked() {
    $("#picked").innerHTML = state.picked.map((n) => '<span class="chip on">' + esc(n) + ' <span data-rm="' + esc(n) + '" role="button" aria-label="Remove ' + esc(n) + '" style="cursor:pointer;padding-left:4px">✕</span></span>').join("");
  }
  function analyzePicked() {
    const cards = state.picked.map((n) => byName.get(n.toLowerCase())).filter(Boolean);
    const el = $("#analysis");
    if (!cards.length) { el.innerHTML = ""; return; }
    const r = MTGEngine.analyze(cards, { cr: CR, rulings: RULINGS });
    const cites = (a) => (a || []).map(ruleChip).join(" ");
    let h = "<h2>Cards</h2>" + cards.map((c) => '<div class="card click" data-card="' + esc(c.n) + '">' + cardBlock(c) + "</div>").join("");
    if (cards.length < 2) h += '<div class="note">Add a second card to see how they interact.</div>';
    if (r.keywords.length) h += "<h2>Keywords, from the rules</h2><div class=\"row\">" + r.keywords.map((k) => '<button class="chip rule" data-rule="' + k.rule + '">' + esc(k.card) + ": " + esc(k.keyword) + " → CR " + k.rule + "</button>").join("") + "</div>";
    h += "<h2>Connections</h2>";
    h += r.connections.length ? '<ul class="clean">' + r.connections.map((c) => "<li><b>" + esc(c.from) + "</b> → <b>" + esc(c.to) + "</b> through " + esc(c.eventLabel) + (c.replacement ? " (a replacement effect, so it applies as the event happens and does not use the stack)" : c.optional ? " (optional trigger)" : " (triggers, then goes on the stack)") +
      '<div class="sub">' + mana(c.src) + "<br>→ " + mana(c.dst) + "</div>" + cites(c.cites) + "</li>").join("") + "</ul>" : '<div class="sub">No trigger or replacement links found by text reading. That does not prove the cards do not interact, so read both cards.</div>';
    if (r.replacements.length) h += "<h2>Replacement and prevention effects</h2><ul class=\"clean\">" + r.replacements.map((x) => "<li><b>" + esc(x.card) + "</b>: " + mana(x.text) + "<div class=\"sub\">A " + (x.kind === "prevention" ? "prevention" : "replacement") + " effect changes an event as it would happen. It is not a trigger and never goes on the stack.</div>" + cites(x.cites) + "</li>").join("") + "</ul>";
    if (r.loops.length) h += "<h2>Possible loops</h2><ul class=\"clean\">" + r.loops.map((l) => "<li>" + l.chain.map((x) => mana(x)).join("<br>→ ") + '<div class="sub">' + (l.optional ? "Contains an optional step, so nobody is forced to continue." : "Every step looks mandatory. A loop of only mandatory actions is a draw, so check this carefully.") + "</div>" + cites(l.cites) + "</li>").join("") + "</ul>";
    if (r.layers.length) h += "<h2>Layers, if effects overlap</h2><ul class=\"clean\">" + r.layers.map((l) => "<li><b>" + esc(l.card) + "</b>: " + esc(l.why) + " " + ruleChip(l.rule) + '<div class="sub">' + mana(l.text) + "</div></li>").join("") + "</ul>";
    if (r.rulingLinks.length) h += "<h2>Official rulings that mention both</h2><ul class=\"clean\">" + r.rulingLinks.map((x) => '<li><span class="sub">' + esc(x.date) + " · on " + esc(x.about) + "</span><br>" + linkRules(mana(x.text)) + "</li>").join("") + "</ul>";
    else if (!RULINGS) h += '<div class="sub">Official rulings are still loading…</div>';
    if (r.gotchas.length) h += "<h2>Gotchas</h2>" + r.gotchas.map((g) => '<div class="note">' + esc(g.text) + "<br>" + cites(g.cites) + "</div>").join("");
    h += '<div class="note"><b>Confidence:</b> ' + esc(r.confidence) + "</div>";
    el.innerHTML = h;
  }

  // ---------- rules tab ----------
  const PARTS = { 1: "Game Concepts", 2: "Parts of a Card", 3: "Card Types", 4: "Zones", 5: "Turn Structure", 6: "Spells, Abilities, and Effects", 7: "Additional Rules", 8: "Multiplayer Rules", 9: "Casual Variants" };
  function initRules() {
    const input = $("#rq"); let timer;
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(rulesSearch, 150); });
    $("#rresults").addEventListener("click", (e) => {
      const r = e.target.closest("[data-rule]"); if (r) return openSheet({ type: "rule", rule: r.dataset.rule });
      const g = e.target.closest("[data-gloss]"); if (g) openSheet({ type: "rule", rule: "gloss:" + g.dataset.gloss });
    });
    rulesSearch();
  }
  function rulesSearch() {
    const q = $("#rq").value.trim().toLowerCase(), el = $("#rresults");
    if (!q) {
      el.innerHTML = '<h2>Browse the rulebook</h2>' + Object.keys(PARTS).map((p) => '<div class="card"><h4>' + p + ". " + PARTS[p] + '</h4><div class="row">' +
        CR.order.filter((n) => /^\d{3}$/.test(n) && n[0] === p).map((n) => '<button class="chip rule" data-rule="' + n + '">' + n + " " + esc(CR.rules[n].t) + "</button>").join("") + "</div></div>").join("");
      return;
    }
    if (/^\d{3}(\.\d+[a-z]?)?$/.test(q) && CR.rules[q]) { el.innerHTML = ""; openSheet({ type: "rule", rule: q }); return; }
    const terms = q.split(/\s+/);
    const gl = Object.keys(CR.glossary).filter((k) => terms.every((t) => k.toLowerCase().includes(t))).slice(0, 8);
    const hits = [];
    for (const n of CR.order) { const t = CR.rules[n].t.toLowerCase(); if (terms.every((x) => t.includes(x))) { hits.push(n); if (hits.length >= 40) break; } }
    el.innerHTML = (gl.length ? "<h2>Glossary</h2>" + gl.map((k) => '<div class="card click" data-gloss="' + esc(k) + '"><h4>' + esc(k) + '</h4><div class="sub">' + esc(CR.glossary[k].replace(/\u2028/g, " ").slice(0, 160)) + "…</div></div>").join("") : "") +
      "<h2>Rules</h2>" + (hits.length ? hits.map((n) => '<div class="card click" data-rule="' + n + '"><h4>' + n + '</h4><div class="sub">' + esc(snippet(CR.rules[n].t, terms[0])) + "</div></div>").join("") : '<div class="sub">No rules match.</div>');
  }
  function snippet(t, term) { const i = t.toLowerCase().indexOf(term); const s = Math.max(0, i - 60); return (s ? "…" : "") + t.slice(s, s + 200) + (t.length > s + 200 ? "…" : ""); }

  // ---------- about ----------
  function initAbout() {
    $("#about").innerHTML = '<div class="card"><h3>What this is</h3><p>A pocket Commander rules judge. Card text, rulings and rules all come from the data files in this site, never from memory.</p>' +
      "<ul><li><b>Search</b>: " + CARDS.length.toLocaleString() + " cards. Tap one for its text, rulings and keyword rules.</li><li><b>Interact</b>: pick cards and see which triggers and replacement effects connect them, with rule numbers.</li><li><b>Rules</b>: the full Comprehensive Rules (effective " + esc(CR.effective) + ").</li></ul></div>" +
      '<div class="note"><b>Know the limits.</b> The Interact tab finds links by reading card text with pattern rules. It is a fast first pass, not a judge. Check the exact card text and rulings it shows. Commander legality comes from the ban list and a filter on joke and digital-only cards, so treat it as approximate.</div>' +
      '<div class="card"><h3>Sources</h3><p class="sub">Card data and rulings from the open-source mtg.wtf search engine (github.com/taw/magic-search-engine). Magic: The Gathering and its card text belong to Wizards of the Coast. Source and rebuild steps: github.com/cpt-jason-burke/mtgsme.</p></div>';
  }

  load();
})();

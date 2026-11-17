/* Card images from Scryfall, loaded by the viewer's browser.
 * Card text never comes from here; only pictures. Requests are batched (up to 75 cards per call)
 * and spaced out to respect Scryfall's rate limits, and results are remembered on the device. */
(function (root) {
  "use strict";
  const API = "https://api.scryfall.com";
  const KEY = "scry-img-v3";
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { mem = {}; }
  const waiting = new Map();      // name -> [callbacks]
  let queue = new Set(), timer = null, busy = false;
  const state = { enabled: true, failed: false, lastError: "" };
  try { state.enabled = localStorage.getItem("scry-enabled") !== "0"; } catch (e) { /* storage blocked */ }

  function save() {
    try {
      const keys = Object.keys(mem);
      if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach((k) => delete mem[k]);
      localStorage.setItem(KEY, JSON.stringify(mem));
    } catch (e) { /* storage full or blocked: keep in memory only */ }
  }

  function pick(card, wanted) {
    const face = card.card_faces && card.card_faces.find((f) => f.name === wanted && f.image_uris);
    const u = card.image_uris || (face && face.image_uris) || (card.card_faces && card.card_faces[0].image_uris) || null;
    if (!u) return null;
    // the default printing's set, number and price, for deck totals when a list names no printing
    const pr = card.prices || {}, usd = pr.usd || pr.usd_foil || pr.usd_etched;
    return { art: u.art_crop, small: u.small, normal: u.normal, large: u.large || u.normal, set: card.set, num: card.collector_number, usd: usd ? +usd : null };
  }

  async function flush() {
    timer = null;
    if (busy || !queue.size) return;
    busy = true;
    const batch = [...queue].slice(0, 75);
    batch.forEach((n) => queue.delete(n));
    try {
      const res = await fetch(API + "/cards/collection", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }) });
      if (!res.ok) throw new Error("Scryfall answered " + res.status);
      const json = await res.json();
      const found = new Set();
      for (const card of json.data || []) {
        const names = [card.name].concat(card.name.split(" // "), (card.card_faces || []).map((f) => f.name));
        for (const want of batch) if (!found.has(want) && names.includes(want)) { mem[want] = pick(card, want); found.add(want); }
      }
      for (const want of batch) if (!found.has(want)) mem[want] = null;
      state.failed = false;
      save();
    } catch (e) {
      state.failed = true; state.lastError = String(e.message || e);
      batch.forEach((n) => { (waiting.get(n) || []).forEach((cb) => cb(null)); waiting.delete(n); });
    }
    for (const n of batch) if (n in mem) { (waiting.get(n) || []).forEach((cb) => cb(mem[n])); waiting.delete(n); }
    busy = false;
    if (queue.size) timer = setTimeout(flush, 120);
  }

  // get(name, cb): cb receives {art, small, normal} or null.
  function get(name, cb) {
    if (!state.enabled) return cb(null);
    if (name in mem) return cb(mem[name]);
    if (!waiting.has(name)) waiting.set(name, []);
    waiting.get(name).push(cb);
    queue.add(name);
    if (!timer && !busy) timer = setTimeout(flush, 60);
  }

  async function test() {
    const t0 = performance.now();
    const res = await fetch(API + "/cards/named?exact=" + encodeURIComponent("Sol Ring"), { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Scryfall answered " + res.status);
    const card = await res.json();
    return { ms: Math.round(performance.now() - t0), img: pick(card, card.name) };
  }

  // ---- exact printings (set + collector number) with prices, for set grids and precon totals ----
  const day = new Date().toISOString().slice(0, 10);
  let pmem = {};
  try { const j = JSON.parse(localStorage.getItem("scry-print-v1") || "{}"); if (j.day === day) pmem = j.m; } catch (e) { pmem = {}; }
  const pwait = new Map(), pqueue = new Map();
  let ptimer = null, pbusy = false;
  const slim = (c) => {
    const u = c.image_uris || (c.card_faces && c.card_faces[0].image_uris) || null;
    return { img: u ? { art: u.art_crop, small: u.small, normal: u.normal, large: u.large || u.normal } : null, prices: c.prices || {}, finishes: c.finishes || [],
      set: c.set, setName: c.set_name, num: c.collector_number, date: c.released_at, rarity: c.rarity, promo: !!c.promo, frame: (c.frame_effects || []).join(" "), border: c.border_color,
      year: c.frame, full: !!c.full_art, ptypes: c.promo_types || [] };
  };
  function psave() {
    try { const keys = Object.keys(pmem); if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach((k) => delete pmem[k]); localStorage.setItem("scry-print-v1", JSON.stringify({ day, m: pmem })); } catch (e) { /* ignore */ }
  }
  async function pflush() {
    ptimer = null;
    if (pbusy || !pqueue.size) return;
    pbusy = true;
    const batch = [...pqueue.entries()].slice(0, 75);
    batch.forEach(([k]) => pqueue.delete(k));
    try {
      const res = await fetch(API + "/cards/collection", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: batch.map(([, v]) => ({ set: v.set, collector_number: v.num })) }) });
      if (!res.ok) throw new Error("Scryfall answered " + res.status);
      const json = await res.json();
      // collector numbers can differ in case between sources (1701d / 1701D), so match them case-insensitively
      const got = new Map((json.data || []).map((c) => [(c.set + "/" + c.collector_number).toLowerCase(), slim(c)]));
      for (const [k] of batch) pmem[k] = got.get(k.toLowerCase()) || null;
      psave();
    } catch (e) { state.failed = true; state.lastError = String(e.message || e); }
    for (const [k] of batch) { (pwait.get(k) || []).forEach((cb) => cb(pmem[k] || null)); pwait.delete(k); }
    pbusy = false;
    if (pqueue.size) ptimer = setTimeout(pflush, 120);
  }
  // getPrint(set, number, cb): cb receives the printing (image, prices, finishes) or null.
  function getPrint(set, num, cb) {
    if (!state.enabled) return cb(null);
    const k = set + "/" + num;
    if (k in pmem) return cb(pmem[k]);
    if (!pwait.has(k)) pwait.set(k, []);
    pwait.get(k).push(cb);
    pqueue.set(k, { set, num });
    if (!ptimer && !pbusy) ptimer = setTimeout(pflush, 60);
  }

  // Every paper printing of a card, newest first.
  async function printings(name) {
    let url = API + "/cards/search?unique=prints&order=released&dir=desc&include_variations=true&q=" + encodeURIComponent('!"' + name + '" game:paper');
    const out = [];
    for (let page = 0; url && page < 6; page++) {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 404) break;
      if (!res.ok) throw new Error("Scryfall answered " + res.status);
      const j = await res.json();
      out.push(...j.data.map(slim));
      url = j.has_more ? j.next_page : null;
      if (url) await new Promise((r) => setTimeout(r, 110));
    }
    return out;
  }

  // Printings for many cards at once (deck upgrades): one search per group of names instead of one per card.
  // Basic lands have hundreds of printings, so each gets its 175 cheapest and 175 priciest. Kept on the device for a day.
  const MKEY = "scry-prints-v1";
  let many = {};
  try { const j = JSON.parse(localStorage.getItem(MKEY) || "{}"); if (j.day === day) many = j.m; } catch (e) { many = {}; }
  const mini = (p) => [p.set, p.setName, p.num, p.date, p.finishes, [p.prices.usd || "", p.prices.usd_foil || "", p.prices.usd_etched || ""], p.img ? p.img.normal : "", p.frame, p.border, p.year, p.full ? 1 : 0, p.ptypes, p.rarity];
  const unmini = (a) => ({ set: a[0], setName: a[1], num: a[2], date: a[3], finishes: a[4], prices: { usd: a[5][0] || null, usd_foil: a[5][1] || null, usd_etched: a[5][2] || null },
    img: a[6] ? { normal: a[6], large: a[6].replace("/normal/", "/large/"), small: a[6].replace("/normal/", "/small/"), art: a[6].replace("/normal/", "/art_crop/") } : null,
    frame: a[7], border: a[8], year: a[9], full: !!a[10], ptypes: a[11] || [], rarity: a[12] });
  function msave() {
    try { const keys = Object.keys(many); if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete many[k]); localStorage.setItem(MKEY, JSON.stringify({ day, m: many })); } catch (e) { /* storage full: keep in memory */ }
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function pages(url, maxPages, each) {
    for (let page = 0; url && page < maxPages; page++) {
      if (page) await wait(110);
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 404) return;
      if (!res.ok) throw new Error("Scryfall answered " + res.status);
      const j = await res.json();
      j.data.forEach(each);
      url = j.has_more ? j.next_page : null;
    }
  }
  // printingsMany(names, onProgress) -> { name: [printing, ...] } (newest first; basics sorted by price)
  async function printingsMany(names, onProgress) {
    const out = {}, todo = [];
    for (const n of names) { if (many[n]) out[n] = many[n].map(unmini); else todo.push(n); }
    const basics = todo.filter((n) => /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(n));
    const rest = todo.filter((n) => !basics.includes(n));
    let done = names.length - todo.length;
    const tell = () => onProgress && onProgress(done, names.length);
    tell();
    const q = (n) => '!"' + n.replace(/"/g, "") + '"';
    const groups = [];
    for (let i = 0, g = []; i < rest.length; i++) { g.push(rest[i]); if (g.length === 12 || i === rest.length - 1) { groups.push(g); g = []; } }
    const S = API + "/cards/search?unique=prints&include_variations=true&q=";
    for (const g of groups) {
      const got = {};
      g.forEach((n) => (got[n] = []));
      await pages(S + encodeURIComponent("game:paper (" + g.map(q).join(" or ") + ")") + "&order=released&dir=desc", 20, (c) => {
        const front = c.name.split(" // ")[0];
        const n = g.find((x) => x === c.name || x === front || (c.card_faces || []).some((f) => f.name === x));
        if (n) got[n].push(slim(c));
      });
      for (const n of g) { out[n] = got[n]; many[n] = got[n].map(mini); }
      done += g.length; tell(); msave();
      await wait(110);
    }
    for (const n of basics) {
      const seen = new Set(), list = [];
      for (const dir of ["asc", "desc"]) {
        await pages(S + encodeURIComponent("game:paper " + q(n)) + "&order=usd&dir=" + dir, 1, (c) => { const k = c.set + "/" + c.collector_number; if (!seen.has(k)) { seen.add(k); list.push(slim(c)); } });
        await wait(110);
      }
      out[n] = list; many[n] = list.map(mini);
      done++; tell(); msave();
    }
    return out;
  }

  function setEnabled(on) { state.enabled = on; try { localStorage.setItem("scry-enabled", on ? "1" : "0"); } catch (e) { /* ignore */ } }

  root.Scry = { get, getPrint, printings, printingsMany, test, state, setEnabled };
})(self);

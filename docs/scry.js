/* Card images from Scryfall, loaded by the viewer's browser.
 * Card text never comes from here; only pictures. Requests are batched (up to 75 cards per call)
 * and spaced out to respect Scryfall's rate limits, and results are remembered on the device. */
(function (root) {
  "use strict";
  const API = "https://api.scryfall.com";
  const KEY = "scry-img-v1";
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
    return u ? { art: u.art_crop, small: u.small, normal: u.normal } : null;
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

  function setEnabled(on) { state.enabled = on; try { localStorage.setItem("scry-enabled", on ? "1" : "0"); } catch (e) { /* ignore */ } }

  root.Scry = { get, test, state, setEnabled };
})(self);

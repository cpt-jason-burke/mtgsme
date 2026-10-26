/* MTGSME Play: a table-top life counter with a chess clock.
 * Built for an iPad lying in the middle of the table; each player's panel faces their seat.
 * Everything is saved on the device after every change, so a reload or a locked screen loses nothing. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  const APP = () => window.MTGSME;   // card data, rules and the open deck, provided by app.js
  const SAVE = "game-v1", PROFILES = "profiles-v1", OPTS = "play-opts-v1";
  const COLORS = ["#d06a26", "#6f9fc9", "#7cc493", "#a77bd6", "#e2765f", "#d9b84a"];
  // Player counters. "single": only one player can have it; "each": a flag any player can have.
  const COUNTERS = [
    { k: "poison", label: "Poison", icon: "Φ", rule: "704.5c", lose: 10 },
    { k: "tax", label: "Commander tax", icon: "♜", rule: "903.8", step: 2 },
    { k: "energy", label: "Energy", icon: "ϟ", rule: "107.14" },
    { k: "exp", label: "Experience", icon: "✦", rule: "122.1" },
    { k: "treasure", label: "Treasure", icon: "◆", rule: "111.10a" },
    { k: "rad", label: "Rad", icon: "☢︎", rule: "728" },
    { k: "monarch", label: "Monarch", icon: "♛", rule: "725", flag: "single" },
    { k: "initiative", label: "Initiative", icon: "⛨︎", rule: "726", flag: "single" },
    { k: "blessing", label: "City's blessing", icon: "✷", rule: "702.131c", flag: "each" },
  ];
  const opts = Object.assign({ count: 4, life: 40, clock: true, limit: 0, random: false, haptics: true }, store.get(OPTS, {}));
  let game = store.get(SAVE, null);
  let open = false, tickTimer = null, wake = null;

  // ---------- haptics ----------
  // iPhone Safari (iOS 18+) gives a light tick when a switch is toggled; a hidden switch is toggled on each tap.
  // iPads have no haptic motor, so this does nothing there.
  let hapticEl = null;
  function haptic() {
    if (!opts.haptics) return;
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    if (!hapticEl) {
      hapticEl = document.createElement("label");
      hapticEl.setAttribute("aria-hidden", "true");
      hapticEl.style.cssText = "position:fixed;left:-200px;top:0;opacity:0;pointer-events:none";
      const i = document.createElement("input");
      i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
      hapticEl.appendChild(i); document.body.appendChild(hapticEl);
    }
    hapticEl.click();
  }

  // ---------- game state ----------
  function newGame(o) {
    const seats = (o.seats || []).slice(0, o.count);
    let players = Array.from({ length: o.count }, (_, i) => ({
      id: i, name: (seats[i] && seats[i].name) || "Player " + (i + 1), art: (seats[i] && seats[i].art) || null, art2: (seats[i] && seats[i].art2) || null,
      color: (seats[i] && seats[i].color) || COLORS[i % COLORS.length], life: o.life, c: {}, cmd: {}, ko: false, time: 0,
    }));
    if (o.random) players = shuffle(players);
    game = { v: 1, life: o.life, players, day: "", log: [], mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, storm: 0 }, started: Date.now(),
      clock: { on: o.clock, limit: o.limit, active: players[0].id, holder: players[0].id, running: false, last: 0, turn: 1, turnUsed: 0, warned: 0 } };
    save(true);
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const P = (id) => game.players.find((p) => p.id === id);
  let saveTimer = null;
  // Writes at most every 300ms, so a steady stream of changes (like the running clock) still gets saved.
  function save(now) {
    if (now) { clearTimeout(saveTimer); saveTimer = null; store.set(SAVE, game); return; }
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; store.set(SAVE, game); }, 300);
  }
  function log(e) {
    const last = game.log[game.log.length - 1];
    e.turn = game.clock.turn; e.active = game.clock.active; e.t = Date.now();
    // taps in quick succession on the same thing become one entry (e.g. -1 -1 -1 -> -3)
    if (last && last.pid === e.pid && last.kind === e.kind && last.from === e.from && last.k === e.k && e.t - last.t < 4000 && e.d) { last.d += e.d; last.v = e.v; last.t = e.t; }
    else game.log.push(e);
    if (game.log.length > 2000) game.log.shift();
  }

  function changeLife(pid, d) {
    const p = P(pid); p.life += d;
    log({ pid, kind: "life", d, v: p.life });
    bump(pid, d); save(); update();
  }
  function changeCmd(pid, from, slot, d) {
    const p = P(pid); p.cmd[from] = p.cmd[from] || [0, 0];
    if (p.cmd[from][slot] + d < 0) return;
    p.cmd[from][slot] += d; p.life -= d;   // commander damage is damage, so it also costs life
    log({ pid, kind: "cmd", from, d, v: p.cmd[from][slot] });
    bump(pid, -d); save(); update();
  }
  function changeCounter(pid, k, d) {
    const p = P(pid), def = COUNTERS.find((x) => x.k === k);
    if (def.flag === "single") { const had = p.c[k]; game.players.forEach((q) => delete q.c[k]); if (!had) p.c[k] = 1; log({ pid, kind: "counter", k, d: 0, v: had ? 0 : 1 }); }
    else if (def.flag === "each") { p.c[k] = p.c[k] ? 0 : 1; log({ pid, kind: "counter", k, d: 0, v: p.c[k] }); }
    else { const v = Math.max(0, (p.c[k] || 0) + d * (def.step || 1)); if (v === (p.c[k] || 0)) return; p.c[k] = v; log({ pid, kind: "counter", k, d: d * (def.step || 1), v }); }
    save(); update();
  }
  // Why a player may have lost, with the rule that says so.
  function losses(p) {
    const out = [];
    if (p.life <= 0) out.push(["0 or less life", "704.5a"]);
    if ((p.c.poison || 0) >= 10) out.push(["10 poison counters", "704.5c"]);
    for (const [from, v] of Object.entries(p.cmd)) v.forEach((n, i) => { if (n >= 21) { const q = P(+from); out.push(["21 damage from " + (q ? q.name : "a commander") + (i ? " (partner)" : ""), "903.10a"]); } });
    return out;
  }

  // ---------- chess clock ----------
  function clockTick() {
    const c = game && game.clock;
    if (!c || !c.on || !c.running) return;
    const now = Date.now(), dt = now - c.last; c.last = now;
    const h = P(c.holder); if (h) h.time += dt;
    c.turnUsed += dt;
    if (c.limit) {
      const lim = c.limit * 60000;
      if (c.turnUsed > lim * 0.8 && c.warned < 1) { c.warned = 1; haptic(); }
      if (c.turnUsed > lim && c.warned < 2) { c.warned = 2; haptic(); }
    }
    updateClocks();
    save();
  }
  function startTicking() { stopTicking(); tickTimer = setInterval(clockTick, 250); }
  function stopTicking() { clearInterval(tickTimer); tickTimer = null; }
  function setRunning(on) { const c = game.clock; clockTick(); c.running = on; c.last = Date.now(); save(); update(); }
  const living = () => game.players.filter((p) => !p.ko);
  // Tapping your own clock passes the turn; tapping someone else's gives them priority; tapping it again hands it back.
  function clockTap(pid) {
    const c = game.clock;
    haptic();
    if (!c.running) { setRunning(true); if (pid !== c.active) { c.holder = pid; } update(); return; }
    clockTick();
    if (pid === c.holder && c.holder !== c.active) { c.holder = c.active; }
    else if (pid !== c.active) { c.holder = pid; }
    else if (pid === c.active && c.holder !== c.active) { c.holder = c.active; }
    else nextTurn();
    save(); update();
  }
  function nextTurn() {
    const c = game.clock, order = game.players.map((p) => p.id), alive = living().map((p) => p.id);
    if (!alive.length) return;
    let i = order.indexOf(c.active);
    for (let n = 0; n < order.length; n++) {
      i = (i + 1) % order.length;
      if (i === 0) c.turn++;
      if (alive.includes(order[i])) break;
    }
    c.active = c.holder = order[i]; c.turnUsed = 0; c.warned = 0;
    log({ pid: c.active, kind: "turn", d: 0, v: c.turn });
  }
  const fmt = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

  // ---------- layout ----------
  // Seats run clockwise. iPad portrait: players sit on the left and right sides; landscape: top and bottom.
  function seatCells(n, portrait) {
    const cells = [];   // {row, col, span, rot}
    if (portrait) {
      const half = Math.floor(n / 2), rows = half + (n % 2);
      const right = Array.from({ length: half }, (_, r) => ({ row: r, col: 2, rot: -90 }));
      const left = Array.from({ length: half }, (_, r) => ({ row: r, col: 0, rot: 90 }));
      cells.push(left[0], ...right);
      if (n % 2) cells.push({ row: rows - 1, col: 0, span: 3, rot: 0 });
      cells.push(...left.slice(1).reverse());
      return { cells, rows, cols: 3 };
    }
    return { top: Math.ceil(n / 2) };
  }
  function render() {
    const g = $("#game");
    if (!g || !game) return;
    const W = window.innerWidth, H = window.innerHeight, portrait = H >= W;
    const n = game.players.length, L = seatCells(n, portrait);
    let panels = "", style;
    if (portrait) {
      style = "grid-template-columns:1fr 56px 1fr;grid-template-rows:repeat(" + L.rows + ",1fr)";
      game.players.forEach((p, i) => { const c = L.cells[i]; panels += panel(p, c.rot, "grid-row:" + (c.row + 1) + ";grid-column:" + (c.col + 1) + (c.span ? " / span " + c.span : "")); });
      panels += '<div class="gbar vertical" style="grid-column:2;grid-row:1 / span ' + (n % 2 ? L.rows - 1 : L.rows) + '">' + toolbar() + "</div>";
    } else {
      // two rows of panels with the toolbar between them; each row divides its width evenly
      style = "grid-template-columns:1fr;grid-template-rows:1fr 56px 1fr";
      const top = game.players.slice(0, L.top), bottom = game.players.slice(L.top).reverse();
      panels += '<div class="grow" style="grid-row:1">' + top.map((p) => panel(p, 180, "")).join("") + "</div>";
      panels += '<div class="gbar" style="grid-row:2">' + toolbar() + "</div>";
      panels += '<div class="grow" style="grid-row:3">' + bottom.map((p) => panel(p, 0, "")).join("") + "</div>";
    }
    g.innerHTML = '<div class="ggrid" style="' + style + '">' + panels + '</div><div id="gmodal"></div>';
    sizePanels(); hydrateArt(g); update();
  }
  // Rotated panels swap their width and height so text faces the seat.
  function sizePanels() {
    document.querySelectorAll("#game .pcell").forEach((cell) => {
      const inner = cell.firstElementChild, r = +cell.dataset.rot, w = cell.clientWidth, h = cell.clientHeight;
      const side = Math.abs(r) === 90;
      inner.style.width = (side ? h : w) + "px"; inner.style.height = (side ? w : h) + "px";
      inner.style.transform = "translate(-50%,-50%) rotate(" + r + "deg)";
    });
  }
  function panel(p, rot, pos) {
    const opps = game.players.filter((q) => q.id !== p.id);
    const tiles = opps.map((q) => [0, q.art2 ? 1 : -1].filter((s) => s >= 0).map((slot) =>
      '<button class="ctile2" data-cmd="' + p.id + ":" + q.id + ":" + slot + '" style="--pc:' + q.color + '" data-art="' + esc(slot ? q.art2 : q.art) + '"><b data-cv="' + p.id + ":" + q.id + ":" + slot + '">0</b><i>' + esc(shortName(q.name)) + "</i></button>").join("")).join("");
    return '<div class="pcell" data-rot="' + rot + '" style="' + pos + '"><div class="pinner" data-pid="' + p.id + '" style="--pc:' + p.color + '">' +
      '<div class="pbg" data-art="' + esc(p.art) + '"></div>' +
      '<div class="pzone plus" data-z="' + p.id + ':1"><span>+</span></div><div class="pzone minus" data-z="' + p.id + ':-1"><span>−</span></div>' +
      '<button class="pname" data-menu="' + p.id + '">' + esc(p.name) + "</button>" +
      '<div class="plife" data-life="' + p.id + '"></div><div class="pdelta" data-delta="' + p.id + '"></div>' +
      '<div class="pbadges" data-badges="' + p.id + '"></div>' +
      '<div class="ptiles">' + tiles + "</div>" +
      (game.clock.on ? '<button class="pclock" data-clock="' + p.id + '"><b data-ct="' + p.id + '">0:00</b><i data-cs="' + p.id + '"></i></button>' : "") +
      '<button class="plost hidden" data-lost="' + p.id + '"></button>' +
      "</div></div>";
  }
  const shortName = (n) => (/^Player \d+$/.test(n) ? "P" + n.slice(7) : n.split(" ")[0].slice(0, 7));
  function toolbar() {
    const c = game.clock;
    return '<button data-g="menu" aria-label="Game menu">☰</button>' +
      (c.on ? '<button data-g="clock" aria-label="Start or pause the clock" id="gplay"></button><span class="gturn" id="gturn"></span>' : "") +
      '<button data-g="dice" aria-label="Dice and coins">⚄</button><button data-g="mana" aria-label="Mana and storm">●</button>' +
      '<button data-g="log" aria-label="Game log">≡</button><button data-g="exit" aria-label="Leave the table">✕</button>';
  }
  function hydrateArt(root) {
    root.querySelectorAll("[data-art]").forEach((el) => {
      const n = el.dataset.art; if (!n || !window.Scry) return;
      Scry.get(n, (img) => { if (img) el.style.backgroundImage = 'url("' + img.art + '")'; });
    });
  }
  // Refresh numbers and highlights without rebuilding the panels (so a held finger is not interrupted).
  function update() {
    if (!open || !game) return;
    const c = game.clock;
    for (const p of game.players) {
      const life = $('[data-life="' + p.id + '"]'); if (life) life.textContent = p.life;
      const inner = $('.pinner[data-pid="' + p.id + '"]');
      if (inner) {
        inner.classList.toggle("ko", p.ko);
        inner.classList.toggle("active", c.on && c.active === p.id);
        inner.classList.toggle("holder", c.on && c.holder === p.id && c.holder !== c.active);
      }
      const b = $('[data-badges="' + p.id + '"]');
      if (b) b.innerHTML = COUNTERS.filter((d) => p.c[d.k]).map((d) => '<span title="' + esc(d.label) + '">' + d.icon + (d.flag ? "" : "<b>" + p.c[d.k] + "</b>") + "</span>").join("") + (game.day && p.id === game.players[0].id ? '<span>' + (game.day === "day" ? "☀︎" : "☾") + "</span>" : "");
      for (const q of game.players) [0, 1].forEach((slot) => { const el = $('[data-cv="' + p.id + ":" + q.id + ":" + slot + '"]'); if (el) { const v = (p.cmd[q.id] || [0, 0])[slot]; el.textContent = v; el.parentElement.classList.toggle("lethal", v >= 21); el.parentElement.classList.toggle("some", v > 0); } });
      const lost = $('[data-lost="' + p.id + '"]'), why = losses(p);
      if (lost) { lost.classList.toggle("hidden", !why.length || p.ko); lost.innerHTML = why.length ? "☠ " + esc(why[0][0]) + " · rule " + why[0][1] + "<br><small>Tap to mark out</small>" : ""; }
    }
    updateClocks();
  }
  function updateClocks() {
    if (!open || !game || !game.clock.on) return;
    const c = game.clock;
    for (const p of game.players) {
      const t = $('[data-ct="' + p.id + '"]'), s = $('[data-cs="' + p.id + '"]');
      if (!t) continue;
      t.textContent = fmt(p.time);
      const lim = c.limit * 60000;
      if (s) s.textContent = p.id === c.holder && p.id !== c.active ? "priority · tap to return" : p.id === c.active ? (c.running ? "turn " + fmt(c.turnUsed) + (lim ? " / " + fmt(lim) : "") + " · tap to pass" : "tap to start") : "";
      const el = t.parentElement;
      el.classList.toggle("warn", p.id === c.active && lim && c.turnUsed > lim * 0.8 && c.turnUsed <= lim);
      el.classList.toggle("over", p.id === c.active && lim && c.turnUsed > lim);
    }
    const play = $("#gplay"); if (play) play.textContent = c.running ? "❚❚" : "▶";
    const turn = $("#gturn"); if (turn) turn.textContent = "T" + c.turn;
  }
  // Running total near the life number for the last few seconds of taps.
  const pending = {};
  function bump(pid, d) {
    const el = $('[data-delta="' + pid + '"]'); if (!el) return;
    const s = pending[pid] || (pending[pid] = { v: 0, t: 0 });
    s.v += d; clearTimeout(s.t);
    el.textContent = (s.v > 0 ? "+" : "") + s.v; el.classList.add("on"); el.classList.toggle("neg", s.v < 0);
    s.t = setTimeout(() => { el.classList.remove("on"); s.v = 0; }, 1600);
  }

  // ---------- touch handling ----------
  let hold = null;
  function bind() {
    const g = $("#game");
    g.addEventListener("pointerdown", (e) => {
      const z = e.target.closest("[data-z]"), t = e.target.closest("[data-cmd]");
      if (z) {
        const [pid, sign] = z.dataset.z.split(":").map(Number);
        hold = { held: false, timer: setTimeout(function rep() { hold.held = true; changeLife(pid, sign * 10); haptic(); hold.timer = setTimeout(rep, 600); }, 450), pid, sign, el: z };
        z.classList.add("down");
      } else if (t) {
        const [pid, from, slot] = t.dataset.cmd.split(":").map(Number);
        hold = { held: false, timer: setTimeout(() => { hold.held = true; changeCmd(pid, from, slot, -1); haptic(); }, 500), cmd: [pid, from, slot] };
      }
    });
    const end = (fire) => {
      if (!hold) return;
      clearTimeout(hold.timer);
      if (hold.el) hold.el.classList.remove("down");
      if (fire && !hold.held) { if (hold.cmd) changeCmd(hold.cmd[0], hold.cmd[1], hold.cmd[2], 1); else changeLife(hold.pid, hold.sign); haptic(); }
      hold = null;
    };
    g.addEventListener("pointerup", () => end(true));
    g.addEventListener("pointercancel", () => end(false));
    g.addEventListener("pointerleave", () => end(false));
    g.addEventListener("contextmenu", (e) => e.preventDefault());
    g.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.clock) return clockTap(+b.dataset.clock);
      if (b.dataset.menu) return playerMenu(+b.dataset.menu, "player");
      if (b.dataset.lost) { const p = P(+b.dataset.lost); p.ko = true; log({ pid: p.id, kind: "ko", d: 0, v: 1 }); if (game.clock.active === p.id) nextTurn(); save(); update(); return; }
      const a = b.dataset.g;
      if (a === "exit") return close();
      if (a === "clock") { haptic(); return setRunning(!game.clock.running); }
      if (a === "menu") return gameMenu();
      if (a === "dice") return diceMenu();
      if (a === "mana") return manaMenu();
      if (a === "log") return logView();
    });
  }

  // ---------- in-game windows ----------
  function modal(title, body, onClick) {
    const m = $("#gmodal");
    m.innerHTML = '<div class="gm-bg"><div class="gm"><div class="gm-top"><b>' + esc(title) + '</b><button data-x aria-label="Close">✕</button></div><div class="gm-body">' + body + "</div></div></div>";
    const bg = m.firstChild;
    bg.addEventListener("click", (e) => {
      if (e.target === bg || e.target.closest("[data-x]")) { m.innerHTML = ""; update(); return; }
      const r = e.target.closest("[data-rule]"); if (r) { const box = r.closest(".gm").querySelector(".gm-rule"); box.innerHTML = ruleText(r.dataset.rule); box.scrollIntoView({ block: "nearest" }); return; }
      if (onClick) onClick(e);
    });
    return bg;
  }
  function closeModal() { $("#gmodal").innerHTML = ""; update(); }
  function ruleText(num) {
    const CR = APP().CR(); const r = CR && CR.rules[num];
    if (!r) return "";
    const subs = CR.order.filter((n) => n === num || (n.startsWith(num) && /^[a-z]$/.test(n.slice(num.length)))).slice(0, 4);
    return '<div class="gm-rulebox"><b>Rule ' + esc(num) + "</b>" + subs.map((n) => "<p><b>" + esc(n) + "</b> " + esc(CR.rules[n].t) + "</p>").join("") + "</div>";
  }
  const ruleLink = (num) => (APP().CR() && APP().CR().rules[num] ? '<button class="gm-rl" data-rule="' + num + '">rule ' + num + "</button>" : "");

  function playerMenu(pid, tab) {
    const p = P(pid), opps = game.players.filter((q) => q.id !== pid);
    const tabs = '<div class="gm-tabs">' + [["player", "Player"], ["counters", "Counters"], ["cmd", "Commander damage"]].map(([k, l]) => '<button data-tab="' + k + '" class="' + (k === tab ? "on" : "") + '">' + l + "</button>").join("") + "</div>";
    let body = tabs;
    if (tab === "player") {
      const deck = APP().deck(), cmd = deck && deck.commanders || [];
      const profs = store.get(PROFILES, []);
      body += '<label class="gm-lbl">Name</label><input class="gm-in" id="pname" value="' + esc(p.name) + '" maxlength="18" autocomplete="off">' +
        '<label class="gm-lbl">Background art (any card)</label><input class="gm-in" id="part" placeholder="Search a card name" autocomplete="off" autocapitalize="none"><div id="partres" class="gm-res"></div>' +
        (cmd.length ? '<div class="gm-row">' + cmd.map((n) => '<button class="gm-chip" data-setart="' + esc(n) + '">Use ' + esc(n.split(",")[0]) + "</button>").join("") + "</div>" : "") +
        '<div class="gm-row"><button class="gm-chip" data-art2>Partner or second commander art' + (p.art2 ? ": " + esc(p.art2.split(",")[0]) : "") + "</button>" + (p.art2 ? '<button class="gm-chip" data-clear2>Remove</button>' : "") + "</div>" +
        '<label class="gm-lbl">Color</label><div class="gm-row">' + COLORS.map((c) => '<button class="gm-sw' + (c === p.color ? " on" : "") + '" data-color="' + c + '" style="background:' + c + '"></button>').join("") + "</div>" +
        '<label class="gm-lbl">Profiles</label><div class="gm-row">' + profs.map((f, i) => '<button class="gm-chip" data-prof="' + i + '">' + esc(f.name) + "</button>").join("") + '<button class="gm-chip on" data-saveprof>Save as profile</button></div>' +
        '<div class="gm-row"><button class="gm-chip' + (p.ko ? " on" : "") + '" data-ko>' + (p.ko ? "Back in the game" : "Mark as knocked out") + "</button></div>";
    } else if (tab === "counters") {
      body += '<div class="gm-grid">' + COUNTERS.map((d) => {
        const v = p.c[d.k] || 0;
        return '<div class="gm-ct' + (v ? " on" : "") + '"><button class="gm-ctmain" data-ct="' + d.k + '"><span class="ic">' + d.icon + "</span>" + esc(d.label) + (d.flag ? "" : "<b>" + v + "</b>") + "</button>" +
          (d.flag ? "" : '<button class="gm-minus" data-ctm="' + d.k + '">−</button>') + ruleLink(d.rule) + "</div>";
      }).join("") + "</div>" +
        '<div class="gm-row"><span class="gm-lbl" style="margin:0">Day / night (whole table)</span>' + ["", "day", "night"].map((v) => '<button class="gm-chip' + (game.day === v ? " on" : "") + '" data-day="' + v + '">' + (v || "off") + "</button>").join("") + ruleLink("731") + "</div>" +
        '<div class="gm-rule"></div><div class="gm-note">Tap a counter to add. Poison at 10 loses the game ' + ruleLink("704.5c") + ".</div>";
    } else {
      body += '<div class="gm-note">Damage ' + esc(p.name) + " has taken from each commander. It also comes off their life. 21 from one commander loses the game " + ruleLink("903.10a") + ".</div>" +
        opps.map((q) => [0, q.art2 ? 1 : -1].filter((s) => s >= 0).map((slot) => {
          const v = (p.cmd[q.id] || [0, 0])[slot];
          return '<div class="gm-cmd' + (v >= 21 ? " lethal" : "") + '"><div class="gm-cmdart" data-art="' + esc(slot ? q.art2 : q.art) + '" style="--pc:' + q.color + '"></div><span>' + esc(q.name) + (slot ? " (partner)" : "") + '</span><button class="gm-minus" data-cmdd="' + q.id + ":" + slot + ':-1">−</button><b>' + v + '</b><button class="gm-minus" data-cmdd="' + q.id + ":" + slot + ':1">+</button></div>';
        }).join("")).join("") + '<div class="gm-rule"></div>';
    }
    const bg = modal(p.name, body, (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.tab) return playerMenu(pid, t.dataset.tab);
      if (t.dataset.ct) { changeCounter(pid, t.dataset.ct, 1); haptic(); return playerMenu(pid, "counters"); }
      if (t.dataset.ctm) { changeCounter(pid, t.dataset.ctm, -1); return playerMenu(pid, "counters"); }
      if (t.dataset.day !== undefined) { game.day = t.dataset.day; save(); return playerMenu(pid, "counters"); }
      if (t.dataset.cmdd) { const [from, slot, d] = t.dataset.cmdd.split(":").map(Number); changeCmd(pid, from, slot, d); haptic(); return playerMenu(pid, "cmd"); }
      if (t.dataset.color) { p.color = t.dataset.color; save(); render(); return playerMenu(pid, "player"); }
      if (t.dataset.setart) { if (pickingArt2) { p.art2 = t.dataset.setart; pickingArt2 = false; } else p.art = t.dataset.setart; save(); render(); return playerMenu(pid, "player"); }
      if (t.dataset.art2 !== undefined) { pickingArt2 = true; $("#part").placeholder = "Search the partner's card"; $("#part").focus(); return; }
      if (t.dataset.clear2 !== undefined) { p.art2 = null; save(); render(); return playerMenu(pid, "player"); }
      if (t.dataset.prof) { const f = store.get(PROFILES, [])[+t.dataset.prof]; Object.assign(p, { name: f.name, art: f.art, art2: f.art2 || null, color: f.color || p.color }); save(); render(); return playerMenu(pid, "player"); }
      if (t.dataset.saveprof !== undefined) { const profs = store.get(PROFILES, []).filter((f) => f.name !== p.name); profs.push({ name: p.name, art: p.art, art2: p.art2, color: p.color }); store.set(PROFILES, profs.slice(-30)); return playerMenu(pid, "player"); }
      if (t.dataset.ko !== undefined) { p.ko = !p.ko; log({ pid, kind: "ko", d: 0, v: p.ko ? 1 : 0 }); if (p.ko && game.clock.active === pid) nextTurn(); save(); return playerMenu(pid, "player"); }
    });
    hydrateArt(bg);
    const name = $("#pname");
    if (name) name.addEventListener("change", () => { p.name = name.value.trim() || p.name; save(); render(); });
    const art = $("#part");
    if (art) art.addEventListener("input", () => {
      const q = art.value.trim().toLowerCase(), res = $("#partres");
      if (q.length < 2) { res.innerHTML = ""; return; }
      const list = APP().CARDS().filter((c) => c.n.toLowerCase().includes(q)).sort((a, b) => (a.n.toLowerCase().startsWith(q) ? 0 : 1) - (b.n.toLowerCase().startsWith(q) ? 0 : 1)).slice(0, 8);
      res.innerHTML = list.map((c) => '<button class="gm-chip" data-setart="' + esc(c.n) + '">' + esc(c.n) + "</button>").join("");
    });
  }
  let pickingArt2 = false;

  function gameMenu() {
    const c = game.clock;
    const body = '<label class="gm-lbl">New game</label><div class="gm-row">' + [2, 3, 4, 5, 6].map((n) => '<button class="gm-chip' + (n === game.players.length ? " on" : "") + '" data-n="' + n + '">' + n + " players</button>").join("") + "</div>" +
      '<div class="gm-row">' + [20, 25, 30, 40].map((l) => '<button class="gm-chip' + (l === game.life ? " on" : "") + '" data-life="' + l + '">' + l + " life</button>").join("") + "</div>" +
      '<div class="gm-row"><button class="gm-chip on" data-restart>Restart with the same players</button><button class="gm-chip" data-seat>Randomize seating</button></div>' +
      '<label class="gm-lbl">Chess clock</label><div class="gm-row"><button class="gm-chip' + (c.on ? " on" : "") + '" data-clockon>' + (c.on ? "On" : "Off") + "</button>" +
      [0, 1, 2, 3, 5].map((m) => '<button class="gm-chip' + (c.limit === m ? " on" : "") + '" data-limit="' + m + '">' + (m ? m + " min turns" : "No turn limit") + "</button>").join("") + "</div>" +
      '<div class="gm-row"><button class="gm-chip" data-resetclock>Reset all clocks</button></div>' +
      '<label class="gm-lbl">Device</label><div class="gm-row"><button class="gm-chip' + (opts.haptics ? " on" : "") + '" data-hap>Haptic taps ' + (opts.haptics ? "on" : "off") + '</button></div><div class="gm-note">Haptics work on iPhone (iOS 18 or later). iPads have no haptic motor.</div>';
    modal("Game", body, (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const keep = () => game.players.map((p) => ({ name: p.name, art: p.art, art2: p.art2, color: p.color }));
      if (t.dataset.n) { if (!confirm("Start a new " + t.dataset.n + "-player game?")) return; opts.count = +t.dataset.n; store.set(OPTS, opts); newGame({ ...opts, life: game.life, seats: keep() }); closeModal(); return render(); }
      if (t.dataset.life) { if (!confirm("Start a new game at " + t.dataset.life + " life?")) return; opts.life = +t.dataset.life; store.set(OPTS, opts); newGame({ ...opts, count: game.players.length, seats: keep() }); closeModal(); return render(); }
      if (t.dataset.restart !== undefined) { if (!confirm("Reset life, counters and clocks?")) return; newGame({ ...opts, count: game.players.length, life: game.life, clock: c.on, limit: c.limit, seats: keep() }); closeModal(); return render(); }
      if (t.dataset.seat !== undefined) { game.players = shuffle(game.players); save(); closeModal(); return render(); }
      if (t.dataset.clockon !== undefined) { c.on = !c.on; c.running = false; opts.clock = c.on; store.set(OPTS, opts); save(); closeModal(); return render(); }
      if (t.dataset.limit) { c.limit = +t.dataset.limit; c.warned = 0; opts.limit = c.limit; store.set(OPTS, opts); save(); return gameMenu(); }
      if (t.dataset.resetclock !== undefined) { game.players.forEach((p) => (p.time = 0)); Object.assign(c, { turn: 1, turnUsed: 0, running: false, active: game.players[0].id, holder: game.players[0].id, warned: 0 }); save(); closeModal(); return; }
      if (t.dataset.hap !== undefined) { opts.haptics = !opts.haptics; store.set(OPTS, opts); haptic(); return gameMenu(); }
    });
  }

  function diceMenu(result) {
    const dice = [4, 6, 8, 10, 12, 20];
    const body = '<div class="gm-result">' + (result || "Roll a die or flip a coin") + "</div>" +
      '<div class="gm-dice"><button data-coin>Coin</button>' + dice.map((d) => '<button data-d="' + d + '">d' + d + "</button>").join("") + '<button data-custom>d?</button></div>' +
      '<div class="gm-row"><button class="gm-chip on" data-rp>Random player</button><button class="gm-chip" data-ro>Random opponent</button></div>';
    modal("Dice & coins", body, (e) => {
      const t = e.target.closest("button"); if (!t) return;
      haptic();
      const r = (n) => 1 + Math.floor(Math.random() * n);
      if (t.dataset.coin !== undefined) return diceMenu(Math.random() < 0.5 ? "Heads" : "Tails");
      if (t.dataset.d) return diceMenu("d" + t.dataset.d + ": <b>" + r(+t.dataset.d) + "</b>");
      if (t.dataset.custom !== undefined) { const n = parseInt(prompt("How many sides?", "100"), 10); if (n > 1) diceMenu("d" + n + ": <b>" + r(n) + "</b>"); return; }
      const alive = living();
      if (t.dataset.rp !== undefined) return diceMenu("<b>" + esc(alive[r(alive.length) - 1].name) + "</b>");
      if (t.dataset.ro !== undefined) { const me = game.clock.on ? game.clock.active : null, pool = alive.filter((p) => p.id !== me); return diceMenu((me != null ? esc(P(me).name) + " targets " : "") + "<b>" + esc(pool[r(pool.length) - 1].name) + "</b>"); }
    });
  }

  function manaMenu() {
    const m = game.mana, rows = [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["C", "Colorless"], ["storm", "Storm count"]];
    const body = rows.map(([k, l]) => '<div class="gm-mana"><i class="ms ' + (k === "storm" ? "" : k) + '">' + (k === "storm" ? "⚡︎" : k) + "</i><span>" + l + '</span><button class="gm-minus" data-m="' + k + ':-1">−</button><b>' + m[k] + '</b><button class="gm-minus" data-m="' + k + ':1">+</button></div>').join("") +
      '<div class="gm-row"><button class="gm-chip" data-clear>Clear</button></div>';
    modal("Mana & storm", body, (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.dataset.m) { const [k, d] = t.dataset.m.split(":"); m[k] = Math.max(0, m[k] + +d); haptic(); save(); return manaMenu(); }
      if (t.dataset.clear !== undefined) { Object.keys(m).forEach((k) => (m[k] = 0)); save(); return manaMenu(); }
    });
  }

  function logView() {
    const name = (id) => { const p = P(id); return p ? esc(p.name) : "?"; };
    const label = (e) => e.kind === "life" ? "life " + (e.d > 0 ? "+" : "") + e.d + " → " + e.v
      : e.kind === "cmd" ? "commander damage from " + name(e.from) + " " + (e.d > 0 ? "+" : "") + e.d + " → " + e.v
      : e.kind === "counter" ? (COUNTERS.find((d) => d.k === e.k) || { label: e.k }).label + (e.d ? " " + (e.d > 0 ? "+" : "") + e.d + " → " + e.v : e.v ? " gained" : " lost")
      : e.kind === "ko" ? (e.v ? "knocked out ☠" : "back in") : "turn " + e.v + " starts";
    const groups = [];
    for (const e of game.log.slice().reverse()) {
      const key = e.turn + ":" + e.active;
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) groups.push((g = { key, turn: e.turn, active: e.active, items: [] }));
      if (e.kind !== "turn") g.items.push(e);
    }
    const body = groups.length ? groups.map((g) => '<div class="gm-turn"><div class="gm-th">Turn ' + g.turn + " · " + name(g.active) + "</div>" + (g.items.length ? g.items.map((e) => '<div class="gm-le"><b style="color:' + (P(e.pid) || {}).color + '">' + name(e.pid) + "</b> " + label(e) + "</div>").join("") : '<div class="gm-le gm-note">No changes</div>') + "</div>").join("") : '<div class="gm-note">Nothing has happened yet.</div>';
    modal("Game log", body);
  }

  // ---------- open / close ----------
  async function keepAwake() { try { if ("wakeLock" in navigator && open) wake = await navigator.wakeLock.request("screen"); } catch (e) { /* not allowed right now */ } }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && open) keepAwake(); });
  function openTable() {
    if (!game) newGame(opts);
    open = true;
    let g = $("#game");
    if (!g) { g = document.createElement("div"); g.id = "game"; document.body.appendChild(g); bind(); }
    g.classList.remove("hidden");
    document.body.classList.add("ingame");
    render(); startTicking(); keepAwake();
  }
  function close() {
    if (game && game.clock.running) setRunning(false);
    open = false; stopTicking();
    const g = $("#game"); if (g) g.classList.add("hidden");
    document.body.classList.remove("ingame");
    if (wake) { wake.release().catch(() => {}); wake = null; }
    renderSetup();
  }
  window.addEventListener("resize", () => { if (open) { render(); } });

  // ---------- the Play tab (outside a game) ----------
  function renderSetup() {
    const el = $("#playsetup"); if (!el) return;
    const g = game, profs = store.get(PROFILES, []);
    let h = "";
    if (g) {
      const leader = g.players.filter((p) => !p.ko).sort((a, b) => b.life - a.life)[0];
      h += '<div class="panel item"><b>Game in progress</b><div class="d">' + g.players.length + " players · turn " + g.clock.turn + " · started " + new Date(g.started).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) +
        (leader ? " · " + esc(leader.name) + " leads at " + leader.life : "") + '</div><div class="chips"><button class="btn primary" data-p="resume">Resume game</button><button class="btn" data-p="discard">End game</button></div></div>';
    }
    h += '<section class="block"><h2>New game</h2><div class="panel item">' +
      '<div class="d">Players</div><div class="chips" style="padding-top:6px">' + [2, 3, 4, 5, 6].map((n) => '<button class="chip' + (opts.count === n ? " on" : "") + '" data-p="count" data-v="' + n + '">' + n + "</button>").join("") + "</div>" +
      '<div class="d" style="margin-top:10px">Starting life</div><div class="chips" style="padding-top:6px">' + [20, 25, 30, 40].map((n) => '<button class="chip' + (opts.life === n ? " on" : "") + '" data-p="life" data-v="' + n + '">' + n + "</button>").join("") + "</div>" +
      '<div class="d" style="margin-top:10px">Chess clock</div><div class="chips" style="padding-top:6px"><button class="chip' + (opts.clock ? " on" : "") + '" data-p="clock">' + (opts.clock ? "On" : "Off") + "</button>" +
      [0, 1, 2, 3, 5].map((m) => '<button class="chip' + (opts.limit === m ? " on" : "") + '" data-p="limit" data-v="' + m + '">' + (m ? m + " min turns" : "No turn limit") + "</button>").join("") + "</div>" +
      '<div class="chips"><button class="chip' + (opts.random ? " on" : "") + '" data-p="random">Random seating</button></div>' +
      (profs.length ? '<div class="d" style="margin-top:10px">Saved players: ' + profs.map((f) => esc(f.name)).join(", ") + " · load them from a player's menu during the game</div>" : "") +
      '<div class="chips"><button class="btn primary" data-p="start">' + (g ? "Start a new game" : "Start game") + "</button></div></div></section>" +
      '<div class="d" style="margin:14px 2px">Set the iPad in the middle of the table. Each panel faces its player. Tap the top of a panel for +1 and the bottom for −1; hold for 10. Tap a player\'s name for counters, commander damage and art. With the clock on, tap your own clock to pass the turn, or another player\'s clock to give them priority.</div>';
    el.innerHTML = h;
  }
  function initSetup() {
    const el = $("#playsetup"); if (!el || el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      const a = b.dataset.p, v = +b.dataset.v;
      if (a === "count") opts.count = v;
      if (a === "life") opts.life = v;
      if (a === "clock") opts.clock = !opts.clock;
      if (a === "limit") opts.limit = v;
      if (a === "random") opts.random = !opts.random;
      store.set(OPTS, opts);
      if (a === "resume") return openTable();
      if (a === "discard") { if (confirm("End this game? Its life totals and log will be cleared.")) { game = null; store.set(SAVE, null); } }
      if (a === "start") {
        if (game && !confirm("Start a new game? The current one will be replaced.")) return;
        const seats = game ? game.players.map((p) => ({ name: p.name, art: p.art, art2: p.art2, color: p.color })) : [];
        const deck = APP().deck();
        if (!seats.length && deck && deck.commanders && deck.commanders[0]) seats.push({ name: "Player 1", art: deck.commanders[0], art2: deck.commanders[1] || null });
        newGame({ ...opts, seats });
        return openTable();
      }
      renderSetup();
    });
    renderSetup();
  }

  window.MTGPlay = { init: initSetup, open: openTable, render: renderSetup };
})();

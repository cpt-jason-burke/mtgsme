// Transporter console: the animated entrance to the Star Trek signed headliners.
// Loaded only when it opens. Trek.open({cards, set, finds, onCard, onAll, onClose}) shows it full-screen;
// Trek.beam(canvas, columns, opts) is the beam-in effect on its own. Original art; sounds are generated and start off.
(function (root) {
  "use strict";
  const R = 680 / 488;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 });
  const url = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const CSS = `
.tk{--tk-bg:#06080e;--tk-panel:#111624;--tk-line:#2a3350;--tk-text:#e9eef8;--tk-mute:#8d97ad;--tk-amber:#f0a03c;--tk-ice:#9fc8ff;--tk-lilac:#b9a6ea;--tk-rose:#e3806d;--p:0;
  position:fixed;inset:0;z-index:1000;background:var(--tk-bg);color:var(--tk-text);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);opacity:0;transition:opacity .3s;-webkit-tap-highlight-color:transparent}
.tk.open{opacity:1}
.tk *{box-sizing:border-box}
.tk button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.tk :focus-visible{outline:2px solid var(--tk-ice);outline-offset:2px}
.tk-room{position:relative;height:100%;max-width:560px;margin:0 auto;display:flex;flex-direction:column;overflow:hidden}
.tk-lab{font-family:"Avenir Next Condensed","Helvetica Neue","Arial Narrow",Arial,sans-serif;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.tk-top{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px}
.tk-top h1{flex:1;min-width:0;margin:0;font-size:13.5px;letter-spacing:.07em;color:var(--tk-amber);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tk-top h1 small{display:block;font:500 12px/1.2 inherit;letter-spacing:0;text-transform:none;color:var(--tk-mute);overflow:hidden;text-overflow:ellipsis}
.tk .tk-btn{flex:none;min-height:40px;min-width:40px;padding:0 11px;border-radius:20px;border:1px solid var(--tk-line);background:var(--tk-panel);font-size:13px;color:var(--tk-text)}
.tk .tk-btn[aria-pressed="true"]{border-color:var(--tk-amber);color:var(--tk-amber)}
.tk-stage{position:relative;flex:1;min-height:0;
  background:radial-gradient(70% 34% at 50% 0%,rgba(159,200,255,calc(.1 + var(--p)*.3)),transparent 70%),repeating-linear-gradient(90deg,transparent 0 13.6%,rgba(159,200,255,.045) 13.6% 14.2857%),linear-gradient(180deg,#0b101c,#06080e 62%)}
.tk-stage::before{content:"";position:absolute;left:8%;right:8%;top:0;height:6px;border-radius:0 0 6px 6px;background:var(--tk-ice);opacity:calc(.25 + var(--p)*.75);box-shadow:0 0 calc(8px + var(--p)*30px) var(--tk-ice)}
.tk-pad,.tk-show{position:absolute;inset:0;transition:opacity .5s}
.tk-floor{position:absolute;left:-6%;right:-6%;top:40%;bottom:-4%;border-radius:50%;background:radial-gradient(closest-side,#1a2136,#0d111c 72%,transparent);border-top:1px solid var(--tk-line)}
.tk-disc{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(159,200,255,calc(.22 + var(--p)*.7)),rgba(159,200,255,.06) 62%,transparent);border:1px solid rgba(159,200,255,calc(.25 + var(--p)*.5))}
.tk-pc{position:absolute;border-radius:4.75%/3.5%;overflow:hidden;opacity:0;filter:brightness(3) saturate(0) blur(3px);transition:opacity 1.1s,filter 1.5s}
.tk-pc.in{opacity:1;filter:none}
.tk-pc img,.tk-card img{display:block;width:100%;height:100%;object-fit:cover}
.tk-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.tk-console{flex:none;display:grid;grid-template-columns:1fr auto 1fr;gap:6px 12px;align-items:center;padding:14px 14px 8px;max-height:340px;overflow:hidden;
  background:linear-gradient(180deg,#151b2b,#0a0d16);border-top:2px solid var(--tk-line);border-radius:24px 24px 0 0;transition:max-height .5s,opacity .4s,padding .5s}
.tk-keys{display:grid;gap:7px;min-width:0}
.tk-key{height:30px;display:flex;align-items:center;padding:0 10px;font-size:11px;color:#0a0d16;opacity:.3;transition:opacity .25s,box-shadow .25s;white-space:nowrap;overflow:hidden}
.tk-keys.l .tk-key{border-radius:15px 4px 4px 15px;justify-content:flex-end}
.tk-keys.r .tk-key{border-radius:4px 15px 15px 4px}
.tk-key.on{opacity:1;box-shadow:0 0 14px currentColor}
.tk-key:nth-child(1){background:var(--tk-lilac)}.tk-key:nth-child(2){background:var(--tk-ice)}.tk-key:nth-child(3){background:var(--tk-rose)}.tk-key:nth-child(4){background:var(--tk-amber)}
.tk-key.on:nth-child(1){box-shadow:0 0 14px var(--tk-lilac)}.tk-key.on:nth-child(2){box-shadow:0 0 14px var(--tk-ice)}.tk-key.on:nth-child(3){box-shadow:0 0 14px var(--tk-rose)}.tk-key.on:nth-child(4){box-shadow:0 0 14px var(--tk-amber)}
.tk-slide{position:relative;width:132px;height:172px;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-radius:14px;background:#04060a;border:1px solid var(--tk-line);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
.tk-track{position:relative;border-radius:8px;background:#0f1422;overflow:hidden}
.tk-track i{position:absolute;left:0;right:0;bottom:0;height:calc(var(--p)*100%);background:linear-gradient(0deg,var(--tk-amber),var(--tk-ice))}
.tk-track::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 11px,rgba(4,6,10,.55) 11px 13px)}
.tk-handle{position:absolute;left:4px;right:4px;height:36px;bottom:calc(6px + var(--p)*(100% - 48px));border-radius:10px;background:linear-gradient(180deg,#f7f9ff,#a9b6d8);box-shadow:0 4px 12px rgba(0,0,0,.6),0 0 calc(var(--p)*26px) var(--tk-ice);display:flex;align-items:center;justify-content:center;color:#28324e;font-size:15px}
.tk-slide.back{--p:0}
.tk-slide.back .tk-handle,.tk-slide.back .tk-track i{transition:bottom .35s,height .35s}
.tk-s-ready .tk-handle span{animation:tk-nudge 1.4s ease-in-out infinite}
@keyframes tk-nudge{50%{transform:translateY(-5px)}}
.tk-say{grid-column:1/-1;text-align:center;font-size:13px;color:var(--tk-amber);min-height:18px}
.tk-note{grid-column:1/-1;text-align:center;font-size:10.5px;line-height:1.3;color:var(--tk-mute);opacity:.8}
.tk-show{display:flex;flex-direction:column;opacity:0;pointer-events:none}
.tk-s-show .tk-show{opacity:1;pointer-events:auto}
.tk-s-show .tk-pad,.tk-s-show .tk-fx{opacity:0}
.tk-s-show .tk-console{max-height:0;opacity:0;padding-top:0;padding-bottom:0;border-top-width:0}
.tk-s-show .tk-skip{display:none}
.tk-car{position:relative;flex:1;min-height:0;display:flex;align-items:center;gap:16px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;padding:8px calc(50% - var(--cw,240px)/2);scrollbar-width:none}
.tk-car::-webkit-scrollbar{display:none}
.tk .tk-card{position:relative;flex:0 0 var(--cw,240px);height:calc(var(--cw,240px)*1.3934);scroll-snap-align:center;border-radius:4.75%/3.5%;overflow:hidden;background:#141926;opacity:.55;
  transform:perspective(800px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) scale(.9);transition:transform .25s,opacity .25s,box-shadow .25s}
.tk .tk-card.focus{opacity:1;transform:perspective(800px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));box-shadow:0 18px 40px rgba(0,0,0,.7),0 0 34px rgba(159,200,255,.28)}
.tk-card::after{content:"";position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:0;background:linear-gradient(115deg,transparent 30%,rgba(159,200,255,.32) 44%,rgba(255,236,200,.38) 50%,rgba(185,166,234,.3) 56%,transparent 70%) 0 0/300% 100%}
.tk-card.focus::after{opacity:1;animation:tk-foil 5s linear infinite}
@keyframes tk-foil{from{background-position:120% 0}to{background-position:-60% 0}}
.tk-cap{flex:none;text-align:center;padding:2px 16px 0}
.tk-cap b{display:block;font-size:18px;line-height:1.25}
.tk-cap span{display:block;font-size:13.5px;color:var(--tk-mute)}
.tk-cap em{font-style:normal;font-weight:700;color:var(--tk-amber)}
.tk-dots{flex:none;display:flex;justify-content:center;gap:6px;padding:10px 0 2px}
.tk-dots i{width:6px;height:6px;border-radius:3px;background:var(--tk-line);transition:width .2s,background .2s}
.tk-dots i.on{width:18px;background:var(--tk-amber)}
.tk-acts{flex:none;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;padding:10px 16px 14px}
.tk-scrim{position:absolute;inset:0;background:rgba(3,4,8,.6);opacity:0;pointer-events:none;transition:opacity .3s}
.tk-info{position:absolute;left:0;right:0;bottom:0;max-height:86%;display:flex;flex-direction:column;background:var(--tk-panel);border-top:2px solid var(--tk-amber);border-radius:22px 22px 0 0;transform:translateY(102%);visibility:hidden;transition:transform .32s,visibility 0s .32s}
.tk-s-info .tk-scrim{opacity:1;pointer-events:auto}
.tk-s-info .tk-info{transform:none;visibility:visible;transition:transform .32s}
.tk-ihead{flex:none;display:flex;align-items:center;gap:10px;padding:12px 12px 10px 16px}
.tk-ihead h2{flex:1;min-width:0;margin:0;font-size:17px;line-height:1.25}
.tk-ihead h2 small{display:block;font-size:11px;color:var(--tk-amber)}
.tk-ibody{overflow-y:auto;padding:0 16px 18px;-webkit-overflow-scrolling:touch}
.tk-row{display:flex;gap:12px;padding:8px 0;border-top:1px solid var(--tk-line);font-size:14.5px}
.tk-row>span{flex:0 0 104px;color:var(--tk-mute);font-size:13px}
.tk-row>div{flex:1;min-width:0;overflow-wrap:anywhere}
.tk-row ul{margin:0;padding-left:18px}
.tk-links{display:flex;flex-wrap:wrap;gap:8px;padding:12px 0 4px}
.tk-links a{display:inline-flex;align-items:center;text-decoration:none}
.tk-fine{font-size:12px;color:var(--tk-mute);margin:8px 0 0}
@media (prefers-reduced-motion:reduce){.tk,.tk *{animation:none!important;transition:none!important}}
`;

  // The beam-in effect. columns: [{x, y, w, h, delay}] in CSS pixels on the canvas; opts.onCol(i) fires as column i fills in, opts.done() at the end.
  function beam(canvas, columns, opts) {
    opts = opts || {};
    const dpr = Math.min(2, root.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const g = canvas.getContext("2d"), per = Math.max(12, Math.min(52, Math.floor(380 / Math.max(1, columns.length))));
    const cols = columns.map((c) => ({ c, hit: false, parts: Array.from({ length: per }, () => ({ x: Math.random(), y: Math.random(), v: 0.15 + Math.random() * 0.5, r: 0.5 + Math.random() * 1.1, len: 2 + Math.random() * 9, ph: Math.random() * 6.28, sp: 4 + Math.random() * 9, warm: Math.random() < 0.22 })) }));
    const LEN = 2.7, total = Math.max.apply(null, columns.map((c) => c.delay || 0)) + LEN;
    let t = 0, last = 0, raf = 0, stopped = false;
    function frame(now) {
      if (stopped) return;
      t += Math.min(0.05, last ? (now - last) / 1000 : 0); last = now;   // a hidden tab pauses the clock
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < cols.length; i++) {
        const o = cols[i], c = o.c, lt = t - (c.delay || 0);
        if (lt <= 0 || lt >= LEN) continue;
        if (!o.hit && lt > 0.75) { o.hit = true; if (opts.onCol) opts.onCol(i); }
        const e = lt < 0.5 ? lt / 0.5 : lt > 1.8 ? Math.max(0, 1 - (lt - 1.8) / 0.9) : 1;
        const grd = g.createLinearGradient(0, c.y, 0, c.y + c.h);
        grd.addColorStop(0, "rgba(159,200,255,0)"); grd.addColorStop(0.2, "rgba(159,200,255," + 0.2 * e + ")"); grd.addColorStop(1, "rgba(200,225,255," + 0.34 * e + ")");
        g.fillStyle = grd; g.fillRect(c.x, c.y, c.w, c.h);
        for (const p of o.parts) {
          p.y -= p.v * 0.016; if (p.y < 0) p.y += 1;
          const a = e * (0.35 + 0.65 * Math.abs(Math.sin(t * p.sp + p.ph))), px = c.x + p.x * c.w, py = c.y + p.y * c.h;
          g.fillStyle = p.warm ? "rgba(255,226,170," + a + ")" : "rgba(205,230,255," + a + ")";
          g.fillRect(px - 0.4, py - p.len, 0.8, p.len * 2);
          g.beginPath(); g.arc(px, py, p.r, 0, 6.28); g.fill();
        }
      }
      if (t >= total) { g.clearRect(0, 0, W, H); if (opts.done) opts.done(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return { stop() { stopped = true; cancelAnimationFrame(raf); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); } };
  }

  // Generated sounds (no recordings). Nothing plays until the viewer turns sound on.
  function sounds() {
    let ctx = null, on = false, hum = null;
    const now = () => ctx.currentTime;
    function tone(f, at, dur, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + dur + 0.05);
    }
    function humStop() { if (hum) { const h = hum; hum = null; h.g.gain.linearRampToValueAtTime(0, now() + 0.2); h.o.stop(now() + 0.25); } }
    return {
      toggle() {
        on = !on;
        if (on && !ctx) { const A = root.AudioContext || root.webkitAudioContext; if (A) ctx = new A(); else on = false; }
        if (on && ctx.state === "suspended") ctx.resume();
        if (!on && ctx) humStop();
        if (on) tone(1320, now(), 0.12, 0.05);
        return on;
      },
      blip() { if (on) { tone(1180, now(), 0.09, 0.05); tone(1570, now() + 0.07, 0.12, 0.05); } },
      hum(p) {
        if (!on) return;
        if (p <= 0) return humStop();
        if (!hum) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; g.gain.value = 0; o.connect(g).connect(ctx.destination); o.start(); hum = { o, g }; }
        hum.o.frequency.setTargetAtTime(90 + p * 150, now(), 0.05); hum.g.gain.setTargetAtTime(0.02 + p * 0.05, now(), 0.05);
      },
      energize(len) {
        if (!on) return;
        humStop();
        const t0 = now(), m = ctx.createGain();
        m.gain.setValueAtTime(0, t0); m.gain.linearRampToValueAtTime(0.09, t0 + 0.9); m.gain.setValueAtTime(0.09, t0 + len - 1.5); m.gain.linearRampToValueAtTime(0, t0 + len);
        m.connect(ctx.destination);
        [1046.5, 1318.5, 1568, 2093, 2637, 3136, 4186].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
          o.frequency.setValueAtTime(f, t0); o.frequency.linearRampToValueAtTime(f * 1.03, t0 + len);
          g.gain.value = 0.5 / (1 + i * 0.35); l.frequency.value = 5 + Math.random() * 7; lg.gain.value = g.gain.value * 0.9;
          l.connect(lg).connect(g.gain); o.connect(g).connect(m); o.start(t0); l.start(t0); o.stop(t0 + len + 0.1); l.stop(t0 + len + 0.1);
        });
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * (len + 0.1)), ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
        n.buffer = buf; bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 0.9; ng.gain.value = 0.16;
        n.connect(bp).connect(ng).connect(m); n.start(t0);
      },
      close() { if (ctx) { humStop(); ctx.close(); ctx = null; on = false; } },
    };
  }

  function open(o) {
    const cards = o.cards || [], set = o.set || {}, finds = o.finds || [], n = cards.length;
    const still = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!document.getElementById("tk-css")) { const s = document.createElement("style"); s.id = "tk-css"; s.textContent = CSS; document.head.appendChild(s); }
    const nFinds = (c) => finds.filter((f) => String(f.card || "").toLowerCase() === c.key).length;
    const market = (c) => (c.tcg && c.tcg.market) || c.sf || null;
    const price = (c) => { const m = market(c), low = c.tcg && c.tcg.low; return m ? "<em>" + money(m) + "</em> recent sales" : low ? "<em>" + money(low) + "</em> asking" : "No price yet"; };
    const pic = (c) => (c.img && c.img.n ? '<img src="' + esc(c.img.n) + '" alt="' + esc(c.name) + '" draggable="false">' : "");
    // seven pads: three in front, four behind (captains in front when the list is the Star Trek seven)
    const front = n === 7 ? [0, 1, 4] : cards.map((c, i) => i).slice(0, Math.round((n * 3) / 7));
    const back = cards.map((c, i) => i).filter((i) => !front.includes(i));
    const pos = [];
    front.forEach((ci, k) => { pos[ci] = { cx: (k + 1) / (front.length + 1) * 1.04 - 0.02, by: 0.92, f: 1 }; });
    back.forEach((ci, k) => { pos[ci] = { cx: back.length > 1 ? 0.15 + (k * 0.7) / (back.length - 1) : 0.5, by: 0.57, f: 0 }; });
    const order = back.concat(front);

    const el = document.createElement("div");
    el.className = "tk"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Transporter room");
    el.innerHTML = '<div class="tk-room tk-s-ready">' +
      '<div class="tk-top"><button class="tk-btn" data-a="close" aria-label="Close">✕</button><h1 class="tk-lab">Transporter room<small>' + esc(set.title || set.name || "Headliners") + "</small></h1>" +
      '<button class="tk-btn tk-skip" data-a="skip">Skip</button><button class="tk-btn" data-a="sound" aria-pressed="false">Sound off</button></div>' +
      '<div class="tk-stage"><div class="tk-pad" aria-hidden="true"><div class="tk-floor"></div>' + cards.map(() => '<div class="tk-disc"></div>').join("") + cards.map((c) => '<div class="tk-pc">' + pic(c) + "</div>").join("") + "</div>" +
      '<canvas class="tk-fx" aria-hidden="true"></canvas>' +
      '<div class="tk-show"><div class="tk-car">' + cards.map((c, i) => '<button class="tk-card" data-i="' + i + '" aria-label="' + esc(c.name) + ', details">' + pic(c) + "</button>").join("") + "</div>" +
      '<div class="tk-cap" aria-live="polite"></div><div class="tk-dots" aria-hidden="true">' + cards.map(() => "<i></i>").join("") + "</div>" +
      '<div class="tk-acts">' + (still ? "" : '<button class="tk-btn" data-a="again">Beam in again</button>') + (o.onAll ? '<button class="tk-btn" data-a="all">All headliners</button>' : "") + "</div></div></div>" +
      '<div class="tk-console"><div class="tk-keys l tk-lab" aria-hidden="true"><div class="tk-key">Lock</div><div class="tk-key">Scan</div><div class="tk-key">Buffer</div><div class="tk-key">Energize</div></div>' +
      '<div class="tk-slide" role="slider" tabindex="0" aria-label="Energize. Slide up, or press Enter." aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="tk-track"><i></i></div><div class="tk-track"><i></i></div><div class="tk-track"><i></i></div><div class="tk-handle"><span>▲</span></div></div>' +
      '<div class="tk-keys r tk-lab" aria-hidden="true"><div class="tk-key">' + n + ' pads</div><div class="tk-key">Signed</div><div class="tk-key">&lt; 250 each</div><div class="tk-key">Foil</div></div>' +
      '<div class="tk-say tk-lab" role="status"></div>' + (set.notice ? '<div class="tk-note">' + esc(set.notice) + "</div>" : "") + "</div>" +
      '<div class="tk-scrim" data-a="shut"></div><div class="tk-info" aria-hidden="true"><div class="tk-ihead"><h2></h2><button class="tk-btn" data-a="shut" aria-label="Close details">✕</button></div><div class="tk-ibody"></div></div></div>';
    document.body.appendChild(el);
    const $ = (s) => el.querySelector(s), $$ = (s) => Array.from(el.querySelectorAll(s));
    const room = $(".tk-room"), stage = $(".tk-stage"), canvas = $(".tk-fx"), slide = $(".tk-slide"), say = $(".tk-say"), car = $(".tk-car");
    const pcs = $$(".tk-pc"), discs = $$(".tk-disc"), keys = $$(".tk-keys.l .tk-key"), rkeys = $$(".tk-keys.r .tk-key"), cels = $$(".tk-card"), dots = $$(".tk-dots i");
    const snd = sounds(), prevOverflow = document.body.style.overflow;
    let p = 0, busy = false, drag = null, fx = null, focus = -1, timer = 0, closed = false, rects = [];
    document.body.style.overflow = "hidden";

    function layout() {
      const W = stage.clientWidth, H = stage.clientHeight;
      if (!W || !H) return;
      const bh = Math.min(0.18 * W * R, 0.27 * H), fh = Math.min(0.23 * W * R, 0.34 * H);
      rects = pos.map((q, i) => {
        const h = q.f ? fh : bh, w = h / R, x = q.cx * W - w / 2, y = q.by * H - h;
        pcs[i].style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;z-index:" + (q.f ? 2 : 1);
        discs[i].style.cssText = "left:" + (q.cx * W - w * 0.64) + "px;top:" + (q.by * H - w * 0.2) + "px;width:" + w * 1.28 + "px;height:" + w * 0.4 + "px";
        return { x, y, w, h };
      });
      el.style.setProperty("--cw", Math.round(Math.max(120, Math.min(0.76 * W, 340, (H - 170) / R))) + "px");
    }
    function setP(v) {
      p = clamp(v); room.style.setProperty("--p", p.toFixed(3)); slide.style.setProperty("--p", p.toFixed(3)); slide.setAttribute("aria-valuenow", Math.round(p * 100));
      keys.forEach((k, i) => k.classList.toggle("on", p >= (i + 1) * 0.25 - 0.01));
      rkeys.forEach((k, i) => k.classList.toggle("on", p >= (i + 1) * 0.25 - 0.01));
      snd.hum(busy ? 0 : p);
    }
    function ready() {
      if (fx) fx.stop(); fx = null; clearTimeout(timer); busy = false;
      room.classList.remove("tk-s-show", "tk-s-go", "tk-s-info"); room.classList.add("tk-s-ready");
      pcs.forEach((x) => x.classList.remove("in")); setP(0);
      say.textContent = "Slide up to energize";
    }
    function show() {
      if (fx) fx.stop(); fx = null; clearTimeout(timer); busy = true; snd.hum(0);
      room.classList.remove("tk-s-ready", "tk-s-go"); room.classList.add("tk-s-show");
      setTimeout(() => { if (closed) return; layout(); setFocus(focus < 0 ? 0 : focus, true); center(focus, false); }, still ? 0 : 520);
    }
    function energize() {
      if (busy) return;
      busy = true; setP(1); layout(); room.classList.remove("tk-s-ready"); room.classList.add("tk-s-go"); say.textContent = "Energizing";
      const cols = order.map((ci, k) => { const r = rects[ci], top = Math.max(0, r.y - r.h * 0.9); return { x: r.x - r.w * 0.04, w: r.w * 1.08, y: top, h: r.y + r.h - top, delay: k * 0.17 }; });
      snd.energize(cols[cols.length - 1].delay + 2.9);
      fx = beam(canvas, cols, {
        onCol: (k) => pcs[order[k]].classList.add("in"),
        done: () => { fx = null; say.textContent = n + " aboard"; timer = setTimeout(show, 900); },
      });
    }
    function setFocus(i, force) {
      if (i === focus && !force) return;
      focus = i; const c = cards[i];
      cels.forEach((x, k) => x.classList.toggle("focus", k === i)); dots.forEach((x, k) => x.classList.toggle("on", k === i));
      $(".tk-cap").innerHTML = "<b>" + esc(c.name) + "</b><span>" + (c.signer ? "Signed by " + esc(c.signer) : "#" + esc(c.num)) + "</span><span>" + price(c) + " · tap the card for details</span>";
    }
    function center(i, smooth) { const x = cels[i]; car.scrollTo({ left: x.offsetLeft + x.offsetWidth / 2 - car.clientWidth / 2, behavior: smooth ? "smooth" : "auto" }); }
    function info(i) {
      const c = cards[i], m = market(c), f = nFinds(c), row = (k, v) => '<div class="tk-row"><span>' + esc(k) + "</span><div>" + v + "</div></div>";
      const finish = (c.fin || []).map(cap).concat(c.border === "borderless" ? ["borderless"] : []).join(", ");
      $(".tk-ihead h2").innerHTML = (c.signer ? '<small class="tk-lab">Signed by ' + esc(c.signer) + "</small>" : "") + esc(c.name);
      $(".tk-ibody").innerHTML = row("Card", esc((set.name || c.set) + " (" + c.set + ") #" + c.num)) + (c.artist ? row("Artist", esc(c.artist)) : "") + (finish ? row("Finish", esc(finish)) : "") +
        (set.run ? row("Print run", esc(set.run)) : "") + (set.odds ? row("Odds", esc(set.odds)) : "") +
        row("Recent sales", m ? money(m) : "None yet") + row("Lowest asking", c.tcg && c.tcg.low ? money(c.tcg.low) : "No listings") +
        (set.in ? row("Found in", "<ul>" + set.in.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>") : "") +
        row("Reported finds", f ? f + " (an estimate: one card can be reported twice)" : "None yet") +
        '<div class="tk-links">' + (o.onCard ? '<button class="tk-btn" data-a="full" data-i="' + i + '" aria-pressed="true">Full details</button>' : "") +
        (c.tcg && c.tcg.url ? '<a class="tk-btn" href="' + esc(url(c.tcg.url)) + '" target="_blank" rel="noopener">TCGplayer ↗</a>' : "") +
        (c.scry ? '<a class="tk-btn" href="' + esc(url(c.scry)) + '" target="_blank" rel="noopener">Scryfall ↗</a>' : "") + "</div>" +
        '<p class="tk-fine">Prices are from TCGplayer, in US dollars, without shipping or tax. Recent sales is its market price. Asking is the cheapest listing right now, not a sale.</p>' +
        (set.notice ? '<p class="tk-fine">' + esc(set.notice) + "</p>" : "");
      $(".tk-ibody").scrollTop = 0; $(".tk-info").setAttribute("aria-hidden", "false"); room.classList.add("tk-s-info"); snd.blip();
    }
    function shut() { room.classList.remove("tk-s-info"); $(".tk-info").setAttribute("aria-hidden", "true"); }
    function close() {
      if (closed) return; closed = true;
      if (fx) fx.stop(); clearTimeout(timer); snd.close(); ro && ro.disconnect();
      document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow;
      el.classList.remove("open"); setTimeout(() => el.remove(), still ? 0 : 300);
      if (o.onClose) o.onClose();
    }
    function onKey(e) { if (e.key === "Escape") { if (room.classList.contains("tk-s-info")) shut(); else close(); } }

    slide.addEventListener("pointerdown", (e) => { if (busy) return; drag = { y: e.clientY, p0: p }; slide.classList.remove("back"); try { slide.setPointerCapture(e.pointerId); } catch (x) {} });
    slide.addEventListener("pointermove", (e) => { if (drag && !busy) setP(drag.p0 + (drag.y - e.clientY) / (slide.clientHeight - 48)); });
    const drop = () => { if (!drag) return; drag = null; if (busy) return; if (p >= 0.9) energize(); else { slide.classList.add("back"); setP(0); setTimeout(() => slide.classList.remove("back"), 380); } };
    slide.addEventListener("pointerup", drop); slide.addEventListener("pointercancel", drop);
    slide.addEventListener("keydown", (e) => {
      if (busy) return;
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); energize(); }
      else if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); setP(p + 0.25); if (p >= 1) energize(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); setP(p - 0.25); }
    });
    car.addEventListener("scroll", () => {
      const mid = car.scrollLeft + car.clientWidth / 2; let best = 0, bd = 1e9;
      cels.forEach((x, i) => { const d = Math.abs(x.offsetLeft + x.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
      setFocus(best);
    }, { passive: true });
    car.addEventListener("pointermove", (e) => {
      const c = e.pointerType === "mouse" && e.target.closest(".tk-card.focus"); if (!c || still) return;
      const r = c.getBoundingClientRect(); c.style.setProperty("--ry", ((e.clientX - r.left) / r.width - 0.5) * 16 + "deg"); c.style.setProperty("--rx", (0.5 - (e.clientY - r.top) / r.height) * 12 + "deg");
    });
    car.addEventListener("pointerleave", () => cels.forEach((c) => { c.style.removeProperty("--rx"); c.style.removeProperty("--ry"); }));
    el.addEventListener("click", (e) => {
      const c = e.target.closest(".tk-card");
      if (c) { const i = +c.dataset.i; if (i === focus) info(i); else center(i, !still); return; }
      const a = e.target.closest("[data-a]"); if (!a) return;
      const act = a.dataset.a;
      if (act === "close") close();
      else if (act === "skip") show();
      else if (act === "again") ready();
      else if (act === "shut") shut();
      else if (act === "sound") { const s = snd.toggle(); a.setAttribute("aria-pressed", s); a.textContent = s ? "Sound on" : "Sound off"; }
      else if (act === "all") { close(); o.onAll(); }
      else if (act === "full") { const k = cards[+a.dataset.i].key; close(); o.onCard(k); }
    });
    room.addEventListener("scroll", () => { room.scrollTop = 0; room.scrollLeft = 0; });
    document.addEventListener("keydown", onKey);
    const ro = root.ResizeObserver ? new ResizeObserver(layout) : null;
    if (ro) ro.observe(stage); else root.addEventListener("resize", layout);

    layout(); ready();
    if (still) show();
    requestAnimationFrame(() => el.classList.add("open"));
    return { close, el };
  }

  const Trek = { open, beam };
  if (typeof module !== "undefined" && module.exports) module.exports = Trek; else root.Trek = Trek;
})(typeof window !== "undefined" ? window : globalThis);

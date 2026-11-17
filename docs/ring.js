/* MTGSME printings ring: a circle of cards seen from slightly above. Swipe or drag to turn it; tap the front card.
 * Ring.mount(host, items, { start, onFront(i), onTap(i) }) where items are [{ img, thumb, label }]. Returns { go(i), destroy() }.
 * Pictures load only for cards near the front. Self-contained: it injects its own CSS (classes start with rg-). */
(function (root) {
  "use strict";
  const CSS = `
.rg{position:relative;height:var(--rg-h);margin:0 -16px;overflow:hidden;perspective:1100px;perspective-origin:50% 0;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:grab}
.rg:active{cursor:grabbing}
.rg-spin{position:absolute;left:50%;top:var(--rg-top);width:var(--rg-w);height:calc(var(--rg-w) * 680 / 488);margin-left:calc(var(--rg-w) / -2);transform-style:preserve-3d;transition:transform .5s cubic-bezier(.2,.8,.25,1)}
.rg.drag .rg-spin{transition:none}
.rg-c{position:absolute;inset:0;border-radius:4.75%/3.5%;background:#1d1c1c center/cover;box-shadow:0 14px 30px rgba(0,0,0,.55)}
.rg-c.far{visibility:hidden}
.rg-c.front{box-shadow:0 18px 40px rgba(0,0,0,.7),0 0 0 1px rgba(208,106,38,.45),0 0 30px rgba(208,106,38,.2)}
.rg-c b{position:absolute;left:8px;right:8px;bottom:8px;font-size:11px;color:#aaa;font-weight:600}
.rg-c.pic b{display:none}
.rg-floor{position:absolute;left:10%;right:10%;bottom:6px;height:26px;border-radius:50%;background:radial-gradient(closest-side,rgba(208,106,38,.22),transparent)}
`;
  let styled = false;
  function mount(host, items, opts) {
    opts = opts || {};
    if (!styled) { const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    const n = items.length;
    const W = Math.round(Math.min(210, Math.max(130, host.clientWidth * 0.42)));
    const H = Math.round(W * 680 / 488);
    const step = 360 / n;
    // radius so neighbouring cards just clear each other; at least enough to read as a ring
    const R = Math.max(W * 0.9, (W * 1.1) / (2 * Math.tan(Math.PI / n)));
    // tilting the ring lowers the front card and lifts the back half above it; leave room for both
    const P = 1100, rad = Math.asin(Math.min(0.2, Math.max(0.05, (0.3 * H) / R))), TILT = (rad * 180) / Math.PI;
    const down = R * Math.sin(rad), up = n > 30 ? 0 : (R * Math.sin(rad) * P) / (P + 2 * R * Math.cos(rad));
    const top = Math.round(up * 1.5 + 8 - down);
    host.innerHTML = '<div class="rg" tabindex="0" role="listbox" aria-label="Printings: drag or use the arrow keys" style="--rg-w:' + W + "px;--rg-h:" + Math.round(up * 1.5 + H + 26) + "px;--rg-top:" + top + 'px"><div class="rg-floor"></div><div class="rg-spin"></div></div>';
    const rg = host.firstChild, spin = rg.lastChild;
    const cells = items.map((it, i) => {
      const c = document.createElement("div");
      c.className = "rg-c";
      c.setAttribute("role", "option");
      c.setAttribute("aria-label", it.label || "");
      c.innerHTML = "<b></b>";
      c.firstChild.textContent = it.label || "";
      c.style.transform = "rotateY(" + i * step + "deg) translateZ(" + R + "px)";
      spin.appendChild(c);
      return c;
    });
    let angle = -(opts.start || 0) * step, front = -1;
    const mod = (a, m) => ((a % m) + m) % m;
    const idx = () => mod(Math.round(-angle / step), n);
    function paint() {
      spin.style.transform = "translateZ(" + -R + "px) rotateX(" + -TILT + "deg) rotateY(" + angle + "deg)";
      const f = idx();
      cells.forEach((c, i) => {
        const d = Math.abs(mod(i * step + angle + 180, 360) - 180);
        // a small ring shows its back half too (dimmer); a big one only the front arc
        c.classList.toggle("far", n > 30 ? d > 95 : false);
        if (i !== f) c.style.filter = "brightness(" + (0.25 + 0.5 * Math.max(0, Math.cos(d * Math.PI / 180))).toFixed(2) + ")"; else c.style.filter = "";
        c.classList.toggle("front", i === f);
        const near = Math.min(mod(i - f, n), mod(f - i, n)) <= 4;
        // full pictures near the front, small ones for the rest of a small ring
        if (near && c.dataset.done !== "2" && items[i].img) { c.dataset.done = "2"; c.style.backgroundImage = 'url("' + items[i].img + '")' + (items[i].thumb ? ',url("' + items[i].thumb + '")' : ""); c.classList.add("pic"); }
        else if (!near && !c.dataset.done && n <= 30 && items[i].thumb) { c.dataset.done = "1"; c.style.backgroundImage = 'url("' + items[i].thumb + '")'; c.classList.add("pic"); }
      });
      if (f !== front) { front = f; cells.forEach((c, i) => c.setAttribute("aria-selected", i === f)); if (opts.onFront) opts.onFront(f); }
    }
    function go(i) { const cur = idx(); let d = mod(i - cur, n); if (d > n / 2) d -= n; angle -= d * step; paint(); }
    // drag: one card width of travel turns the ring by one card
    let x0 = null, a0 = 0, moved = 0, lastX = 0, lastT = 0, vel = 0;
    rg.addEventListener("pointerdown", (e) => {
      x0 = lastX = e.clientX; a0 = angle; moved = 0; vel = 0; lastT = performance.now();
      rg.classList.add("drag");
    });
    rg.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      moved = Math.max(moved, Math.abs(dx));
      if (moved > 6 && !rg.hasPointerCapture(e.pointerId)) { try { rg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      const now = performance.now();
      vel = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
      angle = a0 + (dx / W) * step;
      paint();
    });
    const end = (e) => {
      if (x0 == null) return;
      x0 = null; rg.classList.remove("drag");
      if (moved <= 6 && e.type === "pointerup") {
        const c = e.target.closest(".rg-c"), i = cells.indexOf(c);
        if (i >= 0 && i === idx()) { if (opts.onTap) opts.onTap(i); } else if (i >= 0) go(i);
        return;
      }
      // a flick carries on a little, then the ring settles on the nearest card
      angle += Math.max(-4, Math.min(4, vel * 180 / W)) * step;
      angle = Math.round(angle / step) * step;
      paint();
    };
    rg.addEventListener("pointerup", end);
    rg.addEventListener("pointercancel", end);
    rg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { go(idx() - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { go(idx() + 1); e.preventDefault(); }
      if (e.key === "Enter" && opts.onTap) opts.onTap(idx());
    });
    paint();
    return { go, destroy() { host.innerHTML = ""; } };
  }
  root.Ring = { mount };
})(typeof self !== "undefined" ? self : this);

// Hub: the animated amber hologram at the top of Overview. Every tile shows what's left to do and opens its tab.
// No money is shown here on purpose. Loaded before app.js. Uses state, BUSINESSES, esc, todayStr, touchesOn at runtime.

function hubGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function hubTiles() {
  const today = todayStr();
  const tiles = [];
  const talks = typeof touchesOn === "function" ? touchesOn(today) : 0;
  const target = state.crm?.dailyTarget || 20;
  const due = (state.crm?.contacts || []).filter((c) => c.nextFollowUp && c.nextFollowUp <= today).length;
  tiles.push({ id: "crm", name: "Daily 20 CRM", big: plural(due, "follow-up"), small: `${talks}/${target} conversations today`, alert: due > 0 });
  const callbacks = (state.dialer?.leads || []).filter((l) => typeof callbackDue === "function" && callbackDue(l)).length;
  const queue = typeof queueLeads === "function" ? queueLeads().length : 0;
  tiles.push({ id: "dialer", name: "Dialer", big: plural(callbacks, "callback"), small: `${queue} in the call queue`, alert: callbacks > 0 });
  tiles.push({ id: "inbox", name: "Inbox", big: "Scan", small: "find leads in Gmail" });
  for (const biz of BUSINESSES) {
    const open = (state[biz.id]?.todos || []).filter((x) => !x.done);
    tiles.push({ id: biz.id, name: biz.name, big: plural(open.length, "task"), small: open[0] ? `Next: ${open[0].text}` : "All clear", alert: false });
  }
  return tiles;
}

function renderHub() {
  const tiles = hubTiles();
  const n = tiles.length;
  const pos = tiles.map((_, i) => {
    const a = ((-90 + (360 / n) * (i + 0.5)) * Math.PI) / 180; // half-step keeps top and bottom clear
    return { x: 50 + 41 * Math.cos(a), y: 50 + 41 * Math.sin(a) };
  });
  const lines = pos.map((p, i) => `<line data-i="${i}" x1="50" y1="50" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}"/>`).join("");
  const now = new Date();
  const talks = typeof touchesOn === "function" ? touchesOn(todayStr()) : 0;
  const target = state.crm?.dailyTarget || 20;
  setTimeout(startHubHologram, 0);
  return `<section class="hub" id="hub">
    <svg class="hub-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    <div class="hub-readout">
      <div class="hub-clock" id="hub-clock">${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      <div class="hub-date">${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
      <div class="hub-hello">${hubGreeting()}, Devin · ${talks >= target ? "Daily 20 done ✓" : `${target - talks} conversations to go`}</div>
    </div>
    <div class="hub-center"><canvas id="hub-holo" aria-hidden="true"></canvas></div>
    ${hubGauges(tiles)}
    ${tiles.map((t, i) => `<button class="hub-tile ${t.alert ? "alert" : ""}" data-goto="${t.id}" data-i="${i}" ${t.id === "crm" || t.id === "dialer" ? 'data-haki="1"' : ""}
        style="--x:${pos[i].x.toFixed(2)}%;--y:${pos[i].y.toFixed(2)}%;--d:${i * 70}ms">
        <span class="hub-tile-name">${esc(t.name)}</span>
        <span class="hub-tile-big">${esc(t.big)}</span>
        <span class="hub-tile-small">${esc(t.small)}</span>
      </button>`).join("")}
  </section>`;
}

// ---------- corner gauges ----------

function hubGauge(cls, value, max, big, label, sub, haki) {
  const r = 40, C = 2 * Math.PI * r, f = max ? Math.min(1, value / max) : 0;
  return `<div class="hub-gauge ${cls}" ${haki ? 'data-haki="1"' : ""}>
    <svg viewBox="-50 -50 100 100" aria-hidden="true">
      <circle r="46" class="g-tick"/>
      <circle r="${r}" class="g-track"/>
      <circle r="${r}" class="g-fill" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90)"/>
      <circle r="31" class="g-inner"/>
    </svg>
    <div class="g-num">${esc(big)}</div>
    <div class="g-label">${esc(label)}</div>
    <div class="g-sub">${esc(sub)}</div>
  </div>`;
}

function hubGauges(tiles) {
  const today = todayStr();
  const talks = typeof touchesOn === "function" ? touchesOn(today) : 0;
  const target = state.crm?.dailyTarget || 20;
  const dials = (state.dialer?.log || []).filter((x) => x.date === today).length;
  const goal = (typeof dialerSettings === "function" && dialerSettings().session?.goalDials) || 50;
  const tasks = BUSINESSES.reduce((n, b) => n + (state[b.id]?.todos || []).filter((x) => !x.done).length, 0);
  const done = BUSINESSES.reduce((n, b) => n + (state[b.id]?.todos || []).filter((x) => x.done).length, 0);
  return hubGauge("tr", talks, target, String(talks), "Daily 20", `${Math.max(0, target - talks)} to go`) +
    hubGauge("bl", done, done + tasks, String(tasks), "Open tasks", `${done} done`) +
    hubGauge("br", dials, goal, String(dials), "Dials", `goal ${goal}`);
}

// ---------- amber wireframe hologram (canvas) ----------

let hubHolo = null; // { canvas, ctx, mesh, chords, sparks, t0, raf }

function hubRandOnSphere() {
  const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return [s * Math.cos(th), u, s * Math.sin(th)];
}

function startHubHologram() {
  const canvas = document.getElementById("hub-holo");
  if (!canvas || canvas.dataset.on) return;
  canvas.dataset.on = "1";
  if (hubHolo && hubHolo.raf) cancelAnimationFrame(hubHolo.raf);
  // Shape stays the same between redraws so the hologram doesn't "jump" when the page re-renders.
  if (!hubHolo || !hubHolo.chords) {
    const chords = Array.from({ length: 70 }, () => [hubRandOnSphere(), hubRandOnSphere()]);
    const sparks = Array.from({ length: 160 }, () => ({ p: hubRandOnSphere(), r: 0.55 + Math.random() * 0.75, s: 0.2 + Math.random() * 0.8 }));
    hubHolo = { chords, sparks, t0: performance.now() };
  }
  hubHolo.canvas = canvas;
  hubHolo.ctx = canvas.getContext("2d");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frame = (now) => {
    if (!canvas.isConnected) return; // page re-rendered; the next canvas starts its own loop
    drawHubHologram((now - hubHolo.t0) / 1000);
    if (!reduce) hubHolo.raf = requestAnimationFrame(frame);
  };
  hubHolo.raf = requestAnimationFrame(frame);
}

function drawHubHologram(t) {
  const { canvas, ctx } = hubHolo;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth;
  if (canvas.width !== Math.round(size * dpr) || canvas.height !== Math.round(size * dpr)) { canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const c = size / 2, R = size * 0.28;
  const ay = t * 0.35, ax = -0.38 + Math.sin(t * 0.25) * 0.08;
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  const proj = ([x, y, z], r = R) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const f = 1 / (1 - z2 * 0.28);
    return [c + x1 * r * f, c + y2 * r * f, z2];
  };
  const amber = (a) => `rgba(255, 170, 60, ${a})`;
  ctx.globalCompositeOperation = "lighter";

  // soft glow behind
  const g = ctx.createRadialGradient(c, c, 0, c, c, R * 1.9);
  g.addColorStop(0, "rgba(255, 150, 40, 0.30)");
  g.addColorStop(0.45, "rgba(255, 120, 20, 0.10)");
  g.addColorStop(1, "rgba(255, 120, 20, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const poly = (pts, alphaFn, w) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.strokeStyle = amber(alphaFn((a[2] + b[2]) / 2));
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  };
  const depthA = (base) => (z) => base * (0.25 + 0.75 * (z + 1) / 2);

  // latitude and longitude wireframe
  for (let i = 1; i < 9; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / 9, y = Math.sin(phi), r = Math.cos(phi);
    poly(Array.from({ length: 49 }, (_, k) => { const th = (k / 48) * Math.PI * 2; return proj([r * Math.cos(th), y, r * Math.sin(th)]); }), depthA(0.7), 0.9);
  }
  for (let j = 0; j < 14; j++) {
    const th = (j / 14) * Math.PI;
    poly(Array.from({ length: 41 }, (_, k) => { const phi = (k / 40) * Math.PI * 2; return proj([Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)]); }), depthA(0.5), 0.8);
  }

  // network chords through the sphere, flickering
  hubHolo.chords.forEach(([a, b], i) => {
    const flick = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7);
    const pa = proj(a), pb = proj(b);
    ctx.strokeStyle = amber(0.10 + 0.25 * flick);
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
  });

  // outer orbit rings
  const ring = (tilt, spin, rr, a, w, dash) => {
    ctx.save();
    ctx.translate(c, c); ctx.rotate(spin);
    ctx.scale(1, tilt);
    ctx.setLineDash(dash || []);
    ctx.strokeStyle = amber(a); ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };
  ring(0.32, t * 0.15, R * 1.45, 0.45, 1.2, [60, 18, 6, 18]);
  ring(0.55, -t * 0.22 + 1, R * 1.32, 0.3, 0.8, [2, 6]);
  ring(1, t * 0.05, R * 1.62, 0.25, 0.8, [1, 9]);
  ring(1, -t * 0.09, R * 1.72, 0.35, 2, [90, 40, 20, 60]);

  // drifting sparks
  hubHolo.sparks.forEach((s, i) => {
    const r = R * (s.r + 0.06 * Math.sin(t * s.s + i));
    const p = proj(s.p, r);
    const a = 0.35 + 0.65 * Math.abs(Math.sin(t * (1 + s.s) + i));
    ctx.fillStyle = amber(a * (0.4 + 0.6 * (p[2] + 1) / 2));
    ctx.beginPath(); ctx.arc(p[0], p[1], 0.6 + s.s * 1.3, 0, Math.PI * 2); ctx.fill();
  });

  // bright core
  const core = ctx.createRadialGradient(c, c, 0, c, c, R * 0.42);
  core.addColorStop(0, "rgba(255, 240, 210, 0.95)");
  core.addColorStop(0.35, "rgba(255, 180, 70, 0.55)");
  core.addColorStop(1, "rgba(255, 140, 30, 0)");
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(c, c, R * 0.42 * (1 + 0.06 * Math.sin(t * 2)), 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

// Live clock, and the line to a tile lights up while you hover it.
setInterval(() => {
  const el = document.getElementById("hub-clock");
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}, 15000);

document.getElementById("view").addEventListener("mouseover", (e) => {
  const hub = document.getElementById("hub");
  if (!hub) return;
  const tile = e.target.closest(".hub-tile");
  hub.querySelectorAll(".hub-lines line.on").forEach((l) => l.classList.remove("on"));
  hub.classList.toggle("focus", !!tile);
  if (tile) hub.querySelector(`.hub-lines line[data-i="${tile.dataset.i}"]`)?.classList.add("on");
});

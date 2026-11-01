// Hub: the animated core at the top of Overview. Every tile shows one live number and opens its tab.
// Loaded before app.js. Uses state, BUSINESSES, monthTotals, money, esc, todayStr, touchesOn at runtime.

const HUB_ACCENTS = { crm: "#1f6feb", dialer: "#3dffa8", inbox: "#ff4fd8" };

function hubGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function hubTiles() {
  const today = todayStr();
  const tiles = [];
  const talks = typeof touchesOn === "function" ? touchesOn(today) : 0;
  const due = (state.crm?.contacts || []).filter((c) => c.nextFollowUp && c.nextFollowUp <= today).length;
  tiles.push({ id: "crm", name: "Daily 20 CRM", big: `${talks}/20`, small: due ? `${due} follow-up${due === 1 ? "" : "s"} due` : "conversations today", color: HUB_ACCENTS.crm, alert: due > 0 });
  const log = (state.dialer?.log || []).filter((x) => x.date === today);
  const appts = log.filter((x) => x.outcome === "appointment").length;
  tiles.push({ id: "dialer", name: "Dialer", big: String(log.length), small: appts ? `dials · ${appts} appt${appts === 1 ? "" : "s"}` : "dials today", color: HUB_ACCENTS.dialer });
  tiles.push({ id: "inbox", name: "Inbox", big: "✉", small: "scan Gmail for leads", color: HUB_ACCENTS.inbox });
  for (const biz of BUSINESSES) {
    const t = monthTotals(biz.id);
    const todos = (state[biz.id]?.todos || []).filter((x) => !x.done).length;
    tiles.push({ id: biz.id, name: biz.name, big: money(t.profit), small: `${todos} to-do${todos === 1 ? "" : "s"} · ${biz.subtitle}`, color: biz.color, neg: t.profit < 0 });
  }
  return tiles;
}

function hubCoreSvg() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180, r1 = i % 6 ? 131 : 125, r2 = 137;
    return `<line x1="${(r1 * Math.cos(a)).toFixed(1)}" y1="${(r1 * Math.sin(a)).toFixed(1)}" x2="${(r2 * Math.cos(a)).toFixed(1)}" y2="${(r2 * Math.sin(a)).toFixed(1)}"/>`;
  }).join("");
  return `<svg class="hub-core" viewBox="-150 -150 300 300" aria-hidden="true">
    <defs>
      <radialGradient id="hubOrb" cx="42%" cy="38%" r="65%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="22%" stop-color="#b8fbff"/>
        <stop offset="55%" stop-color="#5eeaff" stop-opacity=".75"/>
        <stop offset="100%" stop-color="#1f6feb" stop-opacity=".15"/>
      </radialGradient>
      <radialGradient id="hubHalo" r="50%">
        <stop offset="0%" stop-color="#5eeaff" stop-opacity=".45"/>
        <stop offset="100%" stop-color="#5eeaff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="hubSweep" x1="0" x2="1">
        <stop offset="0%" stop-color="#5eeaff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#5eeaff" stop-opacity=".55"/>
      </linearGradient>
    </defs>
    <circle r="150" fill="url(#hubHalo)" class="hub-pulse-slow"/>
    <g class="hub-ticks hub-spin-xslow">${ticks}</g>
    <circle r="118" class="hub-ring faint"/>
    <g class="hub-spin-slow"><circle r="110" class="hub-ring dots"/></g>
    <g class="hub-spin-rev"><circle r="97" class="hub-ring dashes"/></g>
    <g class="hub-spin-med"><circle r="84" class="hub-ring arcs"/><circle r="84" class="hub-ring arcs pink"/></g>
    <g class="hub-spin-sweep"><path d="M0 0 L118 0 A118 118 0 0 0 102.2 -59 Z" fill="url(#hubSweep)" opacity=".35"/></g>
    <g class="hub-spin-fast"><circle cx="0" cy="-70" r="3.2" class="hub-dot"/><circle cx="0" cy="70" r="2" class="hub-dot gold"/></g>
    <g class="hub-spin-rev-fast"><circle cx="-62" cy="0" r="2.4" class="hub-dot pink"/></g>
    <circle r="50" fill="url(#hubOrb)" class="hub-orb"/>
    <g class="hub-globe">
      <ellipse rx="50" ry="50"/>
      <ellipse rx="34" ry="50"><animate attributeName="rx" values="50;0;50" dur="6s" repeatCount="indefinite"/></ellipse>
      <ellipse rx="10" ry="50"><animate attributeName="rx" values="25;50;0;25" dur="6s" repeatCount="indefinite"/></ellipse>
      <ellipse rx="50" ry="18"/><line x1="-50" y1="0" x2="50" y2="0"/>
    </g>
  </svg>`;
}

function renderHub() {
  const tiles = hubTiles();
  const n = tiles.length;
  const pos = tiles.map((_, i) => {
    const a = ((-90 + (360 / n) * (i + 0.5)) * Math.PI) / 180; // half-step offset keeps the top and bottom clear for the readout
    return { x: 50 + 41 * Math.cos(a), y: 50 + 41 * Math.sin(a) };
  });
  const lines = pos.map((p, i) => `<line data-i="${i}" x1="50" y1="50" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}" style="--c:${tiles[i].color}"/>`).join("");
  const now = new Date();
  const talks = typeof touchesOn === "function" ? touchesOn(todayStr()) : 0;
  return `<section class="hub" id="hub">
    <svg class="hub-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    <div class="hub-readout">
        <div class="hub-clock" id="hub-clock">${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
        <div class="hub-date">${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
        <div class="hub-hello">${hubGreeting()}, Devin · ${talks >= 20 ? "Daily 20 done ✓" : `${20 - talks} conversations to go`}</div>
      </div>
    <div class="hub-center">
      ${hubCoreSvg()}
    </div>
    ${tiles.map((t, i) => `<button class="hub-tile ${t.alert ? "alert" : ""}" data-goto="${t.id}" data-i="${i}"
        style="--x:${pos[i].x.toFixed(2)}%;--y:${pos[i].y.toFixed(2)}%;--c:${t.color};--d:${i * 70}ms">
        <span class="hub-tile-name">${esc(t.name)}</span>
        <span class="hub-tile-big ${t.neg ? "neg" : ""}">${esc(t.big)}</span>
        <span class="hub-tile-small">${esc(t.small)}</span>
      </button>`).join("")}
  </section>`;
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

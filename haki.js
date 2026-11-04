// Haki: red-and-black lightning that crackles around anything marked data-haki (CRM and Dialer),
// and a full-screen burst when you set an appointment or finish your Daily 20.
// One fixed canvas over the page; it never blocks clicks.

(function () {
  const canvas = document.createElement("canvas");
  canvas.id = "haki-layer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let bolts = [];          // { pts, born, life, width }
  let burstUntil = 0;
  let last = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener("resize", resize);
  resize();

  // A jagged bolt from (x1,y1) to (x2,y2) by midpoint displacement, with a branch now and then.
  function bolt(x1, y1, x2, y2, rough) {
    let pts = [[x1, y1], [x2, y2]];
    for (let k = 0; k < 5; k++) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const len = Math.hypot(bx - ax, by - ay);
        const nx = -(by - ay) / (len || 1), ny = (bx - ax) / (len || 1);
        const off = (Math.random() - 0.5) * len * rough;
        next.push([(ax + bx) / 2 + nx * off, (ay + by) / 2 + ny * off], pts[i]);
      }
      pts = next;
    }
    return pts;
  }

  function spawnAround(r, big) {
    // start on the element's edge, arc outward or along the edge
    const side = Math.floor(Math.random() * 4);
    const t = Math.random();
    const p = [[r.left + t * r.width, r.top], [r.right, r.top + t * r.height], [r.left + t * r.width, r.bottom], [r.left, r.top + t * r.height]][side];
    const out = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    const reach = (big ? 60 : 26) + Math.random() * (big ? 90 : 34);
    const along = (Math.random() - 0.5) * (big ? 140 : 70);
    const ex = p[0] + out[0] * reach + (out[1] !== 0 ? along : 0);
    const ey = p[1] + out[1] * reach + (out[0] !== 0 ? along : 0);
    const now = performance.now();
    bolts.push({ pts: bolt(p[0], p[1], ex, ey, 0.55), born: now, life: 140 + Math.random() * 160, width: big ? 2.2 : 1.4 });
    if (Math.random() < 0.35) {
      const m = bolts[bolts.length - 1].pts[Math.floor(bolts[bolts.length - 1].pts.length / 2)];
      bolts.push({ pts: bolt(m[0], m[1], m[0] + (Math.random() - 0.5) * reach, m[1] + (Math.random() - 0.5) * reach, 0.6), born: now, life: 120, width: 0.9 });
    }
  }

  function drawBolt(b, now) {
    const age = (now - b.born) / b.life;
    if (age >= 1) return false;
    const a = (1 - age) * (0.75 + Math.random() * 0.25);
    const path = () => { ctx.beginPath(); ctx.moveTo(b.pts[0][0], b.pts[0][1]); for (const p of b.pts) ctx.lineTo(p[0], p[1]); };
    ctx.lineJoin = "round";
    // black outer, red glow, hot core: the conqueror's look
    path(); ctx.strokeStyle = `rgba(0, 0, 0, ${0.85 * a})`; ctx.lineWidth = b.width * 4; ctx.stroke();
    ctx.shadowColor = "rgba(255, 20, 20, 0.9)"; ctx.shadowBlur = 14;
    path(); ctx.strokeStyle = `rgba(255, 30, 30, ${a})`; ctx.lineWidth = b.width * 2; ctx.stroke();
    ctx.shadowBlur = 0;
    path(); ctx.strokeStyle = `rgba(255, 210, 200, ${0.8 * a})`; ctx.lineWidth = Math.max(0.6, b.width * 0.6); ctx.stroke();
    return true;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 16) return;
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // Spar is full-screen and the page behind it doesn't need lightning
    if (document.body.classList.contains("spar-open") || document.hidden) { bolts = []; return; }
    const bursting = now < burstUntil;
    const els = document.querySelectorAll("[data-haki]");
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
      // a little: about one crackle per element every ~1.5s, more during a burst
      if (Math.random() < (bursting ? 0.35 : 0.011)) spawnAround(r, bursting);
      // faint red aura that breathes
      const pulse = 0.5 + 0.5 * Math.sin(now / 700 + r.left);
      ctx.save();
      ctx.shadowColor = `rgba(255, 25, 25, ${0.25 + 0.25 * pulse + (bursting ? 0.4 : 0)})`;
      ctx.shadowBlur = 18 + 10 * pulse;
      ctx.strokeStyle = `rgba(255, 40, 40, ${0.10 + 0.12 * pulse})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.left - 2, r.top - 2, r.width + 4, r.height + 4);
      ctx.restore();
    }
    if (bursting && Math.random() < 0.5) {
      // bolts from the screen edges toward the middle
      const x = Math.random() * innerWidth, top = Math.random() < 0.5;
      bolts.push({ pts: bolt(x, top ? 0 : innerHeight, x + (Math.random() - 0.5) * 300, innerHeight * (top ? 0.25 : 0.75), 0.5), born: now, life: 220, width: 2.6 });
    }
    if (bursting) {
      const left = (burstUntil - now) / 1400;
      ctx.fillStyle = `rgba(120, 0, 0, ${0.18 * left})`;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    bolts = bolts.filter((b) => drawBolt(b, now));
  }

  window.hakiBurst = function () {
    if (reduce) return;
    burstUntil = performance.now() + 1400;
  };

  if (!reduce) requestAnimationFrame(frame);
})();

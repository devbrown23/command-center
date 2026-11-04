// Spar: a practice call with a talking homeowner, run from the Dialer.
// - A red orb floats on the Dialer tab; tap it (or "🔴 Spar") to open a full-screen practice call.
// - The homeowner talks out loud (speech synthesis), throws objections from your Objection cards,
//   asks you questions, and scores every line. Answer with your mic (Chrome) or by typing.
// - Brain: if your site link + passcode are set (CRM settings) and ANTHROPIC_API_KEY is on Vercel,
//   it uses /api/spar on fromstart2keys for a real AI homeowner. Otherwise a built-in homeowner runs here.
// Loaded after dialer.js. Uses esc, objectionsList, dialerSettings, saveDialerSettings, fillVars,
// titleCase, firstName, parseStreetAddress, fubSettings, siteApi, todayStr, state at runtime.

(function () {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // iPhone/iPad: the mic level meter (getUserMedia) fights speech recognition and can mute the voice, so it's skipped there.
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // ---------- the orb ----------
  // A glowing red core with spinning arc rings, orbiting sparks and a waveform ring that reacts to sound.
  // state: idle | listening | thinking | speaking. level: 0..1 loudness.
  function makeOrb(canvas) {
    const ctx = canvas.getContext("2d");
    const o = { state: "idle", level: 0, target: 0, alive: true };
    const sparks = Array.from({ length: 46 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.45, s: (0.2 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1), z: Math.random() }));
    const ripples = [];
    let t0 = performance.now(), lastRipple = 0;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 200, h = canvas.clientHeight || 200;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [w, h];
    }

    function frame(now) {
      if (!o.alive) return;
      if (!canvas.isConnected) { o.alive = false; return; }
      // hidden (other tab, or the overlay is open): don't burn frames drawing nothing
      if (!canvas.offsetParent || document.hidden) { setTimeout(() => requestAnimationFrame(frame), 400); return; }
      const [w, h] = size();
      const t = (now - t0) / 1000;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.26;
      // ease loudness; fake a voice when speaking without real levels
      if (o.state === "speaking" && o.target < 0.05) o.target = 0.25 + 0.35 * Math.abs(Math.sin(t * 9) * Math.sin(t * 3.7));
      o.level += (o.target - o.level) * 0.18;
      o.target *= 0.9;
      const lv = o.level;
      const spin = o.state === "thinking" ? 3.2 : o.state === "speaking" ? 1.6 : 0.6;
      const breathe = 1 + Math.sin(t * (o.state === "idle" ? 1.4 : 2.4)) * 0.03 + lv * 0.18;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      // outer glow
      let g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.3);
      g.addColorStop(0, `rgba(255,46,77,${0.32 + lv * 0.35})`);
      g.addColorStop(0.45, "rgba(255,30,40,0.10)");
      g.addColorStop(1, "rgba(255,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // listening ripples
      if (o.state === "listening" && now - lastRipple > 520 - lv * 300) { ripples.push({ born: now }); lastRipple = now; }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const k = (now - ripples[i].born) / 1600;
        if (k > 1) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(255,90,90,${(1 - k) * 0.55})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, R * (1.05 + k * 1.1), 0, Math.PI * 2); ctx.stroke();
      }

      // arc rings
      const rings = [[1.32, 0.9, 7, 0.55], [1.55, -0.6, 3, 0.4], [1.8, 0.35, 12, 0.28]];
      rings.forEach(([rr, sp, segs, alpha], i) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * sp * spin + i);
        ctx.strokeStyle = `rgba(255,${80 + i * 40},${70 + i * 20},${alpha + lv * 0.3})`;
        ctx.lineWidth = i === 0 ? 3 : 1.6;
        for (let s = 0; s < segs; s++) {
          const a0 = (s / segs) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(0, 0, R * rr * breathe, a0, a0 + (Math.PI * 2 / segs) * 0.62); ctx.stroke();
        }
        ctx.restore();
      });

      // waveform ring
      ctx.beginPath();
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wob = Math.sin(a * 6 + t * 5) * 0.5 + Math.sin(a * 11 - t * 7) * 0.35 + Math.sin(a * 3 + t * 2) * 0.3;
        const r = R * 1.12 * breathe + wob * (2 + lv * R * 0.32);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(255,120,110,${0.5 + lv * 0.5})`; ctx.lineWidth = 1.5; ctx.stroke();

      // core
      g = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, R * 0.05, cx, cy, R * breathe);
      g.addColorStop(0, "rgba(255,245,240,0.95)");
      g.addColorStop(0.25, "rgba(255,120,120,0.95)");
      g.addColorStop(0.65, "rgba(230,20,50,0.9)");
      g.addColorStop(1, "rgba(90,0,15,0.85)");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * breathe, 0, Math.PI * 2); ctx.fill();
      // inner swirl
      ctx.globalCompositeOperation = "lighter";
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-t * spin * 0.8);
      for (let k = 0; k < 3; k++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.strokeStyle = `rgba(255,200,190,${0.18 + lv * 0.35})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(R * 0.18, 0, R * 0.55 * breathe, -0.9, 0.9); ctx.stroke();
      }
      ctx.restore();

      // sparks
      for (const p of sparks) {
        p.a += p.s * 0.01 * spin * (1 + lv * 2);
        const r = R * (1.2 + p.r * 0.95) * breathe;
        const x = cx + Math.cos(p.a) * r, y = cy + Math.sin(p.a) * r * (0.75 + p.z * 0.25);
        ctx.fillStyle = `rgba(255,${120 + p.z * 120},${110 + p.z * 60},${0.35 + p.z * 0.5})`;
        ctx.beginPath(); ctx.arc(x, y, 0.8 + p.z * 1.6 + lv * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!reduce || o.state !== "idle") requestAnimationFrame(frame);
      else setTimeout(() => requestAnimationFrame(frame), 250);
    }
    requestAnimationFrame(frame);
    return {
      set state(s) { o.state = s; }, get state() { return o.state; },
      pulse(v) { o.target = Math.max(o.target, Math.min(1, v)); },
      destroy() { o.alive = false; },
    };
  }

  // ---------- floating orb on the Dialer ----------
  const fab = document.createElement("button");
  fab.className = "spar-fab";
  fab.title = "Spar: practice a call with a talking homeowner";
  fab.innerHTML = `<canvas aria-hidden="true"></canvas><span>SPAR</span>`;
  document.body.appendChild(fab);
  makeOrb(fab.querySelector("canvas"));
  fab.addEventListener("click", () => openSpar());

  // ---------- personas ----------
  const PERSONAS = [
    { id: "busy", name: "Busy parent", emoji: "🧃", trust: 45, tilt: -3,
      blurb: "Kids yelling in the background. Gives you about 30 seconds.",
      ai: "a busy parent juggling kids and dinner, distracted, impatient but fair, owns a 3-bed house, might move for schools in a few years",
      hello: "Hello? Sorry, hold on. ...Yeah, who's this?", warm: "Okay, honestly we've talked about needing a bigger place once the baby comes. Maybe next year?",
      bye: "I gotta go, my kid's screaming. Bye.", voice: { rate: 1.12, pitch: 1.15 } },
    { id: "skeptic", name: "Skeptical retiree", emoji: "🧓", trust: 35, tilt: 2,
      blurb: "Been in the house 30 years. Hates sales calls. Asks hard questions.",
      ai: "a skeptical retiree who has owned the home 30 years, dislikes salespeople, sharp, asks pointed questions about commissions and why you",
      hello: "Hello. Who is this and what do you want?", warm: "Well. My wife keeps saying the stairs are getting to be too much. I suppose we'd need to know the numbers.",
      bye: "I'm not interested. Take me off your list.", voice: { rate: 0.92, pitch: 0.85 } },
    { id: "curious", name: "Curious maybe-seller", emoji: "🤔", trust: 60, tilt: -1.5,
      blurb: "Friendly, has been watching Zillow. Wants info, not a pitch.",
      ai: "a friendly homeowner who checks Zillow a lot, curious about values, might sell in 6-12 months if the number is right, asks lots of questions about the market",
      hello: "Hi, this is {first}.", warm: "Yeah, actually I've been watching Zillow. If we could get a good number we'd think about it this spring.",
      bye: "Okay, well, maybe just send me something. Thanks.", voice: { rate: 1.02, pitch: 1.05 } },
    { id: "agent", name: "Already has an agent", emoji: "🤝", trust: 40, tilt: 3,
      blurb: "Their cousin is an agent. Loyal, polite, hard to move.",
      ai: "a polite homeowner whose cousin is a real estate agent, loyal to them, hard to move, but the cousin is not very active",
      hello: "Hello, this is {first}.", warm: "I mean, my cousin hasn't really followed up on anything. What would you actually do differently?",
      bye: "I appreciate it, but I'll stick with my cousin. Take care.", voice: { rate: 1, pitch: 0.95 } },
    { id: "hostile", name: "Hostile", emoji: "🔥", trust: 20, tilt: -2.5,
      blurb: "Third agent call today. Short fuse. Earn every second.",
      ai: "an irritated homeowner who has gotten three agent calls today, curt, sarcastic, will hang up fast on anything salesy, but respects someone calm and honest",
      hello: "Yeah? If this is another realtor I swear...", warm: "...Fine. You're the first one who didn't just pitch me. We might downsize in a year or two.",
      bye: "Don't call here again.", voice: { rate: 1.15, pitch: 0.9 } },
  ];
  const DIFF = { easy: { need: 1, bonus: 15 }, medium: { need: 2, bonus: 0 }, hard: { need: 3, bonus: -10 } };
  const OWNER_QUESTIONS = [
    { q: "What's this going to cost me?", keys: ["free", "no cost", "nothing", "commission", "only if"] },
    { q: "So how's the market around here right now?", keys: ["sold", "days", "inventory", "rates", "prices", "buyers"] },
    { q: "Why would I use you over one of the big brokerages?", keys: ["local", "plan", "market", "neighbors", "follow", "personal", "classes"] },
    { q: "What do you think my place is worth?", keys: ["walkthrough", "updates", "range", "comps", "sold", "look"] },
    { q: "Are prices dropping? I keep hearing they are.", keys: ["depends", "street", "sold", "data", "neighborhood", "numbers"] },
    { q: "How long would it even take to sell?", keys: ["days", "weeks", "price", "prep", "market", "depends"] },
  ];

  // ---------- scoring a line (built-in brain, and as a backup coach) ----------
  const RX = {
    ack: /\b(totally|fair|understand|understood|makes sense|no problem|appreciate|i hear you|great question|good question|of course|absolutely|i get (it|that)|that's okay|got it|completely|for sure|no worries|sorry to bother)\b/i,
    qword: /^(what|how|when|would|could|is|are|do|does|have|has|did|which|where|who|can|should|if you)\b/i,
    pushy: /\b(sign (today|now|up)|you need to|you have to|you should|trust me|guarantee|limited time|act now|list (it|your (house|home)) (now|today|with me)|don't miss)\b/i,
    intro: /\b(devin|unique lifestyle|realty|real estate|agent)\b/i,
    reason: /\b(sold|neighbor|value|worth|market|update|street|nearby|homes?)\b/i,
    meet: /\b(walk ?-?through|visit|stop by|come by|swing by|meet|appointment|15[- ]?min|fifteen|sit down|this week|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|\d ?(am|pm|o'clock))\b/i,
  };
  function sentences(t) { return String(t).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean); }
  function endsWithQuestion(t) {
    const s = sentences(t), last = s[s.length - 1] || "";
    return /\?\s*$/.test(last) || RX.qword.test(last) || /\b(right|sound good|fair enough|make sense|work for you)\??$/i.test(last);
  }
  function overlap(a, b) {
    const words = (s) => new Set(String(s).toLowerCase().match(/[a-z']{5,}/g) || []);
    const A = words(a), B = words(b);
    if (!B.size) return 0;
    let n = 0; B.forEach((w) => { if (A.has(w)) n++; });
    return n / Math.min(B.size, 12);
  }
  function scoreLine(text, ctx) {
    const words = (String(text).match(/\S+/g) || []).length;
    const r = { ack: RX.ack.test(text), q: endsWithQuestion(text), pushy: RX.pushy.test(text), words, meet: RX.meet.test(text) };
    let s = 50, tip = "";
    if (ctx.kind === "opener") {
      const intro = RX.intro.test(text), reason = RX.reason.test(text);
      s += (intro ? 15 : -15) + (reason ? 15 : -10) + (r.q ? 10 : -5) + (words > 70 ? -15 : 0);
      tip = !intro ? "Say who you are and your company in the first breath." : !reason ? "Give the reason for the call: homes nearby just sold." : !r.q ? "End the opener with an easy question to get them talking." : words > 70 ? "Shorter. Your opener should take under 20 seconds." : "Clean opener: who, why, then a question.";
    } else {
      s += (r.ack ? 14 : -10) + (r.q ? 14 : -12) + (r.pushy ? -25 : 0) + (words < 6 ? -10 : words > 75 ? -14 : 4);
      const ov = ctx.card ? overlap(text, ctx.card) : ctx.keys ? (ctx.keys.some((k) => String(text).toLowerCase().includes(k)) ? 0.4 : 0) : 0;
      const relevant = !!(ctx.card || ctx.keys);
      s += ov > 0.3 ? 10 : ov > 0.15 ? 5 : relevant && ov < 0.08 ? -14 : 0; // did you actually answer what they said?
      tip = r.pushy ? "That sounded pushy. Drop the pressure and get curious." : ov < 0.08 && (ctx.card || ctx.keys) ? "That didn't answer what they said. Address their exact words, then ask." : !r.ack ? "Acknowledge first: \"Totally fair...\" before you answer." : !r.q ? "End with a question so they keep talking." : words > 75 ? "Too long. Two sentences and a question." : words < 6 ? "Too short. Answer, then ask something." : ov < 0.15 && ctx.card ? "Good shape. Your card answer has a sharper angle; peek at it after." : "Strong. Acknowledge, answer, question.";
    }
    return { score: Math.max(0, Math.min(100, Math.round(s))), tip, r };
  }

  // ---------- built-in homeowner ----------
  function builtInBrain(sp) {
    const st = { phase: "opener", handled: 0, asked: 0, nudged: false, turns: 0, used: new Set(), lastCtx: { kind: "opener" } };
    const cards = sp.cards;
    const weightedCard = () => {
      const scores = dialerSettings().practiceScores || {};
      const pool = cards.filter((c) => !st.used.has(c.q) && !/now's not a good time/i.test(c.q));
      const w = pool.flatMap((c) => Array((scores[c.q]?.miss || 0) + 1).fill(c));
      return w[Math.floor(Math.random() * w.length)] || null;
    };
    const casual = (q) => {
      const tweaks = [(s) => s, (s) => "Look, " + s.charAt(0).toLowerCase() + s.slice(1), (s) => s.replace(/\.$/, ", honestly."), (s) => "Hm. " + s];
      return tweaks[Math.floor(Math.random() * tweaks.length)](q);
    };
    function nextChallenge() {
      // alternate objections from your cards with questions homeowners actually ask
      const useQ = st.asked < st.handled / 2 + 0.5 && Math.random() < 0.55;
      if (!useQ) {
        const c = weightedCard();
        if (c) { st.used.add(c.q); st.lastCtx = { kind: "objection", card: fillVars(c.a, sp.lead), q: c.q }; return casual(c.q); }
      }
      const pool = OWNER_QUESTIONS.filter((x) => !st.used.has(x.q));
      const x = pool[Math.floor(Math.random() * pool.length)] || OWNER_QUESTIONS[0];
      st.used.add(x.q); st.asked++;
      st.lastCtx = { kind: "question", keys: x.keys, q: x.q };
      return x.q;
    }
    return {
      async hello() { return { say: sp.persona.hello.replace("{first}", sp.lead.first), trust: sp.trust, coach: "", lineScore: null, end: null }; },
      async turn(text) {
        st.turns++;
        const ctx = st.lastCtx;
        const sc = scoreLine(text, ctx);
        let trust = sp.trust + Math.round((sc.score - 50) * 0.5);
        trust = Math.max(0, Math.min(100, trust));
        const out = { trust, coach: sc.tip, lineScore: sc.score, end: null, objection: ctx.q || null };
        if (trust < 12 || (sp.diff === "hard" && sc.r.pushy)) return { ...out, say: sp.persona.bye, end: "hangup" };
        if (st.turns > 11) return { ...out, say: "Alright, I've got to run. Send me something if you want.", end: "hangup" };

        if (st.phase === "opener") {
          if (!RX.intro.test(text) && !st.nudged) { st.nudged = true; return { ...out, say: "Sorry, who is this?" }; }
          st.phase = "objections";
          return { ...out, say: nextChallenge() };
        }
        if (st.phase === "objections") {
          if (sc.score >= 55) st.handled++;
          if (st.handled >= sp.need && trust >= 55) { st.phase = "open"; st.lastCtx = { kind: "close" }; return { ...out, say: sp.persona.warm }; }
          if (sc.score < 40 && Math.random() < 0.5) return { ...out, say: ["That didn't really answer my question.", "Uh huh. So what's the point of this call?", "Okay... and?"][Math.floor(Math.random() * 3)] };
          return { ...out, say: nextChallenge() };
        }
        // open: they warmed up, now ask for the appointment
        if (sc.r.meet && sc.r.q) return { ...out, trust: Math.max(trust, 70), coach: "You asked for the meeting with a specific time. That's how you book it.", say: "Yeah, okay. That works. What do you need from me before then?", end: "booked" };
        if (!st.nudged2) { st.nudged2 = true; return { ...out, coach: "They opened up. Ask for a 15-minute walkthrough and offer two times.", say: "So what are you suggesting?" }; }
        return { ...out, coach: "You had them. Next time ask for the appointment: \"Would Tuesday at 5 or Thursday at 6 be better?\"", say: "Alright, well, send me something I guess.", end: "hangup" };
      },
      async debrief(lines) {
        const mine = lines.filter((l) => l.role === "agent" && l.score != null);
        const avg = mine.length ? mine.reduce((a, b) => a + b.score, 0) / mine.length : 0;
        const worst = mine.slice().sort((a, b) => a.score - b.score)[0];
        const best = mine.slice().sort((a, b) => b.score - a.score)[0];
        const acks = mine.filter((l) => RX.ack.test(l.text)).length, qs = mine.filter((l) => endsWithQuestion(l.text)).length;
        const wins = [], fixes = [];
        if (acks >= mine.length / 2) wins.push("You acknowledged before answering."); else fixes.push("Lead with an acknowledgment: \"Totally fair...\"");
        if (qs >= mine.length / 2) wins.push("You kept ending on questions."); else fixes.push("End more lines with a question.");
        if (best) wins.push(`Best line (${best.score}): "${best.text.slice(0, 90)}${best.text.length > 90 ? "…" : ""}"`);
        if (!lines.some((l) => l.role === "agent" && RX.meet.test(l.text))) fixes.push("Ask for a specific appointment time.");
        return { score: Math.round(avg), wins: wins.slice(0, 3), fixes: fixes.slice(0, 3), betterLine: worst && worst.coach && worst.score < 70 ? { original: worst.text, rewrite: worst.coach } : null };
      },
    };
  }

  // ---------- AI homeowner (fromstart2keys /api/spar) ----------
  function aiBrain(sp) {
    const api = siteApi("/api/spar");
    const { passcode } = fubSettings();
    const base = { persona: sp.persona.ai, difficulty: sp.diff, objections: sp.cards.slice(0, 12), lead: { first: sp.lead.first, street: sp.lead.street } };
    async function call(body) {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 9000);
      try {
        const r = await fetch(api, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "X-CRM-Passcode": passcode }, body: JSON.stringify({ ...base, ...body }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || "AI unavailable");
        return j;
      } finally { clearTimeout(to); }
    }
    const msgs = () => sp.lines.map((l) => ({ role: l.role, text: l.text }));
    return {
      async hello() { const j = await call({ messages: [] }); return { ...j, coach: "", lineScore: null }; },
      async turn() {
        const j = await call({ messages: msgs() });
        if (typeof j.lineScore !== "number") j.lineScore = scoreLine(sp.lines[sp.lines.length - 1].text, { kind: "objection" }).score;
        return j;
      },
      async debrief() { return call({ mode: "debrief", messages: msgs() }); },
    };
  }

  // ---------- voice ----------
  const synth = window.speechSynthesis;
  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  function pickVoice(pref) {
    const vs = (synth && synth.getVoices().filter((v) => /^en/i.test(v.lang))) || [];
    if (!vs.length) return null;
    const nice = vs.filter((v) => /natural|neural|google|online/i.test(v.name));
    const list = nice.length ? nice : vs;
    return list[pref % list.length];
  }
  if (synth) synth.onvoiceschanged = () => {};

  // ---------- overlay ----------
  let sp = null; // current session

  function newSession() {
    const cards = objectionsList().map((c) => ({ q: c.q, a: c.a }));
    const pool = state.dialer.leads.filter((l) => l.name && l.address);
    const lead = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { name: "SMITH, PAT", address: "1215 S UNION AVE" };
    const a = parseStreetAddress(lead.address);
    const prev = dialerSettings().spar || {};
    return {
      step: "setup", personaId: prev.personaId || "busy", diff: prev.diff || "medium",
      voiceOn: prev.voiceOn !== false, autoListen: prev.autoListen !== false, brainPref: prev.brainPref || "auto",
      cards, lead: { raw: lead, first: titleCase(firstName(lead.name) || "Pat"), street: a ? titleCase(a.street) : "your street" },
      lines: [], trust: 50, startedAt: 0, busy: false, ended: null, debrief: null, brainName: "", note: "",
    };
  }

  function openSpar() {
    if (document.querySelector(".spar")) return;
    sp = newSession();
    const el = document.createElement("div");
    el.className = "spar";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Spar practice call");
    document.body.appendChild(el);
    document.body.classList.add("spar-open");
    el.addEventListener("click", onClick);
    el.addEventListener("submit", onSubmit);
    paint();
  }

  function closeSpar() {
    if (rec) { const r = rec; rec = null; try { r.abort(); } catch (e) { /* closed */ } }
    releaseMic(); if (synth) synth.cancel();
    clearInterval(sp && sp.clock);
    if (sp && sp.orb) sp.orb.destroy();
    const el = document.querySelector(".spar");
    if (el) el.remove();
    document.body.classList.remove("spar-open");
    sp = null;
  }

  function savePrefs() {
    saveDialerSettings({ spar: { personaId: sp.personaId, diff: sp.diff, voiceOn: sp.voiceOn, autoListen: sp.autoListen, brainPref: sp.brainPref } });
  }

  function persona() { return PERSONAS.find((p) => p.id === sp.personaId) || PERSONAS[0]; }

  function setupHtml() {
    const hist = (dialerSettings().sparHistory || []).slice(-6).reverse();
    const aiReady = !!(siteApi("/api/spar") && fubSettings().passcode);
    return `<div class="spar-setup">
      <div class="spar-hero"><canvas class="spar-orb"></canvas></div>
      <div class="spar-setup-col">
        <h2 class="spar-title">Spar</h2>
        <p class="spar-sub">A homeowner picks up. They'll throw your objection cards at you and ask real questions. Earn their trust, then book the appointment.</p>
        <h4>Who picks up?</h4>
        <div class="spar-personas">${PERSONAS.map((p) => `<button class="spar-pcard ${p.id === sp.personaId ? "on" : ""}" style="--tilt:${p.tilt}deg" data-spar="persona" data-id="${p.id}">
          <span class="spar-emoji">${p.emoji}</span><strong>${esc(p.name)}</strong><small>${esc(p.blurb)}</small></button>`).join("")}</div>
        <div class="spar-opts">
          <div class="spar-seg">${Object.keys(DIFF).map((d) => `<button data-spar="diff" data-id="${d}" class="${sp.diff === d ? "on" : ""}">${d}</button>`).join("")}</div>
          <label><input type="checkbox" data-spar="voice" ${sp.voiceOn ? "checked" : ""}> They talk out loud</label>
          <label><input type="checkbox" data-spar="auto" ${sp.autoListen ? "checked" : ""} ${Recog ? "" : "disabled"}> Mic opens after they talk ${Recog ? "" : "(needs Chrome)"}</label>
          <label>Brain <select data-spar="brain">
            <option value="auto" ${sp.brainPref === "auto" ? "selected" : ""}>${aiReady ? "AI homeowner (falls back to built-in)" : "Built-in (AI not connected)"}</option>
            <option value="builtin" ${sp.brainPref === "builtin" ? "selected" : ""}>Built-in only (works offline)</option></select></label>
        </div>
        <div class="btn-row"><button class="primary spar-go" data-spar="start">📞 Pick up the phone</button><button data-spar="close">Back to dialer</button></div>
        <p class="muted">Calling ${esc(sp.lead.first)} on ${esc(sp.lead.street)} · ${sp.cards.length} objection cards loaded from your settings.</p>
        ${hist.length ? `<div class="spar-hist"><h4>Recent spars</h4>${hist.map((h) => `<span class="spar-chip ${h.end === "booked" ? "good" : ""}">${esc(h.grade)} · ${esc(h.persona)}${h.end === "booked" ? " · booked" : ""}</span>`).join("")}</div>` : ""}
      </div>
    </div>`;
  }

  function callHtml() {
    const p = persona();
    const last = sp.lines.filter((l) => l.role === "owner").slice(-1)[0];
    const mine = sp.lines.filter((l) => l.role === "agent");
    const lastMine = mine[mine.length - 1];
    const trustCls = sp.trust >= 60 ? "good" : sp.trust < 30 ? "bad" : "";
    const done = !!sp.ended;
    return `<div class="spar-call">
      <div class="spar-side spar-left">
        <div class="spar-sticker" style="--tilt:-2deg"><div class="spar-k">ON THE LINE</div><div class="spar-big">${p.emoji} ${esc(sp.lead.first)}</div><div class="muted">${esc(p.name)} · ${esc(sp.diff)} · ${esc(sp.brainName)}</div></div>
        <div class="spar-sticker" style="--tilt:1.5deg"><div class="spar-k">TRUST</div><div class="spar-meter ${trustCls}"><span style="width:${sp.trust}%"></span></div><div class="spar-big num">${sp.trust}</div></div>
        <div class="spar-sticker" style="--tilt:-1deg"><div class="spar-k">CALL TIME</div><div class="spar-big num" id="spar-clock">0:00</div></div>
        ${lastMine && lastMine.coach ? `<div class="spar-sticker coach" style="--tilt:2deg"><div class="spar-k">COACH · LAST LINE ${lastMine.score != null ? lastMine.score : ""}</div><div>${esc(lastMine.coach)}</div></div>` : ""}
        ${sp.note ? `<div class="spar-sticker" style="--tilt:-1.5deg"><div class="muted">${esc(sp.note)}</div></div>` : ""}
      </div>
      <div class="spar-center">
        <canvas class="spar-orb"></canvas>
        <div class="spar-caption">${last ? "“" + esc(last.text) + "”" : sp.busy ? "Ringing…" : ""}</div>
        <div class="spar-live" id="spar-live"></div>
        ${done ? "" : `<form class="spar-input" id="spar-form">
          ${Recog ? `<button type="button" class="spar-mic ${sp.listening ? "on" : ""}" data-spar="mic" title="Talk (hold Space)">${sp.listening ? "● Listening" : "🎙 Talk"}</button>` : ""}
          <input id="spar-text" autocomplete="off" placeholder="${Recog ? "Talk, or type your answer and press Enter" : "Type your answer and press Enter"}">
          <button class="primary">Send</button>
        </form>
        <div class="btn-row spar-end-row"><button data-spar="hangup">Hang up</button><button data-spar="peek">👀 Peek at my card</button></div>`}
        ${sp.peek ? `<div class="spar-sticker peek" style="--tilt:1deg"><div class="spar-k">YOUR CARD${sp.peek.q ? ": " + esc(sp.peek.q) : ""}</div><pre>${esc(sp.peek.a)}</pre></div>` : ""}
      </div>
      <div class="spar-side spar-right">
        <div class="spar-k" style="margin-bottom:8px">TRANSCRIPT</div>
        <div class="spar-log" id="spar-log">${sp.lines.map((l) => `<div class="spar-msg ${l.role}"><div>${esc(l.text)}</div>${l.role === "agent" && l.score != null ? `<span class="spar-score ${l.score >= 65 ? "good" : l.score < 45 ? "bad" : ""}">${l.score}</span>` : ""}</div>`).join("")}
        ${sp.busy && sp.lines.length ? `<div class="spar-msg owner typing"><div>…</div></div>` : ""}</div>
      </div>
      ${done ? debriefHtml() : ""}
    </div>`;
  }

  function debriefHtml() {
    const d = sp.debrief;
    const head = sp.ended === "booked" ? "📅 Appointment booked!" : sp.ended === "hangup" ? "📵 They hung up" : "Call ended";
    return `<div class="spar-debrief">
      <div class="spar-sticker big" style="--tilt:-1.5deg"><div class="spar-k">${head}</div>
        ${d ? `<div class="spar-grade">${esc(d.grade)}</div><div class="muted">Score ${d.score}/100</div>` : `<div class="spar-big">Grading…</div>`}</div>
      ${d ? `<div class="spar-sticker" style="--tilt:1deg"><div class="spar-k">WINS</div><ul>${(d.wins || []).map((w) => `<li>${esc(w)}</li>`).join("") || "<li>Keep reps coming.</li>"}</ul></div>
      <div class="spar-sticker" style="--tilt:-1deg"><div class="spar-k">FIX NEXT TIME</div><ul>${(d.fixes || []).map((w) => `<li>${esc(w)}</li>`).join("") || "<li>Nothing big. Run a harder caller.</li>"}</ul></div>
      ${d.betterLine && d.betterLine.original ? `<div class="spar-sticker" style="--tilt:1.5deg"><div class="spar-k">SAY IT BETTER</div><p class="muted">You: “${esc(d.betterLine.original)}”</p><p>${esc(d.betterLine.rewrite)}</p></div>` : ""}` : ""}
      <div class="btn-row"><button class="primary" data-spar="again">🔁 Run it back</button><button data-spar="setup">Change caller</button><button data-spar="close">Back to dialer</button></div>
    </div>`;
  }

  function paint() {
    const el = document.querySelector(".spar");
    if (!el || !sp) return;
    const focus = document.activeElement && document.activeElement.id === "spar-text";
    const draft = focus ? document.activeElement.value : "";
    if (sp.orb) sp.orb.destroy();
    el.innerHTML = `<button class="spar-x" data-spar="close" title="Close (Esc)">✕</button>` + (sp.step === "setup" ? setupHtml() : callHtml());
    const cv = el.querySelector(".spar-orb");
    if (cv) { sp.orb = makeOrb(cv); sp.orb.state = sp.listening ? "listening" : sp.speaking ? "speaking" : sp.busy ? "thinking" : "idle"; }
    const log = el.querySelector("#spar-log");
    if (log) log.scrollTop = log.scrollHeight;
    const inp = el.querySelector("#spar-text");
    if (inp && (focus || (!sp.listening && !sp.busy))) { inp.value = draft; if (!Recog || focus) inp.focus(); }
    tickClock();
  }

  function tickClock() {
    const c = document.getElementById("spar-clock");
    if (c && sp && sp.startedAt) { const s = Math.floor(((sp.endedAt || Date.now()) - sp.startedAt) / 1000); c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  }

  function unlockVoice() {
    if (!synth) return;
    try { synth.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); } catch (e) { /* no voice */ }
  }

  function orbState(s) { if (sp && sp.orb) sp.orb.state = s; }

  function speak(text) {
    return new Promise((resolve) => {
      if (!sp.voiceOn || !synth) return resolve();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const p = persona();
      u.rate = p.voice.rate; u.pitch = p.voice.pitch;
      const v = pickVoice(PERSONAS.indexOf(p)); if (v) u.voice = v;
      u.onboundary = () => sp && sp.orb && sp.orb.pulse(0.6 + Math.random() * 0.4);
      let done = false, started = false;
      const finish = () => { if (done) return; done = true; if (sp) { sp.speaking = false; orbState("idle"); } resolve(); };
      u.onstart = () => { started = true; };
      u.onend = finish; u.onerror = finish;
      // never get stuck if the browser drops the event (iPhone does this a lot)
      setTimeout(finish, 1500 + text.length * 75);
      setTimeout(() => { if (!started && !synth.speaking) finish(); }, 1800); // voice never started: move on
      sp.speaking = true; orbState("speaking");
      synth.speak(u);
    });
  }

  // ---------- mic ----------
  let rec = null, micStream = null, micRaf = 0;
  async function micLevels() {
    if (IOS || micStream || !navigator.mediaDevices) return;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const an = ac.createAnalyser(); an.fftSize = 512;
      ac.createMediaStreamSource(micStream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += (v - 128) * (v - 128);
        if (sp && sp.listening && sp.orb) sp.orb.pulse(Math.min(1, Math.sqrt(sum / buf.length) / 30));
        micRaf = requestAnimationFrame(loop);
      };
      loop();
      micStream._ac = ac;
    } catch (e) { micStream = null; }
  }
  function releaseMic() {
    cancelAnimationFrame(micRaf);
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); try { micStream._ac.close(); } catch (e) { /* closed */ } micStream = null; }
  }
  // Speech recognition with watchdogs: iPhone Safari sometimes never starts, never fires onend,
  // or never marks results final. Any of those used to leave Spar stuck on "Listening".
  function startListening() {
    if (!Recog || !sp || sp.busy || sp.ended || sp.listening) return;
    if (synth) synth.cancel();
    const r = new Recog();
    rec = r;
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    let finalText = "", interim = "", started = false, heardAt = 0, ended = false;
    const t0 = Date.now(), session = sp;
    const wrapUp = () => {
      if (ended) return;
      ended = true;
      clearInterval(watch);
      if (rec === r) rec = null;
      try { r.abort(); } catch (e) { /* already closed */ }
      if (!sp || sp !== session) return; // Spar was closed or restarted
      sp.listening = false;
      const t = (finalText || interim).trim();
      if (t && !sp.busy && !sp.ended) send(t); else { orbState("idle"); paint(); }
    };
    r._wrap = wrapUp;
    r.onstart = r.onaudiostart = () => { started = true; };
    r.onresult = (e) => {
      started = true; heardAt = Date.now();
      let fin = "", mid = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript; else mid += e.results[i][0].transcript;
      }
      finalText = fin; interim = (fin + " " + mid).trim();
      const live = document.getElementById("spar-live");
      if (live) live.textContent = interim;
    };
    r.onerror = (e) => { if (sp) sp.note = e.error === "not-allowed" || e.error === "service-not-allowed" ? "Mic is blocked. Tap 🎙 Talk, allow the microphone, or type instead." : e.error === "no-speech" || e.error === "aborted" ? "" : "Mic hiccup: " + e.error + ". Tap 🎙 Talk or type."; };
    r.onend = wrapUp;
    const watch = setInterval(() => {
      const now = Date.now();
      if (!sp || sp !== session) return wrapUp();
      if (!started && now - t0 > 3000) { sp.note = "Mic didn't open. Tap 🎙 Talk or type your answer."; return wrapUp(); }
      if (heardAt && now - heardAt > 2200) return stopListening(); // you paused: send it
      if (now - t0 > 25000) return stopListening();
    }, 300);
    sp.listening = true; sp.note = "";
    micLevels();
    try { r.start(); } catch (e) { sp.note = "Mic didn't open. Tap 🎙 Talk or type your answer."; wrapUp(); return; }
    paint();
  }
  function stopListening() {
    const r = rec;
    if (!r) return;
    try { r.stop(); } catch (e) { /* stopped */ }
    setTimeout(() => r._wrap && r._wrap(), 1200); // if the browser never fires onend, finish it ourselves
  }

  // ---------- the call ----------
  async function startCall() {
    savePrefs();
    sp.step = "call"; sp.lines = []; sp.ended = null; sp.debrief = null; sp.peek = null; sp.note = "";
    const p = persona();
    sp.persona = p; sp.need = DIFF[sp.diff].need; sp.trust = Math.max(5, Math.min(90, p.trust + DIFF[sp.diff].bonus));
    const aiOk = sp.brainPref === "auto" && siteApi("/api/spar") && fubSettings().passcode;
    sp.brain = aiOk ? aiBrain(sp) : builtInBrain(sp);
    sp.brainName = aiOk ? "AI" : "built-in";
    sp.fallback = builtInBrain(sp);
    sp.startedAt = Date.now(); sp.endedAt = 0;
    clearInterval(sp.clock); sp.clock = setInterval(tickClock, 1000);
    sp.busy = true; paint();
    let r;
    try { r = await sp.brain.hello(); } catch (e) { r = await useFallback(e, () => sp.brain.hello()); }
    if (!sp) return;
    await ownerSays(r);
  }

  async function useFallback(err, again) {
    sp.note = `AI not available (${err.message}). Using the built-in homeowner.`;
    sp.brain = sp.fallback; sp.brainName = "built-in";
    return again();
  }

  async function ownerSays(r) {
    if (!sp) return;
    sp.busy = false;
    if (typeof r.trust === "number") sp.trust = Math.max(0, Math.min(100, Math.round(r.trust)));
    const mine = sp.lines.filter((l) => l.role === "agent");
    const lastMine = mine[mine.length - 1];
    if (lastMine && lastMine.score == null) {
      lastMine.score = typeof r.lineScore === "number" ? Math.round(r.lineScore) : null;
      lastMine.coach = r.coach || "";
      if (r.objection || lastMine.objection) trackCard(r.objection || lastMine.objection, lastMine.score);
    }
    const say = String(r.say || "...").trim();
    sp.lines.push({ role: "owner", text: say });
    // remember which card they just threw, so Peek and practice scores line up
    const card = sp.cards.find((c) => say.toLowerCase().includes(c.q.toLowerCase().replace(/[.?!]+$/, "").slice(0, 18)));
    sp.currentCard = card || null;
    if (r.end) { sp.ended = r.end; sp.endedAt = Date.now(); }
    paint();
    await speak(say);
    if (!sp) return;
    if (sp.ended) return finish();
    if (sp.autoListen && Recog) startListening();
  }

  function trackCard(q, score) {
    if (!q || score == null) return;
    const card = sp.cards.find((c) => c.q === q);
    if (!card) return;
    const ps = dialerSettings();
    const scores = { ...(ps.practiceScores || {}) };
    const cur = { hit: 0, miss: 0, ...(scores[q] || {}) };
    if (score >= 60) cur.hit++; else cur.miss++;
    scores[q] = cur;
    saveDialerSettings({ practiceScores: scores });
  }

  async function send(text) {
    if (!sp || sp.busy || sp.ended || !text.trim()) return;
    stopListening();
    if (synth) synth.cancel();
    sp.lines.push({ role: "agent", text: text.trim(), score: null, objection: sp.currentCard ? sp.currentCard.q : null });
    sp.peek = null;
    sp.busy = true; orbState("thinking"); paint();
    let r;
    try { r = await sp.brain.turn(text.trim()); } catch (e) { r = await useFallback(e, () => sp.brain.turn(text.trim())); }
    await ownerSays(r);
  }

  async function finish() {
    if (!sp) return;
    sp.endedAt = sp.endedAt || Date.now();
    stopListening(); releaseMic();
    clearInterval(sp.clock); tickClock();
    if (sp.ended === "booked" && window.hakiBurst) window.hakiBurst();
    paint();
    let d;
    try { d = await sp.brain.debrief(sp.lines); } catch (e) { d = await sp.fallback.debrief(sp.lines); }
    if (!sp) return;
    let score = Math.max(0, Math.min(100, Math.round(Number(d.score) || 0)));
    if (sp.ended === "booked") score = Math.min(100, score + 15);
    const grade = score >= 90 ? "S" : score >= 78 ? "A" : score >= 64 ? "B" : score >= 50 ? "C" : "D";
    sp.debrief = { ...d, score, grade };
    const ps = dialerSettings();
    const hist = (ps.sparHistory || []).concat({ t: Date.now(), persona: sp.persona.name, diff: sp.diff, grade, score, end: sp.ended }).slice(-30);
    const reps = ps.practiceDate === todayStr() ? (ps.practiceReps || 0) + 1 : 1;
    saveDialerSettings({ sparHistory: hist, practiceReps: reps, practiceDate: todayStr() });
    paint();
  }

  // ---------- events ----------
  function onClick(e) {
    const b = e.target.closest("[data-spar]");
    if (!b || !sp) return;
    const a = b.dataset.spar;
    if (b.tagName === "INPUT" || b.tagName === "SELECT") return; // handled by change
    if (a === "close") return closeSpar();
    if (a === "persona") { sp.personaId = b.dataset.id; return paint(); }
    if (a === "diff") { sp.diff = b.dataset.id; return paint(); }
    if (a === "start") { unlockVoice(); return startCall(); }
    if (a === "mic") return sp.listening ? stopListening() : startListening();
    if (a === "hangup") { sp.ended = sp.ended || "ended"; if (synth) synth.cancel(); return finish(); }
    if (a === "peek") {
      const c = sp.currentCard;
      sp.peek = c ? { q: c.q, a: fillVars(c.a, sp.lead.raw) } : { q: "", a: "No card for this one. Acknowledge, answer in one line, then ask a question." };
      return paint();
    }
    if (a === "again") { unlockVoice(); const keep = { personaId: sp.personaId, diff: sp.diff }; closeSpar(); openSpar(); Object.assign(sp, keep); return startCall(); }
    if (a === "setup") { sp.step = "setup"; sp.ended = null; return paint(); }
  }
  document.addEventListener("change", (e) => {
    const t = e.target.closest && e.target.closest(".spar [data-spar]");
    if (!t || !sp) return;
    if (t.dataset.spar === "voice") sp.voiceOn = t.checked;
    if (t.dataset.spar === "auto") sp.autoListen = t.checked;
    if (t.dataset.spar === "brain") sp.brainPref = t.value;
    savePrefs();
  });
  function onSubmit(e) {
    if (e.target.id !== "spar-form") return;
    e.preventDefault();
    const inp = document.getElementById("spar-text");
    const v = inp.value; inp.value = "";
    send(v);
  }
  document.addEventListener("keydown", (e) => {
    if (!sp) return;
    if (e.key === "Escape") { e.preventDefault(); closeSpar(); return; }
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.code === "Space" && !typing && !e.repeat && sp.step === "call") {
      e.preventDefault();
      if (sp.listening) { stopListening(); return; } // tap Space again to stop
      sp.spaceAt = Date.now(); startListening();
    }
  });
  document.addEventListener("keyup", (e) => {
    // hold Space to talk: releasing after a long hold sends; a quick tap leaves the mic open
    if (sp && e.code === "Space" && sp.listening && sp.spaceAt && Date.now() - sp.spaceAt > 700 && !(document.activeElement && document.activeElement.tagName === "INPUT")) stopListening();
  });

  window.openSpar = openSpar;
})();

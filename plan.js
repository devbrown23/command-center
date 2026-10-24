// 2026 plan for the From Start 2 Keys tab: $100K tracker, weekly scorecard,
// close-my-buyers checklist, homebuyer class funnel and review goal.
// Loaded before app.js. Uses state, save, render, uid, esc, money, todayStr and weekKey at runtime.

const PLAN_GCI_GOAL = 100000;
const PLAN_CLOSINGS_GOAL = 8;
const PLAN_REVIEW_GOAL = 40;

const PRIORITY_ONE = [
  "Call every active buyer: \"What would need to be true for you to buy in the next 60 days?\"",
  "Re-run each buyer's numbers with their lender",
  "Monday: send each buyer the price-reduced homes in their range",
  "Bring up seller-paid rate buydowns and concessions on every offer",
  "Review down payment assistance (WSHFC) with every first-time buyer",
  "Weekly game plan text to each buyer: 3 homes, 1 market fact, 1 next step",
];

const NEXT_7_DAYS = [
  "Set your 100-day start date in the Daily 20 CRM",
  "Call every buyer in your Buyer Contract stage in Follow Up Boss",
  "Send 3 Zestimate texts and 3 review requests",
  "Film \"What upgrades actually add value\" using your stairs",
  "Send email #1 with current Pierce/King County numbers",
  "Call everyone who opened it, then fill in this week's scorecard",
  "Open house with the review QR card on the sign-in table",
];

// Weekly targets. "auto" rows are counted from the other tabs.
const SCORECARD = [
  { id: "conversations", label: "Conversations", target: 100, auto: true },
  { id: "appointments", label: "Appointments set", target: 5 },
  { id: "agreements", label: "Buyer agreements signed", target: 1 },
  { id: "listingAppts", label: "Listing appointments", target: 1 },
  { id: "openRate", label: "Email open rate %", target: 40, auto: true },
  { id: "reviews", label: "Google reviews added", target: 2 },
  { id: "posts", label: "Video posts", target: 4, auto: true },
];

function planState(s) {
  s.plan = { scorecard: {}, priority: {}, next7: [], classes: [], reviewsNow: 14, ...(s.plan || {}) };
  return s.plan;
}

function autoScore(id, week) {
  if (id === "conversations") return state.crm.touches.filter((t) => t.date >= week).length;
  if (id === "openRate") {
    const rate = (state.crm.emails[week] || {}).openRate;
    return rate === "" || rate == null ? null : rate;
  }
  if (id === "posts") return (state.content ? state.content.videos : []).filter((v) => v.date >= week).length;
  return null;
}

function renderPlan2026(s) {
  const plan = planState(s);
  const week = weekKey();
  const start = state.crm.startDate || "";
  const gci = s.money.filter((m) => m.type === "income" && (!start || m.date >= start)).reduce((sum, m) => sum + m.amount, 0);
  const closings = s.pipeline.filter((p) => p.stage === "Closed").length;
  const active = s.pipeline.filter((p) => !["Lead", "Closed"].includes(p.stage)).length;
  const pct = (n, goal) => Math.min(100, (n / goal) * 100);
  const checks = plan.priority[week] || [];
  const manual = plan.scorecard[week] || {};

  const classTotals = plan.classes.reduce((t, c) => ({
    attendees: t.attendees + c.attendees, consults: t.consults + c.consults, signed: t.signed + c.signed,
  }), { attendees: 0, consults: 0, signed: 0 });
  const rate = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "–");

  const scoreRows = SCORECARD.map((row) => {
    const value = row.auto ? autoScore(row.id, week) : manual[row.id];
    const hit = value != null && value !== "" && Number(value) >= row.target;
    const cell = row.auto
      ? `<strong>${value == null ? "–" : value}</strong>`
      : `<input type="number" min="0" data-plan="score" data-id="${row.id}" value="${esc(value ?? "")}" style="width:70px">`;
    return `<li><span class="grow">${esc(row.label)} <span class="muted">(goal ${row.target}${row.auto ? ", auto" : ""})</span></span>${cell}<span class="${hit ? "pos" : "muted"}">${hit ? "✓" : ""}</span></li>`;
  }).join("");

  return `<div class="grid" style="margin-top:16px">
    <div class="card" style="--tab:#1f6feb">
      <h3>$100K in 100 days</h3>
      <div class="stats">
        <div class="stat"><div class="label">Commission earned</div><div class="value">${money(gci)}</div></div>
        <div class="stat"><div class="label">Closings</div><div class="value">${closings} / ${PLAN_CLOSINGS_GOAL}</div></div>
        <div class="stat"><div class="label">Active clients</div><div class="value">${active}</div></div>
      </div>
      <div class="bar"><div style="width:${pct(gci, PLAN_GCI_GOAL)}%"></div></div>
      <p class="muted">${Math.round(pct(gci, PLAN_GCI_GOAL))}% of $100K${start ? ` since ${esc(start)}` : ""}. Log each commission as income above and move the client to Closed.</p>
      <p class="muted">The math: about $13K per deal means 7–8 closings, about 12 signed clients, about 25 appointments and about 1,500 conversations. Your Daily 20 covers it.</p>
    </div>

    <div class="card">
      <h3>Priority 1: close my buyers</h3>
      <p class="muted">Resets every Monday. The fastest money is the buyers you already have.</p>
      <ul class="list">${PRIORITY_ONE.map((item, i) => `<li class="${checks[i] ? "done" : ""}">
        <input type="checkbox" data-plan="priority" data-i="${i}" ${checks[i] ? "checked" : ""}>
        <span class="grow">${esc(item)}</span></li>`).join("")}</ul>
    </div>

    <div class="card">
      <h3>Weekly scorecard</h3>
      <p class="muted">Week of ${esc(week)}. Check it every Friday.</p>
      <ul class="list">${scoreRows}</ul>
    </div>
  </div>

  <div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>Homebuyer class funnel</h3>
      <div class="stats">
        <div class="stat"><div class="label">Attendees</div><div class="value">${classTotals.attendees}</div></div>
        <div class="stat"><div class="label">Consultations</div><div class="value">${classTotals.consults} <span class="muted">${rate(classTotals.consults, classTotals.attendees)}</span></div></div>
        <div class="stat"><div class="label">Signed</div><div class="value">${classTotals.signed} <span class="muted">${rate(classTotals.signed, classTotals.attendees)}</span></div></div>
      </div>
      <p class="muted">Goal per class: 10 attendees, 3 consultations, 1–2 signed. Text every attendee the same night: "What's one thing from tonight you want help with?"</p>
      <ul class="list">${[...plan.classes].sort((a, b) => b.date.localeCompare(a.date)).map((c) => `<li>
        <span class="grow">${esc(c.date)}: ${c.attendees} attended · ${c.consults} consultations · ${c.signed} signed</span>
        <button class="x" data-plan="del-class" data-id="${c.id}" title="Delete">✕</button></li>`).join("") || `<li class="muted">No classes logged yet</li>`}</ul>
      <form class="row" data-plan-form="class">
        <input type="date" name="date" value="${todayStr()}" required>
        <input type="number" name="attendees" min="0" placeholder="Attendees" required>
        <input type="number" name="consults" min="0" placeholder="Consultations">
        <input type="number" name="signed" min="0" placeholder="Signed">
        <button class="primary">Log class</button>
      </form>
    </div>

    <div class="card">
      <h3>Google reviews</h3>
      <div class="stats">
        <div class="stat"><div class="label">Reviews now</div><div class="value">${plan.reviewsNow} / ${PLAN_REVIEW_GOAL}</div></div>
      </div>
      <div class="bar"><div style="width:${pct(plan.reviewsNow, PLAN_REVIEW_GOAL)}%"></div></div>
      <form class="row" data-plan-form="reviews">
        <label class="muted">Current Google review count <input type="number" name="reviewsNow" min="0" value="${plan.reviewsNow}" style="width:80px"></label>
        <button>Update</button>
      </form>
      <p class="muted">Reviews, a complete Google Business Profile and FAQ answers on your website decide who AI search recommends in 2026. Ask from the Reviews card in the Daily 20 CRM.</p>
    </div>

    <div class="card">
      <h3>Next 7 days</h3>
      <ul class="list">${NEXT_7_DAYS.map((item, i) => `<li class="${plan.next7[i] ? "done" : ""}">
        <input type="checkbox" data-plan="next7" data-i="${i}" ${plan.next7[i] ? "checked" : ""}>
        <span class="grow">${esc(item)}</span></li>`).join("")}</ul>
    </div>
  </div>

  <details class="card" style="margin-top:16px">
    <summary><strong>2026 plan notes</strong></summary>
    <ul class="muted">
      <li><strong>Market:</strong> more homes for sale, longer days on market and more price cuts than 2023. Sellers need pricing and prep advice; buyers have negotiating power.</li>
      <li><strong>Buyer agreements:</strong> since August 2024, buyers sign a written agreement before touring and commission is negotiated openly. Treat the buyer consultation as your sales presentation.</li>
      <li><strong>Texting and email:</strong> Washington's anti-spam law covers commercial texts, so text people you know one-to-one. Keep email subject lines honest. Check bulk texting with your broker.</li>
      <li><strong>Off-market posts:</strong> check NWMLS rules and your broker before publicly marketing a home that isn't on the MLS.</li>
      <li><strong>Your edge:</strong> "the Realtor who renovates." Film what to fix before buying, which upgrades add value, and renovation loans with one lender partner.</li>
      <li><strong>Time blocks:</strong> prospect 8–11am every weekday (non-negotiable), appointments in the afternoon, film Sunday, edit Wednesday, Juice Havan on weekends, cards, gaming and trucking in time-boxed evenings.</li>
      <li><strong>Always verify:</strong> rates, loan programs and MLS rules change often. Confirm with your lender and broker, and use current local MLS numbers.</li>
    </ul>
  </details>`;
}

// ---------- events ----------

const planView = document.getElementById("view");

planView.addEventListener("change", (e) => {
  if (currentTab !== "realestate") return;
  const el = e.target;
  if (!el.dataset.plan) return;
  const plan = planState(state.realestate);
  const week = weekKey();
  if (el.dataset.plan === "priority") {
    const checks = plan.priority[week] || [];
    checks[Number(el.dataset.i)] = el.checked;
    plan.priority[week] = checks;
  } else if (el.dataset.plan === "next7") {
    plan.next7[Number(el.dataset.i)] = el.checked;
  } else if (el.dataset.plan === "score") {
    plan.scorecard[week] = { ...(plan.scorecard[week] || {}), [el.dataset.id]: el.value === "" ? "" : Math.max(0, Number(el.value)) };
  } else {
    return;
  }
  save();
  render();
});

planView.addEventListener("click", (e) => {
  if (currentTab !== "realestate") return;
  const btn = e.target.closest("button[data-plan='del-class']");
  if (!btn || !confirm("Delete this class?")) return;
  const plan = planState(state.realestate);
  plan.classes = plan.classes.filter((c) => c.id !== btn.dataset.id);
  save();
  render();
});

planView.addEventListener("submit", (e) => {
  if (currentTab !== "realestate") return;
  const form = e.target;
  if (!form.dataset.planForm) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const plan = planState(state.realestate);
  if (form.dataset.planForm === "class") {
    plan.classes.push({
      id: uid(), date: f.date,
      attendees: Number(f.attendees) || 0, consults: Number(f.consults) || 0, signed: Number(f.signed) || 0,
    });
  } else if (form.dataset.planForm === "reviews") {
    plan.reviewsNow = Math.max(0, Number(f.reviewsNow) || 0);
  }
  save();
  render();
});

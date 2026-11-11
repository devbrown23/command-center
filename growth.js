// Game Plan tab: the Monday review (three things to do this week, from what didn't get done last week),
// a KPI dashboard across the businesses, the SOI outreach engine (segments + a weekly call/text list
// with drafted messages) and the class-to-client funnel (attendees in, follow-up sequence, booking link).
// Loaded before app.js. Uses state, save, render, uid, esc, money, todayStr, addDays, weekKey, logTouch,
// touchesOn, contactName, copyText, shareToPool, planState and dsState at runtime.

const GP_DEFAULT_BOOKING = "https://calendly.com/devbrownrealtor/30min";
const GP_GOALS = { closings: 20, reviews: 200, classSignups: 240 };

// Weekly list size per segment, and how long before someone in that segment is due again.
const SOI_SEGMENTS = [
  { id: "past", name: "Past clients", perWeek: 5, everyDays: 60 },
  { id: "class", name: "Class grads", perWeek: 10, everyDays: 30 },
  { id: "sphere", name: "Sphere", perWeek: 10, everyDays: 45 },
  { id: "cold", name: "Cold", perWeek: 10, everyDays: 90 },
];

// Drafts rotate by month so the same person doesn't get the same message twice in a row.
const SOI_DRAFTS = {
  past: [
    "Hi {first}, it's Devin! How's the house treating you? Quick question: who do you know thinking about buying or selling this year? I'd take great care of them.",
    "Hey {first}, it's Devin. I just pulled updated values near you, and homes on your side of town have held up well. Want me to send you a quick equity update?",
    "Hi {first}! Hope you and the family are good. If you ever need a contractor, lender or anything for the house, I've got a list of people I trust. Just ask.",
  ],
  class: [
    "Hi {first}, it's Devin from the homebuyer class! Are you still thinking about buying, or did life go a different direction? Either is fine. If you're still looking, grab 15 minutes here: {booking}",
    "Hey {first}, Devin here. Rates and down payment programs have moved since class. Want a quick updated game plan for your budget? {booking}",
    "Hi {first}! Just checking: did you get a chance to talk with a lender yet? I can connect you with Kelli, who taught the class with me.",
  ],
  sphere: [
    "Hey {first}, it's Devin! Was thinking about you. How's everything? Also, who do you know thinking about buying or selling this year?",
    "Hi {first}, Devin here. I've been doing free home value updates for friends this month. Want me to run yours?",
    "Hey {first}! Quick one: I'm putting together a list of good local contractors and lenders. Anyone you'd recommend, or anyone you need?",
  ],
  cold: [
    "Hi {first}, it's Devin Brown with From Start 2 Keys. We connected a while back. Are you still thinking about a move, or should I check back later?",
    "Hi {first}, Devin with From Start 2 Keys. I'm sending a few people free updates on what homes near them sold for. Want one for your area?",
    "Hi {first}, it's Devin. Just checking in once: still open to buying or selling in the next year? A yes or no is perfect.",
  ],
};

// Class follow-up sequence: days after the class.
const CLASS_STEPS = [
  { day: 0, label: "Same night: thank you + booking link", msg: "Hi {first}, it's Devin! Thanks for coming to the homebuyer class tonight. What's one thing from class you want help with? When you're ready, grab a free 15-minute game plan here: {booking}" },
  { day: 2, label: "Day 2: check in", msg: "Hey {first}, Devin from the homebuyer class. Did you get a chance to talk with a lender yet? Happy to connect you with Kelli." },
  { day: 7, label: "Day 7: book the 1-on-1", msg: "Hi {first}! Want to map out your budget, payment and down payment help in 15 minutes this week? Pick a time here: {booking}" },
  { day: 14, label: "Day 14: last nudge", msg: "Hi {first}, last check-in from me for now: are you still planning to buy in the next year? A yes or no is perfect, and I'll follow your lead." },
];

let gpTextTarget = null; // remembers which step a Text button was for, so it can be marked done

function gpState() {
  state.gp = {
    goals: { ...GP_GOALS }, bookingUrl: GP_DEFAULT_BOOKING, closingsBefore: 0,
    soiPerWeek: {}, monday: {}, ...(state.gp || {}),
  };
  state.gp.goals = { ...GP_GOALS, ...state.gp.goals };
  return state.gp;
}

function gpFill(text, c) {
  return text.replace(/\{first\}/g, (c && c.firstName) || "there").replace(/\{booking\}/g, gpState().bookingUrl || GP_DEFAULT_BOOKING);
}

function gpSms(phone, text) {
  return `sms:${encodeURIComponent(phone)}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}`;
}

function gpDaysBetween(a, b) {
  return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
}

function gpLastWeek() {
  return addDays(weekKey(), -7);
}

// ---------- KPIs ----------

function gpKpis() {
  const gp = gpState();
  const year = todayStr().slice(0, 4);
  const month = todayStr().slice(0, 7);
  const re = state.realestate || { pipeline: [], money: [] };
  const plan = typeof planState === "function" ? planState(re) : { reviewsNow: 0, classes: [] };
  const closedThisYear = re.pipeline.filter((p) => p.stage === "Closed" && (!p.movedAt || p.movedAt.startsWith(year))).length;
  const closings = closedThisYear + (Number(gp.closingsBefore) || 0);
  const classSignups = plan.classes.filter((c) => (c.date || "").startsWith(year)).reduce((a, c) => a + (Number(c.attendees) || 0), 0);
  const sum = (biz, type, prefix) => ((state[biz] && state[biz].money) || []).filter((m) => m.type === type && m.date.startsWith(prefix)).reduce((a, m) => a + m.amount, 0);
  const cards = state.cards || { pipeline: [] };
  const cardsSold = cards.pipeline.filter((p) => p.stage === "Sold" || p.stage === "Shipped").length;
  const ds = state.dropship && typeof dsState === "function" ? dsState(state.dropship) : { subs: [] };
  const toolCost = (ds.subs || []).reduce((a, x) => a + (Number(x.cost) || 0), 0);
  const shopifyRev = sum("dropship", "income", month);
  const gci = sum("realestate", "income", year);
  return {
    closings, reviews: plan.reviewsNow || 0, classSignups,
    cardMonth: sum("cards", "income", month), cardYear: sum("cards", "income", year), cardsSold,
    shopifyRev, shopifyAds: sum("dropship", "expense", month), toolCost, gci,
  };
}

function gpMeter(label, value, goal, note, fmt = (n) => n) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return `<div class="gp-kpi">
    <div class="label">${esc(label)}</div>
    <div class="value">${fmt(value)} <span class="muted">/ ${fmt(goal)}</span></div>
    <div class="bar"><div style="width:${pct}%"></div></div>
    <div class="muted">${note}</div>
  </div>`;
}

function renderKpis() {
  const gp = gpState();
  const k = gpKpis();
  const weekOfYear = Math.ceil(gpDaysBetween(todayStr().slice(0, 4) + "-01-01", todayStr()) / 7) || 1;
  const pace = (goal) => Math.round((goal * weekOfYear) / 52);
  const covered = k.toolCost > 0 ? k.shopifyRev / k.toolCost : 0;
  return `<div class="card" style="margin-top:16px">
    <h3>KPI dashboard</h3>
    <div class="gp-kpis">
      ${gpMeter("Closings this year", k.closings, gp.goals.closings, `On pace: ${pace(gp.goals.closings)} by now`)}
      ${gpMeter("Google reviews", k.reviews, gp.goals.reviews, "Update the count in Real Estate → Google reviews")}
      ${gpMeter("Class signups this year", k.classSignups, gp.goals.classSignups, "From classes logged below")}
      <div class="gp-kpi">
        <div class="label">eBay card sales</div>
        <div class="value">${money(k.cardMonth)} <span class="muted">this month</span></div>
        <div class="muted">${money(k.cardYear)} this year · ${k.cardsSold} cards sold or shipped</div>
      </div>
      <div class="gp-kpi">
        <div class="label">Stack & Smoke vs. tools</div>
        <div class="value ${k.shopifyRev >= k.toolCost ? "pos" : "neg"}">${money(Math.round(k.shopifyRev))} <span class="muted">/ ${money(Math.round(k.toolCost))}</span></div>
        <div class="bar"><div style="width:${Math.min(100, covered * 100)}%"></div></div>
        <div class="muted">Sales this month vs. monthly tools${k.shopifyAds ? ` · ${money(Math.round(k.shopifyAds))} ad spend` : ""}</div>
      </div>
      <div class="gp-kpi">
        <div class="label">Commission this year</div>
        <div class="value">${money(Math.round(k.gci))}</div>
        <div class="muted">Real Estate → Money in / out</div>
      </div>
    </div>
    <details style="margin-top:10px"><summary class="muted"><strong>Goals and setup</strong></summary>
      <form class="row" data-gp-form="goals">
        <label class="muted">Closings goal <input type="number" name="closings" min="1" value="${gp.goals.closings}" style="width:80px"></label>
        <label class="muted">Reviews goal <input type="number" name="reviews" min="1" value="${gp.goals.reviews}" style="width:80px"></label>
        <label class="muted">Class signups goal <input type="number" name="classSignups" min="1" value="${gp.goals.classSignups}" style="width:80px"></label>
        <label class="muted">Closings this year before tracking <input type="number" name="closingsBefore" min="0" value="${gp.closingsBefore}" style="width:80px"></label>
        <input name="bookingUrl" type="url" placeholder="Booking link" value="${esc(gp.bookingUrl)}" style="flex-basis:100%">
        <button class="primary">Save</button>
      </form>
      <p class="muted">Closings count clients moved to Closed this year on the Real Estate board. Card sales come from Cards → Money in; Stack & Smoke from Dropship → Money in and its monthly tools.</p>
    </details>
  </div>`;
}

// ---------- SOI outreach engine ----------

function soiSegment(c) {
  if (["Hot Prospect", "Active Client", "Under Contract"].includes(c.stage)) return null; // active: worked from the Daily 20
  if (c.stage === "Closed" || c.stage === "Past Client" || /past client/i.test(c.source || "")) return "past";
  if (/class/i.test(c.source || "") || c.classDate) return "class";
  if (c.stage === "Sphere" || /sphere|referral|lender/i.test(c.source || "")) return "sphere";
  return "cold";
}

function soiWeekList() {
  const gp = gpState();
  const week = weekKey();
  const today = todayStr();
  const doneThisWeek = new Set(state.crm.touches.filter((t) => t.date >= week && t.contactId).map((t) => t.contactId));
  const bySeg = {};
  for (const seg of SOI_SEGMENTS) bySeg[seg.id] = { seg, all: [], due: [], list: [] };
  for (const c of state.crm.contacts) {
    if (!c.phone && !c.email) continue;
    const s = soiSegment(c);
    if (!s) continue;
    bySeg[s].all.push(c);
    const since = c.lastContact ? gpDaysBetween(c.lastContact, today) : 9999;
    if (since >= bySeg[s].seg.everyDays || doneThisWeek.has(c.id)) bySeg[s].due.push(c);
  }
  for (const s of Object.values(bySeg)) {
    const per = gp.soiPerWeek[s.seg.id] ?? s.seg.perWeek;
    // contacts already reached this week stay on the list (checked off); the rest fill up, oldest contact first
    const done = s.due.filter((c) => doneThisWeek.has(c.id));
    const open = s.due.filter((c) => !doneThisWeek.has(c.id)).sort((a, b) => (a.lastContact || "").localeCompare(b.lastContact || ""));
    s.list = [...done, ...open].slice(0, Math.max(per, done.length));
    s.doneCount = done.length;
    s.per = per;
  }
  return { bySeg, doneThisWeek };
}

function renderSoi() {
  const { bySeg, doneThisWeek } = soiWeekList();
  const monthIdx = new Date().getMonth();
  const total = Object.values(bySeg).reduce((a, s) => a + s.list.length, 0);
  const done = Object.values(bySeg).reduce((a, s) => a + s.doneCount, 0);
  const sections = SOI_SEGMENTS.map((seg) => {
    const s = bySeg[seg.id];
    const draft = SOI_DRAFTS[seg.id][monthIdx % SOI_DRAFTS[seg.id].length];
    const rows = s.list.map((c) => {
      const msg = gpFill(draft, c);
      const isDone = doneThisWeek.has(c.id);
      return `<li class="sender ${isDone ? "done" : ""}">
        <span class="grow"><strong>${esc(contactName(c))}</strong> <span class="muted">${esc(c.stage || "")}${c.lastContact ? ` · last talked ${esc(c.lastContact)}` : " · never contacted"}</span></span>
        <span class="btn-row">${isDone ? `<span class="pos">✓ Done this week</span>` : `
          ${c.phone ? `<a class="ghost" href="tel:${esc(c.phone)}" data-soi="call" data-id="${c.id}">Call</a>
          <a class="ghost" href="${esc(gpSms(c.phone, msg))}" data-soi="text" data-id="${c.id}">Text</a>` : ""}
          ${c.email ? `<a class="ghost" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("Quick question")}&body=${encodeURIComponent(msg)}" data-soi="email" data-id="${c.id}">Email</a>` : ""}`}
        </span>
      </li>`;
    }).join("");
    return `<div class="gp-seg">
      <h4>${esc(seg.name)} <span class="muted">${s.doneCount}/${s.list.length} this week · ${s.all.length} total · due every ${seg.everyDays} days</span></h4>
      <p class="muted"><strong>This month's message:</strong> ${esc(gpFill(draft, { firstName: "[name]" }))}
        <button class="x" data-soi="copy" data-text="${esc(draft)}">Copy</button></p>
      <ul class="list">${rows || `<li class="muted">Nobody due in this group this week.</li>`}</ul>
    </div>`;
  }).join("");
  return `<div class="card" style="margin-top:16px">
    <h3>SOI outreach: this week's list</h3>
    <div class="stats">
      <div class="stat"><div class="label">Reached this week</div><div class="value">${done} / ${total}</div></div>
    </div>
    <div class="bar"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
    <p class="muted">Built every Monday from your CRM: past clients, class grads, sphere and cold contacts who are due, longest-since-contact first. Call, Text or Email opens your phone or mail app with the message filled in, and counts toward your Daily 20. Pull from Follow Up Boss first so everyone is here.</p>
    ${sections}
    <details><summary class="muted"><strong>List sizes</strong></summary>
      <form class="row" data-gp-form="soi">
        ${SOI_SEGMENTS.map((seg) => `<label class="muted">${esc(seg.name)} <input type="number" min="0" name="${seg.id}" value="${gpState().soiPerWeek[seg.id] ?? seg.perWeek}" style="width:70px"></label>`).join("")}
        <button>Save</button>
      </form>
    </details>
  </div>`;
}

// ---------- class-to-client funnel ----------

function classStepDue(c, today = todayStr()) {
  if (!c.classDate || c.classBooked) return null;
  const done = c.classSteps || {};
  const since = gpDaysBetween(c.classDate, today);
  for (let i = 0; i < CLASS_STEPS.length; i++) {
    if (done[i]) continue;
    if (since >= CLASS_STEPS[i].day) return { i, step: CLASS_STEPS[i], overdue: since - CLASS_STEPS[i].day };
    return null; // next step isn't due yet
  }
  return null;
}

function parseAttendees(text) {
  return text.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|,/).map((x) => x.trim()).filter(Boolean);
    const email = parts.find((p) => p.includes("@")) || "";
    const phone = parts.find((p) => (p.replace(/\D/g, "").length >= 10)) || "";
    const name = parts.find((p) => p !== email && p !== phone) || email.split("@")[0] || "";
    const [firstName, ...rest] = name.split(/\s+/);
    return { firstName: firstName || "", lastName: rest.join(" "), email, phone };
  }).filter((a) => a.firstName || a.email || a.phone);
}

function addClass(date, text, shareLender) {
  const people = parseAttendees(text);
  const norm = (p) => (p || "").replace(/\D/g, "").slice(-10);
  let added = 0, matched = 0;
  const ids = [];
  for (const a of people) {
    let c = state.crm.contacts.find((x) => (a.email && x.email && x.email.toLowerCase() === a.email.toLowerCase()) || (norm(a.phone) && norm(x.phone) === norm(a.phone)));
    if (c) {
      matched++;
      if (!c.phone && a.phone) c.phone = a.phone;
      if (!c.email && a.email) c.email = a.email;
    } else {
      c = { id: uid(), firstName: a.firstName, lastName: a.lastName, phone: a.phone, email: a.email, source: "Homebuyer class", stage: "Lead",
        notes: "", createdAt: new Date().toISOString(), lastContact: "", fub: "", fubError: "", review: "", reviewAsked: "" };
      state.crm.contacts.push(c);
      added++;
    }
    c.classDate = date;
    c.classSteps = {};
    c.classBooked = false;
    c.nextStep = "Book a 1-on-1 game plan";
    c.nextFollowUp = date;
    ids.push(c.id);
  }
  const plan = planState(state.realestate);
  plan.classes.push({ id: uid(), date, attendees: people.length, consults: 0, signed: 0, contactIds: ids });
  save();
  if (shareLender && typeof shareToPool === "function") {
    ids.forEach((id, i) => { const c = state.crm.contacts.find((x) => x.id === id); if (c) setTimeout(() => shareToPool(c), i * 400); });
  }
  return { added, matched, total: people.length };
}

function renderClassFunnel() {
  const today = todayStr();
  const grads = state.crm.contacts.filter((c) => c.classDate);
  const due = grads.map((c) => ({ c, d: classStepDue(c, today) })).filter((x) => x.d).sort((a, b) => b.d.overdue - a.d.overdue);
  const plan = planState(state.realestate);
  const recent = [...plan.classes].filter((k) => k.contactIds).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const booked = (ids) => ids.map((id) => state.crm.contacts.find((x) => x.id === id)).filter((c) => c && c.classBooked).length;
  const signed = (ids) => ids.map((id) => state.crm.contacts.find((x) => x.id === id)).filter((c) => c && ["Active Client", "Under Contract", "Closed", "Past Client"].includes(c.stage)).length;
  return `<div class="card" style="margin-top:16px">
    <h3>Class to client</h3>
    <div class="grid" style="gap:16px">
      <div>
        <h4>Log a class</h4>
        <form data-gp-form="class">
          <div class="row"><label class="muted">Class date <input type="date" name="date" value="${today}" required></label></div>
          <textarea name="people" placeholder="One attendee per line: name, phone, email (paste from Zoom or your sign-up sheet)" required></textarea>
          <div class="row">
            <label class="muted"><input type="checkbox" name="lender" checked> Share them with Kelli (Client Pool)</label>
            <button class="primary">Add attendees</button>
          </div>
        </form>
        <p class="muted">Each attendee lands in your CRM as a Homebuyer class lead with the next step "Book a 1-on-1 game plan" and a 4-step follow-up: same night, day 2, day 7 and day 14. The texts include your booking link.</p>
      </div>
      <div>
        <h4>Follow-ups due (${due.length})</h4>
        <ul class="list">${due.map(({ c, d }) => {
          const msg = gpFill(d.step.msg, c);
          return `<li class="sender">
            <span class="grow"><strong>${esc(contactName(c))}</strong> <span class="muted">${esc(d.step.label)}${d.overdue ? ` · ${d.overdue} day${d.overdue === 1 ? "" : "s"} late` : ""}</span></span>
            <span class="btn-row">
              ${c.phone ? `<a class="ghost" href="${esc(gpSms(c.phone, msg))}" data-cls="text" data-id="${c.id}" data-i="${d.i}">Text</a>` : ""}
              ${c.email ? `<a class="ghost" href="mailto:${esc(c.email)}?subject=${encodeURIComponent("From the homebuyer class")}&body=${encodeURIComponent(msg)}" data-cls="text" data-id="${c.id}" data-i="${d.i}">Email</a>` : ""}
              <button data-cls="skip" data-id="${c.id}" data-i="${d.i}">Skip</button>
              <button class="primary" data-cls="booked" data-id="${c.id}">Booked</button>
            </span>
          </li>`;
        }).join("") || `<li class="muted">No class follow-ups due.</li>`}</ul>
      </div>
    </div>
    ${recent.length ? `<h4 style="margin-top:12px">Recent classes</h4>
    <ul class="list">${recent.map((k) => `<li><span class="grow">${esc(k.date)}: ${k.attendees} attended · ${booked(k.contactIds)} booked a 1-on-1 · ${signed(k.contactIds)} signed</span></li>`).join("")}</ul>` : ""}
  </div>`;
}

// ---------- Monday review ----------

function gpWeekStats(week) {
  const end = addDays(week, 7);
  const touches = state.crm.touches.filter((t) => t.date >= week && t.date < end);
  const target = state.crm.dailyTarget || 20;
  let daysHit = 0;
  for (let i = 0; i < 5; i++) if (touches.filter((t) => t.date === addDays(week, i)).length >= target) daysHit++;
  return { touches, daysHit, reviewsAsked: state.crm.contacts.filter((c) => c.reviewAsked && c.reviewAsked >= week && c.reviewAsked < end).length };
}

function gpActions() {
  const today = todayStr();
  const last = gpLastWeek();
  const lw = gpWeekStats(last);
  const actions = [];
  const add = (weight, miss, todo, tab) => actions.push({ weight, miss, todo, tab });

  if (lw.daysHit < 5) add(100 - lw.daysHit * 15, `Hit the Daily 20 on ${lw.daysHit} of 5 weekdays`, "Block 8–11am Monday through Friday for the Daily 20 and protect it", "crm");
  const overdue = state.crm.contacts.filter((c) => c.nextFollowUp && c.nextFollowUp < today && !["Closed", "Past Client"].includes(c.stage)).length;
  if (overdue) add(70 + Math.min(overdue, 20), `${overdue} follow-up${overdue === 1 ? "" : "s"} past due`, `Clear the ${overdue} overdue follow-ups first thing Monday`, "crm");
  const classDue = state.crm.contacts.filter((c) => classStepDue(c, today)).length;
  if (classDue) add(85, `${classDue} class follow-up${classDue === 1 ? "" : "s"} not sent`, `Send the ${classDue} class follow-ups and get 1-on-1s booked`, "gameplan");
  const { bySeg } = soiWeekList();
  const soiTotal = Object.values(bySeg).reduce((a, s) => a + s.list.length, 0);
  if (soiTotal) add(60, "SOI list for the week not worked yet", `Work this week's SOI list: ${soiTotal} people`, "gameplan");
  const re = state.realestate || { pipeline: [] };
  const stalled = re.pipeline.filter((p) => p.stage !== "Closed" && p.movedAt && gpDaysBetween(p.movedAt, today) >= 7);
  if (stalled.length) add(80, `${stalled.length} deal${stalled.length === 1 ? "" : "s"} stalled 7+ days (${stalled.slice(0, 3).map((p) => p.title).join(", ")})`, `Call ${stalled.slice(0, 3).map((p) => p.title).join(", ")} with a clear next step`, "realestate");
  if (!lw.reviewsAsked) add(55, "No review requests sent", "Ask 3 past clients for a Google review", "crm");
  const email = state.crm.emails && state.crm.emails[last];
  if (!email || !email.sent) add(50, "Thursday value email didn't go out", "Send Thursday's value email, then call everyone who opens it Friday", "crm");
  const plan = typeof planState === "function" ? planState(re) : { scorecard: {} };
  const appts = Number((plan.scorecard[last] || {}).appointments) || 0;
  if (appts < 5) add(65, `${appts} appointment${appts === 1 ? "" : "s"} set (goal 5)`, "Turn conversations into appointments: offer two times on every yes", "realestate");
  const k = gpKpis();
  if (k.toolCost && k.shopifyRev < k.toolCost) add(40, `Stack & Smoke at ${money(Math.round(k.shopifyRev))} vs. ${money(Math.round(k.toolCost))} in tools this month`, "Post 3 Stack & Smoke videos and run the next ad test", "dropship");
  const wr = plan.weekly && plan.weekly[last];
  if (!wr || !(wr.wins || wr.lessons || wr.top3)) add(30, "Friday weekly review skipped", "Do the 5-minute Friday review this week", "realestate");
  return actions.sort((a, b) => b.weight - a.weight);
}

function renderMonday(compact) {
  const gp = gpState();
  const week = weekKey();
  // Lock the three picks on the first look of the week, so they don't shift as you work.
  if (!gp.monday[week]) {
    const picks = gpActions().slice(0, 3).map((a) => ({ text: a.todo, why: a.miss, tab: a.tab, done: false }));
    gp.monday[week] = { picks, at: todayStr() };
    save();
  }
  const m = gp.monday[week];
  const misses = gpActions().slice(0, 6);
  const doneCount = m.picks.filter((p) => p.done).length;
  const list = m.picks.map((p, i) => `<li class="${p.done ? "done" : ""}">
    <input type="checkbox" data-mon="${i}" ${p.done ? "checked" : ""}>
    <span class="grow"><strong>${esc(p.text)}</strong><br><span class="muted">Because last week: ${esc(p.why)}</span></span>
    <button class="x" data-goto-tab="${esc(p.tab)}">Go →</button>
  </li>`).join("") || `<li class="muted">Nothing slipped last week. Keep the same rhythm.</li>`;
  if (compact) {
    return `<div class="card" style="margin-bottom:16px" data-goto="gameplan">
      <h3>This week's 3 <span class="muted">${doneCount}/${m.picks.length} done</span></h3>
      <ul class="list">${m.picks.map((p) => `<li class="${p.done ? "done" : ""}"><span class="grow">${esc(p.text)}</span></li>`).join("")}</ul>
    </div>`;
  }
  return `<div class="card" data-haki="1">
    <h2>Monday review · week of ${esc(week)}</h2>
    <p class="muted">What didn't get executed last week, turned into the three things that matter most this week.</p>
    <ul class="list">${list}</ul>
    ${misses.length ? `<details style="margin-top:8px"><summary class="muted"><strong>Everything that slipped last week</strong></summary>
      <ul class="muted">${misses.map((a) => `<li>${esc(a.miss)}</li>`).join("")}</ul></details>` : ""}
    <div class="btn-row"><button data-mon="redo">Rebuild this week's 3</button></div>
  </div>`;
}

function renderGamePlan() {
  return `${renderMonday(false)}
    ${renderKpis()}
    ${renderClassFunnel()}
    ${renderSoi()}`;
}

// ---------- events ----------

const gpView = document.getElementById("view");

gpView.addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto-tab]");
  if (go) {
    e.preventDefault();
    e.stopPropagation();
    currentTab = go.dataset.gotoTab;
    location.hash = currentTab;
    render();
    scrollTo({ top: 0 });
    return;
  }
  if (currentTab !== "gameplan") return;
  const soi = e.target.closest("[data-soi]");
  if (soi) {
    if (soi.dataset.soi === "copy") {
      e.preventDefault();
      copyText(gpFill(soi.dataset.text, { firstName: "[name]" }));
      soi.textContent = "Copied!";
      return;
    }
    const type = soi.dataset.soi === "call" ? "call" : soi.dataset.soi === "text" ? "text" : "dm";
    logTouch(type, soi.dataset.id);
    save();
    setTimeout(render, 300); // let the phone/mail link open first
    return;
  }
  const cls = e.target.closest("[data-cls]");
  if (cls) {
    const c = state.crm.contacts.find((x) => x.id === cls.dataset.id);
    if (!c) return;
    if (cls.dataset.cls === "booked") {
      c.classBooked = true;
      c.stage = c.stage === "Lead" ? "Hot Prospect" : c.stage;
      c.nextStep = "1-on-1 game plan booked";
      logTouch("text", c.id);
    } else {
      c.classSteps = { ...(c.classSteps || {}), [cls.dataset.i]: todayStr() };
      if (cls.dataset.cls === "text") logTouch("text", c.id);
      const next = classStepDue(c) || CLASS_STEPS.find((s, i) => !c.classSteps[i]);
      if (next) c.nextFollowUp = addDays(c.classDate, (next.step || next).day);
    }
    save();
    if (cls.tagName === "A") setTimeout(render, 300);
    else { e.preventDefault(); render(); }
    return;
  }
  const mon = e.target.closest("button[data-mon]");
  if (mon && mon.dataset.mon === "redo") {
    delete gpState().monday[weekKey()];
    save();
    render();
  }
});

gpView.addEventListener("change", (e) => {
  if (currentTab !== "gameplan" || !e.target.matches("input[data-mon]")) return;
  const m = gpState().monday[weekKey()];
  if (!m) return;
  m.picks[Number(e.target.dataset.mon)].done = e.target.checked;
  save();
  render();
});

gpView.addEventListener("submit", (e) => {
  if (currentTab !== "gameplan" || !e.target.dataset.gpForm) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const gp = gpState();
  const kind = e.target.dataset.gpForm;
  if (kind === "goals") {
    gp.goals = { closings: Number(f.closings) || GP_GOALS.closings, reviews: Number(f.reviews) || GP_GOALS.reviews, classSignups: Number(f.classSignups) || GP_GOALS.classSignups };
    gp.closingsBefore = Number(f.closingsBefore) || 0;
    gp.bookingUrl = (f.bookingUrl || "").trim() || GP_DEFAULT_BOOKING;
  } else if (kind === "soi") {
    for (const seg of SOI_SEGMENTS) gp.soiPerWeek[seg.id] = Math.max(0, Number(f[seg.id]) || 0);
  } else if (kind === "class") {
    const r = addClass(f.date, f.people || "", !!f.lender);
    alert(`Class logged: ${r.total} attendee${r.total === 1 ? "" : "s"} (${r.added} new, ${r.matched} already in your CRM). Their first follow-up is ready below.`);
  }
  save();
  render();
});

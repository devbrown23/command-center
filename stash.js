// Money Stash: a calendar for time and money together. Month grid + day agenda + next 14 days,
// your own events (with repeats and dollar amounts), weekly time blocks, things pulled in from the
// rest of the app (follow-ups, class texts, Stack & Smoke dates, money already logged), a running
// cash projection for the month, and .ics export to a phone calendar.
// Loaded before app.js. Uses state, save, render, uid, esc, money, todayStr, addDays, BUSINESSES,
// classStepDue, CLASS_STEPS and SS at runtime.

const STASH_TYPES = {
  "Appointment": "#5eeaff", "Showing": "#3dffa8", "Listing appt": "#ffd23f", "Consultation": "#1f6feb",
  "Homebuyer class": "#ff8a2a", "Open house": "#c77dff", "Closing": "#ffd700", "Payday": "#3dffa8",
  "Bill": "#ff5c7a", "Personal": "#8fa7c4", "Time block": "#556",
};
const STASH_REPEATS = ["None", "Weekly", "Every 2 weeks", "Monthly"];
const STASH_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Starter time blocks from the game plan. Days are 0 = Sunday.
const STASH_BLOCKS = [
  { title: "Prospecting: Daily 20", days: [1, 2, 3, 4, 5], start: "08:00", end: "11:00" },
  { title: "Appointments & showings", days: [1, 2, 3, 4, 5], start: "13:00", end: "17:00" },
  { title: "Edit videos", days: [3], start: "19:00", end: "21:00" },
  { title: "Send value email", days: [4], start: "11:00", end: "11:30" },
  { title: "Call email openers + weekly review", days: [5], start: "11:00", end: "12:00" },
  { title: "Film the week's videos + plan", days: [0], start: "10:00", end: "12:00" },
];

let stashSel = null;   // selected day (YYYY-MM-DD)
let stashMonth = null; // month shown (YYYY-MM)
let stashEdit = null;  // event id being edited

function stashState() {
  state.stash = { events: [], cash: 0, cashDate: "", showBlocks: true, showAuto: true, blocks: null, ...(state.stash || {}) };
  if (!state.stash.blocks) state.stash.blocks = STASH_BLOCKS.map((b) => ({ id: uid(), ...b }));
  return state.stash;
}

function sDate(str) { return new Date(str + "T12:00:00"); }
function sStr(d) { return d.toLocaleDateString("en-CA"); }
function sTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
}

// Does a (possibly repeating) event land on this date?
function stashOccurs(ev, date) {
  if (date < ev.date) return false;
  if (ev.until && date > ev.until) return false;
  if (date === ev.date) return true;
  const days = Math.round((sDate(date) - sDate(ev.date)) / 86400000);
  if (ev.repeat === "Weekly") return days % 7 === 0;
  if (ev.repeat === "Every 2 weeks") return days % 14 === 0;
  if (ev.repeat === "Monthly") {
    const want = Number(ev.date.slice(8, 10));
    const d = sDate(date);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(want, last);
  }
  return false;
}

// Everything on one day: your events, time blocks and things pulled from the rest of the app.
function stashDay(date) {
  const st = stashState();
  const items = [];
  for (const ev of st.events) if (stashOccurs(ev, date)) items.push({ ...ev, kind: "event" });
  if (st.showBlocks) {
    const dow = sDate(date).getDay();
    for (const b of st.blocks) if (b.days.includes(dow)) items.push({ id: b.id, title: b.title, type: "Time block", time: b.start, end: b.end, kind: "block" });
  }
  if (st.showAuto) {
    const today = todayStr();
    const contacts = (state.crm && state.crm.contacts) || [];
    const due = contacts.filter((c) => c.nextFollowUp && (date === today ? c.nextFollowUp <= today : c.nextFollowUp === date) && !["Closed", "Past Client"].includes(c.stage));
    if (due.length && date >= today) items.push({ title: `${due.length} follow-up${due.length === 1 ? "" : "s"} due`, type: "Appointment", kind: "auto", tab: "crm" });
    if (typeof CLASS_STEPS !== "undefined") {
      let n = 0;
      for (const c of contacts) {
        if (!c.classDate || c.classBooked) continue;
        CLASS_STEPS.forEach((s, i) => { if (!(c.classSteps || {})[i] && addDays(c.classDate, s.day) === date) n++; });
      }
      const classes = new Set(contacts.filter((c) => c.classDate === date).map((c) => c.classDate)).size;
      if (classes) items.push({ title: "Homebuyer class", type: "Homebuyer class", kind: "auto", tab: "gameplan" });
      if (n && date >= today) items.push({ title: `${n} class follow-up text${n === 1 ? "" : "s"}`, type: "Homebuyer class", kind: "auto", tab: "gameplan" });
    }
    if (typeof SS !== "undefined") {
      if (date === SS.blackFriday) items.push({ title: "Black Friday (Stack & Smoke)", type: "Payday", kind: "auto", tab: "dropship" });
      if (date === SS.shipCutoff) items.push({ title: "Christmas ship cutoff", type: "Bill", kind: "auto", tab: "dropship" });
    }
    for (const biz of BUSINESSES) {
      const s = state[biz.id];
      if (!s || !s.money) continue;
      const day = s.money.filter((m) => m.date === date);
      const inc = day.filter((m) => m.type === "income").reduce((a, m) => a + m.amount, 0);
      const out = day.filter((m) => m.type === "expense").reduce((a, m) => a + m.amount, 0);
      if (inc) items.push({ title: `${biz.name}: in`, type: "Payday", amount: inc, kind: "logged", tab: biz.id });
      if (out) items.push({ title: `${biz.name}: out`, type: "Bill", amount: -out, kind: "logged", tab: biz.id });
    }
  }
  return items.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

// Money for a date range: logged money (past) plus planned paydays and bills that aren't logged yet.
function stashMoney(from, to) {
  let logged = 0, plannedIn = 0, plannedOut = 0;
  const st = stashState();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const it of stashDay(d)) {
      if (!it.amount) continue;
      if (it.kind === "logged") logged += it.amount;
      else if (it.kind === "event" && !(it.paid || []).includes(d)) {
        if (it.amount > 0) plannedIn += it.amount; else plannedOut += -it.amount;
      }
    }
  }
  return { logged, plannedIn, plannedOut };
}

function stashProjection(monthStart, monthEnd) {
  const st = stashState();
  const today = todayStr();
  const base = Number(st.cash) || 0;
  const from = st.cashDate && st.cashDate > monthStart ? st.cashDate : today;
  const points = [];
  let bal = base;
  for (let d = from; d <= monthEnd; d = addDays(d, 1)) {
    for (const it of stashDay(d)) {
      if (it.kind === "event" && it.amount && !(it.paid || []).includes(d)) bal += it.amount;
      if (it.kind === "logged" && d > (st.cashDate || "") && d <= today) bal += it.amount;
    }
    points.push({ d, bal });
  }
  return { start: base, end: points.length ? points[points.length - 1].bal : base, low: points.reduce((m, p) => Math.min(m, p.bal), base), points };
}

function stashSpark(points) {
  if (points.length < 2) return "";
  const vals = points.map((p) => p.bal);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 1);
  const w = 300, h = 60;
  const xy = points.map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p.bal - min) / (max - min || 1)) * h).toFixed(1)}`).join(" ");
  const zero = h - ((0 - min) / (max - min || 1)) * h;
  return `<svg viewBox="0 0 ${w} ${h}" class="stash-spark" preserveAspectRatio="none" role="img" aria-label="Projected balance">
    ${min < 0 ? `<line x1="0" x2="${w}" y1="${zero}" y2="${zero}" class="zero"/>` : ""}
    <polyline points="${xy}"/></svg>`;
}

function stashChip(it) {
  const color = STASH_TYPES[it.type] || "#8fa7c4";
  return `<span class="stash-chip ${it.kind}" style="--c:${color}">${it.time && it.kind !== "auto" ? `<b>${sTime(it.time)}</b> ` : ""}${esc(it.title)}${it.amount ? ` <em class="${it.amount > 0 ? "pos" : "neg"}">${it.amount > 0 ? "+" : "−"}${money(Math.abs(it.amount))}</em>` : ""}</span>`;
}

function renderStash() {
  const st = stashState();
  const today = todayStr();
  stashSel = stashSel || today;
  stashMonth = stashMonth || today.slice(0, 7);
  const first = sDate(stashMonth + "-01");
  const monthEnd = sStr(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  const gridStart = addDays(stashMonth + "-01", -first.getDay());

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    if (i >= 35 && d.slice(0, 7) !== stashMonth) break;
    const items = stashDay(d).filter((it) => it.kind !== "block");
    const net = items.reduce((a, it) => a + (it.amount || 0), 0);
    cells.push(`<button class="stash-cell ${d.slice(0, 7) !== stashMonth ? "other" : ""} ${d === today ? "today" : ""} ${d === stashSel ? "sel" : ""}" data-stash-day="${d}">
      <span class="stash-num">${Number(d.slice(8))}</span>
      ${net ? `<span class="stash-net ${net > 0 ? "pos" : "neg"}">${net > 0 ? "+" : "−"}${money(Math.abs(Math.round(net)))}</span>` : ""}
      <span class="stash-dots">${items.slice(0, 4).map((it) => `<i style="--c:${STASH_TYPES[it.type] || "#8fa7c4"}" title="${esc(it.title)}"></i>`).join("")}${items.length > 4 ? `<small>+${items.length - 4}</small>` : ""}</span>
      <span class="stash-cell-list">${items.slice(0, 3).map(stashChip).join("")}</span>
    </button>`);
  }

  const dayItems = stashDay(stashSel);
  const agenda = dayItems.map((it) => `<li>
    <span class="stash-bar" style="--c:${STASH_TYPES[it.type] || "#8fa7c4"}"></span>
    <span class="grow"><strong>${it.time ? `${sTime(it.time)}${it.end ? "–" + sTime(it.end) : ""} · ` : ""}${esc(it.title)}</strong>
      <br><span class="muted">${esc(it.type)}${it.repeat && it.repeat !== "None" ? ` · repeats ${esc(it.repeat.toLowerCase())}` : ""}${it.where ? ` · ${esc(it.where)}` : ""}${it.notes ? ` · ${esc(it.notes)}` : ""}</span></span>
    ${it.amount ? `<span class="${it.amount > 0 ? "pos" : "neg"}">${it.amount > 0 ? "+" : "−"}${money(Math.abs(it.amount))}</span>` : ""}
    ${it.kind === "event" ? `
      ${it.amount ? `<label class="muted" title="Money actually came in or went out"><input type="checkbox" data-stash="paid" data-id="${it.id}" ${(it.paid || []).includes(stashSel) ? "checked" : ""}> ${it.amount > 0 ? "Received" : "Paid"}</label>` : ""}
      <button class="x" data-stash="ics" data-id="${it.id}" title="Add to phone calendar">📲</button>
      <button class="x" data-stash="edit" data-id="${it.id}" title="Edit">✎</button>
      <button class="x" data-stash="del" data-id="${it.id}" title="Delete">✕</button>` : ""}
    ${it.tab ? `<button class="x" data-goto-tab="${it.tab}">Go →</button>` : ""}
  </li>`).join("") || `<li class="muted">Nothing scheduled. Add something below.</li>`;

  const upcoming = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    stashDay(d).filter((it) => it.kind === "event").forEach((it) => upcoming.push({ d, it }));
  }

  const m = stashMoney(stashMonth + "-01", monthEnd);
  const proj = stashProjection(stashMonth + "-01", monthEnd);
  const ed = stashEdit ? st.events.find((e) => e.id === stashEdit) : null;
  const v = (k, dflt = "") => esc(ed ? (ed[k] ?? dflt) : dflt);
  const monthName = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return `<div class="stash-head">
    <h2>💰 Money Stash</h2>
    <div class="btn-row">
      <button data-stash="prev">‹</button><strong class="stash-month">${esc(monthName)}</strong><button data-stash="next">›</button>
      <button data-stash="today">Today</button>
    </div>
  </div>

  <div class="grid stash-money">
    <div class="card">
      <h3>Stash this month</h3>
      <div class="stats">
        <div class="stat"><div class="label">Logged so far</div><div class="value ${m.logged >= 0 ? "pos" : "neg"}">${money(Math.round(m.logged))}</div></div>
        <div class="stat"><div class="label">Still coming in</div><div class="value pos">${money(Math.round(m.plannedIn))}</div></div>
        <div class="stat"><div class="label">Bills still due</div><div class="value neg">${money(Math.round(m.plannedOut))}</div></div>
      </div>
      <p class="muted">Logged = money in/out across every business this month. Planned paydays and bills come from events with an amount; tick Received or Paid once it happens, and log it in that business's Money in / out.</p>
    </div>
    <div class="card">
      <h3>Cash projection</h3>
      <div class="stats">
        <div class="stat"><div class="label">Cash now</div><div class="value">${money(Math.round(proj.start))}</div></div>
        <div class="stat"><div class="label">End of month</div><div class="value ${proj.end >= 0 ? "pos" : "neg"}">${money(Math.round(proj.end))}</div></div>
        <div class="stat"><div class="label">Lowest point</div><div class="value ${proj.low >= 0 ? "" : "neg"}">${money(Math.round(proj.low))}</div></div>
      </div>
      ${stashSpark(proj.points)}
      <form class="row" data-stash-form="cash">
        <label class="muted">Cash on hand today <input type="number" step="any" name="cash" value="${st.cash || ""}" style="width:120px"></label>
        <button>Update</button>
      </form>
    </div>
  </div>

  <div class="card stash-cal" style="margin-top:16px">
    <div class="stash-dow">${STASH_DOW.map((d) => `<span>${d}</span>`).join("")}</div>
    <div class="stash-grid">${cells.join("")}</div>
    <div class="btn-row" style="margin-top:8px">
      <label class="muted"><input type="checkbox" data-stash="blocks" ${st.showBlocks ? "checked" : ""}> Time blocks</label>
      <label class="muted"><input type="checkbox" data-stash="auto" ${st.showAuto ? "checked" : ""}> Follow-ups, classes & logged money</label>
    </div>
  </div>

  <div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>${esc(sDate(stashSel).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</h3>
      <ul class="list stash-agenda">${agenda}</ul>
    </div>
    <div class="card">
      <h3>${ed ? "Edit event" : "Add to the stash"}</h3>
      <form class="row" data-stash-form="event">
        <input name="title" placeholder="What (e.g. Showing with Davit, AutoDS bill, Lopez closing)" value="${v("title")}" required style="flex-basis:100%">
        <select name="type">${Object.keys(STASH_TYPES).filter((t) => t !== "Time block").map((t) => `<option ${ed && ed.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        <input type="date" name="date" value="${v("date", stashSel)}" required>
        <label class="muted">From <input type="time" name="time" value="${v("time")}"></label>
        <label class="muted">To <input type="time" name="end" value="${v("end")}"></label>
        <select name="repeat">${STASH_REPEATS.map((r) => `<option ${ed && ed.repeat === r ? "selected" : ""}>${r}</option>`).join("")}</select>
        <label class="muted">Amount <input type="number" step="any" name="amount" value="${ed && ed.amount ? Math.abs(ed.amount) : ""}" placeholder="$" style="width:100px"></label>
        <select name="dir"><option value="in" ${ed && ed.amount > 0 ? "selected" : ""}>Money in</option><option value="out" ${ed && ed.amount < 0 ? "selected" : ""}>Money out</option></select>
        <input name="where" placeholder="Where (address or Zoom)" value="${v("where")}">
        <input name="notes" placeholder="Notes" value="${v("notes")}" style="flex-basis:100%">
        <button class="primary">${ed ? "Save changes" : "Add"}</button>
        ${ed ? `<button type="button" data-stash="cancel">Cancel</button>` : ""}
      </form>
      <p class="muted">Bills go in as Money out with a Monthly repeat (Shopify $39, AutoDS). Closings and referral fees go in as Money in on the day you expect them. 📲 adds any event to your phone calendar.</p>
    </div>
  </div>

  <div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>Next 14 days</h3>
      <ul class="list">${upcoming.map(({ d, it }) => `<li><span class="grow"><strong>${esc(sDate(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }))}</strong> ${it.time ? sTime(it.time) + " · " : ""}${esc(it.title)}</span>
        ${it.amount ? `<span class="${it.amount > 0 ? "pos" : "neg"}">${it.amount > 0 ? "+" : "−"}${money(Math.abs(it.amount))}</span>` : ""}</li>`).join("") || `<li class="muted">Nothing on the books yet.</li>`}</ul>
      <div class="btn-row"><button data-stash="ics-all">📲 Add all upcoming to my phone calendar</button></div>
    </div>
    <div class="card">
      <h3>Weekly time blocks</h3>
      <ul class="list">${st.blocks.map((b) => `<li><span class="grow"><strong>${esc(b.title)}</strong> <span class="muted">${b.days.map((d) => STASH_DOW[d]).join(", ")} · ${sTime(b.start)}–${sTime(b.end)}</span></span>
        <button class="x" data-stash="delblock" data-id="${b.id}" title="Remove">✕</button></li>`).join("")}</ul>
      <form class="row" data-stash-form="block">
        <input name="title" placeholder="Block (e.g. Juice Havan prep)" required>
        <input type="time" name="start" value="18:00"><input type="time" name="end" value="19:00">
        <span class="muted stash-days">${STASH_DOW.map((d, i) => `<label><input type="checkbox" name="d${i}"> ${d}</label>`).join(" ")}</span>
        <button>Add block</button>
      </form>
    </div>
  </div>`;
}

// ---------- calendar file (.ics) for iPhone / Google Calendar ----------

function icsEsc(s) { return String(s || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n"); }
function icsStamp(date, time) {
  return time ? `${date.replace(/-/g, "")}T${time.replace(":", "")}00` : date.replace(/-/g, "");
}

function icsEvent(ev) {
  const lines = ["BEGIN:VEVENT", `UID:${ev.id}@command-center`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`];
  if (ev.time) {
    lines.push(`DTSTART:${icsStamp(ev.date, ev.time)}`, `DTEND:${icsStamp(ev.date, ev.end || ev.time)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${icsStamp(ev.date)}`, `DTEND;VALUE=DATE:${icsStamp(addDays(ev.date, 1))}`);
  }
  const rule = { "Weekly": "FREQ=WEEKLY", "Every 2 weeks": "FREQ=WEEKLY;INTERVAL=2", "Monthly": "FREQ=MONTHLY" }[ev.repeat];
  if (rule) lines.push(`RRULE:${rule}`);
  const amt = ev.amount ? ` (${ev.amount > 0 ? "+" : "-"}${money(Math.abs(ev.amount))})` : "";
  lines.push(`SUMMARY:${icsEsc(ev.title + amt)}`);
  if (ev.where) lines.push(`LOCATION:${icsEsc(ev.where)}`);
  if (ev.notes || ev.type) lines.push(`DESCRIPTION:${icsEsc([ev.type, ev.notes].filter(Boolean).join(" · "))}`);
  if (ev.time) lines.push("BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM");
  lines.push("END:VEVENT");
  return lines;
}

function downloadIcs(events, name) {
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Command Center//Money Stash//EN", "CALSCALE:GREGORIAN", ...events.flatMap(icsEvent), "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- events ----------

const stashView = document.getElementById("view");

stashView.addEventListener("click", (e) => {
  if (currentTab !== "stash") return;
  const day = e.target.closest("[data-stash-day]");
  if (day) {
    stashSel = day.dataset.stashDay;
    if (stashSel.slice(0, 7) !== stashMonth) stashMonth = stashSel.slice(0, 7);
    render();
    return;
  }
  const btn = e.target.closest("button[data-stash]");
  if (!btn) return;
  e.preventDefault();
  const st = stashState();
  const ev = st.events.find((x) => x.id === btn.dataset.id);
  const shift = (n) => { const d = sDate(stashMonth + "-01"); d.setMonth(d.getMonth() + n); stashMonth = sStr(d).slice(0, 7); };
  switch (btn.dataset.stash) {
    case "prev": shift(-1); break;
    case "next": shift(1); break;
    case "today": stashSel = todayStr(); stashMonth = stashSel.slice(0, 7); break;
    case "edit": stashEdit = btn.dataset.id; break;
    case "cancel": stashEdit = null; break;
    case "del":
      if (!ev || !confirm(`Delete "${ev.title}"${ev.repeat && ev.repeat !== "None" ? " and all its repeats" : ""}?`)) return;
      st.events = st.events.filter((x) => x !== ev);
      save();
      break;
    case "delblock":
      st.blocks = st.blocks.filter((b) => b.id !== btn.dataset.id);
      save();
      break;
    case "ics":
      if (ev) downloadIcs([ev], `${ev.title.replace(/[^\w ]+/g, "").trim() || "event"}.ics`);
      return;
    case "ics-all": {
      const end = addDays(todayStr(), 60);
      const list = st.events.filter((x) => x.repeat !== "None" ? (!x.until || x.until >= todayStr()) : x.date >= todayStr() && x.date <= end);
      if (!list.length) { alert("Nothing upcoming to add yet."); return; }
      downloadIcs(list, "money-stash.ics");
      return;
    }
    default: return;
  }
  render();
});

stashView.addEventListener("change", (e) => {
  if (currentTab !== "stash") return;
  const el = e.target;
  const st = stashState();
  if (el.dataset.stash === "blocks") st.showBlocks = el.checked;
  else if (el.dataset.stash === "auto") st.showAuto = el.checked;
  else if (el.dataset.stash === "paid") {
    const ev = st.events.find((x) => x.id === el.dataset.id);
    if (!ev) return;
    const paid = new Set(ev.paid || []);
    el.checked ? paid.add(stashSel) : paid.delete(stashSel);
    ev.paid = [...paid];
  } else return;
  save();
  render();
});

stashView.addEventListener("submit", (e) => {
  if (currentTab !== "stash" || !e.target.dataset.stashForm) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const st = stashState();
  const kind = e.target.dataset.stashForm;
  if (kind === "cash") {
    st.cash = Number(f.cash) || 0;
    st.cashDate = todayStr();
  } else if (kind === "block") {
    const days = STASH_DOW.map((_, i) => (f[`d${i}`] ? i : -1)).filter((i) => i >= 0);
    if (!days.length) { alert("Pick at least one day."); return; }
    st.blocks.push({ id: uid(), title: f.title.trim(), days, start: f.start, end: f.end });
  } else if (kind === "event") {
    const amt = Number(f.amount) || 0;
    const data = { title: f.title.trim(), type: f.type, date: f.date, time: f.time || "", end: f.end || "", repeat: f.repeat,
      amount: amt ? (f.dir === "out" ? -Math.abs(amt) : Math.abs(amt)) : 0, where: (f.where || "").trim(), notes: (f.notes || "").trim() };
    const ed = stashEdit && st.events.find((x) => x.id === stashEdit);
    if (ed) Object.assign(ed, data);
    else st.events.push({ id: uid(), paid: [], ...data });
    stashEdit = null;
    stashSel = f.date;
    stashMonth = f.date.slice(0, 7);
  }
  save();
  render();
});

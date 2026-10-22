// Daily 20 CRM: a 100-day prospecting plan, a contact list, and a bridge to Follow Up Boss.
// Loaded before app.js. Uses state, save, render, uid and esc from app.js at runtime.

const FUB_SETTINGS_KEY = "command-center-fub"; // kept out of the backup file on purpose
const DEFAULT_FUB_URL = "https://fromstart2keys.vercel.app/api/crm-contact";

const CRM_SOURCES = ["Sphere", "Past client", "Open house", "Social media", "Homebuyer class", "FSBO / Expired", "Door knock", "Referral", "Lender / Partner", "Other"];
const CRM_STAGES = ["Lead", "Sphere", "Hot Prospect", "Active Client", "Under Contract", "Closed", "Past Client"];
const TOUCH_TYPES = [
  { id: "call", label: "Call" },
  { id: "text", label: "Text" },
  { id: "dm", label: "DM" },
  { id: "person", label: "In person" },
  { id: "note", label: "Note card" },
];

// Days until the next follow-up after a touch, by stage.
const FOLLOW_UP_DAYS = { "Hot Prospect": 2, "Active Client": 3, "Lead": 7, "Under Contract": 7, "Sphere": 30, "Closed": 30, "Past Client": 60 };

// 100-day phases.
const PHASES = [
  { from: 1, to: 7, name: "Load the ship", text: "Pull your Follow Up Boss contacts, phone contacts and social followers into one list. Tag everyone Sphere, Past Client or Lead. Goal: 100 names in this CRM by Day 7." },
  { from: 8, to: 90, name: "Full sail", text: "Daily 20, six days a week. Prospect before you do anything else. Every new name goes into the CRM the same day." },
  { from: 91, to: 100, name: "Count the treasure", text: "Review your numbers. Ask every closed client for a review and a referral. Pick what worked and plan the next 100 days." },
];

// Weekly rhythm. Index matches Date.getDay() (0 = Sunday).
const WEEK_PLAN = [
  {
    theme: "Rest + plan",
    rest: true,
    steps: [
      "Look at last week on the Overview tab: conversations, appointments, deals",
      "Film the week's video batch",
      "Pick next week's list: 20 sphere names, 10 past clients, 10 neighbors to circle",
    ],
    script: "",
  },
  {
    theme: "Sphere & past clients",
    steps: [
      "Call 10 people in your sphere",
      "Text 5 past clients a check-in",
      "Add 5 new names to the CRM (phone contacts, Facebook, LinkedIn)",
    ],
    script: "Hey ___, it's Devin! I was thinking about you. How's everything with the family? ... Quick question: who do you know who's thinking about buying or selling this year?",
  },
  {
    theme: "Hot prospects & FUB follow-up",
    steps: [
      "Call or text every Hot Prospect and Active Client (check your FUB Deals board)",
      "Follow up with everyone who opened your last email (FUB Recent Activity)",
      "Invite 5 renters or first-time buyers to the free homebuyer class",
    ],
    script: "Hi ___, it's Devin. I saw you checked out my email. Want me to send you a few homes that fit, or set up a quick 15-minute call?",
  },
  {
    theme: "Circle prospecting",
    steps: [
      "Call or knock on 10 neighbors around a recent closing",
      "Reach out to 5 FSBO or expired listings",
      "Add every new person to the CRM before you leave the street",
    ],
    script: "Hi, I'm Devin with From Start 2 Keys. I just helped a family close on a home right down the street. Are you curious what that means for your home's value?",
  },
  {
    theme: "Content & social",
    steps: [
      "Post this week's video and reply to every comment",
      "DM 10 people who liked, commented or watched",
      "Text 5 sphere contacts the video: \"Thought you'd find this useful\"",
    ],
    script: "Hey ___, thanks for watching! Are you thinking about buying soon, or just learning for now?",
  },
  {
    theme: "Homebuyer class & partners",
    steps: [
      "Text 10 class registrants or past attendees",
      "Call 3 lenders or referral partners",
      "Write 5 handwritten notes",
      "Lock in a weekend open house",
    ],
    script: "Hi ___, it's Devin from the homebuyer class. Did you get a chance to talk with a lender yet? I can connect you with someone great.",
  },
  {
    theme: "Open house day",
    steps: [
      "Host an open house. Goal: 20 sign-ins, all added to the CRM",
      "No open house? Coffee or lunch with 2 sphere people and 18 texts",
    ],
    script: "Thanks for coming by! Are you looking in this neighborhood, or just getting ideas? I'll send you the homes that don't make it online.",
  },
];

// ---------- data ----------

function defaultCrm() {
  return { startDate: "", dailyTarget: 20, contacts: [], touches: [] };
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

function touchesOn(date) {
  return state.crm.touches.filter((t) => t.date === date).length;
}

function challengeDay() {
  if (!state.crm.startDate) return 0;
  const start = new Date(state.crm.startDate + "T12:00:00");
  const now = new Date(todayStr() + "T12:00:00");
  return Math.floor((now - start) / 86400000) + 1;
}

// Days in a row (Sundays skipped) where the daily target was hit. Today counts once it's hit.
function streak() {
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const date = todayStr(-i);
    if (new Date(date + "T12:00:00").getDay() === 0) continue;
    const hit = touchesOn(date) >= state.crm.dailyTarget;
    if (hit) count++;
    else if (i > 0) break;
  }
  return count;
}

function contactName(c) {
  return `${c.firstName} ${c.lastName}`.trim() || c.email || c.phone || "(no name)";
}

function logTouch(type, contactId) {
  state.crm.touches.push({ id: uid(), date: todayStr(), type, contactId: contactId || null });
  if (contactId) {
    const c = state.crm.contacts.find((x) => x.id === contactId);
    if (c) {
      c.lastContact = todayStr();
      c.nextFollowUp = addDays(todayStr(), FOLLOW_UP_DAYS[c.stage] || 7);
    }
  }
}

function fubSettings() {
  try {
    return { url: DEFAULT_FUB_URL, passcode: "", ...JSON.parse(localStorage.getItem(FUB_SETTINGS_KEY) || "{}") };
  } catch (e) {
    return { url: DEFAULT_FUB_URL, passcode: "" };
  }
}

function saveFubSettings(s) {
  try {
    localStorage.setItem(FUB_SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    alert("Could not save settings. Your browser may be blocking storage.");
  }
}

async function sendToFub(contact) {
  const { url, passcode } = fubSettings();
  if (!url || !passcode) {
    contact.fub = "failed";
    contact.fubError = "Add your site link and passcode in CRM settings";
    save();
    render();
    return;
  }
  contact.fub = "pending";
  render();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Passcode": passcode },
      body: JSON.stringify({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        stage: contact.stage,
        source: contact.source,
        note: contact.notes,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Error ${res.status}`);
    contact.fub = "synced";
    contact.fubId = data.fubId || null;
    contact.fubError = "";
  } catch (err) {
    contact.fub = "failed";
    contact.fubError = err.message === "Failed to fetch" ? "Couldn't reach your site" : err.message;
  }
  save();
  render();
}

// ---------- rendering ----------

function crmProgress() {
  const done = touchesOn(todayStr());
  const target = state.crm.dailyTarget || 20;
  const pct = Math.min(100, (done / target) * 100);
  return { done, target, pct };
}

// Small card for the Overview tab.
function renderCrmOverviewCard() {
  const { done, target, pct } = crmProgress();
  const day = challengeDay();
  const plan = WEEK_PLAN[new Date().getDay()];
  return `<div class="card biz" style="--tab:#1f6feb;margin-bottom:16px" data-goto="crm">
    <h2>Daily 20 ${day > 0 && day <= 100 ? `· Day ${day} of 100` : ""}</h2>
    <div class="stats">
      <div class="stat"><div class="label">Conversations today</div><div class="value">${done} / ${target}</div></div>
      <div class="stat"><div class="label">Streak</div><div class="value">${streak()} days</div></div>
      <div class="stat"><div class="label">Follow-ups due</div><div class="value">${dueContacts().length}</div></div>
      <div class="stat"><div class="label">Today's focus</div><div class="value" style="font-size:16px">${esc(plan.theme)}</div></div>
    </div>
    <div class="bar"><div style="width:${pct}%"></div></div>
  </div>`;
}

function dueContacts() {
  const today = todayStr();
  return state.crm.contacts
    .filter((c) => c.nextFollowUp && c.nextFollowUp <= today)
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
}

function fubBadge(c) {
  if (c.fub === "synced") return `<span class="pos" title="In Follow Up Boss">✓ FUB</span>`;
  if (c.fub === "pending") return `<span class="muted">Sending…</span>`;
  if (c.fub === "failed") return `<button class="x neg" data-crm="retry" data-id="${c.id}" title="${esc(c.fubError)}">⟳ FUB</button>`;
  return `<button class="x" data-crm="retry" data-id="${c.id}" title="Send to Follow Up Boss">+ FUB</button>`;
}

function touchButtons(contactId) {
  return TOUCH_TYPES.slice(0, 4)
    .map((t) => `<button data-crm="touch" data-type="${t.id}" ${contactId ? `data-id="${contactId}"` : ""}>${t.label}</button>`)
    .join("");
}

function renderCrm() {
  const crm = state.crm;
  const { done, target, pct } = crmProgress();
  const day = challengeDay();
  const dow = new Date().getDay();
  const plan = WEEK_PLAN[dow];
  const phase = PHASES.find((p) => day >= p.from && day <= p.to);
  const due = dueContacts();
  const fub = fubSettings();
  const today = todayStr();

  const last7 = Array.from({ length: 7 }, (_, i) => todayStr(i - 6)).map((d) => {
    const n = touchesOn(d);
    const h = Math.min(100, (n / target) * 100);
    const label = new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
    return `<div class="day"><div class="day-bar"><div style="height:${h}%"></div></div><div class="muted">${label}</div><div class="muted">${n}</div></div>`;
  }).join("");

  const todayTouches = crm.touches.filter((t) => t.date === today);
  const byType = [{ id: "new", label: "New people" }, ...TOUCH_TYPES]
    .map((t) => `${t.label}: ${todayTouches.filter((x) => x.type === t.id).length}`)
    .join(" · ");

  const contactRows = [...crm.contacts]
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .map((c) => `<li data-search="${esc(`${contactName(c)} ${c.email} ${c.phone} ${c.source} ${c.stage}`.toLowerCase())}">
      <span class="grow"><strong>${esc(contactName(c))}</strong>
        <span class="muted">${esc(c.source)}${c.phone ? ` · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}${c.email ? ` · ${esc(c.email)}` : ""}</span>
        ${c.notes ? `<br><span class="muted">${esc(c.notes)}</span>` : ""}</span>
      <select data-crm="stage" data-id="${c.id}">${CRM_STAGES.map((s) => `<option ${s === c.stage ? "selected" : ""}>${s}</option>`).join("")}</select>
      <input type="date" data-crm="next" data-id="${c.id}" value="${esc(c.nextFollowUp || "")}" title="Next follow-up">
      ${fubBadge(c)}
      <button class="x" data-crm="del" data-id="${c.id}" title="Delete">✕</button>
    </li>`).join("");

  return `<div class="grid">
    <div class="card" style="--tab:#1f6feb">
      <h2>Daily 20 ${day > 0 ? `· Day ${day} of 100` : ""}</h2>
      ${day > 0 ? "" : `<p class="muted">Set your start date in CRM settings below to begin the 100-day count.</p>`}
      <div class="stats">
        <div class="stat"><div class="label">Today</div><div class="value">${done} / ${target}</div></div>
        <div class="stat"><div class="label">Streak</div><div class="value">${streak()}</div></div>
        <div class="stat"><div class="label">Contacts</div><div class="value">${crm.contacts.length}</div></div>
      </div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <p class="muted">${esc(byType)}</p>
      <div class="muted">Log a conversation:</div>
      <div class="btn-row">${touchButtons()}<button data-crm="touch" data-type="note">Note card</button><button class="x" data-crm="undo" title="Undo last">↶ Undo</button></div>
      <div class="week">${last7}</div>
    </div>

    <div class="card">
      <h3>Today: ${esc(plan.theme)}</h3>
      ${phase ? `<p class="muted"><strong>${esc(phase.name)}</strong> (Days ${phase.from}–${phase.to}): ${esc(phase.text)}</p>` : ""}
      ${plan.rest ? `<p class="muted">Rest day. Today doesn't count toward your streak.</p>` : ""}
      <ul class="list">${plan.steps.map((s) => `<li><span class="grow">${esc(s)}</span></li>`).join("")}</ul>
      ${plan.script ? `<p class="muted" style="margin-top:10px"><strong>Script:</strong> ${esc(plan.script)}</p>` : ""}
      <p class="muted">Every day: prospect first, before email or social. Add every new person to the CRM the same day.</p>
    </div>

    <div class="card">
      <h3>Follow up today (${due.length})</h3>
      <ul class="list">${due.map((c) => `<li>
        <span class="grow"><strong>${esc(contactName(c))}</strong> <span class="muted">${esc(c.stage)}${c.nextFollowUp < today ? " · overdue" : ""}</span>
          ${c.phone ? `<br><a href="tel:${esc(c.phone)}">Call</a> · <a href="sms:${esc(c.phone)}">Text</a>` : ""}</span>
        <span class="btn-row">${touchButtons(c.id)}</span>
      </li>`).join("") || `<li class="muted">Nobody due. Add new people below.</li>`}</ul>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Add a person</h3>
    <form class="row" data-crm-form="contact">
      <input name="firstName" placeholder="First name">
      <input name="lastName" placeholder="Last name">
      <input name="phone" type="tel" placeholder="Phone">
      <input name="email" type="email" placeholder="Email">
      <select name="source">${CRM_SOURCES.map((s) => `<option>${s}</option>`).join("")}</select>
      <select name="stage">${CRM_STAGES.map((s) => `<option>${s}</option>`).join("")}</select>
      <label class="muted">Follow up <input name="nextFollowUp" type="date" value="${addDays(today, 2)}"></label>
      <input name="notes" placeholder="Notes (what they want, kids, pets, timeline...)" style="flex-basis:100%">
      <label class="muted"><input type="checkbox" name="talked" checked> I talked to them today (counts toward 20)</label>
      <label class="muted"><input type="checkbox" name="toFub" ${fub.passcode ? "checked" : ""}> Also add to Follow Up Boss</label>
      <button class="primary">Add person</button>
    </form>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Contacts (${crm.contacts.length})</h3>
    <input id="crm-search" placeholder="Search name, phone, source, stage..." style="width:100%;margin-bottom:8px">
    <ul class="list" id="crm-contacts">${contactRows || `<li class="muted">No contacts yet</li>`}</ul>
  </div>

  <details class="card" style="margin-top:16px">
    <summary><strong>CRM settings</strong></summary>
    <form class="row" data-crm-form="settings">
      <label class="muted">100-day start <input type="date" name="startDate" value="${esc(crm.startDate)}"></label>
      <label class="muted">Daily target <input type="number" name="dailyTarget" min="1" value="${crm.dailyTarget}"></label>
      <input name="url" type="url" placeholder="Your site's CRM link" value="${esc(fub.url)}" style="flex-basis:100%">
      <input name="passcode" type="password" placeholder="CRM passcode (same as CRM_PASSCODE on Vercel)" value="${esc(fub.passcode)}">
      <button class="primary">Save settings</button>
    </form>
    <p class="muted">The passcode is saved on this device only and is never included in Export backup.</p>
  </details>`;
}

// ---------- events ----------

const crmView = document.getElementById("view");

crmView.addEventListener("click", (e) => {
  if (currentTab !== "crm") return;
  const btn = e.target.closest("button[data-crm]");
  if (!btn) return;
  e.preventDefault();
  const crm = state.crm;
  const id = btn.dataset.id;
  switch (btn.dataset.crm) {
    case "touch":
      logTouch(btn.dataset.type, id);
      break;
    case "undo":
      crm.touches.pop();
      break;
    case "retry": {
      const c = crm.contacts.find((x) => x.id === id);
      if (c) sendToFub(c);
      return;
    }
    case "del":
      if (!confirm("Delete this contact from the Command Center? (It stays in Follow Up Boss.)")) return;
      crm.contacts = crm.contacts.filter((x) => x.id !== id);
      break;
    default:
      return;
  }
  save();
  render();
});

crmView.addEventListener("change", (e) => {
  if (currentTab !== "crm") return;
  const el = e.target;
  const c = state.crm.contacts.find((x) => x.id === el.dataset.id);
  if (!c) return;
  if (el.dataset.crm === "stage") c.stage = el.value;
  else if (el.dataset.crm === "next") c.nextFollowUp = el.value;
  else return;
  save();
  render();
});

crmView.addEventListener("input", (e) => {
  if (e.target.id !== "crm-search") return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll("#crm-contacts li[data-search]").forEach((li) => {
    li.hidden = q && !li.dataset.search.includes(q);
  });
});

crmView.addEventListener("submit", (e) => {
  if (currentTab !== "crm") return;
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  if (form.dataset.crmForm === "settings") {
    state.crm.startDate = f.startDate;
    state.crm.dailyTarget = Math.max(1, Number(f.dailyTarget) || 20);
    saveFubSettings({ url: f.url.trim(), passcode: f.passcode });
    save();
    render();
    return;
  }
  if (form.dataset.crmForm !== "contact") return;
  if (!f.firstName.trim() && !f.lastName.trim() && !f.phone.trim() && !f.email.trim()) {
    alert("Add at least a name, phone or email.");
    return;
  }
  const contact = {
    id: uid(),
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim(),
    phone: f.phone.trim(),
    email: f.email.trim(),
    source: f.source,
    stage: f.stage,
    nextFollowUp: f.nextFollowUp,
    notes: f.notes.trim(),
    createdAt: new Date().toISOString(),
    lastContact: "",
    fub: "",
    fubError: "",
  };
  state.crm.contacts.push(contact);
  if (f.talked) {
    state.crm.touches.push({ id: uid(), date: todayStr(), type: "new", contactId: contact.id });
    contact.lastContact = todayStr();
  }
  save();
  render();
  if (f.toFub) sendToFub(contact);
});

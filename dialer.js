// Dialer: a one-line power dialer for farm lists (Equity Title exports or any CSV with names, addresses and phones).
// Two ways to call:
//   - "My phone": opens the number in your phone app (free, shows your own number).
//   - "Business line": calls from the browser on a Telnyx number (about $0.007/min + $1/mo per number),
//     using a short-lived login token from fromstart2keys.com/api/dialer-token (same site link and passcode as CRM settings).
// Rules built in: calls only between 8am and 8pm, numbers flagged Do Not Call in the file or marked DNC here are never
// dialed, and each list needs a National DNC scrub date within the last 31 days before it can be called.
// Loaded before app.js. Uses state, save, render, esc, uid, parseCsv, todayStr, addDays, logTouch, fubSettings at runtime.

const DIALER_SETTINGS_KEY = "command-center-dialer"; // per-device: calling mode + caller ID (not in backups)
const CALL_START_HOUR = 8;  // Washington: no solicitation calls before 8am
const CALL_END_HOUR = 20;   // ...or after 8pm
const SCRUB_DAYS = 31;      // FTC: scrub against the National DNC Registry at least every 31 days
const MAX_ATTEMPTS = 3;     // no answer this many times and the lead is done
const LINE_DAILY_SOFT_CAP = 100; // more than this from one number per day raises spam-label risk
const MAX_IMPORT_ROWS = 3000;

const OUTCOMES = [
  { id: "no_answer", label: "No answer", key: "1" },
  { id: "voicemail", label: "Left voicemail", key: "2" },
  { id: "not_interested", label: "Not interested", key: "3", talked: true },
  { id: "callback", label: "Call back", key: "4", talked: true, crm: "Lead" },
  { id: "interested", label: "Interested", key: "5", talked: true, crm: "Lead" },
  { id: "appointment", label: "Appointment set", key: "6", talked: true, crm: "Hot Prospect" },
  { id: "bad_number", label: "Wrong / disconnected", key: "7" },
  { id: "dnc", label: "Do not call", key: "8", talked: true },
];

const DEFAULT_SCRIPT = `Hi, is this {first}?

Hi {first}, this is Devin Brown with Unique Lifestyle Realty. I'm calling homeowners around {street} because a few homes nearby have sold recently, and I'm putting together free home value updates for neighbors.

Have you thought about what your home might be worth today?

IF YES / MAYBE
"What would have to happen for you to think about moving?"
"I can put together the numbers for you. Would a quick 15-minute visit work this week, or would a text with the report be easier?"

IF NOT INTERESTED
"No problem at all, thanks for your time." (Wrap up within 10 seconds.)

IF THEY ASK NOT TO BE CALLED
"Understood. I'll take your number off my list, and you won't hear from me for at least a year." Then tap Do not call.

GOAL: get them talking about their plans and book a home value appointment. Don't try to close on the first call.`;

let dialerCurrentId = null;
let dialerFilter = "queue";   // queue | callbacks | all
let dialerListFilter = "";    // "" = all lists
let dialerImportMsg = "";
let dialerCall = null;        // { leadId, phone, startedAt, connectedAt, state, rtcCall }
let dialerTimer = null;
let telnyxClient = null;
let telnyxReady = null;       // Promise while connecting
let telnyxTokenAt = 0;
let dialerLineMsg = "";
let dialerMuted = false;
let dialerSetupOpen = null; // remembers whether the settings panel is open between redraws

function defaultDialer() {
  return { lists: [], leads: [], dnc: [], log: [], script: DEFAULT_SCRIPT };
}

function dialerSettings() {
  try {
    return { mode: "phone", callerId: "", ...JSON.parse(localStorage.getItem(DIALER_SETTINGS_KEY) || "{}") };
  } catch (e) {
    return { mode: "phone", callerId: "" };
  }
}

function saveDialerSettings(patch) {
  const s = { ...dialerSettings(), ...patch };
  try { localStorage.setItem(DIALER_SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  return s;
}

// ---------- phone helpers ----------

function phoneDigits(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? d : "";
}

function phoneE164(p) {
  const d = phoneDigits(p);
  return d ? "+1" + d : "";
}

function phonePretty(p) {
  const d = phoneDigits(p);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || "");
}

function isDnc(phone) {
  const d = phoneDigits(phone);
  return !d || state.dialer.dnc.includes(d);
}

// ---------- rules ----------

function inCallingHours(now = new Date()) {
  const h = now.getHours();
  return h >= CALL_START_HOUR && h < CALL_END_HOUR;
}

function dialerDaysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((new Date(todayStr() + "T12:00:00") - new Date(dateStr + "T12:00:00")) / 86400000);
}

function listScrubOk(list) {
  return list && dialerDaysSince(list.scrubbedOn) <= SCRUB_DAYS;
}

function leadList(lead) {
  return state.dialer.lists.find((l) => l.id === lead.listId);
}

// The numbers on a lead we're allowed to dial right now.
function dialablePhones(lead) {
  return lead.phones.filter((p) => !p.dnc && !p.bad && !isDnc(p.number));
}

function callbackDue(lead) {
  return lead.status === "callback" && lead.callbackDate && lead.callbackDate <= todayStr();
}

function inQueue(lead) {
  if (dialerListFilter && lead.listId !== dialerListFilter) return false;
  if (!dialablePhones(lead).length) return false;
  if (callbackDue(lead)) return true;
  if (lead.status !== "new" && lead.status !== "retry") return false;
  return lead.lastCall !== todayStr(); // one try per lead per day
}

function queueLeads() {
  const due = state.dialer.leads.filter((l) => inQueue(l) && callbackDue(l));
  const rest = state.dialer.leads.filter((l) => inQueue(l) && !callbackDue(l));
  return [...due, ...rest];
}

function visibleLeads() {
  const leads = state.dialer.leads.filter((l) => !dialerListFilter || l.listId === dialerListFilter);
  if (dialerFilter === "callbacks") return leads.filter((l) => l.status === "callback").sort((a, b) => (a.callbackDate || "").localeCompare(b.callbackDate || ""));
  if (dialerFilter === "all") return leads;
  return queueLeads();
}

function todayLog() {
  const t = todayStr();
  return state.dialer.log.filter((x) => x.date === t);
}

// ---------- CSV import ----------

// Finds the columns we need in Equity Title / title-company farm exports and most skip-trace files.
function detectColumns(header) {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...tests) => h.findIndex((col) => tests.some((t) => (t instanceof RegExp ? t.test(col) : col === t)));
  const cols = {
    name: find(/^owner ?1? ?(full )?name$/, "owner", "owner(s)", "owners", "full name", "name", /^primary owner/),
    first: find(/^(owner ?1? ?)?first ?name$/, "first"),
    last: find(/^(owner ?1? ?)?last ?name$/, "last"),
    address: find(/^(site|situs|property|prop) ?(street )?address$/, "address", "street address", /^site ?addr/, /^property ?addr/),
    city: find(/^(site|situs|property) ?city$/, "city"),
    zip: find(/^(site|situs|property) ?zip/, "zip", "zip code", "zipcode", "postal code"),
    email: find(/e-?mail/),
    phones: [],
    dncCols: [],
  };
  h.forEach((col, i) => {
    if (/(phone|mobile|cell|wireless|landline|tel\b|telephone)/.test(col) && !/(dnc|do not call|type|carrier|status|score|litig)/.test(col)) cols.phones.push(i);
  });
  h.forEach((col, i) => {
    if (/(dnc|do not call|do_not_call)/.test(col)) cols.dncCols.push(i);
  });
  return cols;
}

function truthy(v) {
  return /^(y|yes|true|1|dnc|x)$/i.test(String(v || "").trim());
}

function importDialerCsv(text, listName) {
  const rows = parseCsv(text);
  if (rows.length < 2) return "That file looks empty. Export the list as a CSV and try again.";
  const header = rows[0];
  const cols = detectColumns(header);
  if (cols.name < 0 && cols.first < 0 && cols.last < 0 && cols.address < 0) {
    return "Couldn't find a name or address column. The first row should have headers like Owner Name, Site Address, Phone.";
  }
  const list = { id: uid(), name: listName || `List ${state.dialer.lists.length + 1}`, importedAt: todayStr(), scrubbedOn: "" };
  const existing = new Set(state.dialer.leads.flatMap((l) => l.phones.map((p) => p.number)));
  let added = 0, noPhone = 0, flagged = 0, dupes = 0;
  const body = rows.slice(1, MAX_IMPORT_ROWS + 1);
  for (const r of body) {
    const get = (i) => (i >= 0 ? (r[i] || "").trim() : "");
    let name = get(cols.name);
    if (!name) name = [get(cols.first), get(cols.last)].filter(Boolean).join(" ");
    const address = get(cols.address);
    if (!name && !address) continue;
    // A DNC column next to a phone column ("Phone 1 DNC") flags that phone; a single DNC column flags them all.
    const allDnc = cols.dncCols.length === 1 && truthy(get(cols.dncCols[0]));
    const phones = [];
    cols.phones.forEach((pi, n) => {
      const number = phoneDigits(get(pi));
      if (!number || phones.some((p) => p.number === number)) return;
      const ownDnc = cols.dncCols.length > 1 && cols.dncCols[n] !== undefined && truthy(get(cols.dncCols[n]));
      const dnc = allDnc || ownDnc;
      if (dnc) flagged++;
      phones.push({ number, dnc, bad: false });
    });
    if (!phones.length) noPhone++;
    if (phones.length && phones.every((p) => existing.has(p.number))) { dupes++; continue; }
    phones.forEach((p) => existing.add(p.number));
    state.dialer.leads.push({
      id: uid(), listId: list.id, name, address,
      cityZip: [get(cols.city), get(cols.zip)].filter(Boolean).join(" "),
      email: get(cols.email), phones,
      status: "new", attempts: 0, lastCall: "", lastOutcome: "", callbackDate: "", notes: "", crmId: "",
    });
    added++;
  }
  if (!added) return "No new owners found in that file (they may already be in your dialer).";
  state.dialer.lists.push(list);
  dialerListFilter = list.id;
  dialerCurrentId = null;
  save();
  const extra = rows.length - 1 > MAX_IMPORT_ROWS ? ` Only the first ${MAX_IMPORT_ROWS} rows were imported.` : "";
  return `Imported ${added} owners into "${list.name}". ${noPhone ? `${noPhone} have no phone number yet (skip trace them). ` : ""}${flagged ? `${flagged} numbers were flagged Do Not Call in the file and will be skipped. ` : ""}${dupes ? `${dupes} were already in your dialer. ` : ""}${extra}`;
}

function exportListCsv(listId) {
  const list = state.dialer.lists.find((l) => l.id === listId);
  const leads = state.dialer.leads.filter((l) => l.listId === listId);
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Name", "Address", "City/ZIP", "Phones", "Status", "Last outcome", "Attempts", "Last call", "Callback", "Notes"].map(q).join(",")];
  for (const l of leads) {
    lines.push([l.name, l.address, l.cityZip, l.phones.map((p) => phonePretty(p.number) + (p.dnc || isDnc(p.number) ? " (DNC)" : "")).join(" / "),
      l.status, l.lastOutcome, l.attempts, l.lastCall, l.callbackDate, l.notes].map(q).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(list ? list.name : "dialer").replace(/[^\w-]+/g, "-")}-results.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- outcomes ----------

function firstName(name) {
  const n = String(name || "").trim();
  if (n.includes(",")) return (n.split(",")[1] || "").trim().split(/\s+/)[0] || "";
  return n.split(/\s+/)[0] || "";
}

function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function dialerAddToCrm(lead, stage) {
  const phone = phonePretty(dialablePhones(lead)[0]?.number || lead.phones[0]?.number || "");
  let c = lead.crmId && state.crm.contacts.find((x) => x.id === lead.crmId);
  if (!c) {
    const n = titleCase(lead.name);
    const parts = n.includes(",") ? [n.split(",")[1].trim(), n.split(",")[0].trim()] : [n.split(/\s+/)[0], n.split(/\s+/).slice(1).join(" ")];
    c = {
      id: uid(), firstName: parts[0] || "", lastName: parts[1] || "", phone, email: lead.email || "",
      source: "Cold call", stage, nextFollowUp: "", notes: `Farm list: ${titleCase(lead.address)} ${lead.cityZip}`.trim(),
      createdAt: new Date().toISOString(), lastContact: "", fub: "", fubError: "", review: "", reviewAsked: "",
    };
    state.crm.contacts.push(c);
    lead.crmId = c.id;
  } else if (stage === "Hot Prospect") {
    c.stage = stage;
  }
  if (lead.notes) c.notes = `${c.notes}\nCall notes: ${lead.notes}`.trim();
  return c;
}

function recordOutcome(lead, outcomeId, phoneNumber) {
  const o = OUTCOMES.find((x) => x.id === outcomeId);
  if (!o) return;
  const today = todayStr();
  lead.lastCall = today;
  lead.lastOutcome = o.label;
  lead.attempts = (lead.attempts || 0) + 1;
  const secs = dialerCall && dialerCall.leadId === lead.id && dialerCall.connectedAt ? Math.round((Date.now() - dialerCall.connectedAt) / 1000) : 0;
  state.dialer.log.push({ id: uid(), date: today, leadId: lead.id, outcome: o.id, phone: phoneNumber || "", secs, line: dialerSettings().mode });

  if (o.id === "no_answer" || o.id === "voicemail") {
    lead.status = lead.attempts >= MAX_ATTEMPTS ? "done" : "retry";
  } else if (o.id === "bad_number") {
    const p = lead.phones.find((x) => x.number === phoneNumber);
    if (p) p.bad = true;
    lead.status = dialablePhones(lead).length ? "retry" : "done";
    lead.attempts = Math.max(0, lead.attempts - 1); // a dead number isn't a real attempt
  } else if (o.id === "dnc") {
    for (const p of lead.phones) if (!state.dialer.dnc.includes(p.number)) state.dialer.dnc.push(p.number);
    lead.status = "dnc";
  } else if (o.id === "callback") {
    lead.status = "callback";
    if (!lead.callbackDate || lead.callbackDate <= today) lead.callbackDate = addDays(today, 2);
  } else {
    lead.status = "done";
  }

  let c = null;
  if (o.crm) c = dialerAddToCrm(lead, o.crm);
  // Real conversations count toward the Daily 20.
  if (o.talked) logTouch("call", c ? c.id : null);
  // Set the follow-up after logTouch, which would otherwise replace it with the stage default.
  if (c) c.nextFollowUp = o.id === "callback" ? lead.callbackDate : addDays(today, o.id === "appointment" ? 1 : 3);
  save();
}

// ---------- calling ----------

function siteApi(path) {
  const { url } = fubSettings();
  return url ? url.replace(/\/api\/[^/]*$/, path) : "";
}

function loadTelnyxSdk() {
  if (window.TelnyxWebRTC) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/telnyx-webrtc.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the calling library."));
    document.head.appendChild(s);
  });
}

async function connectLine() {
  const fresh = Date.now() - telnyxTokenAt < 20 * 3600 * 1000; // tokens last 24h
  if (telnyxClient && fresh && telnyxReady) return telnyxReady;
  if (telnyxClient) { try { telnyxClient.disconnect(); } catch (e) { /* already closed */ } telnyxClient = null; }
  telnyxReady = (async () => {
    const { passcode } = fubSettings();
    const api = siteApi("/api/dialer-token");
    if (!api || !passcode) throw new Error("Add your site link and passcode in Daily 20 CRM → CRM settings first.");
    const res = await fetch(api, { method: "POST", headers: { "X-CRM-Passcode": passcode } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Wrong passcode. It must match CRM_PASSCODE on Vercel.");
    if (!res.ok || !data.token) throw new Error(data.error || "The business line isn't set up on your site yet.");
    if (phoneDigits(data.callerId) && !dialerSettings().callerId) saveDialerSettings({ callerId: phoneDigits(data.callerId) });
    await loadTelnyxSdk();
    telnyxTokenAt = Date.now();
    const client = new window.TelnyxWebRTC.TelnyxRTC({ login_token: data.token });
    telnyxClient = client;
    client.on("telnyx.notification", onTelnyxNotification);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("The business line didn't connect. Check your internet and try again.")), 15000);
      client.on("telnyx.ready", () => { clearTimeout(t); resolve(); });
      client.on("telnyx.error", (err) => { clearTimeout(t); reject(new Error((err && err.message) || "Couldn't sign in to the business line.")); });
      client.connect();
    });
  })();
  telnyxReady.catch(() => { telnyxReady = null; telnyxClient = null; });
  return telnyxReady;
}

function onTelnyxNotification(n) {
  if (!n || n.type !== "callUpdate" || !n.call || !dialerCall) return;
  const st = n.call.state;
  dialerCall.rtcCall = n.call;
  if (st === "active" && !dialerCall.connectedAt) dialerCall.connectedAt = Date.now();
  if (st === "hangup" || st === "destroy" || st === "purge") {
    endCallUi(dialerCall.connectedAt ? "Call ended" : "No connection");
    return;
  }
  dialerCall.state = { new: "Calling…", trying: "Calling…", requesting: "Calling…", early: "Ringing…", ringing: "Ringing…", active: "Connected", held: "On hold", recovering: "Reconnecting…" }[st] || dialerCall.state;
  paintCallBar();
}

function endCallUi(label) {
  if (!dialerCall) return;
  dialerCall.state = label;
  dialerCall.ended = true;
  dialerCall.endedAt = Date.now();
  dialerCall.rtcCall = null;
  dialerMuted = false;
  clearInterval(dialerTimer);
  dialerTimer = null;
  paintCallBar();
}

async function startCall(lead, phoneNumber) {
  if (!inCallingHours()) { alert(`Calls are only allowed between ${CALL_START_HOUR}am and ${CALL_END_HOUR - 12}pm.`); return; }
  const list = leadList(lead);
  if (!listScrubOk(list)) { alert("Confirm this list was checked against the National Do Not Call Registry (within the last 31 days) before calling."); return; }
  if (isDnc(phoneNumber)) { alert("That number is on your Do Not Call list."); return; }
  const s = dialerSettings();
  dialerCall = { leadId: lead.id, phone: phoneNumber, startedAt: Date.now(), connectedAt: 0, state: "Calling…", rtcCall: null, ended: false };
  if (s.mode !== "line") {
    // Phone app: we can't see when they answer, so the timer just runs from the tap.
    dialerCall.connectedAt = Date.now();
    dialerCall.state = "Calling from your phone";
    location.href = `tel:${phoneE164(phoneNumber)}`;
    startTimer();
    render();
    return;
  }
  render();
  try {
    await connectLine(); // also fills in the caller ID from TELNYX_CALLER_ID on the site if it's blank here
    const callerId = dialerSettings().callerId;
    if (!callerId) throw new Error("Add your business line number in Dialer settings first.");
    const call = telnyxClient.newCall({ destinationNumber: phoneE164(phoneNumber), callerNumber: phoneE164(callerId), audio: true });
    dialerCall.rtcCall = call;
    startTimer();
  } catch (err) {
    dialerLineMsg = err.message;
    endCallUi("Call failed");
    render();
  }
}

function startTimer() {
  clearInterval(dialerTimer);
  dialerTimer = setInterval(paintCallBar, 1000);
}

function hangUp() {
  if (dialerCall && dialerCall.rtcCall) {
    try { dialerCall.rtcCall.hangup(); } catch (e) { /* already gone */ }
  }
  endCallUi(dialerCall && dialerCall.connectedAt ? "Call ended" : "Canceled");
}

function toggleMute() {
  const c = dialerCall && dialerCall.rtcCall;
  if (!c) return;
  dialerMuted = !dialerMuted;
  try { dialerMuted ? c.muteAudio() : c.unmuteAudio(); } catch (e) { /* not ready */ }
  paintCallBar();
}

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function paintCallBar() {
  const el = document.getElementById("dialer-callbar");
  if (!el) return;
  el.innerHTML = callBarHtml();
}

function callBarHtml() {
  if (!dialerCall) return "";
  const live = !dialerCall.ended;
  const t = dialerCall.connectedAt ? clock((dialerCall.endedAt || Date.now()) - dialerCall.connectedAt) : "";
  const line = dialerCall.rtcCall || (live && dialerSettings().mode === "line");
  return `<div class="dial-callbar ${live ? "live" : ""}">
    <span class="dial-dot"></span><strong>${esc(dialerCall.state)}</strong>
    <span class="muted">${esc(phonePretty(dialerCall.phone))}</span>
    <span class="dial-clock">${t}</span>
    ${live && line ? `<button data-dial="mute">${dialerMuted ? "Unmute" : "Mute"}</button><button class="primary" data-dial="hangup">Hang up</button>` : ""}
    ${live && !line ? `<button data-dial="hangup">Done</button>` : ""}
  </div>`;
}

// ---------- rendering ----------

function scriptFor(lead) {
  const street = (lead.address || "").replace(/^\d+[\w-]*\s+/, "").trim();
  return (state.dialer.script || DEFAULT_SCRIPT)
    .replace(/\{first\}/g, titleCase(firstName(lead.name)) || "there")
    .replace(/\{name\}/g, titleCase(lead.name))
    .replace(/\{street\}/g, titleCase(street) || "your street")
    .replace(/\{address\}/g, titleCase(lead.address));
}

function currentLead(leads) {
  let lead = dialerCurrentId && state.dialer.leads.find((l) => l.id === dialerCurrentId);
  if (!lead || (dialerFilter === "queue" && !inQueue(lead) && !(dialerCall && dialerCall.leadId === lead.id))) {
    lead = leads[0] || null;
    dialerCurrentId = lead ? lead.id : null;
  }
  return lead;
}

function statusLabel(l) {
  if (l.status === "callback") return `Call back ${l.callbackDate || ""}`.trim();
  return { new: "New", retry: `Try again (${l.attempts}/${MAX_ATTEMPTS})`, done: l.lastOutcome || "Done", dnc: "Do not call" }[l.status] || l.status;
}

function renderDialerSetup() {
  const s = dialerSettings();
  const { passcode } = fubSettings();
  const open = dialerSetupOpen === null ? !state.dialer.lists.length : dialerSetupOpen;
  return `<details class="card" id="dial-setup" ${open ? "open" : ""} style="margin-top:16px">
    <summary><strong>Dialer settings & import</strong></summary>
    <h4>1. Import a farm list</h4>
    <p class="muted">Export your list from Equity Title (or any skip-trace file) as a CSV. The dialer finds the owner name, site address and every phone column automatically, and skips numbers marked DNC in the file.</p>
    <form id="dial-import" class="row">
      <input name="name" placeholder="List name (e.g. 12th & Union farm)">
      <label class="ghost btn-file">Choose CSV<input type="file" name="file" accept=".csv,text/csv" hidden></label>
    </form>
    ${dialerImportMsg ? `<p class="muted">${esc(dialerImportMsg)}</p>` : ""}
    <h4>2. How you call</h4>
    <form id="dial-settings" class="row">
      <select name="mode">
        <option value="phone" ${s.mode !== "line" ? "selected" : ""}>My phone (free, shows my number)</option>
        <option value="line" ${s.mode === "line" ? "selected" : ""}>Business line (browser, Telnyx number)</option>
      </select>
      <input name="callerId" placeholder="Business line number, e.g. (253) 555-0100" value="${esc(s.callerId ? phonePretty(s.callerId) : "")}">
      <button class="primary">Save</button>
      <button type="button" data-dial="test-line">Test business line</button>
    </form>
    ${!passcode ? `<p class="muted">The business line uses the same site link and passcode as Daily 20 CRM → CRM settings.</p>` : ""}
    ${dialerLineMsg ? `<p class="muted">${esc(dialerLineMsg)}</p>` : ""}
    <h4>3. Your script</h4>
    <p class="muted">Use {first}, {street}, {name} and {address}. Washington requires you to say your name, your company and why you're calling within the first 30 seconds.</p>
    <textarea id="dial-script" style="min-height:220px">${esc(state.dialer.script || DEFAULT_SCRIPT)}</textarea>
    <div class="btn-row"><button data-dial="reset-script">Reset to default script</button></div>
    <h4>Do Not Call list (${state.dialer.dnc.length})</h4>
    <form id="dial-dnc" class="row"><input name="phone" placeholder="Add a number someone asked you not to call"><button>Add</button></form>
  </details>`;
}

function renderLists() {
  if (!state.dialer.lists.length) return "";
  const rows = state.dialer.lists.map((l) => {
    const leads = state.dialer.leads.filter((x) => x.listId === l.id);
    const withPhone = leads.filter((x) => dialablePhones(x).length).length;
    const left = leads.filter((x) => (x.status === "new" || x.status === "retry") && dialablePhones(x).length).length;
    const ok = listScrubOk(l);
    return `<li>
      <div class="grow"><strong>${esc(l.name)}</strong>
        <div class="muted">${leads.length} owners · ${withPhone} callable · ${left} left to call · imported ${esc(l.importedAt)}</div>
        <div class="muted">${ok ? `✅ DNC scrubbed ${esc(l.scrubbedOn)}` : `⚠️ Not cleared to call: confirm the National DNC scrub`}</div>
      </div>
      ${ok ? "" : `<button data-dial="scrub" data-id="${l.id}">I scrubbed it today</button>`}
      <button data-dial="export" data-id="${l.id}">Export</button>
      <button class="x neg" data-dial="del-list" data-id="${l.id}" title="Delete list">✕</button>
    </li>`;
  }).join("");
  return `<div class="card" style="margin-top:16px"><h3>Lists</h3><ul class="list">${rows}</ul>
    <p class="muted">Before calling, check each list against the National Do Not Call Registry (your first 5 area codes are free at telemarketing.donotcall.gov) and your brokerage's list. Re-check every 31 days.</p></div>`;
}

function renderDialer() {
  const d = state.dialer;
  const s = dialerSettings();
  const log = todayLog();
  const talked = log.filter((x) => OUTCOMES.find((o) => o.id === x.outcome)?.talked).length;
  const appts = log.filter((x) => x.outcome === "appointment").length;
  const lineDials = log.filter((x) => x.line === "line").length;
  const leads = visibleLeads();
  const lead = currentLead(leads);
  const hoursOk = inCallingHours();
  const listOpts = d.lists.map((l) => `<option value="${l.id}" ${dialerListFilter === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("");

  const statsCard = `<div class="card"><div class="stats">
      <div class="stat"><div class="label">Dials today</div><div class="value">${log.length}</div></div>
      <div class="stat"><div class="label">Conversations</div><div class="value">${talked}</div></div>
      <div class="stat"><div class="label">Appointments</div><div class="value pos">${appts}</div></div>
      <div class="stat"><div class="label">In queue</div><div class="value">${queueLeads().length}</div></div>
    </div>
    <div class="muted">${hoursOk ? `Calling window open until ${CALL_END_HOUR - 12}pm.` : `Calling window is closed (${CALL_START_HOUR}am–${CALL_END_HOUR - 12}pm). Use this time to import and scrub lists.`}
    ${s.mode === "line" ? ` · Business line: ${lineDials}/${LINE_DAILY_SOFT_CAP} dials today${lineDials >= LINE_DAILY_SOFT_CAP ? " ⚠️ slow down to protect the number from spam labels" : ""}` : " · Calling from your phone"}</div></div>`;

  if (!d.lists.length) {
    return `<h2 class="dial-title">Dialer</h2>${statsCard}${renderDialerSetup()}`;
  }

  let leadCard = `<div class="card dial-lead"><p class="muted">${dialerFilter === "queue" ? "Nobody left to call right now. Import a new list, or check Callbacks." : "Nobody here yet."}</p></div>`;
  if (lead) {
    const list = leadList(lead);
    const ok = listScrubOk(list);
    const phones = lead.phones.map((p) => {
      const blocked = p.dnc || isDnc(p.number);
      const label = blocked ? "DNC" : p.bad ? "Bad number" : "";
      const can = !blocked && !p.bad && ok && hoursOk && !(dialerCall && !dialerCall.ended);
      return `<div class="dial-phone ${blocked || p.bad ? "off" : ""}">
        <span>${esc(phonePretty(p.number))}</span>${label ? `<span class="tag">${label}</span>` : ""}
        <button class="primary" data-dial="call" data-phone="${p.number}" ${can ? "" : "disabled"}>📞 Call</button>
      </div>`;
    }).join("") || `<p class="muted">No phone number on this owner yet. Skip trace them, then re-import.</p>`;
    const lastPhone = (dialerCall && dialerCall.leadId === lead.id && dialerCall.phone) || dialablePhones(lead)[0]?.number || "";
    leadCard = `<div class="card dial-lead">
      <div class="dial-head">
        <div><div class="dial-name">${esc(titleCase(lead.name) || "Owner")}</div>
          <div class="muted">${esc(titleCase(lead.address))} ${esc(lead.cityZip)}</div>
          <div class="muted">${esc(list ? list.name : "")} · ${esc(statusLabel(lead))}${lead.lastCall ? ` · last call ${esc(lead.lastCall)}` : ""}</div></div>
        <div class="btn-row"><button data-dial="prev">◀</button><button data-dial="skip">Skip ▶</button></div>
      </div>
      ${ok ? "" : `<p class="dial-warn">This list isn't cleared to call yet. Confirm the National DNC scrub in Lists.</p>`}
      <div id="dialer-callbar">${callBarHtml()}</div>
      ${phones}
      <h4>How did it go? <span class="muted">(keys 1–8)</span></h4>
      <div class="dial-outcomes">${OUTCOMES.map((o) => `<button data-dial="outcome" data-outcome="${o.id}" data-phone="${lastPhone}" ${lastPhone ? "" : "disabled"}><span class="k">${o.key}</span>${o.label}</button>`).join("")}</div>
      <div class="row" style="display:flex;gap:6px;margin-top:8px;align-items:center">
        <label class="muted">Call back on <input type="date" id="dial-cb" value="${esc(lead.callbackDate || addDays(todayStr(), 2))}"></label>
      </div>
      <textarea id="dial-notes" placeholder="Notes (motivation, timeline, best time to call)" style="min-height:70px;margin-top:8px">${esc(lead.notes || "")}</textarea>
      ${lead.crmId ? `<p class="muted">✅ In your Daily 20 CRM</p>` : ""}
    </div>
    <div class="card dial-script"><h3>Script</h3><pre>${esc(scriptFor(lead))}</pre></div>`;
  }

  const rows = leads.slice(0, 200).map((l) => `<li class="${lead && l.id === lead.id ? "on" : ""}">
      <button class="x grow dial-row" data-dial="pick" data-id="${l.id}"><strong>${esc(titleCase(l.name) || "Owner")}</strong>
        <span class="muted">${esc(titleCase(l.address))} · ${esc(statusLabel(l))}</span></button>
    </li>`).join("");

  return `<h2 class="dial-title">Dialer</h2>
    ${statsCard}
    <div class="dial-grid">
      <div>${leadCard}</div>
      <div class="card dial-queue">
        <div class="row" style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="dial-filter">
            <option value="queue" ${dialerFilter === "queue" ? "selected" : ""}>Up next</option>
            <option value="callbacks" ${dialerFilter === "callbacks" ? "selected" : ""}>Callbacks</option>
            <option value="all" ${dialerFilter === "all" ? "selected" : ""}>Everyone</option>
          </select>
          <select id="dial-list"><option value="">All lists</option>${listOpts}</select>
        </div>
        <p class="muted">${leads.length} ${dialerFilter === "queue" ? "to call" : "owners"}${leads.length > 200 ? " (showing 200)" : ""}</p>
        <ul class="list">${rows}</ul>
      </div>
    </div>
    ${renderLists()}
    ${renderDialerSetup()}`;
}

// ---------- events ----------

function dialerLead() {
  return dialerCurrentId && state.dialer.leads.find((l) => l.id === dialerCurrentId);
}

function stashNotes() {
  const lead = dialerLead();
  const n = document.getElementById("dial-notes");
  const cb = document.getElementById("dial-cb");
  if (lead && n) lead.notes = n.value;
  if (lead && cb && cb.value) lead.callbackDate = cb.value;
}

function moveCurrent(step) {
  const leads = visibleLeads();
  if (!leads.length) return;
  const i = leads.findIndex((l) => l.id === dialerCurrentId);
  const next = leads[(i + step + leads.length) % leads.length];
  dialerCurrentId = next.id;
}

function finishOutcome(outcomeId, phone) {
  const lead = dialerLead();
  if (!lead) return;
  if (dialerCall && !dialerCall.ended) hangUp();
  stashNotes();
  if (outcomeId === "dnc" && !confirm("Add every number for this owner to your Do Not Call list? They won't be called again.")) return;
  recordOutcome(lead, outcomeId, phone);
  dialerCall = null;
  // On to the next person in the queue.
  const leads = visibleLeads();
  const stillHere = leads.findIndex((l) => l.id === lead.id);
  if (stillHere >= 0) moveCurrent(1);
  else dialerCurrentId = null;
  render();
}

document.getElementById("view").addEventListener("click", async (e) => {
  if (currentTab !== "dialer") return;
  const btn = e.target.closest("[data-dial]");
  if (!btn) return;
  e.preventDefault();
  const id = btn.dataset.id;
  switch (btn.dataset.dial) {
    case "call": {
      const lead = dialerLead();
      stashNotes();
      if (lead) startCall(lead, btn.dataset.phone);
      return;
    }
    case "hangup": hangUp(); render(); return;
    case "mute": toggleMute(); return;
    case "outcome": finishOutcome(btn.dataset.outcome, btn.dataset.phone); return;
    case "skip": stashNotes(); save(); moveCurrent(1); dialerCall = null; render(); return;
    case "prev": stashNotes(); save(); moveCurrent(-1); dialerCall = null; render(); return;
    case "pick": stashNotes(); save(); dialerCurrentId = id; dialerCall = null; render(); return;
    case "scrub": {
      const list = state.dialer.lists.find((l) => l.id === id);
      if (list && confirm("Confirm: you checked this list against the National Do Not Call Registry (and your brokerage's DNC list) today, and removed or flagged registered numbers?")) {
        list.scrubbedOn = todayStr();
        save();
        render();
      }
      return;
    }
    case "export": exportListCsv(id); return;
    case "del-list":
      if (confirm("Delete this list and everyone in it from the dialer? Your Do Not Call list and CRM contacts stay.")) {
        state.dialer.lists = state.dialer.lists.filter((l) => l.id !== id);
        state.dialer.leads = state.dialer.leads.filter((l) => l.listId !== id);
        if (dialerListFilter === id) dialerListFilter = "";
        dialerCurrentId = null;
        save();
        render();
      }
      return;
    case "reset-script":
      if (confirm("Replace your script with the default?")) { state.dialer.script = DEFAULT_SCRIPT; save(); render(); }
      return;
    case "test-line":
      dialerLineMsg = "Connecting…";
      render();
      try {
        await connectLine();
        dialerLineMsg = "✅ Business line connected. You're ready to call from the browser.";
      } catch (err) {
        dialerLineMsg = "❌ " + err.message;
      }
      render();
      return;
  }
});

document.getElementById("view").addEventListener("change", (e) => {
  if (currentTab !== "dialer") return;
  const el = e.target;
  if (el.id === "dial-filter") { stashNotes(); dialerFilter = el.value; dialerCurrentId = null; render(); }
  else if (el.id === "dial-list") { stashNotes(); dialerListFilter = el.value; dialerCurrentId = null; render(); }
  else if (el.id === "dial-notes" || el.id === "dial-cb") { stashNotes(); save(); }
  else if (el.id === "dial-script") { state.dialer.script = el.value; save(); }
  else if (el.name === "file" && el.closest("#dial-import")) {
    const file = el.files[0];
    if (!file) return;
    const name = el.form.elements.name.value.trim() || file.name.replace(/\.csv$/i, "");
    file.text().then((text) => {
      dialerImportMsg = importDialerCsv(text, name);
      render();
    });
  }
});

document.getElementById("view").addEventListener("toggle", (e) => {
  if (currentTab === "dialer" && e.target.id === "dial-setup") dialerSetupOpen = e.target.open;
}, true);

document.getElementById("view").addEventListener("submit", (e) => {
  if (currentTab !== "dialer") return;
  const f = e.target;
  if (f.id === "dial-settings") {
    e.preventDefault();
    const callerId = phoneDigits(f.callerId.value);
    if (f.callerId.value.trim() && !callerId) { alert("Enter the business line as a 10-digit US number."); return; }
    saveDialerSettings({ mode: f.mode.value, callerId });
    dialerLineMsg = f.mode.value === "line" ? "Saved. Tap Test business line to check the connection." : "Saved. Calls will open your phone app.";
    render();
  } else if (f.id === "dial-dnc") {
    e.preventDefault();
    const d = phoneDigits(f.phone.value);
    if (!d) { alert("Enter a 10-digit phone number."); return; }
    if (!state.dialer.dnc.includes(d)) state.dialer.dnc.push(d);
    save();
    render();
  } else if (f.id === "dial-import") {
    e.preventDefault();
  }
});

document.addEventListener("keydown", (e) => {
  if (currentTab !== "dialer" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  const o = OUTCOMES.find((x) => x.key === e.key);
  if (!o) return;
  const btn = document.querySelector(`[data-dial="outcome"][data-outcome="${o.id}"]`);
  if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
});

window.addEventListener("beforeunload", () => {
  if (telnyxClient) { try { telnyxClient.disconnect(); } catch (e) { /* closing anyway */ } }
});

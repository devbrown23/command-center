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

// Objection cards: one per block, first line is what they say, the rest is your answer. Blank line between cards.
const DEFAULT_OBJECTIONS = `How did you get my number?
It's from public property records for homes around {street}. I only call neighbors near recent sales. If you'd rather I not call, I'll take you off my list right now. Otherwise, quick question: have you seen what homes nearby are going for?

I'm not selling.
Totally fair, most people I talk to aren't. I'm just keeping neighbors in the loop on values. If you ever did move, would it be in the next couple of years or more like five-plus?

Just send me something.
Happy to. Is text or email better? And so I send the right numbers, have you done any updates, like the kitchen, roof or bathrooms?

Are you trying to list my house?
Only if it ever makes sense for you. Today I'm just sharing what's selling nearby. If the numbers surprised you, would you want to know what yours could bring?

I already have an agent.
That's great, glad you're taken care of. Are you working with them on a move right now, or are they someone you'd call down the road?

What's my home worth?
Great question, and I want to give you a real number, not a guess. A quick 15-minute walkthrough lets me account for your updates. Is earlier or later in the week better?

Now's not a good time.
No problem at all. Is later today or tomorrow better? (Tap Call back and set the date.)`;

const DEFAULT_VM = `Hi {first}, this is Devin Brown with Unique Lifestyle Realty, {myphone}. I'm calling neighbors around {street} because a few homes nearby just sold, and I put together a free home value update for your place. Call or text me back at {myphone} and I'll send it over. Again, Devin Brown, {myphone}. Have a great day.`;

const DEFAULT_SMS = `Hi {first}, it's Devin Brown with Unique Lifestyle Realty. Thanks for chatting today! Here's the home value update for {address} I mentioned: {report}
Reply STOP and I won't text again.`;

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
let dialerStatsRange = "7";   // today | 7 | 30 | all
let dialerCircle = null;      // { address, num, street, kind } when circle prospecting
let dialerVm = undefined;     // { blob, secs, at } recorded voicemail on this device; undefined = not loaded yet
let dialerVmRec = null;       // { recorder, chunks, startedAt } while recording
let dialerVmMsg = "";
let dialerDncMsg = "";
let dialerPractice = null;    // { lead, step, startedAt, openerSecs, obj, reveal } while practicing

function defaultDialer() {
  return {
    lists: [], leads: [], dnc: [], log: [], script: DEFAULT_SCRIPT,
    objections: DEFAULT_OBJECTIONS, vmScript: DEFAULT_VM, smsTemplate: DEFAULT_SMS,
    reportLink: "", myPhone: "(803) 658-1509", autoFub: true,
  };
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

// ---------- circle prospecting ----------

const STREET_WORDS = {
  SOUTH: "S", NORTH: "N", EAST: "E", WEST: "W", SOUTHEAST: "SE", SOUTHWEST: "SW", NORTHEAST: "NE", NORTHWEST: "NW",
  AVENUE: "AVE", AV: "AVE", STREET: "ST", ROAD: "RD", DRIVE: "DR", BOULEVARD: "BLVD", PLACE: "PL", COURT: "CT",
  LANE: "LN", TERRACE: "TER", WAY: "WAY", CIRCLE: "CIR", PARKWAY: "PKWY", HIGHWAY: "HWY",
};

// "1201 South Union Avenue #2" -> { num: 1201, street: "S UNION AVE" }
function parseStreetAddress(addr) {
  const clean = String(addr || "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+(APT|UNIT|STE|SUITE|#)\s*\S*$/, "").replace(/#\S*$/, "").trim();
  const m = clean.match(/^(\d+)[A-Z-]*\s+(.+)$/);
  if (!m) return null;
  const street = m[2].split(/\s+/).map((w) => STREET_WORDS[w] || w).join(" ").trim();
  return { num: parseInt(m[1], 10), street };
}

function circleLeads(base) {
  if (!dialerCircle) return [];
  return base
    .map((l) => ({ l, a: parseStreetAddress(l.address) }))
    .filter((x) => x.a && x.a.street === dialerCircle.street && x.a.num !== dialerCircle.num)
    .sort((x, y) => Math.abs(x.a.num - dialerCircle.num) - Math.abs(y.a.num - dialerCircle.num))
    .map((x) => x.l);
}

function visibleLeads() {
  if (dialerFilter === "circle") return circleLeads(state.dialer.leads.filter(inQueue));
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
    name: find(/^owner ?1? ?(full )?name$/, "owner", "owner(s)", "owners", "full name", "name", /^primary owner/, "ownernamelabelformat", /^owner ?name/),
    first: find(/^(owner ?1? ?)?first ?name$/, "first"),
    last: find(/^(owner ?1? ?)?last ?name$/, "last"),
    address: find(/^(site|situs|property|prop) ?(street )?address$/, "address", "street address", /^site ?addr/, /^property ?addr/),
    city: find(/^(site|situs|property) ?city$/, "city"),
    zip: find(/^(site|situs|property) ?zip/, "zip", "zip code", "zipcode", "postal code"),
    email: find(/e-?mail/),
    state: find(/^(site|situs|property) ?state$/, "state"),
    parcel: find("parcelid", "parcel id", "parcel", "apn", "parcel number"),
    mailAddr: find("owneraddr", "mailing address", "mail address", "owner address", /^mail(ing)? ?addr/),
    mailCity: find("ownercitynm", "ownercity", "mailing city", "mail city"),
    mailState: find("ownerstate", "mailing state", "mail state"),
    mailZip: find("ownerzipfull", "ownerzip", "mailing zip", "mail zip"),
    ownerOcc: find("owneroccupiedind", "owner occupied", "owneroccupied"),
    beds: find("bedct", "beds", "bedrooms", "bed"),
    baths: find("bathttlct", "baths", "bathrooms", "bath"),
    sqft: find("bldgsqft", "sqft", "square feet", "living area", "building sqft"),
    yrBuilt: find("yrblt", "year built", "yearbuilt"),
    saleAmt: find("saleamt", "last sale price", "sale price", "last sale amount"),
    saleDate: find("docrcrdgdt", "last sale date", "sale date", "recording date"),
    dnm: find("donotmailind", "do not mail"),
    hood: find("nbrhdmlsdsc", "neighborhood", "subdivision"),
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
  return importDialerRows(parseCsv(text), listName);
}

// Same owner = same parcel number, or same street address + ZIP.
function addrKey(addr, zip) {
  const a = parseStreetAddress(addr);
  const z = String(zip || "").slice(0, 5);
  return a ? `${a.num} ${a.street} ${z}` : String(addr || "").toUpperCase().replace(/\s+/g, " ").trim() + " " + z;
}

function cleanNum(v) {
  const n = parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function excelOrTextDate(v) {
  const t = String(v ?? "").trim();
  if (!t) return "";
  if (/^\d{5}(\.\d+)?$/.test(t)) { // Excel serial date
    const d = new Date(Math.round((parseFloat(t) - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(t);
  return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}

function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/xlsx.full.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the spreadsheet reader."));
    document.head.appendChild(s);
  });
}

// Excel files (Equity Title sends .xlsx): first sheet, as rows of text.
async function readSheetRows(file) {
  await loadXlsxLib();
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }).map((r) => r.map((v) => (v === true ? "TRUE" : v === false ? "FALSE" : String(v))));
}

function importDialerRows(rows, listName) {
  if (rows.length < 2) return "That file looks empty. Export the list and try again.";
  const header = rows[0];
  const cols = detectColumns(header);
  if (cols.name < 0 && cols.first < 0 && cols.last < 0 && cols.address < 0) {
    return "Couldn't find a name or address column. The first row should have headers like Owner Name, Site Address, Phone.";
  }
  const list = { id: uid(), name: listName || `List ${state.dialer.lists.length + 1}`, importedAt: todayStr(), scrubbedOn: "" };
  const existing = new Set(state.dialer.leads.flatMap((l) => l.phones.map((p) => p.number)));
  const byKey = new Map();
  for (const l of state.dialer.leads) {
    if (l.info && l.info.parcel) byKey.set("P" + l.info.parcel, l);
    if (l.address) byKey.set("A" + addrKey(l.address, l.zip || l.cityZip.split(" ").pop()), l);
  }
  let added = 0, noPhone = 0, flagged = 0, dupes = 0, merged = 0, phonesAdded = 0;
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
    const zip = get(cols.zip);
    const parcel = get(cols.parcel);
    const occ = get(cols.ownerOcc);
    const mail = [get(cols.mailAddr), get(cols.mailCity), get(cols.mailState), get(cols.mailZip)].filter(Boolean).join(", ");
    const info = {
      parcel, beds: cleanNum(get(cols.beds)), baths: cleanNum(get(cols.baths)), sqft: cleanNum(get(cols.sqft)),
      yrBuilt: cleanNum(get(cols.yrBuilt)), saleAmt: cleanNum(get(cols.saleAmt)), saleDate: excelOrTextDate(get(cols.saleDate)),
      absentee: occ ? !truthy(occ) && /^(n|no|false|0)$/i.test(occ.trim()) : false, mail, dnm: truthy(get(cols.dnm)), hood: get(cols.hood),
    };
    // Already in the dialer (another farm, or a skip-trace file coming back)? Add any new phones to that owner.
    const match = (parcel && byKey.get("P" + parcel)) || (address && byKey.get("A" + addrKey(address, zip)));
    if (match) {
      let gained = 0;
      for (const p of phones) if (!match.phones.some((x) => x.number === p.number)) { match.phones.push(p); existing.add(p.number); gained++; }
      if (!match.info) match.info = info;
      if (gained) { merged++; phonesAdded += gained; if (match.status === "done" && !match.attempts) match.status = "new"; } else dupes++;
      continue;
    }
    if (!phones.length) noPhone++;
    if (phones.length && phones.every((p) => existing.has(p.number))) { dupes++; continue; }
    phones.forEach((p) => existing.add(p.number));
    const lead = {
      id: uid(), listId: list.id, name, address,
      cityZip: [get(cols.city), zip].filter(Boolean).join(" "), zip, state: get(cols.state),
      email: get(cols.email), phones, info,
      status: "new", attempts: 0, lastCall: "", lastOutcome: "", callbackDate: "", notes: "", crmId: "",
    };
    state.dialer.leads.push(lead);
    if (parcel) byKey.set("P" + parcel, lead);
    if (address) byKey.set("A" + addrKey(address, zip), lead);
    added++;
  }
  if (!added && merged) {
    save();
    return `Added ${phonesAdded} phone numbers to ${merged} owners already in your dialer.${dupes ? ` ${dupes} had nothing new.` : ""}`;
  }
  if (!added) return "No new owners found in that file (they may already be in your dialer).";
  state.dialer.lists.push(list);
  dialerListFilter = list.id;
  dialerCurrentId = null;
  save();
  const extra = rows.length - 1 > MAX_IMPORT_ROWS ? ` Only the first ${MAX_IMPORT_ROWS} rows were imported.` : "";
  return `Imported ${added} owners into "${list.name}". ${merged ? `Added ${phonesAdded} phones to ${merged} owners already in your dialer. ` : ""}${noPhone ? `${noPhone} have no phone number yet: tap "Skip trace file" under Lists, run it through a skip-trace service, then import the results here and the numbers attach to the right owners. ` : ""}${flagged ? `${flagged} numbers were flagged Do Not Call in the file and will be skipped. ` : ""}${dupes ? `${dupes} were already in your dialer (another list). ` : ""}${extra}`;
}

// File for a skip-trace service: owners on this list with no callable number yet.
function exportSkipTrace(listId) {
  const list = state.dialer.lists.find((l) => l.id === listId);
  const leads = state.dialer.leads.filter((l) => l.listId === listId && !dialablePhones(l).length && l.status !== "dnc");
  if (!leads.length) { alert("Everyone on this list already has a phone number."); return; }
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["First Name", "Last Name", "Property Address", "Property City", "Property State", "Property Zip", "Mailing Address", "Parcel"].map(q).join(",")];
  for (const l of leads) {
    const n = String(l.name || "").replace(/\s*&.*$/, "").trim(); // first owner on the title
    const parts = n.includes(",") ? [n.split(",")[1].trim(), n.split(",")[0].trim()] : [n.split(/\s+/)[0], n.split(/\s+/).slice(1).join(" ") || String(l.name || "").split(/\s+/).pop()];
    const city = (l.cityZip || "").replace(/\s*\d{5}(-\d{4})?$/, "");
    lines.push([parts[0], parts[1], l.address, city, l.state || "WA", (l.zip || "").slice(0, 5), l.info?.mail || "", l.info?.parcel || ""].map(q).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(list ? list.name : "list").replace(/[^\w-]+/g, "-")}-skip-trace.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
  const now = new Date();
  state.dialer.log.push({ id: uid(), date: today, ts: now.getTime(), hour: now.getHours(), leadId: lead.id, listId: lead.listId, outcome: o.id, phone: phoneNumber || "", secs, line: dialerSettings().mode });

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
  if (o.id === "appointment" && window.hakiBurst) window.hakiBurst();
  if (o.crm) c = dialerAddToCrm(lead, o.crm);
  // Real conversations count toward the Daily 20.
  if (o.talked) logTouch("call", c ? c.id : null);
  // Set the follow-up after logTouch, which would otherwise replace it with the stage default.
  if (c) c.nextFollowUp = o.id === "callback" ? lead.callbackDate : addDays(today, o.id === "appointment" ? 1 : 3);
  save();
  // Hot leads go straight to Follow Up Boss when it's connected (once per contact).
  if (c && state.dialer.autoFub !== false && fubSettings().passcode && c.fub !== "synced" && c.fub !== "pending") sendToFub(c);
}

// ---------- stats ----------

function statsLog() {
  const log = state.dialer.log;
  if (dialerStatsRange === "all") return log;
  if (dialerStatsRange === "today") return todayLog();
  const from = addDays(todayStr(), -(parseInt(dialerStatsRange, 10) - 1));
  return log.filter((x) => x.date >= from);
}

const isTalk = (x) => !!OUTCOMES.find((o) => o.id === x.outcome)?.talked;
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");

// Counts people, not dials: someone dialed 3 times and reached once is 1 person, 1 contact.
function summarize(log) {
  const people = new Set(log.map((x) => x.leadId));
  const reached = new Set(log.filter(isTalk).map((x) => x.leadId));
  const appts = log.filter((x) => x.outcome === "appointment").length;
  return { dials: log.length, people: people.size, reached: reached.size, appts };
}

function renderStats() {
  const log = statsLog();
  const s = summarize(log);
  const byHour = {};
  for (const x of log) {
    if (x.hour === undefined) continue;
    const h = (byHour[x.hour] = byHour[x.hour] || { dials: 0, talks: 0 });
    h.dials++;
    if (isTalk(x)) h.talks++;
  }
  const hours = Object.entries(byHour).filter(([, v]) => v.dials >= 5)
    .sort((a, b) => b[1].talks / b[1].dials - a[1].talks / a[1].dials).slice(0, 3)
    .map(([h, v]) => { const n = +h; const lbl = `${n % 12 || 12}${n < 12 ? "am" : "pm"}`; return `${lbl} (${pct(v.talks, v.dials)} answer)`; });
  const lists = state.dialer.lists.map((l) => {
    const ls = summarize(log.filter((x) => (x.listId || state.dialer.leads.find((d) => d.id === x.leadId)?.listId) === l.id));
    return ls.dials ? `<li><div class="grow"><strong>${esc(l.name)}</strong><div class="muted">${ls.dials} dials · ${ls.reached}/${ls.people} people reached (${pct(ls.reached, ls.people)}) · ${ls.appts} appts</div></div></li>` : "";
  }).join("");
  const opt = (v, t) => `<option value="${v}" ${dialerStatsRange === v ? "selected" : ""}>${t}</option>`;
  return `<details class="card" style="margin-top:16px"><summary><strong>Results: contacts, not dials</strong></summary>
    <div class="row" style="margin:8px 0"><select id="dial-range">${opt("today", "Today")}${opt("7", "Last 7 days")}${opt("30", "Last 30 days")}${opt("all", "All time")}</select></div>
    <div class="stats">
      <div class="stat"><div class="label">Dials</div><div class="value">${s.dials}</div></div>
      <div class="stat"><div class="label">Contact rate</div><div class="value">${pct(s.reached, s.people)}</div></div>
      <div class="stat"><div class="label">Appt rate</div><div class="value pos">${pct(s.appts, s.reached)}</div></div>
      <div class="stat"><div class="label">Dials per appt</div><div class="value">${s.appts ? Math.round(s.dials / s.appts) : "–"}</div></div>
    </div>
    <p class="muted">${s.reached} of ${s.people} people reached, ${s.appts} appointments. Contact rate counts people you talked to out of people you dialed.</p>
    <p class="muted">Best hours to call: ${hours.length ? hours.join(", ") : "needs at least 5 dials in an hour to tell"}</p>
    ${lists ? `<ul class="list">${lists}</ul>` : ""}
  </details>`;
}

// ---------- power hour ----------

function sessionHtml() {
  const ss = dialerSettings().session;
  if (!ss) {
    return `<div class="btn-row" style="margin-top:8px"><button data-dial="session-start">⚡ Start power hour</button>
      <button data-dial="practice">🎯 Practice mode</button>
      <button class="spar-btn" data-dial="spar">🔴 Spar with a homeowner</button></div>`;
  }
  const log = state.dialer.log.filter((x) => (x.ts || 0) >= ss.start);
  const s = summarize(log);
  const mins = Math.floor((Date.now() - ss.start) / 60000);
  const bar = (n, g) => `<span class="dial-bar"><span style="width:${Math.min(100, Math.round((n / g) * 100))}%"></span></span>`;
  return `<div class="dial-session">
    <strong>⚡ Power hour · ${mins} min</strong>
    <span>${s.dials}/${ss.goalDials} dials ${bar(s.dials, ss.goalDials)}</span>
    <span>${s.reached}/${ss.goalTalks} conversations ${bar(s.reached, ss.goalTalks)}</span>
    <span>${s.appts} appts</span>
    <button data-dial="practice">🎯 Practice</button>
    <button class="spar-btn" data-dial="spar">🔴 Spar</button>
    <button data-dial="session-end">End session</button>
  </div>`;
}

// ---------- National DNC registry file ----------

// Reads a registry download (one number per line, any format) without loading it all at once,
// flags matching numbers on every lead, and clears each list whose area codes the file fully covers.
async function scanDncFile(file) {
  const want = new Map();
  for (const l of state.dialer.leads) for (const p of l.phones) {
    if (!want.has(p.number)) want.set(p.number, []);
    want.get(p.number).push(p);
  }
  const areas = new Set();
  let lines = 0, hits = 0, buf = "";
  const take = (line) => {
    const d = line.replace(/\D/g, "");
    if (d.length < 10) return;
    const n = d.slice(-10);
    lines++;
    areas.add(n.slice(0, 3));
    const ps = want.get(n);
    if (ps) { for (const p of ps) { if (!p.dnc) hits++; p.dnc = true; p.registry = true; } }
  };
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const parts = buf.split(/\r?\n/);
    buf = parts.pop();
    parts.forEach(take);
  }
  if (buf) take(buf);
  if (!lines) return "That file had no phone numbers in it. Download the registry list as a text file (unzip it first) and try again.";
  const cleared = [], notCovered = [];
  for (const list of state.dialer.lists) {
    const codes = new Set(state.dialer.leads.filter((l) => l.listId === list.id).flatMap((l) => l.phones.map((p) => p.number.slice(0, 3))));
    const missing = [...codes].filter((c) => !areas.has(c));
    if (!missing.length) { list.scrubbedOn = todayStr(); cleared.push(list.name); }
    else notCovered.push(`${list.name} (also needs area codes ${missing.join(", ")})`);
  }
  save();
  return `Checked ${lines.toLocaleString()} registered numbers in area codes ${[...areas].sort().join(", ")}. ${hits} of your numbers are on the registry and will be skipped.` +
    (cleared.length ? ` ✅ Cleared to call: ${cleared.join(", ")}.` : "") +
    (notCovered.length ? ` ⚠️ Not cleared yet: ${notCovered.join("; ")}.` : "");
}

// ---------- voicemail ----------

function vmDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("command-center-dialer", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function vmLoad() {
  try {
    const db = await vmDb();
    dialerVm = await new Promise((resolve) => {
      const q = db.transaction("files").objectStore("files").get("voicemail");
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    });
  } catch (e) { dialerVm = null; }
  return dialerVm;
}

async function vmSave(v) {
  const db = await vmDb();
  await new Promise((resolve, reject) => {
    const t = db.transaction("files", "readwrite");
    v ? t.objectStore("files").put(v, "voicemail") : t.objectStore("files").delete("voicemail");
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  dialerVm = v;
}

async function vmRecordToggle() {
  if (dialerVmRec) { dialerVmRec.recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    dialerVmRec = { recorder, startedAt: Date.now() };
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const secs = Math.round((Date.now() - dialerVmRec.startedAt) / 1000);
      dialerVmRec = null;
      await vmSave({ blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), secs, at: todayStr() });
      dialerVmMsg = secs > 30 ? `Saved (${secs}s). Try to keep it under 25 seconds.` : `✅ Saved (${secs}s).`;
      render();
    };
    recorder.start();
    dialerVmMsg = "🔴 Recording… read your voicemail script, then tap Stop.";
  } catch (e) {
    dialerVmMsg = "Couldn't use the microphone. Allow mic access for this site and try again.";
  }
  render();
}

function vmPlay() {
  if (!dialerVm) return;
  const a = new Audio(URL.createObjectURL(dialerVm.blob));
  a.onended = () => URL.revokeObjectURL(a.src);
  a.play();
}

// Swaps your mic for the recording on the live business-line call, then hangs up and logs "Left voicemail".
async function dropVoicemail() {
  const call = dialerCall && !dialerCall.ended && dialerCall.rtcCall;
  const pc = call && call.peer && call.peer.instance;
  const sender = pc && pc.getSenders && pc.getSenders().find((s) => s.track && s.track.kind === "audio");
  if (!sender) { alert("Voicemail drop works on a connected business-line call. On your phone, read the voicemail script instead."); return; }
  const vm = dialerVm || (await vmLoad());
  if (!vm) { alert("Record your voicemail first in Dialer settings → 4. Voicemail."); return; }
  const leadId = dialerCall.leadId, phone = dialerCall.phone;
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await vm.blob.arrayBuffer());
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    const mic = sender.track;
    await sender.replaceTrack(dest.stream.getAudioTracks()[0]);
    dialerCall.state = "Dropping voicemail…";
    paintCallBar();
    src.onended = () => setTimeout(() => {
      try { sender.replaceTrack(mic); } catch (e) { /* call already gone */ }
      ctx.close();
      if (dialerCall && dialerCall.leadId === leadId) finishOutcome("voicemail", phone);
    }, 500);
    src.start();
  } catch (e) {
    alert("Couldn't play the voicemail into the call. Leave it live this time.");
  }
}

// ---------- texting ----------

function textReport(lead, phone) {
  if (!confirm("Did they say yes to getting a text? Only text people who agreed on the call. Washington doesn't allow unsolicited marketing texts.")) return;
  const body = fillVars(state.dialer.smsTemplate || DEFAULT_SMS, lead);
  stashNotes();
  lead.notes = `${lead.notes ? lead.notes + "\n" : ""}${todayStr()}: agreed to a text on the call, sent home value report.`;
  save();
  location.href = `sms:${phoneE164(phone)}?&body=${encodeURIComponent(body)}`;
  render();
}

// ---------- practice ----------

function objectionsList() {
  return String(state.dialer.objections || DEFAULT_OBJECTIONS).split(/\n\s*\n/).map((b) => {
    const lines = b.trim().split("\n");
    return { q: (lines[0] || "").trim(), a: lines.slice(1).join("\n").trim() };
  }).filter((o) => o.q && o.a);
}

function newPracticeRep() {
  const pool = state.dialer.leads.filter((l) => l.name && l.address);
  const lead = pool.length ? pool[Math.floor(Math.random() * pool.length)] : { name: "SMITH, PAT", address: "1215 S UNION AVE", cityZip: "Tacoma 98405" };
  const objs = objectionsList();
  const scores = dialerSettings().practiceScores || {};
  // Objections you've missed come up more often.
  const weighted = objs.flatMap((o) => Array((scores[o.q]?.miss || 0) + 1).fill(o));
  dialerPractice = { lead, step: "opener", startedAt: Date.now(), openerSecs: 0, obj: weighted[Math.floor(Math.random() * weighted.length)] || null, reveal: false };
}

function renderPractice() {
  const p = dialerPractice;
  const ps = dialerSettings();
  const reps = ps.practiceDate === todayStr() ? ps.practiceReps || 0 : 0;
  const scores = ps.practiceScores || {};
  const weak = Object.entries(scores).filter(([, v]) => v.miss > v.hit).map(([q]) => q);
  const opener = fillVars(state.dialer.script || DEFAULT_SCRIPT, p.lead).split(/\n\s*\n/).slice(0, 3).join("\n\n");
  let body = "";
  if (p.step === "opener") {
    body = `<p class="muted">Say it out loud like you're on the phone. Name, company and reason for the call within 30 seconds.</p>
      <pre class="dial-pre">${esc(opener)}</pre>
      <div class="btn-row"><button class="primary" data-dial="pr-opener">Done with the opener</button></div>`;
  } else if (p.step === "objection" && p.obj) {
    body = `<p class="dial-warn">Opener: ${p.openerSecs}s ${p.openerSecs <= 30 ? "✅" : "⚠️ over 30 seconds, tighten it up"}</p>
      <h4>They say: “${esc(p.obj.q)}”</h4>
      <p class="muted">Answer out loud, end with a question, then check yourself.</p>
      ${p.reveal ? `<pre class="dial-pre">${esc(fillVars(p.obj.a, p.lead))}</pre>
        <div class="btn-row"><button class="primary" data-dial="pr-score" data-hit="1">Nailed it</button><button data-dial="pr-score" data-hit="0">Need work</button></div>`
      : `<div class="btn-row"><button class="primary" data-dial="pr-reveal">Show my answer</button></div>`}`;
  }
  return `<div class="card dial-lead">
    <div class="dial-head"><div><div class="dial-name">🎯 Practice</div>
      <div class="muted">Rep ${reps + 1} today · pretend you're calling ${esc(titleCase(p.lead.name))}, ${esc(titleCase(p.lead.address))}</div></div>
      <div class="btn-row"><button data-dial="pr-skip">New rep</button><button data-dial="practice-end">Back to dialer</button></div></div>
    ${body}
    ${weak.length ? `<p class="muted">Work on: ${weak.map(esc).join(" · ")}</p>` : ""}
  </div>`;
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
    ${live && line && dialerCall.connectedAt ? `<button data-dial="drop-vm" title="Key V">📼 Drop voicemail</button>` : ""}
    ${live && line ? `<button data-dial="mute">${dialerMuted ? "Unmute" : "Mute"}</button><button class="primary" data-dial="hangup">Hang up</button>` : ""}
    ${live && !line ? `<button data-dial="hangup">Done</button>` : ""}
  </div>`;
}

// ---------- rendering ----------

function yearsOwned(lead) {
  const d = lead.info && lead.info.saleDate;
  return d ? Math.max(0, Math.floor((Date.now() - new Date(d + "T12:00:00")) / (365.25 * 86400000))) : 0;
}

function propertyIntel(lead) {
  const i = lead.info;
  if (!i) return "";
  const yrs = yearsOwned(lead);
  const facts = [
    i.beds ? `${i.beds} bd` : "", i.baths ? `${i.baths} ba` : "", i.sqft ? `${Math.round(i.sqft).toLocaleString()} sqft` : "",
    i.yrBuilt ? `built ${i.yrBuilt}` : "",
  ].filter(Boolean).join(" · ");
  const sale = i.saleAmt || i.saleDate ? `Bought ${i.saleDate ? new Date(i.saleDate + "T12:00:00").toLocaleDateString([], { month: "short", year: "numeric" }) : ""}${i.saleAmt ? ` for $${Math.round(i.saleAmt).toLocaleString()}` : ""}${yrs ? ` · owned ${yrs} yr${yrs === 1 ? "" : "s"}` : ""}` : "";
  const tags = [
    i.absentee ? `<span class="tag">Absentee owner${i.mail ? `: mail goes to ${esc(i.mail)}` : ""}</span>` : "",
    i.dnm ? `<span class="tag">Do not mail</span>` : "",
    i.hood ? `<span class="tag">${esc(i.hood)}</span>` : "",
  ].join(" ");
  const tip = yrs >= 7 ? "Long-time owner: likely big equity. Ask what they'd do with it." : i.absentee ? "Landlord or second home: ask about their plans for the property." : "";
  return `<div class="dial-intel">
    ${facts ? `<div>🏠 ${esc(facts)}</div>` : ""}
    ${sale ? `<div>📈 ${esc(sale)}</div>` : ""}
    ${tags.trim() ? `<div>${tags}</div>` : ""}
    ${tip ? `<div class="muted">💡 ${esc(tip)}</div>` : ""}
  </div>`;
}

function fillVars(text, lead) {
  const street = (lead.address || "").replace(/^\d+[\w-]*\s+/, "").trim();
  return String(text || "")
    .replace(/\{first\}/g, titleCase(firstName(lead.name)) || "there")
    .replace(/\{name\}/g, titleCase(lead.name))
    .replace(/\{street\}/g, titleCase(street) || "your street")
    .replace(/\{address\}/g, titleCase(lead.address) || "your home")
    .replace(/\{myphone\}/g, state.dialer.myPhone || phonePretty(dialerSettings().callerId) || "")
    .replace(/\{report\}/g, state.dialer.reportLink || "(I'll send it over shortly)")
    .replace(/\{years\}/g, yearsOwned(lead) ? `${yearsOwned(lead)} years` : "a while")
    .replace(/\{circle\}/g, dialerCircle ? titleCase(dialerCircle.address) : "a home nearby");
}

const CIRCLE_KIND = { sold: "just sold", listed: "just hit the market", coming: "is coming on the market soon" };

function scriptFor(lead) {
  let s = fillVars(state.dialer.script || DEFAULT_SCRIPT, lead);
  if (dialerFilter === "circle" && dialerCircle) {
    s = fillVars(`CIRCLE OPENER\nHi {first}, this is Devin Brown with Unique Lifestyle Realty. I'm calling a few neighbors because the home at {circle} ${CIRCLE_KIND[dialerCircle.kind] || "just sold"}, and most people like to know what that means for their own value. Had you heard about it?\n\n`, lead) + s;
  }
  return s;
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
    <p class="muted">Drop in the Excel file Equity Title sends (Likely Listings) or any CSV. The dialer finds the owner, address, phones and property details automatically and skips numbers marked DNC. Owners already in your dialer aren't duplicated: a skip-trace file you import later just adds phone numbers to them.</p>
    <form id="dial-import" class="row">
      <input name="name" placeholder="List name (e.g. 12th & Union farm)">
      <label class="ghost btn-file">Choose CSV<input type="file" name="file" accept=".csv,.xlsx,.xls,text/csv" hidden></label>
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
    <div class="muted dial-tips"><strong>Keep the business line off “Spam Likely”:</strong>
      <ul>
        <li>Register it free at <a href="https://www.freecallerregistry.com" target="_blank" rel="noopener">freecallerregistry.com</a> (covers AT&T, T-Mobile and Verizon spam labels).</li>
        <li>In Telnyx, set the caller name (CNAM) to “Devin Brown” or “Unique Lifestyle”.</li>
        <li>Stay under ${LINE_DAILY_SOFT_CAP} dials a day on one number, and let it ring 4–5 times before hanging up.</li>
        <li>First week: call a few friends who'll pick up and talk a minute or two. Answered calls build the number's reputation.</li>
      </ul></div>
    <label class="muted" style="display:block;margin-top:8px"><input type="checkbox" id="dial-autofub" ${state.dialer.autoFub !== false ? "checked" : ""}> Send Call back, Interested and Appointment leads to Follow Up Boss automatically</label>
    <h4>3. Your script</h4>
    <p class="muted">Use {first}, {street}, {name}, {address}, {years} (how long they've owned it) and {myphone}. Washington requires you to say your name, your company and why you're calling within the first 30 seconds.</p>
    <textarea id="dial-script" style="min-height:220px">${esc(state.dialer.script || DEFAULT_SCRIPT)}</textarea>
    <div class="btn-row"><button data-dial="reset" data-field="script">Reset to default script</button></div>
    <h4>4. Voicemail</h4>
    <p class="muted">Your callback number: <input id="dial-myphone" value="${esc(state.dialer.myPhone || "")}" placeholder="(253) 555-0100" style="max-width:200px"></p>
    <textarea id="dial-vm" style="min-height:100px">${esc(state.dialer.vmScript || DEFAULT_VM)}</textarea>
    <p class="muted">Record it once (generic, no names, under 25 seconds). On a business-line call, tap 📼 Drop voicemail (or press V) after the beep: it plays your recording, hangs up and logs Left voicemail. On your phone, read the script shown under the call script. The recording stays on this device.</p>
    <div class="btn-row">
      <button data-dial="vm-rec" class="${dialerVmRec ? "primary" : ""}">${dialerVmRec ? "⏹ Stop" : "🎙 Record voicemail"}</button>
      ${dialerVm ? `<button data-dial="vm-play">▶ Play (${dialerVm.secs}s)</button><button data-dial="vm-del">Delete</button>` : ""}
      <button data-dial="reset" data-field="vmScript">Reset script</button>
    </div>
    ${dialerVmMsg ? `<p class="muted">${esc(dialerVmMsg)}</p>` : ""}
    <h4>5. Objection cards</h4>
    <p class="muted">One card per block: first line is what they say, then your answer. Leave a blank line between cards. They show beside the script and in Practice mode.</p>
    <textarea id="dial-objections" style="min-height:220px">${esc(state.dialer.objections || DEFAULT_OBJECTIONS)}</textarea>
    <div class="btn-row"><button data-dial="reset" data-field="objections">Reset objections</button></div>
    <h4>6. Text follow-up</h4>
    <p class="muted">Only for people who say yes to a text on the call. Use {first}, {address} and {report}.</p>
    <input id="dial-report" value="${esc(state.dialer.reportLink || "")}" placeholder="Home value report link (e.g. your CMA or home value page)">
    <textarea id="dial-sms" style="min-height:90px;margin-top:6px">${esc(state.dialer.smsTemplate || DEFAULT_SMS)}</textarea>
    <div class="btn-row"><button data-dial="reset" data-field="smsTemplate">Reset text</button></div>
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
        ${leads.length - withPhone > 0 ? `<div class="muted">📵 ${leads.length - withPhone} need phone numbers (skip trace)</div>` : ""}
        <div class="muted">${ok ? `✅ DNC scrubbed ${esc(l.scrubbedOn)}` : `⚠️ Not cleared to call: confirm the National DNC scrub`}</div>
      </div>
      ${ok ? "" : `<button data-dial="scrub" data-id="${l.id}">I scrubbed it today</button>`}
      ${leads.length - withPhone > 0 ? `<button data-dial="skiptrace" data-id="${l.id}">Skip trace file</button>` : ""}
      <button data-dial="export" data-id="${l.id}">Export</button>
      <button class="x neg" data-dial="del-list" data-id="${l.id}" title="Delete list">✕</button>
    </li>`;
  }).join("");
  return `<div class="card" style="margin-top:16px"><h3>Lists</h3><ul class="list">${rows}</ul>
    <p class="muted">Before calling, check each list against the National Do Not Call Registry (your first 5 area codes are free at telemarketing.donotcall.gov) and your brokerage's list. Re-check every 31 days.</p>
    <p class="muted"><strong>Fastest way:</strong> download the registry numbers for your area codes (253, 206 and so on) from telemarketing.donotcall.gov, unzip, and upload the file here. Every match is flagged and skipped, and each list it fully covers is cleared for 31 days.</p>
    <label class="ghost btn-file">Upload DNC registry file<input type="file" id="dial-dncfile" accept=".txt,.csv,text/plain,text/csv" hidden></label>
    ${dialerDncMsg ? `<p class="muted">${esc(dialerDncMsg)}</p>` : ""}</div>`;
}

function renderObjectionCards(lead) {
  const objs = objectionsList();
  if (!objs.length) return "";
  return `<div class="card dial-script"><h3>Objections <span class="muted">(tap to open)</span></h3>
    ${objs.map((o) => `<details class="dial-obj"><summary>${esc(o.q)}</summary><pre>${esc(fillVars(o.a, lead))}</pre></details>`).join("")}</div>`;
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

  const statsCard = `<div class="card dial-stats" data-haki="1"><div class="stats">
      <div class="stat"><div class="label">Dials today</div><div class="value">${log.length}</div></div>
      <div class="stat"><div class="label">Conversations</div><div class="value">${talked}</div></div>
      <div class="stat"><div class="label">Appointments</div><div class="value pos">${appts}</div></div>
      <div class="stat"><div class="label">In queue</div><div class="value">${queueLeads().length}</div></div>
    </div>
    <div class="muted">${hoursOk ? `Calling window open until ${CALL_END_HOUR - 12}pm.` : `Calling window is closed (${CALL_START_HOUR}am–${CALL_END_HOUR - 12}pm). Use this time to import and scrub lists.`}
    ${s.mode === "line" ? ` · Business line: ${lineDials}/${LINE_DAILY_SOFT_CAP} dials today${lineDials >= LINE_DAILY_SOFT_CAP ? " ⚠️ slow down to protect the number from spam labels" : ""}` : " · Calling from your phone"}</div>
    ${sessionHtml()}</div>`;

  if (dialerVm === undefined) vmLoad().then(() => { if (currentTab === "dialer") render(); });

  if (dialerPractice) {
    return `<h2 class="dial-title">Dialer</h2>${statsCard}<div style="margin-top:16px">${renderPractice()}</div>`;
  }

  if (!d.lists.length) {
    return `<h2 class="dial-title">Dialer</h2>${statsCard}${renderDialerSetup()}`;
  }

  const emptyMsg = dialerFilter === "queue" ? "Nobody left to call right now. Import a new list, or check Callbacks."
    : dialerFilter === "circle" ? (dialerCircle ? `No callable neighbors on ${titleCase(dialerCircle.street)} in your lists.` : "Enter the address that just sold or listed to call its neighbors first.")
    : "Nobody here yet.";
  let leadCard = `<div class="card dial-lead"><p class="muted">${esc(emptyMsg)}</p></div>`;
  let scriptCards = "";
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
      ${propertyIntel(lead)}
      ${ok ? "" : `<p class="dial-warn">This list isn't cleared to call yet. Confirm the National DNC scrub in Lists.</p>`}
      <div id="dialer-callbar">${callBarHtml()}</div>
      ${phones}
      <h4>How did it go? <span class="muted">(keys 1–8)</span></h4>
      <div class="dial-outcomes">${OUTCOMES.map((o) => `<button data-dial="outcome" data-outcome="${o.id}" data-phone="${lastPhone}" ${lastPhone ? "" : "disabled"}><span class="k">${o.key}</span>${o.label}</button>`).join("")}</div>
      <div class="row" style="display:flex;gap:6px;margin-top:8px;align-items:center">
        <label class="muted">Call back on <input type="date" id="dial-cb" value="${esc(lead.callbackDate || addDays(todayStr(), 2))}"></label>
      </div>
      <textarea id="dial-notes" placeholder="Notes (motivation, timeline, best time to call)" style="min-height:70px;margin-top:8px">${esc(lead.notes || "")}</textarea>
      <div class="btn-row"><button data-dial="sms" data-phone="${lastPhone}" ${lastPhone ? "" : "disabled"}>📱 Text the report (only if they said yes)</button></div>
      ${(() => { const c = lead.crmId && state.crm.contacts.find((x) => x.id === lead.crmId); return c ? `<p class="muted">✅ In your Daily 20 CRM${c.fub === "synced" ? " · ✅ Follow Up Boss" : c.fub === "failed" ? ` · Follow Up Boss failed: ${esc(c.fubError || "")}` : ""}</p>` : ""; })()}
    </div>`;
    scriptCards = `<div class="card dial-script"><h3>Script</h3><pre>${esc(scriptFor(lead))}</pre>
      <details style="margin-top:10px"><summary><strong>Voicemail script</strong></summary><pre>${esc(fillVars(state.dialer.vmScript || DEFAULT_VM, lead))}</pre></details></div>
    ${renderObjectionCards(lead)}`;
  }

  const circleForm = dialerFilter === "circle" ? `<form id="dial-circle" class="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      <input name="address" placeholder="Address that just sold, e.g. 1215 S Union Ave" value="${esc(dialerCircle ? dialerCircle.address : "")}" style="flex:1;min-width:180px">
      <select name="kind">${Object.entries({ sold: "Just sold", listed: "Just listed", coming: "Coming soon" }).map(([k, v]) => `<option value="${k}" ${dialerCircle && dialerCircle.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      <button class="primary">Find neighbors</button></form>` : "";

  const rows = leads.slice(0, 200).map((l) => `<li class="${lead && l.id === lead.id ? "on" : ""}">
      <button class="x grow dial-row" data-dial="pick" data-id="${l.id}"><strong>${esc(titleCase(l.name) || "Owner")}</strong>
        <span class="muted">${esc(titleCase(l.address))} · ${esc(statusLabel(l))}</span></button>
    </li>`).join("");

  return `<h2 class="dial-title">Dialer</h2>
    ${statsCard}
    <div class="dial-grid">
      <div class="dial-col-a">${leadCard}</div>
      <div class="dial-col-b">${scriptCards}</div>
      <div class="card dial-queue">
        <div class="row" style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="dial-filter">
            <option value="queue" ${dialerFilter === "queue" ? "selected" : ""}>Up next</option>
            <option value="callbacks" ${dialerFilter === "callbacks" ? "selected" : ""}>Callbacks</option>
            <option value="all" ${dialerFilter === "all" ? "selected" : ""}>Everyone</option>
            <option value="circle" ${dialerFilter === "circle" ? "selected" : ""}>Circle a sale (neighbors first)</option>
          </select>
          ${dialerFilter === "circle" ? "" : `<select id="dial-list"><option value="">All lists</option>${listOpts}</select>`}
        </div>
        ${circleForm}
        <p class="muted">${leads.length} ${dialerFilter === "queue" || dialerFilter === "circle" ? "to call" : "owners"}${dialerFilter === "circle" ? ", closest house numbers first" : ""}${leads.length > 200 ? " (showing 200)" : ""}</p>
        <ul class="list">${rows}</ul>
      </div>
    </div>
    <div class="dial-lower">${renderStats()}${renderLists()}</div>
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
    case "skiptrace": exportSkipTrace(id); return;
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
    case "reset": {
      const defs = { script: DEFAULT_SCRIPT, vmScript: DEFAULT_VM, objections: DEFAULT_OBJECTIONS, smsTemplate: DEFAULT_SMS };
      const f = btn.dataset.field;
      if (defs[f] && confirm("Replace this with the default version?")) { state.dialer[f] = defs[f]; save(); render(); }
      return;
    }
    case "drop-vm": dropVoicemail(); return;
    case "sms": {
      const lead = dialerLead();
      if (lead && btn.dataset.phone) textReport(lead, btn.dataset.phone);
      return;
    }
    case "vm-rec": vmRecordToggle(); return;
    case "vm-play": vmPlay(); return;
    case "vm-del":
      if (confirm("Delete your recorded voicemail?")) { await vmSave(null); dialerVmMsg = ""; render(); }
      return;
    case "session-start": {
      const dials = parseInt(prompt("Dial goal for this session?", "50"), 10);
      if (!dials) return;
      const talks = parseInt(prompt("Conversation goal?", "5"), 10) || 5;
      saveDialerSettings({ session: { start: Date.now(), goalDials: dials, goalTalks: talks } });
      render();
      return;
    }
    case "session-end": {
      const ss = dialerSettings().session;
      if (ss) {
        const s = summarize(state.dialer.log.filter((x) => (x.ts || 0) >= ss.start));
        alert(`Session done: ${Math.floor((Date.now() - ss.start) / 60000)} min, ${s.dials} dials, ${s.reached} conversations, ${s.appts} appointments.`);
      }
      saveDialerSettings({ session: null });
      render();
      return;
    }
    case "practice": stashNotes(); save(); newPracticeRep(); render(); return;
    case "spar": stashNotes(); save(); if (window.openSpar) window.openSpar(); return;
    case "practice-end": dialerPractice = null; render(); return;
    case "pr-skip": newPracticeRep(); render(); return;
    case "pr-opener":
      dialerPractice.openerSecs = Math.round((Date.now() - dialerPractice.startedAt) / 1000);
      dialerPractice.step = "objection";
      render();
      return;
    case "pr-reveal": dialerPractice.reveal = true; render(); return;
    case "pr-score": {
      const ps = dialerSettings();
      const scores = { ...(ps.practiceScores || {}) };
      const q = dialerPractice.obj.q;
      const cur = { hit: 0, miss: 0, ...(scores[q] || {}) };
      btn.dataset.hit === "1" ? cur.hit++ : cur.miss++;
      scores[q] = cur;
      const reps = ps.practiceDate === todayStr() ? (ps.practiceReps || 0) + 1 : 1;
      saveDialerSettings({ practiceScores: scores, practiceReps: reps, practiceDate: todayStr() });
      newPracticeRep();
      render();
      return;
    }
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
  else if (el.id === "dial-vm") { state.dialer.vmScript = el.value; save(); }
  else if (el.id === "dial-objections") { state.dialer.objections = el.value; save(); }
  else if (el.id === "dial-sms") { state.dialer.smsTemplate = el.value; save(); }
  else if (el.id === "dial-report") { state.dialer.reportLink = el.value.trim(); save(); }
  else if (el.id === "dial-myphone") { state.dialer.myPhone = el.value.trim(); save(); }
  else if (el.id === "dial-autofub") { state.dialer.autoFub = el.checked; save(); }
  else if (el.id === "dial-range") { dialerStatsRange = el.value; render(); }
  else if (el.id === "dial-dncfile") {
    const file = el.files[0];
    if (!file) return;
    dialerDncMsg = "Checking the registry file…";
    render();
    scanDncFile(file).then((msg) => { dialerDncMsg = msg; render(); })
      .catch(() => { dialerDncMsg = "Couldn't read that file. Unzip the registry download and upload the .txt file."; render(); });
  }
  else if (el.name === "file" && el.closest("#dial-import")) {
    const file = el.files[0];
    if (!file) return;
    const name = el.form.elements.name.value.trim() || file.name.replace(/\.(csv|xlsx?)$/i, "").replace(/^[0-9a-f]{8}-/, "").replace(/_/g, " ").replace(/\s*Likely Listings.*$/i, "");
    const isSheet = /\.xlsx?$/i.test(file.name);
    dialerImportMsg = "Reading the file…";
    render();
    (isSheet ? readSheetRows(file).then((rows) => importDialerRows(rows, name)) : file.text().then((text) => importDialerCsv(text, name)))
      .then((msg) => { dialerImportMsg = msg; render(); })
      .catch((err) => { dialerImportMsg = "Couldn't read that file: " + err.message; render(); });
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
  } else if (f.id === "dial-circle") {
    e.preventDefault();
    const a = parseStreetAddress(f.address.value);
    if (!a) { alert("Enter a street address with a house number, e.g. 1215 S Union Ave."); return; }
    stashNotes();
    save();
    dialerCircle = { address: f.address.value.trim(), num: a.num, street: a.street, kind: f.kind.value };
    dialerCurrentId = null;
    render();
  }
});

document.addEventListener("keydown", (e) => {
  if (currentTab !== "dialer" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains("spar-open")) return; // keys belong to the practice call
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
  if (e.key === "v" || e.key === "V") {
    const vb = document.querySelector('[data-dial="drop-vm"]');
    if (vb) { e.preventDefault(); dropVoicemail(); }
    return;
  }
  const o = OUTCOMES.find((x) => x.key === e.key);
  if (!o) return;
  const btn = document.querySelector(`[data-dial="outcome"][data-outcome="${o.id}"]`);
  if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
});

window.addEventListener("beforeunload", () => {
  if (telnyxClient) { try { telnyxClient.disconnect(); } catch (e) { /* closing anyway */ } }
});

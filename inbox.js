// Inbox tab: connects to Gmail in the browser, sorts recent senders into
// potential clients / keep / unsubscribe / archive, and finds storage hogs.
// Nothing is changed in Gmail without a confirm. Scan results stay in memory only.
// Loaded before app.js. Uses state, save, render, uid, esc, todayStr, addDays, sendToFub at runtime.

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

// Senders that are always business mail. Edit the list in the Inbox settings.
const DEFAULT_KEEP = [
  "followupboss.com", "ebay.com", "uniquelifestylerealty.com", "nwmls.com",
  "title", "escrow", "mortgage", "lending", "docusign", "dotloop", "skyslope",
].join("\n");

// Emails from these sites are usually lead notifications.
const LEAD_DOMAINS = ["zillow.com", "realtor.com", "homes.com", "redfin.com", "homelight.com", "opcity.com", "followupboss.com"];
const PERSONAL_DOMAINS = ["gmail.com", "yahoo.com", "icloud.com", "me.com", "outlook.com", "hotmail.com", "live.com", "aol.com", "msn.com", "comcast.net"];
const LEAD_WORDS = /\b(buy|buying|sell|selling|home|house|condo|townhome|listing|showing|tour|pre-?approv\w*|offer|mortgage|moving|relocat\w*|interested|inquiry|home value|cma|homebuyer|first[- ]time|open house)\b/i;

// Scan results live here, not in saved state, so email details never land in backups.
let inboxScan = null;
let inboxToken = null;
let inboxBusy = "";

function inboxSettings() {
  state.inbox = { clientId: "", scanSize: 500, keep: DEFAULT_KEEP, ...(state.inbox || {}) };
  return state.inbox;
}

function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from || "");
  const email = (m ? m[2] : from || "").trim().toLowerCase();
  const name = (m ? m[1] : "").trim() || email.split("@")[0];
  return { name, email, domain: email.split("@")[1] || "" };
}

function header(msg, name) {
  const h = (msg.payload && msg.payload.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function unsubscribeLink(value) {
  const links = (value.match(/<([^>]+)>/g) || []).map((l) => l.slice(1, -1));
  return links.find((l) => l.startsWith("http")) || links.find((l) => l.startsWith("mailto:")) || "";
}

function mb(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------- Gmail ----------

async function gmail(path, options = {}) {
  const res = await fetch(GMAIL_API + path, {
    ...options,
    headers: { Authorization: `Bearer ${inboxToken}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) {
    inboxToken = null;
    throw new Error("Your Google sign-in expired. Click Connect Gmail again.");
  }
  if (!res.ok) throw new Error(`Gmail error ${res.status}`);
  return res.status === 204 ? {} : res.json();
}

// Runs tasks a few at a time to stay under Gmail's rate limits.
async function inBatches(items, size, task, onProgress) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(task))));
    if (onProgress) onProgress(Math.min(items.length, i + size), items.length);
  }
  return out;
}

function loadGoogleScript() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Couldn't load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
}

async function connectGmail() {
  const { clientId } = inboxSettings();
  if (!clientId) {
    alert("Add your Google client ID in Inbox settings first.");
    return;
  }
  try {
    await loadGoogleScript();
    google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          alert(`Google sign-in failed: ${resp.error}`);
          return;
        }
        inboxToken = resp.access_token;
        scanInbox();
      },
    }).requestAccessToken();
  } catch (err) {
    alert(err.message);
  }
}

function setBusy(text) {
  inboxBusy = text;
  if (currentTab === "inbox") render();
}

async function scanInbox() {
  const limit = Math.min(1000, Math.max(50, Number(inboxSettings().scanSize) || 500));
  try {
    setBusy("Finding emails…");
    let ids = [];
    let pageToken = "";
    while (ids.length < limit) {
      const page = await gmail(`/messages?q=${encodeURIComponent("in:inbox")}&maxResults=${Math.min(500, limit - ids.length)}${pageToken ? `&pageToken=${pageToken}` : ""}`);
      ids.push(...(page.messages || []).map((m) => m.id));
      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }
    const fields = ["From", "Subject", "List-Unsubscribe", "Date"].map((h) => `metadataHeaders=${h}`).join("&");
    const messages = await inBatches(ids, 10, (id) => gmail(`/messages/${id}?format=metadata&${fields}`),
      (done, total) => setBusy(`Reading ${done} of ${total} emails…`));
    inboxScan = { at: new Date().toLocaleString(), senders: groupSenders(messages), messages };
    setBusy("");
  } catch (err) {
    setBusy("");
    alert(err.message);
  }
}

function groupSenders(messages) {
  const bySender = new Map();
  for (const msg of messages) {
    const from = parseFrom(header(msg, "From"));
    if (!from.email) continue;
    const s = bySender.get(from.email) || { ...from, ids: [], size: 0, unread: 0, unsubscribe: "", labels: new Set(), latest: null };
    s.ids.push(msg.id);
    s.size += msg.sizeEstimate || 0;
    if ((msg.labelIds || []).includes("UNREAD")) s.unread++;
    (msg.labelIds || []).forEach((l) => s.labels.add(l));
    s.unsubscribe = s.unsubscribe || unsubscribeLink(header(msg, "List-Unsubscribe"));
    const date = Number(msg.internalDate) || 0;
    if (!s.latest || date > s.latest.date) {
      s.latest = { id: msg.id, date, subject: header(msg, "Subject"), snippet: msg.snippet || "" };
    }
    bySender.set(from.email, s);
  }
  return [...bySender.values()].map((s) => ({ ...s, group: classify(s) }));
}

// Sorts one sender into a bucket. Order matters: keep rules always win.
function classify(s) {
  const keep = inboxSettings().keep.split("\n").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const inCrm = state.crm.contacts.some((c) => c.email && c.email.toLowerCase() === s.email);
  if (inCrm) return "client";
  if (keep.some((k) => s.email.includes(k) || s.name.toLowerCase().includes(k))) return "keep";
  const text = `${s.latest.subject} ${s.latest.snippet}`;
  const isBulk = !!s.unsubscribe || s.labels.has("CATEGORY_PROMOTIONS");
  if (LEAD_DOMAINS.some((d) => s.domain.endsWith(d)) && LEAD_WORDS.test(text)) return "lead";
  if (!isBulk && PERSONAL_DOMAINS.includes(s.domain) && LEAD_WORDS.test(text)) return "lead";
  if (isBulk && (s.ids.length >= 3 || s.unread === s.ids.length)) return "unsubscribe";
  if (s.labels.has("CATEGORY_SOCIAL") || s.labels.has("CATEGORY_UPDATES") || s.labels.has("CATEGORY_FORUMS")) return "archive";
  return "review";
}

async function archiveSender(email) {
  const s = inboxScan.senders.find((x) => x.email === email);
  if (!s || !confirm(`Archive ${s.ids.length} email${s.ids.length > 1 ? "s" : ""} from ${s.name}? They leave your inbox but stay in All Mail.`)) return;
  try {
    setBusy(`Archiving ${s.name}…`);
    await gmail("/messages/batchModify", { method: "POST", body: JSON.stringify({ ids: s.ids, removeLabelIds: ["INBOX"] }) });
    inboxScan.senders = inboxScan.senders.filter((x) => x.email !== email);
    setBusy("");
  } catch (err) {
    setBusy("");
    alert(err.message);
  }
}

async function trashSender(email) {
  const s = inboxScan.senders.find((x) => x.email === email);
  if (!s || !confirm(`Move ${s.ids.length} email${s.ids.length > 1 ? "s" : ""} from ${s.name} to Trash? You can restore them from Gmail's Trash for 30 days.`)) return;
  try {
    setBusy(`Moving ${s.name} to Trash…`);
    await inBatches(s.ids, 10, (id) => gmail(`/messages/${id}/trash`, { method: "POST" }));
    inboxScan.senders = inboxScan.senders.filter((x) => x.email !== email);
    inboxScan.messages = inboxScan.messages.filter((m) => !s.ids.includes(m.id));
    setBusy("");
  } catch (err) {
    setBusy("");
    alert(err.message);
  }
}

function addLeadToCrm(email) {
  const s = inboxScan.senders.find((x) => x.email === email);
  if (!s) return;
  const [firstName, ...rest] = s.name.split(" ");
  const contact = {
    id: uid(), firstName, lastName: rest.join(" "), phone: "", email: s.email,
    source: "Email", stage: "Lead", nextFollowUp: todayStr(),
    notes: `From email: "${s.latest.subject}"`,
    createdAt: new Date().toISOString(), lastContact: "", fub: "", fubError: "", review: "", reviewAsked: "",
  };
  state.crm.contacts.push(contact);
  s.group = "client";
  save();
  render();
  if (fubSettings().passcode) sendToFub(contact);
}

// ---------- rendering ----------

function gmailLink(id) {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}

function senderRow(s, actions) {
  return `<li>
    <span class="grow"><strong>${esc(s.name)}</strong> <span class="muted">${esc(s.email)} · ${s.ids.length} email${s.ids.length > 1 ? "s" : ""} · ${mb(s.size)}</span>
      <br><a class="muted" href="${gmailLink(s.latest.id)}" target="_blank" rel="noopener">${esc(s.latest.subject || "(no subject)")}</a></span>
    <span class="btn-row">${actions}</span>
  </li>`;
}

function renderInbox() {
  const settings = inboxSettings();
  const scan = inboxScan;
  const groups = { lead: [], client: [], keep: [], unsubscribe: [], archive: [], review: [] };
  if (scan) scan.senders.forEach((s) => groups[s.group].push(s));
  Object.values(groups).forEach((list) => list.sort((a, b) => b.ids.length - a.ids.length));
  const hogs = scan ? [...scan.messages].sort((a, b) => (b.sizeEstimate || 0) - (a.sizeEstimate || 0)).slice(0, 10) : [];
  const archiveBtn = (s) => `<button data-inbox="archive" data-email="${esc(s.email)}">Archive all</button>`;
  const trashBtn = (s) => `<button data-inbox="trash" data-email="${esc(s.email)}">Trash all</button>`;
  const unsubBtn = (s) => s.unsubscribe ? `<a class="ghost" href="${esc(s.unsubscribe)}" target="_blank" rel="noopener">Unsubscribe</a>` : "";

  const status = inboxBusy
    ? `<p><strong>${esc(inboxBusy)}</strong></p>`
    : scan
      ? `<p class="muted">Scanned ${scan.messages.length} inbox emails from ${scan.senders.length} senders at ${esc(scan.at)}.</p>`
      : `<p class="muted">${inboxToken ? "Connected." : "Not connected yet."} Nothing is changed in Gmail unless you click a button and confirm.</p>`;

  return `<div class="grid">
    <div class="card" style="--tab:#ff4fd8">
      <h2>Inbox</h2>
      ${status}
      <div class="btn-row">
        ${inboxToken
          ? `<button class="primary" data-inbox="scan" ${inboxBusy ? "disabled" : ""}>Scan inbox</button>`
          : `<button class="primary" data-inbox="connect">Connect Gmail</button>`}
      </div>
      ${scan ? `<div class="stats" style="margin-top:10px">
        <div class="stat"><div class="label">Potential clients</div><div class="value pos">${groups.lead.length}</div></div>
        <div class="stat"><div class="label">Unsubscribe</div><div class="value">${groups.unsubscribe.length}</div></div>
        <div class="stat"><div class="label">Archive</div><div class="value">${groups.archive.length}</div></div>
        <div class="stat"><div class="label">Keep</div><div class="value">${groups.client.length + groups.keep.length}</div></div>
      </div>` : ""}
    </div>

    <div class="card">
      <h3>🔥 Potential clients</h3>
      <ul class="list">${groups.lead.map((s) => senderRow(s,
        `<button class="primary" data-inbox="lead" data-email="${esc(s.email)}">Add to CRM</button>`)).join("") ||
        `<li class="muted">${scan ? "No new leads found in this scan." : "Scan your inbox to find people asking about buying or selling."}</li>`}</ul>
      <p class="muted">People writing about buying, selling, showings or pre-approval, plus Zillow and Realtor.com leads. Add to CRM puts them in your Daily 20 as a Lead due today${fubSettings().passcode ? " and sends them to Follow Up Boss" : ""}.</p>
    </div>
  </div>

  ${scan ? `<div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>🚫 Unsubscribe</h3>
      <ul class="list">${groups.unsubscribe.slice(0, 25).map((s) => senderRow(s, unsubBtn(s) + archiveBtn(s) + trashBtn(s))).join("") || `<li class="muted">Nothing here.</li>`}</ul>
      <p class="muted">Mailing lists that email you a lot. Unsubscribe opens the sender's own unsubscribe page.</p>
    </div>

    <div class="card">
      <h3>📦 Archive</h3>
      <ul class="list">${groups.archive.slice(0, 25).map((s) => senderRow(s, archiveBtn(s) + trashBtn(s))).join("") || `<li class="muted">Nothing here.</li>`}</ul>
      <p class="muted">Notifications and social updates. Archiving keeps them searchable in All Mail.</p>
    </div>
  </div>

  <div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>✅ Keep</h3>
      <ul class="list">${[...groups.client, ...groups.keep].slice(0, 30).map((s) => `<li><span class="grow"><strong>${esc(s.name)}</strong> <span class="muted">${esc(s.email)} · ${s.ids.length}</span></span>
        <span class="muted">${s.group === "client" ? "In your CRM" : "Business"}</span></li>`).join("") || `<li class="muted">Nothing matched your keep list.</li>`}</ul>
      <p class="muted">Clients in your CRM and senders on your keep list. These never get archive or trash buttons.</p>
    </div>

    <div class="card">
      <h3>💾 Storage hogs</h3>
      <ul class="list">${hogs.map((m) => `<li><span class="grow"><a href="${gmailLink(m.id)}" target="_blank" rel="noopener">${esc(header(m, "Subject") || "(no subject)")}</a>
        <br><span class="muted">${esc(parseFrom(header(m, "From")).name)}</span></span><span>${mb(m.sizeEstimate || 0)}</span></li>`).join("")}</ul>
      <p class="muted">Your biggest emails in this scan. To free space across your whole account, search Gmail for <strong>larger:10M</strong>.</p>
    </div>

    <div class="card">
      <h3>👀 Review yourself</h3>
      <ul class="list">${groups.review.slice(0, 20).map((s) => senderRow(s, archiveBtn(s))).join("") || `<li class="muted">Nothing here.</li>`}</ul>
      <p class="muted">Everything else, most frequent first.</p>
    </div>
  </div>` : ""}

  <details class="card" style="margin-top:16px" ${settings.clientId ? "" : "open"}>
    <summary><strong>Inbox settings</strong></summary>
    <form class="row" data-inbox-form="settings">
      <input name="clientId" placeholder="Google OAuth client ID (ends in .apps.googleusercontent.com)" value="${esc(settings.clientId)}" style="flex-basis:100%">
      <label class="muted">Emails to scan <input type="number" name="scanSize" min="50" max="1000" step="50" value="${esc(settings.scanSize)}" style="width:90px"></label>
      <label class="muted" style="flex-basis:100%;display:block">Always keep (one per line: an email, a domain, or a word in the sender's name)
        <textarea name="keep">${esc(settings.keep)}</textarea></label>
      <button class="primary">Save settings</button>
    </form>
    <p class="muted">Your Google sign-in lasts about an hour and is never saved. Scan results are only kept until you close the app, and they're never included in Export backup.</p>
  </details>`;
}

// ---------- events ----------

const inboxView = document.getElementById("view");

inboxView.addEventListener("click", (e) => {
  if (currentTab !== "inbox") return;
  const btn = e.target.closest("button[data-inbox]");
  if (!btn) return;
  e.preventDefault();
  const email = btn.dataset.email;
  if (btn.dataset.inbox === "connect") connectGmail();
  else if (btn.dataset.inbox === "scan") scanInbox();
  else if (btn.dataset.inbox === "archive") archiveSender(email);
  else if (btn.dataset.inbox === "trash") trashSender(email);
  else if (btn.dataset.inbox === "lead") addLeadToCrm(email);
});

inboxView.addEventListener("submit", (e) => {
  if (currentTab !== "inbox" || e.target.dataset.inboxForm !== "settings") return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const settings = inboxSettings();
  settings.clientId = f.clientId.trim();
  settings.scanSize = Math.min(1000, Math.max(50, Number(f.scanSize) || 500));
  settings.keep = f.keep;
  save();
  render();
});

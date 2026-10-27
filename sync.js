// Cloud sync: keeps one copy of the Command Center on the fromstart2keys site (/api/cc-sync),
// so phone and laptop share the same data. Uses the same site link and passcode as the
// Follow Up Boss connection in CRM settings.
// Loaded before app.js. Uses state, load, render, STORAGE_KEY and fubSettings at runtime.

const SYNC_KEY = "command-center-sync"; // per-device: on/off, last cloud version seen, unsent changes
const SYNC_DELAY_MS = 1500;
const SYNC_PULL_EVERY_MS = 120000;

let syncTimer = null;
let syncStatus = "";
let syncing = false;

function syncMeta() {
  try {
    return { enabled: false, version: null, dirty: false, lastSync: "", ...JSON.parse(localStorage.getItem(SYNC_KEY) || "{}") };
  } catch (e) {
    return { enabled: false, version: null, dirty: false, lastSync: "" };
  }
}

function setSyncMeta(patch) {
  const meta = { ...syncMeta(), ...patch };
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(meta));
  } catch (e) {
    // storage blocked: sync still works for this session
  }
  return meta;
}

function syncUrl() {
  const { url } = fubSettings();
  return url ? url.replace(/\/api\/[^/]*$/, "/api/cc-sync") : "";
}

function setSyncStatus(text) {
  syncStatus = text;
  const el = document.getElementById("sync-status");
  if (el) el.textContent = text;
}

async function syncRequest(method, body) {
  const res = await fetch(syncUrl(), {
    method,
    headers: { "Content-Type": "application/json", "X-CRM-Passcode": fubSettings().passcode },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) return { conflict: true, ...data };
  if (res.status === 401) throw new Error("wrong passcode");
  if (res.status === 404) throw new Error("your site doesn't have sync yet");
  if (!res.ok || !data.ok) throw new Error(data.error || `error ${res.status}`);
  return data;
}

function adoptRemote(remote) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.data));
  } catch (e) {
    // fall through: state below still updates for this session
  }
  state = load();
  setSyncMeta({ version: remote.version, dirty: false, lastSync: new Date().toISOString() });
  setSyncStatus("☁ Synced");
  render();
}

// Both this device and the cloud changed. Let the person pick which copy wins.
async function resolveConflict(remote) {
  const keepCloud = confirm(
    "Your other device saved newer changes to the cloud.\n\n" +
    "OK = load the cloud copy here (recommended)\n" +
    "Cancel = replace the cloud with this device's copy"
  );
  if (keepCloud) adoptRemote(remote);
  else await syncPush(true);
}

async function syncPush(force = false) {
  const meta = syncMeta();
  if (!meta.enabled || syncing) return;
  syncing = true;
  setSyncStatus("☁ Saving…");
  try {
    const res = await syncRequest("PUT", { data: state, baseVersion: force ? undefined : meta.version });
    syncing = false;
    if (res.conflict) return resolveConflict(res);
    setSyncMeta({ version: res.version, dirty: false, lastSync: new Date().toISOString() });
    setSyncStatus("☁ Synced");
  } catch (err) {
    syncing = false;
    setSyncStatus(navigator.onLine === false ? "☁ Offline, will sync later" : `☁ Sync error: ${err.message === "Failed to fetch" || err instanceof TypeError ? "couldn't reach your site" : err.message}`);
  }
}

async function syncPull() {
  const meta = syncMeta();
  if (!meta.enabled || syncing || !syncUrl()) return;
  try {
    const remote = await syncRequest("GET");
    if (remote.version === null || remote.version === undefined) return syncPush(true); // cloud is empty
    if (remote.version === meta.version) {
      if (meta.dirty) return syncPush();
      return setSyncStatus("☁ Synced");
    }
    if (meta.dirty) return resolveConflict(remote);
    adoptRemote(remote);
  } catch (err) {
    setSyncStatus(navigator.onLine === false ? "☁ Offline" : `☁ Sync error: ${err instanceof TypeError ? "couldn't reach your site" : err.message}`);
  }
}

// Called by save() in app.js after every change.
function scheduleSync() {
  if (!syncMeta().enabled) return;
  setSyncMeta({ dirty: true });
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPush, SYNC_DELAY_MS);
}

async function enableSync() {
  const { passcode } = fubSettings();
  if (!passcode) {
    alert("Enter your site link and passcode above and tap Save settings first.");
    return;
  }
  setSyncStatus("☁ Connecting…");
  try {
    const remote = await syncRequest("GET");
    setSyncMeta({ enabled: true, version: null, dirty: false });
    if (remote.version === null || remote.version === undefined) {
      await syncPush(true); // first device: upload everything
    } else if (confirm("There's already Command Center data in the cloud.\n\nOK = load the cloud data onto this device (recommended for a new phone or laptop)\nCancel = replace the cloud with this device's data")) {
      adoptRemote(remote);
    } else {
      await syncPush(true);
    }
  } catch (err) {
    setSyncMeta({ enabled: false });
    setSyncStatus("");
    alert(`Couldn't turn on sync: ${err instanceof TypeError ? "couldn't reach your site" : err.message}. Use Test Follow Up Boss connection to check the link and passcode.`);
  }
  render();
}

function disableSync() {
  setSyncMeta({ enabled: false, version: null, dirty: false });
  setSyncStatus("");
  render();
}

function renderSyncSettings() {
  const meta = syncMeta();
  return `<div class="btn-row" style="margin-top:12px">
      ${meta.enabled
        ? `<button data-sync="now">Sync now</button><button data-sync="off">Turn off cloud sync</button>`
        : `<button class="primary" data-sync="on">Turn on cloud sync</button>`}
    </div>
    <p class="muted">${meta.enabled
      ? `Cloud sync is on${meta.lastSync ? `, last synced ${esc(new Date(meta.lastSync).toLocaleString())}` : ""}. Every change saves to your website's database, and your other devices pick it up when opened.`
      : "Cloud sync keeps your phone and laptop on the same data. It uses the site link and passcode above."}</p>`;
}

document.getElementById("view").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-sync]");
  if (!btn) return;
  e.preventDefault();
  if (btn.dataset.sync === "on") enableSync();
  else if (btn.dataset.sync === "off") disableSync();
  else if (btn.dataset.sync === "now") syncPull();
});

window.addEventListener("load", () => {
  if (syncMeta().enabled) setSyncStatus("☁ Checking…");
  syncPull();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncPull();
});
setInterval(() => {
  if (document.visibilityState === "visible") syncPull();
}, SYNC_PULL_EVERY_MS);
window.addEventListener("online", syncPull);

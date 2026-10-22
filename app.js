// Command Center: one page to run all the businesses.
// Everything is stored in localStorage under STORAGE_KEY.

const STORAGE_KEY = "command-center-v1";

// Edit this list to rename a business, change its pipeline stages or default links.
const BUSINESSES = [
  {
    id: "realestate",
    name: "From Start 2 Keys",
    subtitle: "Real estate",
    color: "#1f6feb",
    pipelineName: "Clients",
    itemLabel: "Client name",
    amountLabel: "Price / commission",
    stages: ["Lead", "Pre-approval", "Showing", "Under contract", "Closed"],
    links: [
      { label: "Website code (GitHub)", url: "https://github.com/devbrown23/fromstart2keys" },
    ],
  },
  {
    id: "dropship",
    name: "Dropshipping",
    subtitle: "Online store",
    color: "#8250df",
    pipelineName: "Products",
    itemLabel: "Product",
    amountLabel: "Profit per sale",
    stages: ["Researching", "Testing", "Winner", "Paused"],
    links: [],
  },
  {
    id: "cards",
    name: "Cards",
    subtitle: "Card selling (eBay)",
    color: "#d4a72c",
    pipelineName: "Inventory",
    itemLabel: "Card",
    amountLabel: "Price",
    stages: ["To list", "Listed", "Sold", "Shipped"],
    links: [
      { label: "eBay Seller Hub", url: "https://www.ebay.com/sh/ovw" },
    ],
  },
  {
    id: "trucking",
    name: "Vet Bros Trucking",
    subtitle: "Trucking",
    color: "#1a7f37",
    pipelineName: "Loads",
    itemLabel: "Load (origin → destination)",
    amountLabel: "Rate",
    stages: ["Booked", "In transit", "Delivered", "Invoiced", "Paid"],
    links: [],
  },
];

// ---------- state ----------

function emptyBusiness(biz) {
  return {
    goal: 0,
    money: [],     // { id, date, type: "income"|"expense", amount, note }
    todos: [],     // { id, text, done }
    pipeline: [],  // { id, title, amount, stage }
    links: biz.links.map((l) => ({ id: uid(), ...l })),
    notes: "",
  };
}

function load() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    data = {};
  }
  for (const biz of BUSINESSES) {
    data[biz.id] = { ...emptyBusiness(biz), ...(data[biz.id] || {}) };
  }
  data.crm = { ...defaultCrm(), ...(data.crm || {}) };
  return data;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert("Could not save. Your browser may be blocking storage.");
  }
}

let state = load();
let currentTab = location.hash.slice(1) || "overview";
const monthInput = document.getElementById("month");
monthInput.value = new Date().toISOString().slice(0, 7);

// ---------- helpers ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function money(n) {
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function monthTotals(bizId) {
  const month = monthInput.value;
  let income = 0, expense = 0;
  for (const m of state[bizId].money) {
    if (!m.date.startsWith(month)) continue;
    if (m.type === "income") income += m.amount;
    else expense += m.amount;
  }
  return { income, expense, profit: income - expense };
}

function progressBar(value, goal) {
  const pct = goal > 0 ? Math.min(100, Math.max(0, (value / goal) * 100)) : 0;
  return `<div class="bar"><div style="width:${pct}%"></div></div>
    <div class="muted">${goal > 0 ? `${Math.round(pct)}% of ${money(goal)} profit goal` : "No monthly goal set"}</div>`;
}

// ---------- rendering ----------

function renderTabs() {
  const tabs = [
    { id: "overview", name: "Overview", color: "var(--accent)" },
    { id: "crm", name: "Daily 20 CRM", color: "#1f6feb" },
    ...BUSINESSES,
  ];
  document.getElementById("tabs").innerHTML = tabs
    .map((t) => `<button data-tab="${t.id}" style="--tab:${t.color}" class="${t.id === currentTab ? "active" : ""}">${esc(t.name)}</button>`)
    .join("");
}

function renderOverview() {
  let totalIncome = 0, totalExpense = 0, openTodos = 0;
  const cards = BUSINESSES.map((biz) => {
    const t = monthTotals(biz.id);
    const s = state[biz.id];
    const todos = s.todos.filter((x) => !x.done);
    totalIncome += t.income;
    totalExpense += t.expense;
    openTodos += todos.length;
    const counts = biz.stages.map((st) => `${st}: ${s.pipeline.filter((p) => p.stage === st).length}`).join(" · ");
    return `<div class="card biz" style="--tab:${biz.color}" data-goto="${biz.id}">
      <div class="wanted">WANTED</div>
      <h3>${esc(biz.name)} <span class="muted">${esc(biz.subtitle)}</span></h3>
      <div class="stats">
        <div class="stat"><div class="label">Income</div><div class="value">${money(t.income)}</div></div>
        <div class="stat"><div class="label">Profit</div><div class="value ${t.profit >= 0 ? "pos" : "neg"}">${money(t.profit)}</div></div>
      </div>
      ${progressBar(t.profit, s.goal)}
      <p class="muted">${esc(biz.pipelineName)}: ${esc(counts)}</p>
      <div class="muted">Next up:</div>
      <ul class="list">${todos.slice(0, 3).map((x) => `<li><span class="grow">${esc(x.text)}</span></li>`).join("") || `<li class="muted">Nothing on the list</li>`}</ul>
    </div>`;
  }).join("");

  const profit = totalIncome - totalExpense;
  return `${renderCrmOverviewCard()}
    <div class="card" style="margin-bottom:16px">
      <h2>All businesses, ${esc(monthInput.value)}</h2>
      <div class="stats">
        <div class="stat"><div class="label">Total income</div><div class="value">${money(totalIncome)}</div></div>
        <div class="stat"><div class="label">Total expenses</div><div class="value">${money(totalExpense)}</div></div>
        <div class="stat"><div class="label">Total bounty (profit)</div><div class="value ${profit >= 0 ? "pos" : "neg"}">${money(profit)}</div></div>
        <div class="stat"><div class="label">Open to-dos</div><div class="value">${openTodos}</div></div>
      </div>
    </div>
    <div class="grid">${cards}</div>`;
}

function renderBusiness(biz) {
  const s = state[biz.id];
  const t = monthTotals(biz.id);
  const month = monthInput.value;
  const entries = s.money.filter((m) => m.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const today = new Date().toISOString().slice(0, 10);

  const columns = biz.stages.map((stage) => {
    const items = s.pipeline.filter((p) => p.stage === stage);
    return `<div class="col"><h4>${esc(stage)} (${items.length})</h4>
      ${items.map((p) => `<div class="item">
        <div class="title">${esc(p.title)}</div>
        ${p.amount ? `<div class="muted">${money(p.amount)}</div>` : ""}
        <div class="meta">
          <select data-action="move" data-id="${p.id}">
            ${biz.stages.map((st) => `<option ${st === p.stage ? "selected" : ""}>${esc(st)}</option>`).join("")}
          </select>
          <button class="x" data-action="del-pipeline" data-id="${p.id}" title="Delete">✕</button>
        </div>
      </div>`).join("")}
    </div>`;
  }).join("");

  return `<div class="grid">
    <div class="card" style="--tab:${biz.color}">
      <h2>${esc(biz.name)}, ${esc(month)}</h2>
      <div class="stats">
        <div class="stat"><div class="label">Income</div><div class="value">${money(t.income)}</div></div>
        <div class="stat"><div class="label">Expenses</div><div class="value">${money(t.expense)}</div></div>
        <div class="stat"><div class="label">Profit</div><div class="value ${t.profit >= 0 ? "pos" : "neg"}">${money(t.profit)}</div></div>
      </div>
      ${progressBar(t.profit, s.goal)}
      <form class="row" data-form="goal">
        <input type="number" name="goal" min="0" step="any" placeholder="Monthly profit goal" value="${s.goal || ""}">
        <button>Set goal</button>
      </form>
    </div>

    <div class="card">
      <h3>Money in / out</h3>
      <ul class="list">${entries.map((m) => `<li>
        <span class="muted">${esc(m.date.slice(5))}</span>
        <span class="grow">${esc(m.note) || (m.type === "income" ? "Income" : "Expense")}</span>
        <span class="${m.type === "income" ? "pos" : "neg"}">${m.type === "income" ? "+" : "-"}${money(m.amount)}</span>
        <button class="x" data-action="del-money" data-id="${m.id}" title="Delete">✕</button>
      </li>`).join("") || `<li class="muted">No entries this month</li>`}</ul>
      <form class="row" data-form="money">
        <input type="date" name="date" value="${today}" required>
        <select name="type"><option value="income">Income</option><option value="expense">Expense</option></select>
        <input type="number" name="amount" min="0" step="any" placeholder="Amount" required>
        <input name="note" placeholder="What for?">
        <button class="primary">Add</button>
      </form>
    </div>

    <div class="card">
      <h3>To-do</h3>
      <ul class="list">${s.todos.map((x) => `<li class="${x.done ? "done" : ""}">
        <input type="checkbox" data-action="toggle" data-id="${x.id}" ${x.done ? "checked" : ""}>
        <span class="grow">${esc(x.text)}</span>
        <button class="x" data-action="del-todo" data-id="${x.id}" title="Delete">✕</button>
      </li>`).join("") || `<li class="muted">Nothing yet</li>`}</ul>
      <form class="row" data-form="todo">
        <input name="text" placeholder="Add a task" required>
        <button class="primary">Add</button>
      </form>
    </div>

    <div class="card">
      <h3>Links</h3>
      <ul class="list">${s.links.map((l) => `<li>
        <a class="grow" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>
        <button class="x" data-action="del-link" data-id="${l.id}" title="Delete">✕</button>
      </li>`).join("") || `<li class="muted">No links yet</li>`}</ul>
      <form class="row" data-form="link">
        <input name="label" placeholder="Name" required>
        <input name="url" type="url" placeholder="https://..." required>
        <button class="primary">Add</button>
      </form>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>${esc(biz.pipelineName)}</h3>
    <div class="kanban">${columns}</div>
    <form class="row" data-form="pipeline">
      <input name="title" placeholder="${esc(biz.itemLabel)}" required>
      <input name="amount" type="number" min="0" step="any" placeholder="${esc(biz.amountLabel)}">
      <select name="stage">${biz.stages.map((st) => `<option>${esc(st)}</option>`).join("")}</select>
      <button class="primary">Add</button>
    </form>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Notes</h3>
    <textarea data-action="notes" placeholder="Ideas, contacts, plans...">${esc(s.notes)}</textarea>
  </div>`;
}

function render() {
  if (!["overview", "crm"].includes(currentTab) && !BUSINESSES.some((b) => b.id === currentTab)) currentTab = "overview";
  renderTabs();
  const biz = BUSINESSES.find((b) => b.id === currentTab);
  const view = document.getElementById("view");
  if (currentTab === "crm") view.innerHTML = renderCrm();
  else view.innerHTML = biz ? renderBusiness(biz) : renderOverview();
}

// ---------- events ----------

function bizState() {
  return state[currentTab];
}

function onBusinessTab() {
  return BUSINESSES.some((b) => b.id === currentTab);
}

document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  currentTab = btn.dataset.tab;
  location.hash = currentTab;
  render();
});

const view = document.getElementById("view");

view.addEventListener("click", (e) => {
  const card = e.target.closest("[data-goto]");
  if (card) {
    currentTab = card.dataset.goto;
    location.hash = currentTab;
    render();
    return;
  }
  const btn = e.target.closest("button[data-action]");
  if (!btn || !onBusinessTab()) return;
  const s = bizState();
  const id = btn.dataset.id;
  const lists = { "del-money": "money", "del-todo": "todos", "del-pipeline": "pipeline", "del-link": "links" };
  const key = lists[btn.dataset.action];
  if (key && confirm("Delete this?")) {
    s[key] = s[key].filter((x) => x.id !== id);
    save();
    render();
  }
});

view.addEventListener("change", (e) => {
  if (!onBusinessTab()) return;
  const el = e.target;
  const s = bizState();
  if (el.dataset.action === "toggle") {
    const todo = s.todos.find((x) => x.id === el.dataset.id);
    todo.done = el.checked;
  } else if (el.dataset.action === "move") {
    const item = s.pipeline.find((x) => x.id === el.dataset.id);
    item.stage = el.value;
  } else if (el.dataset.action === "notes") {
    s.notes = el.value;
    save();
    return;
  } else {
    return;
  }
  save();
  render();
});

view.addEventListener("submit", (e) => {
  if (!onBusinessTab()) return;
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const s = bizState();
  switch (form.dataset.form) {
    case "goal":
      s.goal = Number(f.goal) || 0;
      break;
    case "money":
      s.money.push({ id: uid(), date: f.date, type: f.type, amount: Number(f.amount) || 0, note: f.note.trim() });
      break;
    case "todo":
      s.todos.push({ id: uid(), text: f.text.trim(), done: false });
      break;
    case "link":
      s.links.push({ id: uid(), label: f.label.trim(), url: f.url.trim() });
      break;
    case "pipeline":
      s.pipeline.push({ id: uid(), title: f.title.trim(), amount: Number(f.amount) || 0, stage: f.stage });
      break;
  }
  save();
  render();
});

monthInput.addEventListener("change", render);

document.getElementById("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `command-center-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm("Replace everything here with this backup?")) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    state = load();
    render();
  } catch (err) {
    alert("That file isn't a valid backup.");
  } finally {
    e.target.value = "";
  }
});

render();

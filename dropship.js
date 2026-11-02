// Dropshipping hub for the Dropship tab: a Stack & Smoke store HQ (launch list, holiday plan, tool costs), a Research → Build → Launch roadmap (following the Power of Three
// course), a product scorecard with real profit math, and an ad test log that says Kill, Keep or Scale.
// Loaded before app.js. Uses state, save, render, uid, esc, money, todayStr and currentTab at runtime.

const DS_FEE_PCT = 0.029;  // Shopify Payments, Basic plan
const DS_FEE_FLAT = 0.30;

const DS_ROADMAP = [
  { phase: "Research", color: "#3dffa8", steps: [
    ["r-tiktok", "Rewatch \"Product Research with TikTok\" (Coach Chris replay)"],
    ["r-bum", "Run the Bum Method + ChatGPT research and add 10 product ideas below"],
    ["r-score", "Score every idea; shortlist 3 with at least a 3x markup"],
    ["r-sample", "Order a sample of your top pick: check quality and the real shipping time"],
  ] },
  { phase: "Build", color: "#ffaa3c", steps: [
    ["b-secure", "Change your Shopify password and turn on 2-step login"],
    ["b-email", "Use a store email inbox that isn't full (Shopify, supplier and customer emails)"],
    ["b-trial", "Restart the Shopify trial and pick a plan (Basic is enough to start)"],
    ["b-settings", "Store settings: name, currency, time zone, sender email"],
    ["b-pay", "Connect payments: Shopify Payments + PayPal"],
    ["b-supplier", "Install a supplier app (DSers, AutoDS or CJ) and import your 3 products"],
    ["b-pages", "Product pages: real photos/video, benefit-led title, honest shipping time"],
    ["b-policy", "Policy pages: refund, shipping, privacy, terms, plus a contact page"],
    ["b-domain", "Connect a domain and place a test order end to end"],
  ] },
  { phase: "Launch", color: "#ff2e4d", steps: [
    ["l-content", "Make 3–5 short videos per product (Content is Currency)"],
    ["l-organic", "Post them on TikTok and Reels first and watch which hooks hold"],
    ["l-bm", "Set up Meta Business Manager, the ad account and the Pixel on Shopify"],
    ["l-creative", "Build 3 ad creatives per product: hook in the first 3 seconds"],
    ["l-launch", "Launch the test: about $20–30/day per product for 3–4 days"],
    ["l-log", "Log results every day below and follow the Kill / Keep / Scale call"],
  ] },
];

const DS_LINKS = [
  ["Shopify admin", "https://admin.shopify.com"],
  ["Course library", "https://gto.ecomfamilyacademy.com/library"],
  ["Meta Ads Manager", "https://adsmanager.facebook.com"],
  ["TikTok Creative Center", "https://ads.tiktok.com/business/creativecenter"],
];

const DS_CHECKS = [
  ["wow", "Wow factor (stops the scroll)"],
  ["problem", "Solves a real problem"],
  ["stores", "Not easy to find in stores"],
  ["video", "Easy to show in a 10-second video"],
];

// ---------- Stack & Smoke store HQ ----------
const SS = {
  // Plan (Nov 1): Starter Stack $59 = instant-read thermometer + gloves + smoke tube + shredder claws; Full Stack $89
  domain: "stackandsmoke.com",
  blackFriday: "2026-11-27",
  shipCutoff: "2026-12-15", // US-warehouse Christmas cutoff (confirm with supplier)
  links: [
    ["Store", "https://stackandsmoke.com"],
    ["Shopify admin", "https://admin.shopify.com/store/shonenhype"],
    ["Products", "https://admin.shopify.com/store/shonenhype/products"],
    ["AutoDS", "https://platform.autods.com"],
    ["Meta Ads Manager", "https://adsmanager.facebook.com"],
    ["Marketing playbook", "https://claude.ai/artifact/Bn55h4wpTrpKcn2EPbEXu8"],
    ["Theme preview", "https://stackandsmoke.com/?preview_theme_id=158027514012"],
    ["Themes", "https://admin.shopify.com/store/shonenhype/themes"],
    ["Theme code (GitHub)", "https://github.com/devbrown23/stack-and-smoke-theme"],
    ["AutoDS drafts", "https://platform.autods.com/drafts"],
    ["Thermometer (supplier)", "https://www.aliexpress.us/item/1005007038287842.html"],
    ["Shipping policy", "https://stackandsmoke.com/pages/shipping-policy"],
    ["Return policy", "https://stackandsmoke.com/pages/return-policy"],
    ["FAQ", "https://stackandsmoke.com/pages/faqs"],
  ],
  weeks: [
    ["2026-11-01", "2026-11-08", "Import products in AutoDS, set prices, build bundles, film cook #1", "$0"],
    ["2026-11-09", "2026-11-15", "Theme + pages live, 1 organic video a day, email pop-up on", "$0"],
    ["2026-11-16", "2026-11-22", "Ad tests: 3 hooks × Starter Stack, kill losers fast", "$30/day"],
    ["2026-11-23", "2026-11-30", "Black Friday / Cyber Monday: 10% code, emails, scale winners", "$50–100/day"],
    ["2026-12-01", "2026-12-07", "Gift guide push, stocking stuffers", "$50–100/day"],
    ["2026-12-08", "2026-12-14", "\"Order by\" urgency, Green Monday (Dec 14)", "Hold or scale"],
    ["2026-12-15", "2026-12-24", "Shipping cutoff, then gift-card / late-gift angle", "$10–20/day"],
  ],
  launch: [
    ["s-name", "Rename store to Stack & Smoke"],
    ["s-domain", "Buy stackandsmoke.com and set it as primary"],
    ["s-archive", "Archive the 7 old products"],
    ["s-collections", "Create the 5 collections + menus, About and FAQ pages"],
    ["s-verify", "Verify the domain email (Gmail)"],
    ["s-handles", "Claim @stackandsmoke on Instagram + TikTok"],
    ["s-tm", "Trademark check: tmsearch.uspto.gov"],
    ["s-autods", "Connect Stack & Smoke to the paid AutoDS account"],
    ["s-import", "Import the 4 Starter Stack items in AutoDS as Draft (thermometer picked)"],
    ["s-dsers", "Uninstall DSers (saves $19.90/mo)"],
    ["s-policies", "Fill Shipping + Return policy pages from supplier terms"],
    ["s-ship", "Shipping: US only, free tracked shipping"],
    ["s-bundles", "Install Shopify Bundles; build Starter Stack + Full Stack"],
    ["s-theme", "Connect the GitHub theme, add photos, preview, publish"],
    ["s-pixel", "Connect Facebook & Instagram channel (Meta pixel)"],
    ["s-email", "Turn on email pop-up + welcome / abandoned-cart automations"],
    ["s-test", "Place a test order end to end"],
    ["s-film", "Film cook #1 from the shot list"],
  ],
  launchDone: ["s-name", "s-domain", "s-archive", "s-collections", "s-verify", "s-autods", "s-dsers", "s-policies", "s-ship"],
  subs: [
    { name: "Shopify Basic", cost: 39 },
    { name: "AutoDS (next charge Nov 18)", cost: 46.23 },
    { name: "Domain (stackandsmoke.com)", cost: 1.42 },
  ],
  // target costs from the sourcing plan; replace with real AutoDS numbers
  products: [
    ["The Starter Stack (bundle)", 17, 59, { wow: true, problem: true, video: true, stores: true }],
    ["The Full Stack (bundle)", 29, 89, { wow: true, problem: true, video: true, stores: true }],
    ["Instant-read thermometer", 6, 19.99, { wow: true, problem: true, video: true }],
    ["Heat-resistant gloves", 5, 14.99, { problem: true, video: true }],
    ["Pellet smoke tube", 3, 9.99, { wow: true, video: true }],
    ["Meat shredder claws", 3, 11.99, { wow: true, video: true }],
    ["Bristle-free grill scraper", 6, 17.99, { problem: true, video: true }],
    ["Marinade injector", 6, 17.99, { video: true }],
  ],
};

function ssDays(to) {
  const d = Math.ceil((new Date(to + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000);
  return d;
}

function renderStackSmoke(ds) {
  const today = todayStr();
  const done = SS.launch.filter(([id]) => ds.launch[id]).length;
  const next = SS.launch.find(([id]) => !ds.launch[id]);
  const bf = ssDays(SS.blackFriday), cut = ssDays(SS.shipCutoff);
  const burn = ds.subs.reduce((a, x) => a + (Number(x.cost) || 0), 0);
  const starter = ds.products.find((p) => /starter stack/i.test(p.name));
  const perSale = starter ? dsMath(starter).profit : 0;
  const salesToCover = perSale > 0 ? Math.ceil(burn / perSale) : null;
  const weekRows = SS.weeks.map(([a, b, focus, spend], i) => {
    const now = today >= a && today <= b;
    return `<tr class="${now ? "ss-now" : today > b ? "ss-past" : ""}"><td>${i + 1}</td><td>${a.slice(5)} – ${b.slice(5)}</td><td>${esc(focus)}</td><td>${esc(spend)}</td></tr>`;
  }).join("");

  return `<div class="card ss-hq" style="margin-top:16px">
    <div class="ds-phase-head"><h3>Stack & Smoke HQ</h3><a href="https://${SS.domain}" target="_blank" rel="noopener" class="muted">${SS.domain} ↗</a></div>
    <p class="muted">Stack it. Smoke it. · Hero: The Starter Stack ($59) · Gifts for the grill guy → spring grilling.</p>
    <div class="stats">
      <div class="stat"><div class="label">Days to Black Friday</div><div class="value">${bf > 0 ? bf : bf === 0 ? "Today" : "–"}</div></div>
      <div class="stat"><div class="label">Days to ship cutoff</div><div class="value ${cut <= 7 ? "neg" : ""}">${cut > 0 ? cut : "–"}</div></div>
      <div class="stat"><div class="label">Launch list</div><div class="value">${done}/${SS.launch.length}</div></div>
      <div class="stat"><div class="label">Tools / month</div><div class="value">${money(Math.round(burn * 100) / 100)}</div></div>
      <div class="stat"><div class="label">Stacks to cover tools</div><div class="value">${salesToCover ?? "–"}</div></div>
    </div>
    ${next ? `<p class="ds-next"><span>NEXT</span> ${esc(next[1])}</p>` : `<p class="ds-next"><span>LIVE</span> Launch list done. Run the ad tests below.</p>`}
    <div class="ss-grid">
      <div>
        <h4>Launch checklist</h4>
        <div class="bar"><div style="width:${(done / SS.launch.length) * 100}%"></div></div>
        <ul class="list">${SS.launch.map(([id, text]) => `<li class="${ds.launch[id] ? "done" : ""}"><label class="grow ds-check">
          <input type="checkbox" data-ds="launch" data-id="${id}" ${ds.launch[id] ? "checked" : ""}> <span>${esc(text)}</span></label></li>`).join("")}</ul>
      </div>
      <div>
        <h4>Holiday plan</h4>
        <div class="ds-table-wrap"><table class="ds-table ss-weeks"><thead><tr><th>Wk</th><th>Dates</th><th>Focus</th><th>Ads</th></tr></thead><tbody>${weekRows}</tbody></table></div>
        <h4 style="margin-top:14px">Monthly tools</h4>
        <ul class="list">${ds.subs.map((x, i) => `<li><span class="grow">${esc(x.name)}</span>
          <input type="number" step="any" min="0" class="ss-sub" data-ds="sub" data-i="${i}" value="${x.cost || ""}" placeholder="0">
          <button class="x" data-ds="subdel" data-i="${i}" title="Delete">✕</button></li>`).join("")}</ul>
        <form class="row" data-ds-form="sub"><input name="name" placeholder="Tool" required><input name="cost" type="number" step="any" min="0" placeholder="$/mo"><button class="primary">Add</button></form>
      </div>
    </div>
    <div class="btn-row">${SS.links.map(([l, u]) => `<a class="btn ghost" href="${u}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</div>
  </div>`;
}

function dsState(s) {
  s.ds = { road: {}, products: [], tests: [], ...(s.ds || {}) };
  // one-time Stack & Smoke setup: launch list, tool costs and target-cost products
  if (!s.ds.ssSeeded) {
    s.ds.launch = Object.fromEntries(SS.launchDone.map((id) => [id, true]));
    s.ds.subs = SS.subs.map((x) => ({ ...x }));
    const have = new Set(s.ds.products.map((p) => p.name.toLowerCase()));
    for (const [name, cost, price, checks] of SS.products) {
      if (!have.has(name.toLowerCase())) s.ds.products.push({ id: uid(), name, cost, ship: 0, price, link: "", stage: "Researching", checks });
    }
    Object.assign(s.ds.road, { "b-trial": true, "b-settings": true, "r-score": true });
    s.ds.ssSeeded = true;
  }
  s.ds.launch = s.ds.launch || {};
  s.ds.subs = s.ds.subs || [];
  // one-time move to the $59 instant-read plan (only touches values still at the old defaults)
  if (!s.ds.ssPlan59) {
    const fix = (oldName, newName, oldCost, oldPrice, cost, price, link) => {
      const p = s.ds.products.find((x) => x.name === oldName);
      if (!p) return;
      p.name = newName;
      if (p.cost === oldCost && p.price === oldPrice) { p.cost = cost; p.price = price; }
      if (link && !p.link) p.link = link;
    };
    fix("The Starter Stack (bundle)", "The Starter Stack (bundle)", 26, 79, 18, 59);
    fix("The Full Stack (bundle)", "The Full Stack (bundle)", 40, 119, 30, 89);
    fix("Wireless meat thermometer", "Instant-read thermometer", 15, 44.99, 6, 19.99, "https://www.aliexpress.us/item/1005007038287842.html");
    s.ds.subs = s.ds.subs.filter((x) => !/^DSers/i.test(x.name));
    const ads = s.ds.subs.find((x) => /^AutoDS/i.test(x.name));
    if (ads) { if (!ads.cost) ads.cost = 46.23; ads.name = "AutoDS (next charge Nov 18)"; }
    for (const id of ["s-verify", "s-autods", "s-dsers", "s-policies", "s-ship"]) s.ds.launch[id] = true;
    Object.assign(s.ds.road, { "b-supplier": true, "b-policy": true });
    s.ds.ssPlan59 = true;
  }
  // one-time swap: shredder claws replace the spray bottle (only touches untouched defaults)
  if (!s.ds.ssClaws) {
    const sb = s.ds.products.find((x) => x.name === "BBQ spray bottle");
    if (sb) { sb.name = "Meat shredder claws"; if (sb.price === 9.99) sb.price = 11.99; sb.checks = { ...(sb.checks || {}), wow: true, video: true }; }
    const st = s.ds.products.find((x) => x.name === "The Starter Stack (bundle)");
    if (st && st.cost === 18) st.cost = 17;
    const fs = s.ds.products.find((x) => x.name === "The Full Stack (bundle)");
    if (fs && fs.cost === 30) fs.cost = 29;
    s.ds.ssClaws = true;
  }
  // one-time move of old Products board items into the scorecard
  if (!s.ds.migrated) {
    for (const p of s.pipeline || []) {
      s.ds.products.push({ id: p.id || uid(), name: p.title, cost: 0, ship: 0, price: 0, link: "", stage: p.stage || "Researching", checks: {} });
    }
    s.ds.migrated = true;
  }
  return s.ds;
}

function dsMath(p) {
  const price = Number(p.price) || 0, cost = (Number(p.cost) || 0) + (Number(p.ship) || 0);
  const fees = price ? price * DS_FEE_PCT + DS_FEE_FLAT : 0;
  const profit = price - cost - fees;
  return {
    profit, fees,
    margin: price ? profit / price : 0,
    markup: cost ? price / cost : 0,
    beRoas: profit > 0 ? price / profit : null, // ad ROAS needed to break even
    maxCpa: profit,                              // most you can pay in ads per sale and break even
  };
}

function dsScore(p) {
  const m = dsMath(p);
  const checks = DS_CHECKS.filter(([k]) => p.checks && p.checks[k]).length; // 0–4
  const markupPts = m.markup >= 3 ? 4 : m.markup >= 2.5 ? 3 : m.markup >= 2 ? 1 : 0;
  const profitPts = m.profit >= 20 ? 2 : m.profit >= 12 ? 1 : 0;
  return Math.round(((checks + markupPts + profitPts) / 10) * 100);
}

function dsTestTotals(ds, productId) {
  const rows = ds.tests.filter((t) => t.productId === productId);
  const t = rows.reduce((a, r) => ({ spend: a.spend + r.spend, clicks: a.clicks + r.clicks, atc: a.atc + r.atc, sales: a.sales + r.sales, revenue: a.revenue + r.revenue }),
    { spend: 0, clicks: 0, atc: 0, sales: 0, revenue: 0 });
  t.days = rows.length;
  t.roas = t.spend ? t.revenue / t.spend : 0;
  t.cpa = t.sales ? t.spend / t.sales : null;
  return t;
}

// The call after a test: based on spend vs. what one sale is worth, and ROAS vs. break-even ROAS.
function dsVerdict(p, t) {
  const m = dsMath(p);
  if (!t.spend) return { tag: "Not tested", cls: "muted", why: "No ad spend logged yet." };
  if (m.profit <= 0) return { tag: "Fix price", cls: "neg", why: "You lose money on every sale. Raise the price or find a cheaper supplier." };
  if (!t.sales && t.spend >= m.maxCpa * 2) return { tag: "Kill", cls: "neg", why: `Spent ${money(Math.round(t.spend))} (2x what a sale is worth) with no sales.` };
  if (!t.sales) return { tag: "Keep testing", cls: "", why: `No sales yet. Give it until about ${money(Math.round(m.maxCpa * 2))} spent.` };
  if (t.roas >= m.beRoas * 1.3) return { tag: "Scale", cls: "pos", why: `ROAS ${t.roas.toFixed(2)} beats break-even ${m.beRoas.toFixed(2)} by 30%+. Raise budget about 20% every 2 days.` };
  if (t.roas >= m.beRoas) return { tag: "Profitable", cls: "pos", why: `ROAS ${t.roas.toFixed(2)} is above break-even ${m.beRoas.toFixed(2)}. Test new creatives before scaling.` };
  if (t.atc && t.sales / t.atc < 0.3) return { tag: "Fix the page", cls: "", why: "People add to cart but don't buy. Check shipping cost, price and trust on the checkout." };
  return { tag: "Below break-even", cls: "neg", why: `ROAS ${t.roas.toFixed(2)} vs break-even ${m.beRoas.toFixed(2)}. Try new hooks, or kill it after 2 more days.` };
}

function renderDropship(s) {
  const ds = dsState(s);
  const stages = ["Researching", "Testing", "Winner", "Paused"];
  const total = DS_ROADMAP.reduce((n, ph) => n + ph.steps.length, 0);
  const done = DS_ROADMAP.reduce((n, ph) => n + ph.steps.filter(([id]) => ds.road[id]).length, 0);
  const nextStep = DS_ROADMAP.flatMap((ph) => ph.steps.map((st) => [ph.phase, ...st])).find(([, id]) => !ds.road[id]);

  const phases = DS_ROADMAP.map((ph) => {
    const n = ph.steps.filter(([id]) => ds.road[id]).length;
    return `<div class="ds-phase" style="--ph:${ph.color}">
      <div class="ds-phase-head"><strong>${ph.phase}</strong><span class="muted">${n}/${ph.steps.length}</span></div>
      <div class="bar"><div style="width:${(n / ph.steps.length) * 100}%;background:${ph.color}"></div></div>
      <ul class="list">${ph.steps.map(([id, text]) => `<li class="${ds.road[id] ? "done" : ""}"><label class="grow ds-check">
        <input type="checkbox" data-ds="road" data-id="${id}" ${ds.road[id] ? "checked" : ""}> <span>${esc(text)}</span></label></li>`).join("")}</ul>
    </div>`;
  }).join("");

  const sorted = ds.products.slice().sort((a, b) => stages.indexOf(a.stage) - stages.indexOf(b.stage) || dsScore(b) - dsScore(a));
  const prodRows = sorted.map((p) => {
    const m = dsMath(p), sc = dsScore(p), t = dsTestTotals(ds, p.id), v = dsVerdict(p, t);
    return `<tr>
      <td><strong>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</strong>
        <div class="ds-checks">${DS_CHECKS.map(([k, label]) => `<label title="${esc(label)}"><input type="checkbox" data-ds="pcheck" data-id="${p.id}" data-k="${k}" ${p.checks && p.checks[k] ? "checked" : ""}>${esc(label.split(" (")[0])}</label>`).join("")}</div></td>
      <td><input type="number" step="any" min="0" data-ds="pnum" data-id="${p.id}" data-k="cost" value="${p.cost || ""}" placeholder="0"></td>
      <td><input type="number" step="any" min="0" data-ds="pnum" data-id="${p.id}" data-k="ship" value="${p.ship || ""}" placeholder="0"></td>
      <td><input type="number" step="any" min="0" data-ds="pnum" data-id="${p.id}" data-k="price" value="${p.price || ""}" placeholder="0"></td>
      <td class="${m.profit > 0 ? "pos" : "neg"}">${p.price ? money(Math.round(m.profit * 100) / 100) : "–"}<div class="muted">${m.markup ? m.markup.toFixed(1) + "x markup" : ""}</div></td>
      <td>${m.beRoas ? m.beRoas.toFixed(2) : "–"}</td>
      <td><span class="ds-score ${sc >= 70 ? "good" : sc < 40 ? "bad" : ""}">${sc}</span></td>
      <td><select data-ds="pstage" data-id="${p.id}">${stages.map((st) => `<option ${st === p.stage ? "selected" : ""}>${st}</option>`).join("")}</select></td>
      <td><span class="ds-verdict ${v.cls}" title="${esc(v.why)}">${v.tag}</span></td>
      <td><button class="x" data-ds="pdel" data-id="${p.id}" title="Delete">✕</button></td>
    </tr>`;
  }).join("");

  const testable = ds.products.filter((p) => p.stage !== "Paused");
  const testCards = ds.products.filter((p) => ds.tests.some((t) => t.productId === p.id)).map((p) => {
    const t = dsTestTotals(ds, p.id), v = dsVerdict(p, t), m = dsMath(p);
    return `<div class="ds-test">
      <div class="ds-phase-head"><strong>${esc(p.name)}</strong><span class="ds-verdict ${v.cls}">${v.tag}</span></div>
      <div class="stats">
        <div class="stat"><div class="label">Spend</div><div class="value">${money(Math.round(t.spend))}</div></div>
        <div class="stat"><div class="label">Sales</div><div class="value">${t.sales}</div></div>
        <div class="stat"><div class="label">ROAS</div><div class="value ${m.beRoas && t.roas >= m.beRoas ? "pos" : ""}">${t.spend ? t.roas.toFixed(2) : "–"}</div></div>
        <div class="stat"><div class="label">Cost per sale</div><div class="value">${t.cpa ? money(Math.round(t.cpa)) : "–"}</div></div>
      </div>
      <p class="muted">${esc(v.why)} ${t.days} day${t.days === 1 ? "" : "s"} logged · break-even ROAS ${m.beRoas ? m.beRoas.toFixed(2) : "–"} · max cost per sale ${money(Math.round(m.maxCpa))}.</p>
    </div>`;
  }).join("");

  return `<div class="ds">
    ${renderStackSmoke(ds)}
    <div class="card ds-road" style="margin-top:16px;--tab:#8250df">
      <div class="ds-phase-head"><h3>Store build: Research → Build → Launch</h3><span class="muted">${done}/${total} done</span></div>
      <div class="bar"><div style="width:${(done / total) * 100}%"></div></div>
      ${nextStep ? `<p class="ds-next"><span>NEXT</span> ${esc(nextStep[0])}: ${esc(nextStep[2])}</p>` : `<p class="ds-next"><span>DONE</span> Store is live. Keep testing products and scaling winners.</p>`}
      <div class="ds-phases">${phases}</div>
      <div class="btn-row">${DS_LINKS.map(([l, u]) => `<a class="btn ghost" href="${u}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("")}</div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Product scorecard</h3>
      <p class="muted">Enter supplier cost, shipping and your price. Profit takes out Shopify payment fees (2.9% + 30¢). Break-even ROAS is the ad return you need just to not lose money; aim for a 3x markup and under 2.0.</p>
      <div class="ds-table-wrap"><table class="ds-table">
        <thead><tr><th>Product</th><th>Cost</th><th>Shipping</th><th>Price</th><th>Profit / sale</th><th>Break-even ROAS</th><th>Score</th><th>Stage</th><th>Call</th><th></th></tr></thead>
        <tbody>${prodRows || `<tr><td colspan="10" class="muted">No products yet. Add your research ideas below.</td></tr>`}</tbody>
      </table></div>
      <form class="row" data-ds-form="product">
        <input name="name" placeholder="Product idea" required>
        <input name="cost" type="number" step="any" min="0" placeholder="Supplier cost">
        <input name="ship" type="number" step="any" min="0" placeholder="Shipping">
        <input name="price" type="number" step="any" min="0" placeholder="Your price">
        <input name="link" type="url" placeholder="Supplier or TikTok link">
        <button class="primary">Add</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Ad test log</h3>
      <p class="muted">Log each day's numbers from Ads Manager and Shopify. The call updates as you go.</p>
      ${testable.length ? `<form class="row ds-test-form" data-ds-form="test">
        <select name="productId">${testable.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
        <input name="date" type="date" value="${todayStr()}" required>
        <input name="spend" type="number" step="any" min="0" placeholder="Ad spend" required>
        <input name="clicks" type="number" min="0" placeholder="Link clicks">
        <input name="atc" type="number" min="0" placeholder="Add to carts">
        <input name="sales" type="number" min="0" placeholder="Sales">
        <input name="revenue" type="number" step="any" min="0" placeholder="Revenue">
        <label class="muted"><input type="checkbox" name="money" checked> Add to Money in / out</label>
        <button class="primary">Log day</button>
      </form>` : `<p class="muted">Add a product to the scorecard first.</p>`}
      <div class="ds-tests">${testCards || ""}</div>
      ${ds.tests.length ? `<details style="margin-top:10px"><summary class="muted">All logged days (${ds.tests.length})</summary><ul class="list">${ds.tests.slice().sort((a, b) => b.date.localeCompare(a.date)).map((t) => {
        const p = ds.products.find((x) => x.id === t.productId);
        return `<li><span class="grow">${esc(t.date)} · ${esc(p ? p.name : "Deleted product")} · ${money(t.spend)} spent · ${t.sales} sales · ${money(t.revenue)}</span><button class="x" data-ds="tdel" data-id="${t.id}" title="Delete">✕</button></li>`;
      }).join("")}</ul></details>` : ""}
    </div>
  </div>`;
}

// ---------- events ----------
(function () {
  const v = document.getElementById("view");
  const ds = () => dsState(state.dropship);
  v.addEventListener("change", (e) => {
    if (currentTab !== "dropship") return;
    const el = e.target, a = el.dataset.ds;
    if (!a) return;
    const d = ds();
    const p = d.products.find((x) => x.id === el.dataset.id);
    if (a === "road") d.road[el.dataset.id] = el.checked;
    else if (a === "launch") d.launch[el.dataset.id] = el.checked;
    else if (a === "sub" && d.subs[el.dataset.i]) d.subs[el.dataset.i].cost = Math.max(0, Number(el.value) || 0);
    else if (a === "pcheck" && p) p.checks = { ...(p.checks || {}), [el.dataset.k]: el.checked };
    else if (a === "pnum" && p) p[el.dataset.k] = Math.max(0, Number(el.value) || 0);
    else if (a === "pstage" && p) p.stage = el.value;
    else return;
    save();
    render();
  });
  v.addEventListener("click", (e) => {
    if (currentTab !== "dropship") return;
    const b = e.target.closest("button[data-ds]");
    if (!b) return;
    const d = ds();
    if (b.dataset.ds === "pdel" && confirm("Delete this product and its test days?")) {
      d.products = d.products.filter((x) => x.id !== b.dataset.id);
      d.tests = d.tests.filter((x) => x.productId !== b.dataset.id);
    } else if (b.dataset.ds === "subdel") {
      d.subs.splice(Number(b.dataset.i), 1);
    } else if (b.dataset.ds === "tdel" && confirm("Delete this day? (Money in/out entries stay.)")) {
      d.tests = d.tests.filter((x) => x.id !== b.dataset.id);
    } else return;
    save();
    render();
  });
  v.addEventListener("submit", (e) => {
    if (currentTab !== "dropship" || !e.target.dataset.dsForm) return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const d = ds();
    const n = (x) => Math.max(0, Number(x) || 0);
    if (e.target.dataset.dsForm === "sub") {
      d.subs.push({ name: f.name.trim(), cost: n(f.cost) });
    } else if (e.target.dataset.dsForm === "product") {
      d.products.push({ id: uid(), name: f.name.trim(), cost: n(f.cost), ship: n(f.ship), price: n(f.price), link: f.link || "", stage: "Researching", checks: {} });
    } else {
      const p = d.products.find((x) => x.id === f.productId);
      const t = { id: uid(), productId: f.productId, date: f.date, spend: n(f.spend), clicks: n(f.clicks), atc: n(f.atc), sales: n(f.sales), revenue: n(f.revenue) };
      d.tests.push(t);
      if (p && p.stage === "Researching") p.stage = "Testing";
      if (f.money) {
        const s = state.dropship;
        if (t.spend) s.money.push({ id: uid(), date: t.date, type: "expense", amount: t.spend, note: `Ads: ${p ? p.name : ""}` });
        if (t.revenue) s.money.push({ id: uid(), date: t.date, type: "income", amount: t.revenue, note: `Sales: ${p ? p.name : ""}` });
      }
    }
    save();
    render();
  });
})();

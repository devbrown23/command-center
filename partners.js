// Top 30 referral partners (contractors, lenders, inspectors...) on the Game Plan tab, plus the
// card profit calculator on the Cards tab.
// Loaded before app.js. Uses state, save, render, uid, esc, money, todayStr and copyText at runtime.

const PARTNER_TRADES = ["Roofing", "General contractor", "Plumbing", "Electrical", "HVAC", "Painting", "Flooring", "Landscaping", "Inspector", "Lender", "Moving", "Cleaning", "Other"];
const JOB_STAGES = ["Sent", "Quoted", "Booked", "Done", "Invoiced", "Paid"];
const PARTNER_TOP = 30;

const PARTNER_TERMS = `Hi {first}, people are always asking me for the top contractors I work with, so I'd like to start sending you referrals. My referral fee is {pct}% of the final job total, paid once the job is paid. Price the job however you normally would. If that works for you, reply "agreed" and I'll add you to my Top 30 list.`;
const PARTNER_JOB = `Hi {first}, I have a referral for you: {job}. Can you take it, and what would it cost? Same terms as always: {pct}% of the final total once it's paid.`;
const PARTNER_INVOICE = `Hey {first}, saw the {job} job wrapped up. 🙌🏾 What was the final total? I'll send over my {pct}% invoice.`;

function partnersState() {
  state.partners = { list: [], pct: 10, ...(state.partners || {}) };
  return state.partners;
}

function partnerFill(text, p, job) {
  return text.replace(/\{first\}/g, (p.name || "").split(" ")[0] || "there").replace(/\{pct\}/g, partnersState().pct).replace(/\{job\}/g, job ? job.what : "the job");
}

function jobFee(job) {
  return Math.round((Number(job.total) || 0) * partnersState().pct) / 100;
}

function renderPartners() {
  const ps = partnersState();
  const jobs = ps.list.flatMap((p) => (p.jobs || []).map((j) => ({ p, j })));
  const owed = jobs.filter(({ j }) => j.stage !== "Paid" && j.total).reduce((a, { j }) => a + jobFee(j), 0);
  const paid = jobs.filter(({ j }) => j.stage === "Paid").reduce((a, { j }) => a + jobFee(j), 0);
  const open = jobs.filter(({ j }) => j.stage !== "Paid").length;
  const smsLink = (phone, text) => `sms:${encodeURIComponent(phone)}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}`;

  const rows = [...ps.list].sort((a, b) => (b.agreed ? 1 : 0) - (a.agreed ? 1 : 0) || a.name.localeCompare(b.name)).map((p) => {
    const jobRows = (p.jobs || []).map((j) => `<li>
      <span class="grow">${esc(j.what)} <span class="muted">${esc(j.date)}${j.total ? ` · job ${money(j.total)} · fee ${money(jobFee(j))}` : ""}</span></span>
      <input type="number" min="0" step="any" placeholder="Final total" value="${j.total || ""}" data-pt="total" data-p="${p.id}" data-j="${j.id}" style="width:110px">
      <select data-pt="stage" data-p="${p.id}" data-j="${j.id}">${JOB_STAGES.map((s) => `<option ${s === j.stage ? "selected" : ""}>${s}</option>`).join("")}</select>
      ${p.phone && j.stage !== "Paid" ? `<a class="ghost" href="${esc(smsLink(p.phone, partnerFill(j.stage === "Done" || j.stage === "Invoiced" ? PARTNER_INVOICE : PARTNER_JOB, p, j)))}">${j.stage === "Done" || j.stage === "Invoiced" ? "Ask for total" : "Text job"}</a>` : ""}
      <button class="x" data-pt="deljob" data-p="${p.id}" data-j="${j.id}" title="Delete">✕</button>
    </li>`).join("");
    return `<li class="sender" style="display:block">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span class="grow"><strong>${esc(p.name)}</strong> <span class="muted">${esc(p.trade)}${p.company ? ` · ${esc(p.company)}` : ""}${p.phone ? ` · <a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : ""}</span></span>
        ${p.agreed ? `<span class="pos">✓ Agreed ${esc(p.agreed)}</span>` : `
          ${p.phone ? `<a class="ghost" href="${esc(smsLink(p.phone, partnerFill(PARTNER_TERMS, p)))}">Text terms</a>` : ""}
          <button data-pt="agreed" data-p="${p.id}">They agreed</button>`}
        <button class="x" data-pt="del" data-p="${p.id}" title="Remove partner">✕</button>
      </div>
      <ul class="list" style="margin-left:12px">${jobRows}</ul>
      <form class="row" data-pt-form="job" data-p="${p.id}">
        <input name="what" placeholder="New referral: client + job (e.g. roof, 2808 S 376th St)" required>
        <button>Add job</button>
      </form>
    </li>`;
  }).join("");

  return `<div class="card" style="margin-top:16px">
    <h3>Top ${PARTNER_TOP} referral partners</h3>
    <div class="stats">
      <div class="stat"><div class="label">Partners</div><div class="value">${ps.list.length} / ${PARTNER_TOP}</div></div>
      <div class="stat"><div class="label">Agreed to ${ps.pct}%</div><div class="value">${ps.list.filter((p) => p.agreed).length}</div></div>
      <div class="stat"><div class="label">Open jobs</div><div class="value">${open}</div></div>
      <div class="stat"><div class="label">Fees owed</div><div class="value">${money(owed)}</div></div>
      <div class="stat"><div class="label">Fees paid</div><div class="value pos">${money(paid)}</div></div>
    </div>
    <ul class="list">${rows || `<li class="muted">Add Roy and the other contractors you trust.</li>`}</ul>
    <form class="row" data-pt-form="add">
      <input name="name" placeholder="Name" required>
      <input name="company" placeholder="Company">
      <select name="trade">${PARTNER_TRADES.map((t) => `<option>${t}</option>`).join("")}</select>
      <input name="phone" type="tel" placeholder="Phone">
      <button class="primary">Add partner</button>
    </form>
    <p class="muted">Get the "agreed" in writing before you send a job. Enter the final total when it's done and the ${ps.pct}% fee is figured for you. Marking a job Paid adds the fee to Real Estate → Money in. Tell the client when you'll earn a referral fee, and check with your managing broker: referral fees tied to a home sale can fall under RESPA.</p>
  </div>`;
}

// ---------- card profit calculator (Cards tab) ----------

const EBAY_FVF_PCT = 13.25; // most categories incl. trading cards, on the total the buyer pays

function ebayFees(total) {
  return Math.round((total * EBAY_FVF_PCT) / 100 * 100 + (total > 10 ? 40 : 30)) / 100;
}

function cardMath(f) {
  const price = Number(f.price) || 0, shipIn = Number(f.shipIn) || 0, label = Number(f.label) || 0, cost = Number(f.cost) || 0, supplies = Number(f.supplies) || 0;
  const fees = price || shipIn ? ebayFees(price + shipIn) : 0;
  const profit = Math.round((price + shipIn - fees - label - cost - supplies) * 100) / 100;
  return { price, shipIn, label, cost, supplies, fees, profit };
}

function renderCardCalc(s) {
  const c = s.calc || {};
  const m = cardMath(c);
  const recent = (s.cardSales || []).slice(-5).reverse();
  return `<div class="card" style="margin-top:16px">
    <h3>Card profit calculator</h3>
    <form class="row" data-cc-form="calc">
      <input name="name" placeholder="Card (e.g. Jewelry Bonney SEC)" value="${esc(c.name || "")}" style="flex-basis:100%">
      <label class="muted">Sold for <input type="number" step="any" min="0" name="price" value="${c.price ?? ""}" style="width:90px"></label>
      <label class="muted">Shipping buyer paid <input type="number" step="any" min="0" name="shipIn" value="${c.shipIn ?? ""}" style="width:80px"></label>
      <label class="muted">Label cost <input type="number" step="any" min="0" name="label" value="${c.label ?? ""}" style="width:80px"></label>
      <label class="muted">What you paid <input type="number" step="any" min="0" name="cost" value="${c.cost ?? ""}" style="width:80px"></label>
      <label class="muted">Supplies <input type="number" step="any" min="0" name="supplies" value="${c.supplies ?? 0.75}" style="width:70px"></label>
    </form>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><div class="label">eBay fees</div><div class="value neg">${money(m.fees)}</div></div>
      <div class="stat"><div class="label">Profit</div><div class="value ${m.profit >= 0 ? "pos" : "neg"}">${m.price ? money(m.profit) : "–"}</div></div>
      <div class="stat"><div class="label">Margin</div><div class="value">${m.price ? Math.round((m.profit / (m.price + m.shipIn)) * 100) + "%" : "–"}</div></div>
    </div>
    <div class="btn-row"><button class="primary" data-cc="log" ${m.price ? "" : "disabled"}>Log this sale</button></div>
    <p class="muted">Estimate: ${EBAY_FVF_PCT}% of sale + shipping, plus $0.30 per order ($0.40 over $10). Sales tax isn't counted. Check the real fee on the eBay order. Logging adds the sale to Money in and the label, card cost and supplies to Money out.</p>
    ${recent.length ? `<ul class="list">${recent.map((x) => `<li><span class="grow">${esc(x.date)} · ${esc(x.name || "Card")}</span><span class="${x.profit >= 0 ? "pos" : "neg"}">${money(x.profit)} profit</span></li>`).join("")}</ul>` : ""}
  </div>`;
}

// ---------- events ----------

const ptView = document.getElementById("view");

ptView.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-pt], button[data-cc]");
  if (!btn) return;
  if (btn.dataset.cc === "log" && currentTab === "cards") {
    const s = state.cards;
    const c = s.calc || {};
    const m = cardMath(c);
    const date = todayStr();
    const name = (c.name || "Card").trim();
    s.money.push({ id: uid(), date, type: "income", amount: Math.round((m.price + m.shipIn) * 100) / 100, note: `Sold: ${name}` });
    const costs = Math.round((m.fees + m.label + m.cost + m.supplies) * 100) / 100;
    if (costs) s.money.push({ id: uid(), date, type: "expense", amount: costs, note: `eBay fees, label, card, supplies: ${name}` });
    s.cardSales = [...(s.cardSales || []), { date, name, profit: m.profit }];
    s.calc = { supplies: c.supplies };
    save();
    render();
    return;
  }
  if (currentTab !== "gameplan" || !btn.dataset.pt) return;
  const ps = partnersState();
  const p = ps.list.find((x) => x.id === btn.dataset.p);
  if (!p) return;
  if (btn.dataset.pt === "agreed") p.agreed = todayStr();
  else if (btn.dataset.pt === "del") {
    if (!confirm(`Remove ${p.name}?`)) return;
    ps.list = ps.list.filter((x) => x !== p);
  } else if (btn.dataset.pt === "deljob") {
    if (!confirm("Delete this job?")) return;
    p.jobs = p.jobs.filter((j) => j.id !== btn.dataset.j);
  }
  save();
  render();
});

ptView.addEventListener("change", (e) => {
  const el = e.target;
  if (currentTab === "cards" && el.form && el.form.dataset.ccForm === "calc") {
    state.cards.calc = Object.fromEntries(new FormData(el.form));
    save();
    render();
    return;
  }
  if (currentTab !== "gameplan" || !el.dataset.pt) return;
  const p = partnersState().list.find((x) => x.id === el.dataset.p);
  const j = p && (p.jobs || []).find((x) => x.id === el.dataset.j);
  if (!j) return;
  if (el.dataset.pt === "total") j.total = Math.max(0, Number(el.value) || 0);
  if (el.dataset.pt === "stage") {
    const wasPaid = j.stage === "Paid";
    j.stage = el.value;
    if (j.stage === "Paid" && !wasPaid && jobFee(j) && state.realestate) {
      state.realestate.money.push({ id: uid(), date: todayStr(), type: "income", amount: jobFee(j), note: `Referral fee: ${p.name} (${j.what})` });
    }
  }
  save();
  render();
});

ptView.addEventListener("submit", (e) => {
  const form = e.target;
  if (currentTab === "cards" && form.dataset.ccForm === "calc") { e.preventDefault(); return; }
  if (currentTab !== "gameplan" || !form.dataset.ptForm) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const ps = partnersState();
  if (form.dataset.ptForm === "add") {
    ps.list.push({ id: uid(), name: f.name.trim(), company: (f.company || "").trim(), trade: f.trade, phone: (f.phone || "").trim(), agreed: "", jobs: [] });
  } else if (form.dataset.ptForm === "job") {
    const p = ps.list.find((x) => x.id === form.dataset.p);
    if (p) p.jobs = [...(p.jobs || []), { id: uid(), date: todayStr(), what: f.what.trim(), total: 0, stage: "Sent" }];
  }
  save();
  render();
});

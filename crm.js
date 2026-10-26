// Daily 20 CRM: a 100-day prospecting plan, a contact list, and a bridge to Follow Up Boss.
// Loaded before app.js. Uses state, save, render, uid and esc from app.js at runtime.

const FUB_SETTINGS_KEY = "command-center-fub"; // kept out of the backup file on purpose
const DEFAULT_FUB_URL = "https://fromstart2keys.com/api/crm-contact"; // no www: the site serves from the bare domain, and a redirect would break the request
const DEFAULT_REVIEW_URL = "https://fromstart2keys.com/review.html";
const REVIEW_STAGES = ["Closed", "Past Client", "Sphere"]; // who to ask first

const CRM_SOURCES = ["Sphere", "Past client", "Open house", "Social media", "Homebuyer class", "Email", "FSBO / Expired", "Door knock", "Referral", "Lender / Partner", "Other"];
const CRM_STAGES = ["Lead", "Sphere", "Hot Prospect", "Active Client", "Under Contract", "Closed", "Past Client"];
const TOUCH_TYPES = [
  { id: "call", label: "Call" },
  { id: "text", label: "Text" },
  { id: "dm", label: "DM" },
  { id: "person", label: "In person" },
  { id: "note", label: "Note card" },
];
const PLAY_LABELS = { "zestimate-text": "Zestimate texts", "video-cma": "Video CMAs", "market-text": "Market texts" };

// Days until the next follow-up after a touch, by stage.
const FOLLOW_UP_DAYS = { "Hot Prospect": 2, "Active Client": 3, "Lead": 7, "Under Contract": 7, "Sphere": 30, "Closed": 30, "Past Client": 60 };

// 100-day phases.
const PHASES = [
  { from: 1, to: 7, name: "Load the ship", text: "Pull your Follow Up Boss contacts, phone contacts and social followers into one list. Tag everyone Sphere, Past Client or Lead. Goal: 100 names in this CRM by Day 7." },
  { from: 8, to: 90, name: "Full sail", text: "Daily 20, six days a week. Prospect before you do anything else. Every new name goes into the CRM the same day." },
  { from: 91, to: 100, name: "Count the treasure", text: "Review your numbers. Ask every closed client for a review and a referral. Pick what worked and plan the next 100 days." },
];

// 100K in 100 Days playbook: one sphere-of-influence strategy per stretch of days,
// plus circle prospecting calls every week. Scripts are written in our own words.
const PLAYBOOK = [
  {
    id: "zestimate-text", from: 1, to: 33, perDay: 3, goal: 100,
    name: "Zestimate text",
    how: "Look up a homeowner you know on Zillow, screenshot their Zestimate, and text it to them with a question. People love talking about what their home is worth.",
    script: "Hi [name]! I was looking at a few homes near you on Zillow today and peeked at your Zestimate: about $___ (screenshot attached). I have my own opinion on it, but I'm curious what you think?",
  },
  {
    id: "video-cma", from: 34, to: 67, perDay: 2, goal: 60,
    name: "Unsolicited video CMA",
    how: "Record a 2–3 minute screen video (Loom or BombBomb): open on their house in Google Earth, walk through nearby active, pending and sold homes, give a value range and a rough seller net sheet. Title it \"[address] Valuation Update\" and end by inviting questions.",
    script: "Hi [name], I put together a quick video on what homes near you are selling for and where I think your home's value sits right now. No pressure at all, just thought you'd want to know. Any questions, I'm here!",
  },
  {
    id: "market-text", from: 68, to: 100, perDay: 5, goal: 100,
    name: "1-to-1 market update text",
    how: "Whenever you see a recent sale in the MLS, text someone in your sphere who lives near it. Short, personal and relevant.",
    script: "Hi [name], I was in the MLS today and saw [address] just sold in your neighborhood. Did you catch the final price?",
  },
];
const WEEKLY_CALL_GOAL = 250;

// Thursday email ideas, one per week in rotation. Outlines are in our own words;
// always swap in current local numbers from the MLS.
const EMAIL_IDEAS = [
  {
    subject: "Unpopular opinion: it's a good time to buy",
    angle: "Nudge homeowners who need to buy next.",
    outline: "A couple of years ago buyers waived inspections and bid way over asking, and many regret rushing. Today buyers have more negotiating power, more choices and more time to decide. Nobody can call the market, but it may be worth a look. P.S. Link a few good-value listings or a recent price drop.",
  },
  {
    subject: "This type of home is sitting on the market",
    angle: "Tell sellers what buyers want right now.",
    outline: "Most buyers want move-in ready, not a project. Homes that need work sit longer, and well-priced turnkey homes sell faster. The upgrades that matter most: floors, fresh paint, kitchen and bathrooms. Mention your own staircase and floor project. P.S. Not sure where your home falls? Reply and let's talk.",
  },
  {
    subject: "How much equity do you have right now?",
    angle: "One interesting number that starts a conversation.",
    outline: "Share a current equity figure for homeowners in your area, compared with a few years ago. Everyone's situation is different. If it's been over a year since your last equity update, reply \"I'm curious\" with your address and I'll put one together.",
  },
  {
    subject: "Quick poll: what matters most to you?",
    angle: "An easy reply that turns into a seller conversation.",
    outline: "As the season changes, what's most important to you? 1) Selling for top dollar 2) Selling quickly and easily 3) Finding a home you love and can afford 4) All of the above. Just reply with a number. P.S. If this market feels stressful, you're not alone. Reply and we'll talk through your situation.",
  },
  {
    subject: "Why are home prices still so high?",
    angle: "Show you understand their frustration, using real data.",
    outline: "Share your local median price compared with last year, how inventory has changed, and how fast homes are selling. Low supply plus steady demand keeps prices up. It's a key time to stay informed. P.S. Thinking about buying or selling? Reply and let's solve your specific situation.",
  },
  {
    subject: "Homeowners are sitting on a lot of equity",
    angle: "A big-picture number that sparks curiosity.",
    outline: "Share a current national or local equity figure and how much it has grown. Curious what yours is? Reply with your address and I'll send you a personal equity update.",
  },
  {
    subject: "Most homeowners don't realize this...",
    angle: "Be the person who explains the market.",
    outline: "Most owners have a mortgage rate below today's rates, so headlines say nobody is selling. But locally, homes are still selling every month (share your number). Supply is tight, and the market is steadier than the news makes it sound. P.S. Thinking of selling before the busy season? Reply and we'll set a time to talk.",
  },
  {
    subject: "Your Zestimate vs. your home's real value",
    angle: "A short hypothetical that's hard not to answer.",
    outline: "Keep it to two lines: What if a buyer offered you 10% over your Zestimate? Would you sell this season?",
  },
  {
    subject: "Foreclosures are up, but here's the real story",
    angle: "A headline-grabbing word, followed by calm context.",
    outline: "Share a current foreclosure trend, then the context: still far below the 2010 crash. What it means: don't expect prices to crash. Look at the bigger picture. P.S. Buying soon? Reply with your ideal neighborhood and price range and I'll watch for deals.",
  },
  {
    subject: "Hot or cold?",
    angle: "Ask them to predict the market.",
    outline: "One line: How hot do you think the market will be this winter? Reply with an emoji 🔥 or 🧊. Can't wait to hear what you think!",
  },
  {
    subject: "Rent vs. sell",
    angle: "Offer a free report for owners weighing their options.",
    outline: "Many owners wonder whether to sell or rent out their home. A Rent vs. Sell Analysis shows the yearly rental income they could earn next to their estimated net from selling, based on local trends and the home's condition. Helpful even with no plans to move. Want me to put one together for you?",
  },
  {
    subject: "Crazy not to sell?",
    angle: "Everyone has a number. Find out theirs.",
    outline: "If you've thought about selling, you've probably wondered whether now is the time or whether to wait and see. It's a confusing market. Just curious: do you have an \"I'd be crazy not to sell\" price in mind?",
  },
  {
    subject: "Let me guess...",
    angle: "Show sellers who need to buy next that you have a plan.",
    outline: "You haven't listed because you haven't found your next home. I hear this all the time. Making an offer that depends on selling first can kill the deal, so many sellers feel stuck. I have a plan for exactly this. Text or call me and we'll map out the right strategy for you.",
  },  {
    subject: "Name your price",
    angle: "A fill-in-the-blank that gets homeowners to name their number. The playbook's top performer.",
    outline: "One line: \"If I could sell my house for $_____, I'd list it this season.\" Ask them to reply with their number. P.S. Don't be afraid to think big.",
  },
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
      "Ask 3 past clients for a review (Reviews card below)",
      "Google Business post: market update",
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
      "Google Business post: home tip or just sold",
    ],
    script: "Hi, I'm Devin with From Start 2 Keys. I just helped a family close on a home right down the street. Are you curious what that means for your home's value?",
  },
  {
    theme: "Content & social",
    steps: [
      "Send this week's value email to your whole database (Weekly email card)",
      "Post this week's video and reply to every comment",
      "DM 10 people who liked, commented or watched",
      "Text 5 sphere contacts the video: \"Thought you'd find this useful\"",
    ],
    script: "Hey ___, thanks for watching! Are you thinking about buying soon, or just learning for now?",
  },
  {
    theme: "Homebuyer class & partners",
    steps: [
      "Call everyone who opened Thursday's email, using the OFQ guide",
      "Text 10 class registrants or past attendees",
      "Call 3 lenders or referral partners",
      "Write 5 handwritten notes",
      "Lock in a weekend open house",
      "Google Business post: homebuyer class or open house",
    ],
    script: "Hi ___, it's Devin from the homebuyer class. Did you get a chance to talk with a lender yet? I can connect you with someone great.",
  },
  {
    theme: "Open house day",
    steps: [
      "Host an open house. Goal: 20 sign-ins, all added to the CRM",
      "Put the review QR card on the sign-in table",
      "No open house? Coffee or lunch with 2 sphere people and 18 texts",
    ],
    script: "Thanks for coming by! Are you looking in this neighborhood, or just getting ideas? I'll send you the homes that don't make it online.",
  },
];

// Google Business Profile: 3 posts a week. Ideas rotate weekly.
const GBP_SLOTS = [
  { day: "Mon", type: "Market update", ideas: [
    "What homes sold for in your area last month, in 3 bullet points",
    "Interest rates this week and what they mean for a $450K home payment",
    "How many days homes are sitting on the market in Tacoma right now",
    "Buyer's market or seller's market? Your honest take for South Sound",
  ] },
  { day: "Wed", type: "Home tip or Just Sold", ideas: [
    "Just Sold: photo of the home + one line about the family (with permission)",
    "One of the 5 first-time buyer mistakes, with a photo of you at a showing",
    "Closing costs explained in plain words",
    "What to fix before you list, and what to skip",
  ] },
  { day: "Fri", type: "Event or offer", ideas: [
    "Free homebuyer class: dates + register link (use the Event post type)",
    "This weekend's open house: address, time and 3 photos",
    "Free home value check: \"Curious what your home is worth? Message me\"",
    "Down payment assistance programs in Washington: book a free call",
  ] },
];

function weekKey() {
  const d = new Date(todayStr() + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d.toLocaleDateString("en-CA");
}

function weekNumber() {
  return Math.floor(new Date(weekKey() + "T12:00:00").getTime() / (7 * 86400000));
}

function reviewUrl() {
  return state.crm.reviewUrl || DEFAULT_REVIEW_URL;
}

function reviewMessage(c) {
  const name = c && c.firstName ? c.firstName : "there";
  return `Hi ${name}, it's Devin! It was a pleasure working with you. Would you take one minute to leave me a quick review? It really helps other families find me: ${reviewUrl()}`;
}

function reviewEmail() {
  return `Subject: A quick favor?\n\nHi ___,\n\nThank you again for trusting me with your move. If you have one minute, a short review on Google or Facebook would mean a lot and helps other families find me:\n\n${reviewUrl()}\n\nThank you!\nDevin Brown\nFrom Start 2 Keys`;
}

function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => prompt("Copy this:", text));
  else prompt("Copy this:", text);
}

// ---------- data ----------

function defaultCrm() {
  return { startDate: "", dailyTarget: 20, contacts: [], touches: [], reviewUrl: "", gbp: {}, emails: {}, doubleDips: [] };
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

function reviewBadge(c) {
  if (c.review === "reviewed") return `<span class="pos" title="Left a review">★ Reviewed</span>`;
  if (c.review === "asked") {
    return `<span class="muted">Asked ${esc((c.reviewAsked || "").slice(5))}</span>
      <button class="x" data-crm="reviewed" data-id="${c.id}" title="They left a review">★ Got it</button>`;
  }
  return `<button class="x" data-crm="ask-review" data-id="${c.id}" title="Text them your review link">Ask review</button>
    <button class="x" data-crm="mark-asked" data-id="${c.id}" title="You already sent the link another way">Already asked</button>`;
}

function renderPlaybook() {
  const day = challengeDay();
  const play = PLAYBOOK.find((p) => day >= p.from && day <= p.to) || PLAYBOOK[0];
  const sent = state.crm.touches.filter((t) => t.type === play.id);
  const today = sent.filter((t) => t.date === todayStr()).length;
  const week = weekKey();
  const calls = state.crm.touches.filter((t) => t.type === "call" && t.date >= week).length;
  const pct = (n, goal) => Math.min(100, (n / goal) * 100);
  return `<div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>100K Playbook: ${esc(play.name)}</h3>
      <p class="muted">${day > 0 && day <= 100 ? `Days ${play.from}–${play.to}` : `Starts on Day ${play.from}. Set your start date in CRM settings.`} · ${play.perDay} a day · goal ${play.goal}</p>
      <div class="stats">
        <div class="stat"><div class="label">Today</div><div class="value">${today} / ${play.perDay}</div></div>
        <div class="stat"><div class="label">Total</div><div class="value">${sent.length} / ${play.goal}</div></div>
      </div>
      <div class="bar"><div style="width:${pct(sent.length, play.goal)}%"></div></div>
      <p class="muted" style="margin-top:10px">${esc(play.how)}</p>
      <p class="muted"><strong>Script:</strong> ${esc(play.script)}</p>
      <div class="btn-row">
        <button class="primary" data-crm="touch" data-type="${play.id}">+1 sent</button>
        <button data-crm="copy-play" data-text="${esc(play.script)}">Copy script</button>
      </div>
    </div>

    <div class="card">
      <h3>Circle prospecting</h3>
      <div class="stats">
        <div class="stat"><div class="label">Calls this week</div><div class="value">${calls} / ${WEEKLY_CALL_GOAL}</div></div>
      </div>
      <div class="bar"><div style="width:${pct(calls, WEEKLY_CALL_GOAL)}%"></div></div>
      <p class="muted" style="margin-top:10px">About 50 calls a weekday. Every call you log with the <strong>Call</strong> button counts here. Rotate three openers: a market update, a new listing nearby, or a home that just sold nearby. Start with owners who've been in their homes 5+ years.</p>
      <details>
        <summary class="muted"><strong>Three voicemail openers</strong></summary>
        <p class="muted"><strong>Just sold:</strong> "Hi, it's Devin with From Start 2 Keys. A home near you on [street] just sold, and it went for [over asking / a strong price]. When that happens, a few neighbors usually start thinking about a move. If you know anyone curious about selling, call or text me at [number]."</p>
        <p class="muted"><strong>Market update:</strong> "Hi, it's Devin with From Start 2 Keys. Home values in [neighborhood] have been moving faster than most of [city], and some owners are starting to look at their options. Even if you're not selling, I'm happy to send you a real estimate of your home's value, much more accurate than an online one. Call or text me at [number]."</p>
        <p class="muted"><strong>Neighbor appointment:</strong> "Hi, it's Devin, a local agent with From Start 2 Keys. I'm meeting with one of your neighbors on [day] to talk about selling their home, so I'm offering free home equity updates to anyone nearby while I'm in the area. Would that be helpful for you?"</p>
      </details>
    </div>
  </div>`;
}

// Weekly email (Thursday send, Friday calls to openers) and the twice-a-month Double Dip.
function renderEmailAndDoubleDip() {
  const crm = state.crm;
  const week = weekKey();
  const email = crm.emails[week] || { sent: false, openRate: "" };
  const month = todayStr().slice(0, 7);
  const dips = crm.doubleDips.filter((d) => d.startsWith(month)).length;
  const pastRates = Object.entries(crm.emails)
    .filter(([w, e]) => w !== week && e.openRate !== "" && e.openRate != null)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 4)
    .map(([w, e]) => `${w.slice(5)}: ${e.openRate}%`)
    .join(" · ");
  return `<div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>Weekly email</h3>
      <ul class="list">
        <li class="${email.sent ? "done" : ""}"><input type="checkbox" data-crm="email-sent" ${email.sent ? "checked" : ""}>
          <span class="grow"><strong>Thursday:</strong> send a value email to your whole database (buyers, sellers, sphere)</span></li>
        <li><span class="grow"><strong>Friday:</strong> call everyone who opened it. Most opens happen in the first 24 hours. Log each with the Call button.</span></li>
        <li><span class="grow"><strong>After each call:</strong> send a short follow-up email confirming what you talked about.</span></li>
      </ul>
      ${(() => {
        // Follow the 100 days when a start date is set (week 1 gets idea #1), otherwise the calendar week.
        const day = challengeDay();
        const index = day > 0 ? Math.floor((day - 1) / 7) : weekNumber();
        const idea = EMAIL_IDEAS[index % EMAIL_IDEAS.length];
        return `<div class="muted" style="margin:10px 0">
          <strong>This week's email idea (#${(index % EMAIL_IDEAS.length) + 1} of ${EMAIL_IDEAS.length}):</strong> "${esc(idea.subject)}"<br>
          <em>${esc(idea.angle)}</em> ${esc(idea.outline)}<br>
          Use current numbers from your MLS, not old national stats.
          <div class="btn-row"><button data-crm="copy-play" data-text="${esc(idea.subject)}">Copy subject line</button></div>
        </div>`;
      })()}
      <form class="row" data-crm-form="open-rate">
        <label class="muted">This week's open rate <input type="number" name="openRate" min="0" max="100" step="any" value="${esc(email.openRate)}" style="width:90px"> %</label>
        <button>Save</button>
      </form>
      ${pastRates ? `<p class="muted">Past weeks: ${pastRates}</p>` : ""}
      <details>
        <summary class="muted"><strong>OFQ call guide</strong></summary>
        <ol class="muted">
          <li><strong>Get permission:</strong> Opening (your name and company), a Fact you both agree on, an easy Question. "Hi, it's Devin with From Start 2 Keys. You opened my email about [topic] yesterday. Are you still thinking about a move, or just keeping an eye on the market?"</li>
          <li><strong>Explore their situation</strong> before talking about what they want.</li>
          <li><strong>Ask deeper questions:</strong> how long they've been thinking about it, what's prompting it, when they'd like to move.</li>
          <li><strong>Big-picture close:</strong> "Based on what you're saying, it sounds like the best next step is…" (meet, send homes, or send a value report).</li>
          <li><strong>Recap and check:</strong> what's holding them back, and who else is part of the decision.</li>
          <li><strong>Agree on next steps</strong>, then ask "What else can I help with?"</li>
          <li><strong>Confirm in writing</strong> by email or text.</li>
          <li><strong>Set the next touch</strong> on a specific day and time.</li>
        </ol>
        <p class="muted">Avoid "just checking in" or "touching base." Open with a reason that helps them.</p>
      </details>
    </div>

    <div class="card">
      <h3>Double Dip</h3>
      <div class="stats">
        <div class="stat"><div class="label">This month</div><div class="value">${dips} / 2</div></div>
      </div>
      <div class="bar"><div style="width:${Math.min(100, dips * 50)}%"></div></div>
      <ol class="muted" style="margin-top:10px">
        <li><strong>Find a hidden gem:</strong> a price cut, an underpriced home, or an off-market or upcoming listing you know about.</li>
        <li><strong>Post it</strong> on Instagram, Facebook and TikTok. Invite comments and DMs.</li>
        <li><strong>Email your database</strong> a link to the post.</li>
        <li><strong>Follow up</strong> with everyone who comments, DMs or opens the email.</li>
      </ol>
      <button class="primary" data-crm="double-dip">+1 Double Dip done</button>
    </div>
  </div>`;
}

function renderReviewsAndPosts() {
  const crm = state.crm;
  const asked = crm.contacts.filter((c) => c.review === "asked").length;
  const reviewed = crm.contacts.filter((c) => c.review === "reviewed").length;
  const toAsk = crm.contacts
    .filter((c) => !c.review && REVIEW_STAGES.includes(c.stage))
    .sort((a, b) => REVIEW_STAGES.indexOf(a.stage) - REVIEW_STAGES.indexOf(b.stage))
    .slice(0, 5);
  const week = weekKey();
  const posted = crm.gbp[week] || [];
  const n = weekNumber();

  return `<div class="grid" style="margin-top:16px">
    <div class="card">
      <h3>Reviews</h3>
      <div class="stats">
        <div class="stat"><div class="label">Asked</div><div class="value">${asked}</div></div>
        <div class="stat"><div class="label">Reviews</div><div class="value">${reviewed}</div></div>
      </div>
      <p class="muted">Your review page: <a href="${esc(reviewUrl())}" target="_blank" rel="noopener">${esc(reviewUrl().replace(/^https?:\/\//, ""))}</a>
        · <a href="${esc(reviewUrl())}?print" target="_blank" rel="noopener">Print QR card</a></p>
      <div class="btn-row">
        <button data-crm="copy" data-what="text">Copy review text</button>
        <button data-crm="copy" data-what="email">Copy review email</button>
      </div>
      <div class="muted" style="margin-top:8px">Ask next (closed, past clients, then sphere):</div>
      <ul class="list">${toAsk.map((c) => `<li><span class="grow">${esc(contactName(c))} <span class="muted">${esc(c.stage)}</span></span>
        <button class="x" data-crm="ask-review" data-id="${c.id}">Ask review</button></li>`).join("") ||
        `<li class="muted">Add past clients and sphere contacts to see who to ask.</li>`}</ul>
      <p class="muted">Best times to ask: at closing, at the 1-week check-in, right after someone thanks you, and at open houses with the QR card.</p>
    </div>

    <div class="card">
      <h3>Google Business posts</h3>
      <p class="muted">${posted.filter(Boolean).length} of 3 posted this week · <a href="https://business.google.com/" target="_blank" rel="noopener">Open Google Business Profile</a></p>
      <ul class="list">${GBP_SLOTS.map((slot, i) => `<li class="${posted[i] ? "done" : ""}">
        <input type="checkbox" data-crm="gbp" data-i="${i}" ${posted[i] ? "checked" : ""}>
        <span class="grow"><strong>${slot.day}: ${esc(slot.type)}</strong><br><span>${esc(slot.ideas[n % slot.ideas.length])}</span></span>
      </li>`).join("")}</ul>
      <p class="muted">Every post: one real photo, 100–300 words, mention your town, and add a button linking to fromstart2keys.com. Cut posts from your weekly video to save time.</p>
    </div>
  </div>`;
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
  // Playbook types only show once you've logged one today.
  const playTypes = Object.entries(PLAY_LABELS)
    .map(([id, label]) => ({ id, label }))
    .filter((t) => todayTouches.some((x) => x.type === t.id));
  const byType = [{ id: "new", label: "New people" }, ...TOUCH_TYPES, ...playTypes]
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
      ${reviewBadge(c)}
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

  ${renderPlaybook()}

  ${renderEmailAndDoubleDip()}

  ${renderReviewsAndPosts()}

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
      <label class="muted"><input type="checkbox" name="reviewAsked"> I already sent them the review link</label>
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
      <input name="reviewUrl" type="url" placeholder="Review page link" value="${esc(reviewUrl())}" style="flex-basis:100%">
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
    case "double-dip":
      crm.doubleDips.push(todayStr());
      break;
    case "copy-play":
      copyText(btn.dataset.text);
      btn.textContent = "Copied!";
      return;
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
    case "ask-review": {
      const c = crm.contacts.find((x) => x.id === id);
      if (!c) return;
      const msg = reviewMessage(c);
      copyText(msg);
      c.review = "asked";
      c.reviewAsked = todayStr();
      logTouch("text", id);
      save();
      render();
      if (c.phone) location.href = `sms:${c.phone}?&body=${encodeURIComponent(msg)}`;
      return;
    }
    case "mark-asked": {
      const c = crm.contacts.find((x) => x.id === id);
      if (!c) return;
      c.review = "asked";
      c.reviewAsked = todayStr();
      break;
    }
    case "reviewed": {
      const c = crm.contacts.find((x) => x.id === id);
      if (c) c.review = "reviewed";
      break;
    }
    case "copy":
      copyText(btn.dataset.what === "email" ? reviewEmail() : reviewMessage(null));
      btn.textContent = "Copied!";
      return;
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
  if (el.dataset.crm === "email-sent") {
    const week = weekKey();
    state.crm.emails[week] = { openRate: "", ...(state.crm.emails[week] || {}), sent: el.checked };
    save();
    render();
    return;
  }
  if (el.dataset.crm === "gbp") {
    const week = weekKey();
    const posted = state.crm.gbp[week] || [false, false, false];
    posted[Number(el.dataset.i)] = el.checked;
    state.crm.gbp[week] = posted;
    save();
    render();
    return;
  }
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
    state.crm.reviewUrl = f.reviewUrl.trim();
    saveFubSettings({ url: f.url.trim(), passcode: f.passcode });
    save();
    render();
    return;
  }
  if (form.dataset.crmForm === "open-rate") {
    const week = weekKey();
    state.crm.emails[week] = { sent: false, ...(state.crm.emails[week] || {}), openRate: f.openRate === "" ? "" : Number(f.openRate) };
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
    review: f.reviewAsked ? "asked" : "",
    reviewAsked: f.reviewAsked ? todayStr() : "",
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

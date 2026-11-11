# Command Center

One page to run all my businesses:

- **From Start 2 Keys**: real estate clients, plus the 2026 plan ($100K tracker, weekly scorecard, close-my-buyers checklist, homebuyer class funnel, review goal)
- **Dropshipping** (Stack & Smoke, stackandsmoke.com): a Stack & Smoke HQ panel (Black Friday and shipping-cutoff countdowns, a launch checklist with a NEXT step, the week-by-week holiday plan with this week highlighted, monthly tool costs and how many Starter Stacks cover them, and quick links to the store, AutoDS, Ads Manager, the marketing playbook and the theme repo), a Research → Build → Launch store roadmap (following the Power of Three course), a product scorecard (cost, shipping, price → profit after Shopify fees, markup, break-even ROAS and a 0–100 score), and an ad test log that calls each product Kill, Keep testing, Profitable or Scale, and can add ad spend and sales to Money in / out
- **Cards**: eBay card inventory
- **Vet Bros Trucking**: loads
- **Juice Havan**: cold-pressed juice pre-orders
- **Video Content**: Canon R8 posts with views, plus paid video shoots
- **Gaming**: TikTok and YouTube videos and views

The **Game Plan** tab (second tab) holds:
- **Monday review**: what slipped last week (Daily 20 days missed, overdue follow-ups, stalled deals, class follow-ups not sent, SOI list not worked, no review asks, no Thursday email, appointments under 5, Stack & Smoke under its tool costs, Friday review skipped) turned into three priorities for the week. They lock on the first look of the week, show on the Overview as "This week's 3", and each has a Go button to the right tab.
- **KPI dashboard**: closings vs. 20 a year (with an on-pace number), Google reviews vs. 200, class signups vs. 240, eBay card sales, Stack & Smoke sales vs. monthly tools, and commission this year. Goals and the booking link are editable.
- **Class to client**: paste a class's attendees (name, phone, email per line) and each lands in the CRM as a Homebuyer class lead with the next step "Book a 1-on-1 game plan", optionally shared with the lender's Client Pool, and a 4-step follow-up (same night, day 2, day 7, day 14) with the booking link in each text. Booked stops the sequence.
- **SOI outreach**: contacts grouped into past clients, class grads, sphere and cold (active clients stay in the Daily 20), with a weekly list of who's due (longest since contact first), this month's drafted message per group, and Call / Text / Email buttons that count toward the Daily 20.

Every contact also has a **Next step** field; contacts shared with the lender send it to the Client Pool.

The **Daily 20 CRM** tab runs a 100-day prospecting plan: 20 conversations a day, a weekly rhythm with scripts, follow-up reminders and a contact list. New contacts can also be sent to Follow Up Boss through the `/api/crm-contact` function on the fromstart2keys site (set `CRM_PASSCODE` on Vercel and type the same passcode into CRM settings).

The **Dialer** tab is a one-line power dialer for farm lists. Import an Equity Title (or skip-trace) CSV and it finds the owner name, site address and every phone column, and skips numbers marked DNC in the file. Each list has to be marked as scrubbed against the National Do Not Call Registry (good for 31 days) before it can be called, calls are only allowed 8am–8pm, and anyone you mark Do not call is never dialed again. Outcomes (keys 1–8) advance to the next owner; Call back, Interested and Appointment set add the owner to the Daily 20 CRM with a follow-up date, and every real conversation counts toward the Daily 20. Two ways to call: **My phone** (free, opens your phone app) or **Business line**, which calls from the browser on a Telnyx number using `/api/dialer-token` on the fromstart2keys site (set `TELNYX_API_KEY`, `TELNYX_CREDENTIAL_ID` and `TELNYX_CALLER_ID` on Vercel). The Telnyx calling library is in `vendor/telnyx-webrtc.js` (MIT) and only loads when you use the business line.

Dialer extras:
- **Equity Title files**: import the Likely Listings .xlsx directly (SheetJS, Apache-2.0, in `vendor/xlsx.full.min.js`, loaded only for Excel files). Property details (beds, baths, sqft, year built, last sale, years owned, absentee owner, do-not-mail) show on each lead and `{years}` works in scripts. Owners already in the dialer are matched by parcel or address, so overlapping farms aren't duplicated.
- **Skip trace**: lists with owners missing phones get a **Skip trace file** button (CSV for any skip-trace service). Import the results file and the phone numbers attach to the matching owners.
- **DNC registry upload**: download your area codes from telemarketing.donotcall.gov, unzip, and upload the file under Lists. Matches are flagged and skipped, and every list the file fully covers is cleared for 31 days.
- **Voicemail drop**: record a generic voicemail once (Dialer settings → 4. Voicemail, saved on that device). On a connected business-line call, tap 📼 Drop voicemail or press V: it plays the recording, hangs up and logs Left voicemail. Phone calls show a voicemail script to read.
- **Objection cards** sit beside the script and are editable in settings.
- **Text the report**: opens a text with your home value link, only after you confirm they agreed to a text on the call, and notes the consent on the lead.
- **Circle a sale**: enter an address that just sold or listed and the queue shows neighbors on that street, closest house numbers first, with a circle opener on the script.
- **Results**: contact rate counted by people (not dials), appointment rate, dials per appointment, best hours and per-list results.
- **Power hour**: set a dial and conversation goal and track the session live.
- **Practice mode**: timed opener reps plus random objections from your cards. Ones you mark Need work come up more often.
- **Spar** (the red orb on the Dialer tab, or 🔴 Spar): a full-screen practice call. Pick who picks up (busy parent, skeptical retiree, curious maybe-seller, already has an agent, hostile) and a difficulty. The homeowner talks out loud, throws objections from your cards, asks you questions and scores every line, with a trust meter, coaching tips and a grade at the end. Answer with your mic (Chrome; hold or tap Space) or by typing. It runs on a built-in homeowner by default; for a real AI homeowner, add `ANTHROPIC_API_KEY` on Vercel for the fromstart2keys site (it uses `/api/spar` with the same site link and passcode as Follow Up Boss). Objections you miss come up more often in Spar and Practice.
- Call back, Interested and Appointment leads go to Follow Up Boss automatically when it's connected (can be turned off).

The **Client Pool** connection shares contacts with your lender. Tap **+ Lender** on a contact (or tick "Share with my lender" when adding someone) and they appear on `fromstart2keys.com/pool`, where your lender updates loan status, pre-approval amount, down payment assistance and notes. Those updates show back on the contact as 🏦 and refresh when the app opens. It uses the same site link and passcode as Follow Up Boss; your lender signs in with `LENDER_PASSCODE` and only sees the pool, never the rest of this app.

The **Deal of the Week** card (Overview and From Start 2 Keys tabs) shows this week's deal from `fromstart2keys.com/deal` with visits, MLS clicks and leads by source, plus the Deal of the Week leads already in your CRM. Buttons open the live page and the update page. Same site link and passcode as Follow Up Boss.

The **Inbox** tab connects to Gmail in the browser (Google OAuth client ID in Inbox settings), finds potential clients to add to the CRM, and suggests what to unsubscribe from or archive. Nothing changes in Gmail without a confirm, and scan results are never saved.

**Cloud sync** (CRM settings → Turn on cloud sync) saves the whole app to the fromstart2keys site (`/api/cc-sync`, Upstash Redis via Vercel Storage) so phone and laptop share data. It uses the same site link and passcode as the Follow Up Boss connection.

Each business has its own tab for monthly income, expenses and a profit goal, a to-do list, a pipeline board, quick links and notes. The Overview tab shows totals across all the businesses.

Look and navigation: the app uses an amber hologram theme. The Overview opens on an animated hub with a tile for every tab (tasks and follow-ups only, no dollar amounts) and three gauges. The hidden **MENU** tab on the left edge (or the ` key) lists every tab in order with quick actions, and can hide the top tab bar. Red haki lightning crackles around the Daily 20 and Dialer and bursts when you set an appointment or hit your Daily 20.

## Use it

Open `index.html` in a browser, or turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The site will then be at `https://devbrown23.github.io/command-center/`.

No build step and no install. It's plain HTML, CSS and JavaScript.

## Your data

Everything you enter is saved in your browser (localStorage), not in this repo, so the code can be public while your numbers stay private. Data does **not** sync between devices or browsers. Use **Export backup** to save a `.json` file and **Import backup** to load it somewhere else.

## Customize

Business names, colors, pipeline stages and default links are in the `BUSINESSES` list at the top of `app.js`.

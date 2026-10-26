# Command Center

One page to run all my businesses:

- **From Start 2 Keys**: real estate clients, plus the 2026 plan ($100K tracker, weekly scorecard, close-my-buyers checklist, homebuyer class funnel, review goal)
- **Dropshipping**: products
- **Cards**: eBay card inventory
- **Vet Bros Trucking**: loads
- **Juice Havan**: cold-pressed juice pre-orders
- **Video Content**: Canon R8 posts with views, plus paid video shoots
- **Gaming**: TikTok and YouTube videos and views

The **Daily 20 CRM** tab runs a 100-day prospecting plan: 20 conversations a day, a weekly rhythm with scripts, follow-up reminders and a contact list. New contacts can also be sent to Follow Up Boss through the `/api/crm-contact` function on the fromstart2keys site (set `CRM_PASSCODE` on Vercel and type the same passcode into CRM settings).

The **Inbox** tab connects to Gmail in the browser (Google OAuth client ID in Inbox settings), finds potential clients to add to the CRM, and suggests what to unsubscribe from or archive. Nothing changes in Gmail without a confirm, and scan results are never saved.

Each business has its own tab for monthly income, expenses and a profit goal, a to-do list, a pipeline board, quick links and notes. The Overview tab shows totals across all the businesses.

## Use it

Open `index.html` in a browser, or turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The site will then be at `https://devbrown23.github.io/command-center/`.

No build step and no install. It's plain HTML, CSS and JavaScript.

## Your data

Everything you enter is saved in your browser (localStorage), not in this repo, so the code can be public while your numbers stay private. Data does **not** sync between devices or browsers. Use **Export backup** to save a `.json` file and **Import backup** to load it somewhere else.

## Customize

Business names, colors, pipeline stages and default links are in the `BUSINESSES` list at the top of `app.js`.

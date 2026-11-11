// Hidden menu: a slide-out drawer with every tab in order, quick actions and a switch to hide the top tab bar.
// Open with the MENU tab on the left edge or the ` key; Esc closes. Number keys jump while it's open.
// Loaded after app.js. Uses currentTab, render, BUSINESSES at runtime.

(function () {
  const HIDE_KEY = "command-center-hide-tabs";
  const ABOUT = {
    overview: "The hub: everything at a glance",
    gameplan: "This week's 3, KPIs, SOI list, class follow-ups",
    crm: "Daily 20 conversations, follow-ups, contacts",
    dialer: "Farm list calling, scripts, practice",
    inbox: "Find leads in Gmail, clean up",
  };
  const items = () => [
    { id: "overview", name: "Overview" },
    { id: "gameplan", name: "Game Plan" },
    { id: "crm", name: "Daily 20 CRM" },
    { id: "dialer", name: "Dialer" },
    { id: "inbox", name: "Inbox" },
    ...BUSINESSES.map((b) => ({ id: b.id, name: b.name, about: b.subtitle })),
  ];

  const handle = document.createElement("button");
  handle.className = "menu-handle";
  handle.innerHTML = "<span>☰</span><b>MENU</b>";
  handle.title = "Open menu ( ` )";
  const shade = document.createElement("div");
  shade.className = "menu-shade";
  const drawer = document.createElement("aside");
  drawer.className = "menu-drawer";
  drawer.setAttribute("aria-label", "Menu");
  document.body.append(handle, shade, drawer);

  const hidden = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch (e) { return false; } };
  const applyHidden = () => document.body.classList.toggle("tabs-hidden", hidden());
  applyHidden();

  function go(id) {
    currentTab = id;
    location.hash = id;
    render();
    close();
    scrollTo({ top: 0, behavior: "smooth" });
  }

  function paint() {
    const list = items().map((t, i) => `
      <button class="menu-item ${t.id === currentTab ? "on" : ""}" data-menu-go="${t.id}">
        <span class="menu-num">${i < 10 ? i : "·"}</span>
        <span class="menu-txt"><strong>${esc(t.name)}</strong><small>${esc(ABOUT[t.id] || t.about || "")}</small></span>
      </button>`).join("");
    drawer.innerHTML = `
      <div class="menu-head"><div class="menu-title">Command Center</div><button class="menu-x" data-menu="close" title="Close (Esc)">✕</button></div>
      <div class="menu-sec">Tabs, in order</div>
      <nav class="menu-list">${list}</nav>
      <div class="menu-sec">Quick actions</div>
      <div class="menu-actions">
        <button data-menu="power">⚡ Start power hour</button>
        <button data-menu="practice">🎯 Practice calls</button>
        <button data-menu="export">⤓ Export backup</button>
        <button data-menu="import">⤒ Import backup</button>
        <button data-menu="tabs">${hidden() ? "Show the top tab bar" : "Hide the top tab bar"}</button>
      </div>
      <p class="menu-tip">Press <kbd>\`</kbd> to open this menu anytime. Number keys jump to a tab while it's open.</p>`;
  }

  function open() { paint(); document.body.classList.add("menu-open"); }
  function close() { document.body.classList.remove("menu-open"); }

  handle.addEventListener("click", open);
  document.addEventListener("click", (e) => { if (e.target.closest("[data-open-menu]")) { e.stopPropagation(); open(); } }, true);
  shade.addEventListener("click", close);
  drawer.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-menu-go]");
    if (goBtn) return go(goBtn.dataset.menuGo);
    const a = e.target.closest("[data-menu]");
    if (!a) return;
    switch (a.dataset.menu) {
      case "close": close(); break;
      case "export": document.getElementById("export").click(); close(); break;
      case "import": document.getElementById("import").click(); close(); break;
      case "tabs":
        try { localStorage.setItem(HIDE_KEY, hidden() ? "0" : "1"); } catch (err) { /* storage blocked */ }
        applyHidden(); paint(); break;
      case "power":
      case "practice":
        go("dialer");
        setTimeout(() => document.querySelector(`[data-dial="${a.dataset.menu === "power" ? "session-start" : "practice"}"]`)?.click(), 60);
        break;
    }
  });

  // ` toggles, Esc closes, numbers jump. Capture phase so the dialer's 1–8 keys don't fire while the menu is open.
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    const isOpen = document.body.classList.contains("menu-open");
    if (e.key === "`" && !typing) { e.preventDefault(); isOpen ? close() : open(); return; }
    if (!isOpen) return;
    if (e.key === "Escape") { close(); e.stopPropagation(); return; }
    if (/^[0-9]$/.test(e.key)) {
      const t = items()[+e.key];
      if (t) { e.preventDefault(); e.stopPropagation(); go(t.id); }
    }
  }, true);
})();

// Dashboard: configurable widget grid with pages/slots
exports.init = function init(ctx) {
  const { config, appItem } = ctx;
  const path = require('path');
  const fs = require('fs');
  const { parseStringPromise } = require('xml2js');
  const si = require('systeminformation');
  const DEG = '\u00B0';

  // State and defaults
  let timers = [];
  const addTimer = (id) => { if (id) timers.push(id); };
  function clearTimers() { try { timers.forEach(clearInterval); } catch {} timers = []; }
  let editMode = false;
  
  // Use app-specific dashboard config
  const appId = appItem ? appItem.id : 'default';
  const dashboards = (config.dashboards = config.dashboards || {});
  const dash = (dashboards[appId] = dashboards[appId] || {});
  dash.pages = Array.isArray(dash.pages) && dash.pages.length ? dash.pages : [
    { columns: 3, widgets: [ { type:'clock', span: 1 }, { type:'weather', span: 1 }, { type:'system', span: 1 } ] }
  ];
  let pageIndex = Math.max(0, Math.min((dash.pageIndex|0)||0, dash.pages.length-1));

  function saveConfig() {
    try { 
      // Make sure we're saving to the correct app-specific config
      const appId = appItem ? appItem.id : 'default';
      const dashboards = (config.dashboards = config.dashboards || {});
      const dash = dashboards[appId];
      if (dash) {
        dash.pageIndex = pageIndex;
      }
      fs.writeFileSync(path.join(__dirname, '..', 'config.json'), JSON.stringify(config, null, 2)); 
    } catch {}
  }

  // Helpers
  function formatBps(bps) { const units=['bps','Kbps','Mbps','Gbps']; let i=0, v=Math.max(0,bps); while(v>=1000&&i<units.length-1){v/=1000;i++;} return v.toFixed(1)+' '+units[i]; }

  // Widget registry (built-ins; can be extended by external files)
  let widgets = {
    clock: {
      title: 'Clock',
      render(container) {
        container.innerHTML = `<div class="row" style="justify-content: space-between; align-items: end;">
          <div><div class="title">Now</div><div class="time" id="dashClock">--:--</div><div class="sub" id="dashDate">-</div></div>
          <div style="text-align:right;"><div class="sub">Mini Touch Dashboard</div></div>
        </div>`;
        function tick() {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2,'0');
          const mm = String(now.getMinutes()).padStart(2,'0');
          const clock = container.querySelector('#dashClock');
          const date = container.querySelector('#dashDate');
          if (clock) clock.textContent = `${hh}:${mm}`;
          if (date) date.textContent = now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
        }
        tick(); addTimer(setInterval(tick, 1000));
      }
    },
    weather: {
      title: 'Weather',
      render(container) {
        container.innerHTML = `<div class="title">Weather</div><div class="big" id="wCur">-</div><div class="sub" id="wSum">-</div><div class="weather-grid" id="wGrid"></div>`;
        async function load() {
          const lat = config.latitude, lon = config.longitude;
          const tempUnit = config.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
          const windUnit = config.windSpeedUnit === 'mph' ? 'mph' : 'kmh';
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
          try {
            const res = await fetch(url);
            const data = await res.json();
            const cur = data.current;
            const ct = container.querySelector('#wCur');
            const ws = container.querySelector('#wSum');
            if (ct) ct.textContent = Math.round(cur.temperature_2m) + (tempUnit === 'fahrenheit' ? DEG+'F' : DEG+'C');
            if (ws) ws.textContent = `Wind ${Math.round(cur.wind_speed_10m)} ${windUnit.toUpperCase()}`;
            const idxNow = data.hourly.time.findIndex(t => new Date(t).getTime() >= Date.now());
            const grid = container.querySelector('#wGrid');
            if (grid) {
              grid.innerHTML = '';
              for (let i = 0; i < 8; i++) {
                const idx = idxNow + i; if (idx >= data.hourly.time.length) break;
                const t = new Date(data.hourly.time[idx]);
                const temp = Math.round(data.hourly.temperature_2m[idx]);
                const el = document.createElement('div');
                el.className = 'weather-item';
                el.innerHTML = `<div class="sub">${t.getHours()}:00</div><div class="big" style="font-size:28px">${temp}${DEG}</div>`;
                grid.appendChild(el);
              }
            }
          } catch {}
        }
        load(); addTimer(setInterval(load, (config.refresh && config.refresh.weatherMs) || 600000));
      }
    },
    system: {
      title: 'System',
      render(container) {
        container.innerHTML = `<div class="title">System</div>
        <div class="row">
          <div class="kpi"><div class="label">CPU</div><div class="val" id="dCpu">-%</div><div class="progress"><div id="dCpuBar"></div></div></div>
          <div class="kpi"><div class="label">CPU Temp</div><div class="val" id="dCpuT">-</div></div>
          <div class="kpi"><div class="label">Memory</div><div class="val" id="dMem">-</div><div class="progress"><div id="dMemBar"></div></div></div>
          <div class="kpi"><div class="label">Net Down</div><div class="val" id="dDown">-</div></div>
          <div class="kpi"><div class="label">Net Up</div><div class="val" id="dUp">-</div></div>
        </div>`;
        let lastRx = 0, lastTx = 0, lastTime = 0;
        async function poll() {
          try {
            const [load, mem, temp, net] = await Promise.all([
              si.currentLoad(), si.mem(), si.cpuTemperature(), si.networkStats()
            ]);
            const cpu = Math.round(Number(load.currentload) || 0);
            const dCpu = container.querySelector('#dCpu'); if (dCpu) dCpu.textContent = cpu + '%';
            const dCpuBar = container.querySelector('#dCpuBar'); if (dCpuBar) dCpuBar.style.width = Math.min(100, cpu) + '%';
            const t = temp.main && temp.main > 0 ? Math.round(temp.main) : 0;
            const dCpuT = container.querySelector('#dCpuT'); if (dCpuT) dCpuT.textContent = (t>0 ? t + DEG + 'C' : '-');
            const used = mem.active || (mem.total - mem.available);
            const memPct = Math.round((used / mem.total) * 100);
            const dMem = container.querySelector('#dMem'); if (dMem) dMem.textContent = `${(used/(1024**3)).toFixed(1)} / ${(mem.total/(1024**3)).toFixed(1)} GB`;
            const dMemBar = container.querySelector('#dMemBar'); if (dMemBar) dMemBar.style.width = Math.min(100, memPct) + '%';
            const rx = net.reduce((a,n)=>a+n.rx_bytes,0);
            const tx = net.reduce((a,n)=>a+n.tx_bytes,0);
            const now = Date.now();
            if (lastTime) {
              const dt = (now - lastTime) / 1000;
              const downBps = (rx - lastRx) * 8 / dt;
              const upBps = (tx - lastTx) * 8 / dt;
              const dDown = container.querySelector('#dDown'); if (dDown) dDown.textContent = formatBps(downBps);
              const dUp = container.querySelector('#dUp'); if (dUp) dUp.textContent = formatBps(upBps);
            }
            lastRx = rx; lastTx = tx; lastTime = now;
          } catch {}
        }
        poll(); addTimer(setInterval(poll, (config.refresh && config.refresh.metricsMs) || 1500));
      }
    },
    feed: {
      title: 'Feed',
      render(container) {
        container.innerHTML = `<div class="title">Feed</div><div class="feed" id="dFeed"></div>`;
        async function loadFeeds() {
          const list = container.querySelector('#dFeed'); if (!list) return;
          list.innerHTML = '';
          for (const feedUrl of (config.rssFeeds || [])) {
            try {
              const res = await fetch(feedUrl);
              const xml = await res.text();
              const parsed = await parseStringPromise(xml, { explicitArray: false });
              const items = (parsed.rss && parsed.rss.channel && parsed.rss.channel.item)
                ? parsed.rss.channel.item
                : (parsed.feed && parsed.feed.entry) ? parsed.feed.entry : [];
              const arr = Array.isArray(items) ? items.slice(0, 5) : [items];
              arr.filter(Boolean).forEach(item => {
                const title = item.title && (item.title._ || item.title) || 'Untitled';
                const link = item.link && (item.link.href || item.link[0] || item.link) || '#';
                const div = document.createElement('div');
                div.className = 'feed-item';
                div.innerHTML = `<a href="${link}" onclick="require('electron').shell.openExternal('${link}'); return false;">${title}</a>`;
                list.appendChild(div);
              });
            } catch (e) {
              const div = document.createElement('div');
              div.className = 'feed-item';
              div.textContent = `Failed to load: ${feedUrl}`;
              list.appendChild(div);
            }
          }
        }
        loadFeeds(); addTimer(setInterval(loadFeeds, (config.refresh && config.refresh.rssMs) || 600000));
      }
    }
  };

  // Load external widgets from extras/widgets so users can add new ones post-build
  (function loadExternalWidgets() {
    try {
      const bases = [
        // Installed app resources (electron-builder extraResources)
        path.join((process && process.resourcesPath) || __dirname, 'extras', 'widgets'),
        // Dev run fallback
        path.join(__dirname, '..', 'extras', 'widgets'),
        path.join(__dirname, 'extras', 'widgets')
      ];
      const loaded = new Set(Object.keys(widgets));
      for (const base of bases) {
        let list = [];
        try { if (fs.existsSync(base)) { list = fs.readdirSync(base).filter(f => /\.js$/i.test(f)); } } catch { list = []; }
        for (const file of list) {
          try {
            const full = path.join(base, file);
            delete require.cache[require.resolve(full)];
            const mod = require(full);
            const def = (mod && (mod.default || mod)) || null;
            if (!def) continue;
            const id = String(def.id || file.replace(/\.js$/i, ''));
            if (!id || loaded.has(id)) continue;
            if (typeof def.render !== 'function') continue;
            widgets[id] = { title: def.title || id, render: def.render };
            loaded.add(id);
          } catch {}
        }
      }
    } catch {}
  })();

  function render() {
    clearTimers();
    const grid = document.getElementById('dashGrid'); if (!grid) return;
    const page = dash.pages[pageIndex] || { columns: 3, widgets: [] };
    const cols = Math.max(1, Math.min(6, Number(page.columns) || 3));
    const rows = page.split ? 2 : 1;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.innerHTML = '';

    // Header controls
    const pageLabel = document.getElementById('dashPageLabel'); if (pageLabel) pageLabel.textContent = `Page ${pageIndex+1} / ${dash.pages.length}`;
    // Add page dots navigation
    const pageDots = document.getElementById('dashPageDots'); 
    if (pageDots) {
      pageDots.innerHTML = '';
      for (let i = 0; i < dash.pages.length; i++) {
        const dot = document.createElement('div');
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.background = i === pageIndex ? 'var(--accent)' : 'rgba(255,255,255,0.3)';
        dot.style.cursor = 'pointer';
        dot.title = `Go to page ${i+1}`;
        dot.onclick = (e) => {
          e.stopPropagation();
          if (i !== pageIndex) {
            pageIndex = i;
            dash.pageIndex = pageIndex;
            saveConfig();
            render();
          }
        };
        pageDots.appendChild(dot);
      }
    }
    const colsLabel = document.getElementById('dashColsLabel'); if (colsLabel) colsLabel.textContent = `${cols} cols`;
    const editBtn = document.getElementById('dashToggleEdit'); if (editBtn) editBtn.textContent = `Edit: ${editMode ? 'On' : 'Off'}`;
    const splitBtn = document.getElementById('dashToggleSplit'); if (splitBtn) splitBtn.textContent = `Split: ${page.split ? 'On' : 'Off'}`;
    // Page navigation controls
    const pagePrevBtn = document.getElementById('dashPagePrev'); if (pagePrevBtn) pagePrevBtn.disabled = pageIndex <= 0;
    const pageNextBtn = document.getElementById('dashPageNext'); if (pageNextBtn) pageNextBtn.disabled = pageIndex >= dash.pages.length - 1;
    const pageRemoveBtn = document.getElementById('dashPageRemove'); if (pageRemoveBtn) pageRemoveBtn.disabled = dash.pages.length <= 1;
    // Ensure header controls are always interactive
    wireHeaderControls();

    // Compute 2D layout (columns x rows=1 or 2). Respect w.col/w.row and w.span (cols) and w.rspan (rows)
    function layoutPositions(items, totalCols, totalRows) {
      const occ = Array.from({ length: totalRows }, () => Array(totalCols).fill(false));
      const out = [];
      for (const w of (items || [])) {
        const span = Math.max(1, Math.min(totalCols, Number(w.span) || 1));
        const rspan = Math.max(1, Math.min(totalRows, Number(w.rspan) || totalRows));
        const wantCol = Number.isFinite(w.col) ? Math.max(0, Math.min(totalCols - span, Number(w.col))) : -1;
        const wantRow = Number.isFinite(w.row) ? Math.max(0, Math.min(totalRows - rspan, Number(w.row))) : -1;
        const fits = (c, r) => (
          c >= 0 && r >= 0 && c + span <= totalCols && r + rspan <= totalRows &&
          (() => { for (let rr = r; rr < r + rspan; rr++) { for (let cc = c; cc < c + span; cc++) { if (occ[rr][cc]) return false; } } return true; })()
        );
        let startC = wantCol, startR = wantRow;
        if (!fits(startC, startR)) {
          startC = -1; startR = -1;
          outer: for (let rr = 0; rr + rspan <= totalRows; rr++) {
            for (let cc = 0; cc + span <= totalCols; cc++) {
              if (fits(cc, rr)) { startC = cc; startR = rr; break outer; }
            }
          }
        }
        if (startC >= 0 && startR >= 0) {
          for (let rr = startR; rr < startR + rspan; rr++) { for (let cc = startC; cc < startC + span; cc++) occ[rr][cc] = true; }
          out.push({ w, startC, startR, span, rspan });
        }
      }
      return { positions: out, occupied: occ };
    }
    const { positions, occupied } = layoutPositions(page.widgets || [], cols, rows);

    // When editing, draw slot outlines across the row without affecting layout (and enable clicking empty slots)
    if (editMode) {
      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.inset = '0';
      overlay.style.zIndex = '10';
      // Let underlying widgets receive clicks; we'll attach clickable plus boxes separately
      overlay.style.pointerEvents = 'none';
      grid.appendChild(overlay);
      const cs = getComputedStyle(grid);
      const gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
      const gw = grid.clientWidth;
      const gh = grid.clientHeight;
      const colW = cols > 0 ? (gw - gap * (cols - 1)) / cols : gw;
      const rowH = rows > 0 ? (gh - gap * (rows - 1)) / rows : gh;

      // Draw clickable plus on every free cell
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          const left = Math.round(i * (colW + gap));
          const top = Math.round(r * (rowH + gap));
          const width = Math.max(0, Math.floor(colW));
          const height = Math.max(0, Math.floor(rowH));
          if (!occupied[r][i]) {
          const plus = document.createElement("div");
          plus.className = "slot-outline slot-empty";
          plus.style.position = "absolute"; plus.style.top = top + "px";
          plus.style.left = left + "px"; plus.style.width = width + "px"; plus.style.height = height + "px";
          plus.style.pointerEvents = "auto"; plus.style.cursor = "pointer"; plus.title = "Click to add a widget"; plus.textContent = "+";
          plus.onclick = (ev) => {
            ev.stopPropagation();
            try { document.getElementById("widgetPicker")?.remove(); } catch {}
            const panel = document.createElement("div"); panel.id = "widgetPicker";
            panel.style.position = "absolute"; panel.style.inset = "12px"; panel.style.display = "flex"; panel.style.flexDirection = "column"; panel.style.gap = "8px"; panel.style.alignItems = "stretch"; panel.style.justifyContent = "center"; panel.style.background = "var(--card)"; panel.style.border = "1px solid rgba(255,255,255,0.15)"; panel.style.borderRadius = "10px"; panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
            Object.keys(widgets).forEach(t => {
              const btn = document.createElement("button"); btn.className = "small-btn"; btn.textContent = `Add ${t}`;
              btn.onclick = (e2) => { e2.stopPropagation(); (dash.pages[pageIndex].widgets = dash.pages[pageIndex].widgets || []).push({ type: t, span: 1, col: i, row: r, rspan: (rows>1?1:1) }); saveConfig(); render(); };
              panel.appendChild(btn);
            });
            const cancel = document.createElement("button"); cancel.className = "small-btn"; cancel.textContent = "Cancel"; cancel.onclick = (e3) => { e3.stopPropagation(); try { panel.remove(); } catch {} };
            panel.appendChild(cancel);
            plus.appendChild(panel);
          };
          overlay.appendChild(plus);
          } else {
            const occBox = document.createElement("div"); occBox.className = "slot-outline";
            occBox.style.position = "absolute"; occBox.style.top = top + "px";
            occBox.style.left = left + "px"; occBox.style.width = width + "px"; occBox.style.height = height + "px";
            occBox.style.pointerEvents = "none"; occBox.style.opacity = "0.12"; overlay.appendChild(occBox);
          }
        }
      }
    }

    // Render widgets at computed positions
    positions.sort((a,b)=> (a.startR - b.startR) || (a.startC - b.startC)).forEach(({ w, startC, startR, span, rspan }) => {
      const def = widgets[w.type];
      const card = document.createElement('div');
      card.className = 'card';
      card.style.gridColumn = `${startC + 1} / span ${span}`;
      card.style.gridRow = `${startR + 1} / span ${rspan || rows}`;
      if (editMode) {
        // Overlay outline (non-blocking)
        card.style.position = 'relative';
        const outline = document.createElement('div');
        outline.style.position = 'absolute';
        outline.style.inset = '0';
        outline.style.border = '2px dashed rgba(77,163,255,0.45)';
        outline.style.borderRadius = '12px';
        outline.style.pointerEvents = 'none';
        outline.style.boxSizing = 'border-box';
        card.appendChild(outline);
                // Floating controls (overlay)
        const ctrls = document.createElement('div');
        ctrls.style.position = 'absolute';
        ctrls.style.top = '6px';
        ctrls.style.right = '6px';
        ctrls.style.display = 'flex';
        ctrls.style.gap = '6px';
        ctrls.style.background = 'rgba(0,0,0,0.35)';
        ctrls.style.backdropFilter = 'blur(4px)';
        ctrls.style.padding = '4px 6px';
        ctrls.style.borderRadius = '8px';
        ctrls.style.pointerEvents = 'auto';
        const mkBtn = (label, title) => { const b = document.createElement('button'); b.className='small-btn'; b.textContent=label; b.title=title; b.style.padding='4px 8px'; b.style.lineHeight='1'; return b; };
        const dec = mkBtn('-', 'Narrower');
        const spanPill = document.createElement('div'); spanPill.className='pill'; spanPill.textContent = 'x'+span;
        const inc = mkBtn('+', 'Wider');
        const half = mkBtn('½', 'Half height');
        const full = mkBtn('1', 'Full height');
        const del = mkBtn('x', 'Remove');
        dec.onclick = (e) => { e.stopPropagation(); w.span = Math.max(1, Math.min(cols, Number(w.span||1) - 1)); saveConfig(); render(); };
        inc.onclick = (e) => { e.stopPropagation(); w.span = Math.max(1, Math.min(cols, Number(w.span||1) + 1)); saveConfig(); render(); };
        half.onclick = (e) => { e.stopPropagation(); if (rows > 1) { w.rspan = 1; w.row = Math.max(0, Math.min(Number(w.row||0), rows-1)); saveConfig(); render(); } };
        full.onclick = (e) => { e.stopPropagation(); w.rspan = rows; w.row = 0; saveConfig(); render(); };
        del.onclick = (e) => { e.stopPropagation(); const arr = page.widgets || []; const i0 = arr.indexOf(w); if (i0 >= 0) arr.splice(i0,1); saveConfig(); render(); };
        ctrls.appendChild(dec); ctrls.appendChild(spanPill); ctrls.appendChild(inc); if (rows>1){ ctrls.appendChild(half); ctrls.appendChild(full);} ctrls.appendChild(del);
        card.appendChild(ctrls);
      }
      const body = document.createElement('div');
      card.appendChild(body);
      grid.appendChild(card);
      if (def && typeof def.render === 'function') def.render(body, { config, addTimer }); else body.textContent = `Unknown widget: ${w.type}`;
    });

    // Add swipe navigation support
    const gridContainer = document.querySelector('.dashboard-wrap');
    if (gridContainer) {
      // Remove existing event listeners to avoid duplicates
      gridContainer.removeEventListener('touchstart', handleSwipeStart);
      gridContainer.removeEventListener('touchmove', handleSwipeMove);
      gridContainer.removeEventListener('touchend', handleSwipeEnd);
      
      // Add swipe event listeners
      gridContainer.addEventListener('touchstart', handleSwipeStart, { passive: true });
      gridContainer.addEventListener('touchmove', handleSwipeMove, { passive: false });
      gridContainer.addEventListener('touchend', handleSwipeEnd, { passive: true });
    }
  }

  // Swipe navigation for pages
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  
  function handleSwipeStart(e) {
    if (e.touches.length > 1) return; // Ignore multi-touch
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = true;
  }
  
  function handleSwipeMove(e) {
    if (!isSwiping || e.touches.length > 1) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchX - touchStartX;
    const diffY = touchY - touchStartY;
    
    // Check if it's a clear horizontal swipe
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      e.preventDefault(); // Prevent scrolling during swipe
      
      if (diffX > 0) {
        // Swipe right - go to previous page
        if (pageIndex > 0) {
          pageIndex = Math.max(0, pageIndex - 1);
          dash.pageIndex = pageIndex;
          saveConfig();
          render();
        }
      } else if (diffX < 0) {
        // Swipe left - go to next page
        if (pageIndex < dash.pages.length - 1) {
          pageIndex = Math.min(dash.pages.length - 1, pageIndex + 1);
          dash.pageIndex = pageIndex;
          saveConfig();
          render();
        }
      }
      isSwiping = false;
    }
  }
  
  function handleSwipeEnd() {
    isSwiping = false;
  }

  // Wire controls (ensure bindings persist and can't be blocked by overlays)
  function wireHeaderControls() {
    function bind(el, handler) {
      if (!el) return;
      if (el.dataset.bound === '1') return;
      el.style.pointerEvents = 'auto'; el.style.position = 'relative'; el.style.zIndex = 200;
      el.addEventListener('click', (e) => { e.stopPropagation(); handler(e); }, true); // capture
      el.dataset.bound = '1';
    }
    bind(document.getElementById('dashPagePrev'), () => { if (pageIndex > 0) { pageIndex--; dash.pageIndex = pageIndex; saveConfig(); render(); } });
    bind(document.getElementById('dashPageNext'), () => { if (pageIndex < dash.pages.length - 1) { pageIndex++; dash.pageIndex = pageIndex; saveConfig(); render(); } });
    bind(document.getElementById('dashPageAdd'), () => { 
      // Add a new page with default configuration
      const newPage = {
        columns: 3,
        widgets: []
      };
      dash.pages.push(newPage);
      pageIndex = dash.pages.length - 1;
      dash.pageIndex = pageIndex;
      saveConfig();
      render();
    });
    bind(document.getElementById('dashPageRemove'), () => {
      // Don't remove the last page
      if (dash.pages.length <= 1) return;
      
      // Remove current page
      dash.pages.splice(pageIndex, 1);
      
      // Adjust pageIndex if needed
      if (pageIndex >= dash.pages.length) {
        pageIndex = dash.pages.length - 1;
      }
      
      dash.pageIndex = pageIndex;
      saveConfig();
      render();
    });
    bind(document.getElementById('dashColsDec'), () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) - 1)); saveConfig(); render(); });
    bind(document.getElementById('dashColsInc'), () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) + 1)); saveConfig(); render(); });
    bind(document.getElementById('dashToggleEdit'), () => { editMode = !editMode; render(); });
    bind(document.getElementById('dashToggleSplit'), () => { const p = dash.pages[pageIndex]; p.split = !p.split; saveConfig(); render(); });
  }
  wireHeaderControls();

  // Last‑resort global handler in capture phase to guarantee header clicks work
  try {
    if (!window.__dashHeaderDelegation) {
      window.__dashHeaderDelegation = true;
      document.addEventListener('click', (e) => {
        try {
          const el = e.target instanceof Element ? e.target : null;
          if (!el) return;
          const dec = el.closest && el.closest('#dashColsDec');
          const inc = el.closest && el.closest('#dashColsInc');
          const tog = el.closest && el.closest('#dashToggleEdit');
          const split = el.closest && el.closest('#dashToggleSplit');
          const pagePrev = el.closest && el.closest('#dashPagePrev');
          const pageNext = el.closest && el.closest('#dashPageNext');
          const pageAdd = el.closest && el.closest('#dashPageAdd');
          const pageRemove = el.closest && el.closest('#dashPageRemove');
          if (dec) {
            e.stopPropagation();
            const p = dash.pages[pageIndex];
            p.columns = Math.max(1, Math.min(6, (p.columns|0) - 1));
            saveConfig();
            render();
            return;
          }
          if (inc) {
            e.stopPropagation();
            const p = dash.pages[pageIndex];
            p.columns = Math.max(1, Math.min(6, (p.columns|0) + 1));
            saveConfig();
            render();
            return;
          }
          if (tog) {
            e.stopPropagation();
            editMode = !editMode;
            render();
            return;
          }
          if (split) {
            e.stopPropagation();
            const p = dash.pages[pageIndex];
            p.split = !p.split;
            saveConfig();
            render();
            return;
          }
          if (pagePrev) {
            e.stopPropagation();
            if (pageIndex > 0) {
              pageIndex--;
              dash.pageIndex = pageIndex;
              saveConfig();
              render();
            }
            return;
          }
          if (pageNext) {
            e.stopPropagation();
            if (pageIndex < dash.pages.length - 1) {
              pageIndex++;
              dash.pageIndex = pageIndex;
              saveConfig();
              render();
            }
            return;
          }
          if (pageAdd) {
            e.stopPropagation();
            // Add a new page with default configuration
            const newPage = {
              columns: 3,
              widgets: []
            };
            dash.pages.push(newPage);
            pageIndex = dash.pages.length - 1;
            dash.pageIndex = pageIndex;
            saveConfig();
            render();
            return;
          }
          if (pageRemove) {
            e.stopPropagation();
            // Don't remove the last page
            if (dash.pages.length <= 1) return;
            
            // Remove current page
            dash.pages.splice(pageIndex, 1);
            
            // Adjust pageIndex if needed
            if (pageIndex >= dash.pages.length) {
              pageIndex = dash.pages.length - 1;
            }
            
            dash.pageIndex = pageIndex;
            saveConfig();
            render();
            return;
          }
        } catch {}
      }, true);
    }
  } catch {}
  function showWidgetPicker(anchorEl, onChoose) {
    try { document.getElementById('widgetPicker')?.remove(); } catch {}
    const types = Object.keys(widgets);
    const picker = document.createElement('div');
    picker.id = 'widgetPicker';
    picker.style.position = 'fixed';
    picker.style.zIndex = '2000';
    picker.style.background = 'var(--card)';
    picker.style.border = '1px solid rgba(255,255,255,0.15)';
    picker.style.borderRadius = '10px';
    picker.style.boxShadow = '0 10px 30px rgba(0,0,0,0.35)';
    picker.style.padding = '8px';
    picker.style.display = 'flex';
    picker.style.gap = '6px';
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'small-btn';
      btn.textContent = t;
      btn.onclick = (e) => {
        e.stopPropagation();
        if (typeof onChoose === 'function') {
          onChoose(t);
        } else {
          (dash.pages[pageIndex].widgets = dash.pages[pageIndex].widgets || []).push({ type: t, span: 1 });
          saveConfig();
        }
        picker.remove();
        render();
      };
      picker.appendChild(btn);
    });
    document.body.appendChild(picker);
    const rect = anchorEl.getBoundingClientRect();
    picker.style.top = Math.round(rect.bottom + 6) + 'px';
    picker.style.left = Math.round(rect.left) + 'px';
    const off = (ev) => { if (!picker.contains(ev.target)) { try { picker.remove(); } catch {} document.removeEventListener('mousedown', off, true); } };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  }
  function addWidgetFlow(anchorEl, onChoose) {
    try {
      if (typeof prompt === 'function') {
        const types = Object.keys(widgets);
        const choice = prompt(`Add widget type: ${types.join(', ')}`, 'clock');
        if (choice && widgets[choice]) {
          if (typeof onChoose === 'function') { onChoose(choice); } else {
            (dash.pages[pageIndex].widgets = dash.pages[pageIndex].widgets || []).push({ type: choice, span: 1 });
            saveConfig(); render();
          }
          return;
        }
      }
    } catch {}
    showWidgetPicker(anchorEl, onChoose);
  }
  const addWidget = document.getElementById('dashAddWidget'); if (addWidget) addWidget.onclick = (e) => {
    addWidgetFlow(addWidget);
  };

  render();
  // Expose safe global handlers as a fallback for header clicks
  try {
    window.dashColsDec = () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) - 1)); saveConfig(); render(); };
    window.dashColsInc = () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) + 1)); saveConfig(); render(); };
    window.dashToggleEdit = () => { editMode = !editMode; render(); };
    window.dashToggleSplit = () => { const p = dash.pages[pageIndex]; p.split = !p.split; saveConfig(); render(); };
    // Add page navigation functions
    window.dashPagePrev = () => { if (pageIndex > 0) { pageIndex--; dash.pageIndex = pageIndex; saveConfig(); render(); } };
    window.dashPageNext = () => { if (pageIndex < dash.pages.length - 1) { pageIndex++; dash.pageIndex = pageIndex; saveConfig(); render(); } };
    // Add page management functions
    window.dashPageAdd = () => {
      // Add a new page with default configuration
      const newPage = {
        columns: 3,
        widgets: []
      };
      dash.pages.push(newPage);
      pageIndex = dash.pages.length - 1;
      dash.pageIndex = pageIndex;
      saveConfig();
      render();
    };
    window.dashPageRemove = () => {
      // Don't remove the last page
      if (dash.pages.length <= 1) return;
      
      // Remove current page
      dash.pages.splice(pageIndex, 1);
      
      // Adjust pageIndex if needed
      if (pageIndex >= dash.pages.length) {
        pageIndex = dash.pages.length - 1;
      }
      
      dash.pageIndex = pageIndex;
      saveConfig();
      render();
    };
  } catch {}
  exports.destroy = function destroy() { clearTimers(); };
};





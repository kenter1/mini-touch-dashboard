// Dashboard: configurable widget grid with pages/slots
exports.init = function init(ctx) {
  const { config } = ctx;
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
  const dash = (config.dashboard = config.dashboard || {});
  // Default: navigation/header enabled unless explicitly disabled
  if (typeof dash.navEnabled === 'undefined') dash.navEnabled = true;
  dash.pages = Array.isArray(dash.pages) && dash.pages.length ? dash.pages : [
    { columns: 3, widgets: [ { type:'clock', span: 1 }, { type:'weather', span: 1 }, { type:'system', span: 1 } ] }
  ];
  let pageIndex = Math.max(0, Math.min((dash.pageIndex|0)||0, dash.pages.length-1));

  function saveConfig() {
    try { fs.writeFileSync(path.join(__dirname, '..', 'config.json'), JSON.stringify(config, null, 2)); } catch {}
  }

  // Helpers
  function formatBps(bps) { const units=['bps','Kbps','Mbps','Gbps']; let i=0, v=Math.max(0,bps); while(v>=1000&&i<units.length-1){v/=1000;i++;} return v.toFixed(1)+' '+units[i]; }

  // Widget registry (built-ins; can be extended by external files)
  let widgets = {};
  /* Inline widgets moved to modules below
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
        const metrics = require('./metricsService');
        metrics.start(config);
        const unsubscribe = metrics.subscribe((data) => {
          try {
            if (!document.body.contains(container)) { try { unsubscribe(); } catch {}; return; }
            const cpu = Math.round(Number(data?.cpu?.loadPct) || 0);
            const dCpu = container.querySelector('#dCpu'); if (dCpu) dCpu.textContent = cpu + '%';
            const dCpuBar = container.querySelector('#dCpuBar'); if (dCpuBar) dCpuBar.style.width = Math.min(100, cpu) + '%';

            const t = Number(data?.temps?.cpuC) || 0; const tDisp = t>0 ? Math.round(t) : 0;
            const dCpuT = container.querySelector('#dCpuT'); if (dCpuT) dCpuT.textContent = (tDisp>0 ? tDisp + DEG + 'C' : '-');

            const memTotal = Number(data?.mem?.total)||0; const memUsed = Number(data?.mem?.used)||0; const memPct = memTotal? Math.round((memUsed/memTotal)*100):0;
            const dMem = container.querySelector('#dMem'); if (dMem) dMem.textContent = `${(memUsed/(1024**3)).toFixed(1)} / ${(memTotal/(1024**3)).toFixed(1)} GB`;
            const dMemBar = container.querySelector('#dMemBar'); if (dMemBar) dMemBar.style.width = Math.min(100, memPct) + '%';

            const downBps = Math.max(0, Number(data?.net?.downBps)||0);
            const upBps = Math.max(0, Number(data?.net?.upBps)||0);
            const dDown = container.querySelector('#dDown'); if (dDown) dDown.textContent = formatBps(downBps);
            const dUp = container.querySelector('#dUp'); if (dUp) dUp.textContent = formatBps(upBps);
          } catch {}
        });
      }
    },
    cpu: {
      title: 'CPU',
      render(container) {
        // 270° arc gauge, centered, larger size
        const size = 220, stroke = 16, r = (size/2) - stroke - 2;
        const cx = size/2, cy = size/2;
        const c = 2 * Math.PI * r;
        const gapRatio = 0.25; // 90° gap -> 270° arc
        const gap = c * gapRatio;
        const visible = c - gap;
        const gapAngleDeg = 360 * gapRatio;
        const startAngle = -90 - (gapAngleDeg / 2); // center the gap at bottom

        container.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; height:100%;">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
              <circle cx="${cx}" cy="${cy}" r="${r}" stroke="rgba(255,255,255,0.12)" stroke-width="${stroke}" fill="none" stroke-linecap="round" transform="rotate(${startAngle} ${cx} ${cy})" stroke-dasharray="${visible} ${gap}" />
              <circle id="cpuArc" cx="${cx}" cy="${cy}" r="${r}" stroke="var(--accent)" stroke-width="${stroke}" fill="none" stroke-linecap="round" transform="rotate(${startAngle} ${cx} ${cy})" />
              <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="var(--fg)" font-size="36" font-weight="800" id="cpuPctText">0%</text>
            </svg>
            <div class="sub" style="text-transform:uppercase; letter-spacing:0.8px;">CPU</div>
          </div>`;
        const arc = container.querySelector('#cpuArc');
        const txt = container.querySelector('#cpuPctText');
        if (arc) { arc.style.strokeDasharray = `${0} ${c}`; arc.style.strokeDashoffset = `0`; }
        const metrics = require('./metricsService');
        metrics.start(config);
        const unsubscribe = metrics.subscribe((data) => {
          try {
            if (!document.body.contains(container)) { try { unsubscribe(); } catch {}; return; }
            const pct = Math.max(0, Math.min(100, Math.round(Number(data?.cpu?.loadPct)||0)));
            if (txt) txt.textContent = pct + '%';
            if (arc) {
              const progress = visible * (pct/100);
              // Single dash equals progress; remainder keeps the 90° gap intact
              arc.style.strokeDasharray = `${progress} ${c - progress}`;
            }
          } catch {}
        });
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
  */

  // Load built-in widgets from views/widgets (refactored to separate files)
  (function overrideWithLocalWidgets() {
    try {
      const mods = [
        './widgets/clock',
        './widgets/weather',
        './widgets/system',
        './widgets/cpu',
        './widgets/feed',
      ].map(p => { try { return require(p); } catch { return null; } });
      mods.forEach(mod => {
        const def = (mod && (mod.default || mod)) || null;
        if (!def) return;
        const id = String(def.id || '');
        if (!id || typeof def.render !== 'function') return;
        widgets[id] = { title: def.title || id, render: def.render };
      });
    } catch {}
  })();

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
    // If nav is disabled, force edit off and hide header later
    if (dash.navEnabled === false && editMode) editMode = false;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.innerHTML = '';

    // Header controls
    const header = document.getElementById('dashHeader'); if (header) header.style.display = (dash.navEnabled === false) ? 'none' : '';
    const pageLabel = document.getElementById('dashPageLabel'); if (pageLabel) pageLabel.textContent = `Page ${pageIndex+1} / ${dash.pages.length}`;
    const colsLabel = document.getElementById('dashColsLabel'); if (colsLabel) colsLabel.textContent = `${cols} cols`;
    const editBtn = document.getElementById('dashToggleEdit'); if (editBtn) editBtn.textContent = `Edit: ${editMode ? 'On' : 'Off'}`;
    const splitBtn = document.getElementById('dashToggleSplit'); if (splitBtn) splitBtn.textContent = `Split: ${page.split ? 'On' : 'Off'}`;
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
      // Respect global UI preference for widget background visibility
      try {
        const bgVisible = !(((config.ui || {}).widgetBackgroundVisible) === false);
        if (!bgVisible) {
          card.style.background = 'transparent';
          card.style.boxShadow = 'none';
          card.style.border = 'none';
          card.style.backdropFilter = 'none';
          try { card.style.webkitBackdropFilter = 'none'; } catch {}
        }
      } catch {}
      const isHidden = !!w.invisible;
      if (isHidden && !editMode) {
        // Keep layout space but make the widget invisible and non-interactive
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
        card.style.boxShadow = 'none';
        card.style.border = 'none';
        card.style.backdropFilter = 'none';
        try { card.style.webkitBackdropFilter = 'none'; } catch {}
      }
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
        if (isHidden) {
          // Indicate hidden state during edit so users can unhide
          const hiddenTag = document.createElement('div');
          hiddenTag.className = 'pill';
          hiddenTag.textContent = 'Hidden';
          hiddenTag.style.position = 'absolute';
          hiddenTag.style.top = '8px';
          hiddenTag.style.left = '8px';
          hiddenTag.style.pointerEvents = 'none';
          card.appendChild(hiddenTag);
          // Slightly fade content in edit mode to hint hidden status
          card.style.opacity = '0.5';
        }
        // Drag handle: allow dragging the entire card (ignore clicks on buttons/links)
        card.style.cursor = 'move';
        (function enableDrag() {
          const pageRef = page; // same object
          let dragState = null;
          function getPoint(ev) {
            if (ev && ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
            if (ev && ev.changedTouches && ev.changedTouches[0]) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
            return { x: ev.clientX, y: ev.clientY };
          }
          function buildOccExcludingSelf() {
            const occ2 = occupied.map(row => row.slice());
            for (let rr = startR; rr < startR + (rspan || rows); rr++) {
              for (let cc = startC; cc < startC + span; cc++) {
                if (rr >= 0 && rr < occ2.length && cc >= 0 && cc < occ2[0].length) occ2[rr][cc] = false;
              }
            }
            return occ2;
          }
          function onDown(ev) {
            // Ignore interactions on controls or interactive elements
            const t = ev.target;
            if ((t.closest && (t.closest('button') || t.closest('a'))) || t.getAttribute?.('contenteditable') === 'true') return;
            ev.preventDefault(); ev.stopPropagation();
            try { card.classList.add('dragging'); grid.classList.add('is-dragging'); } catch {}
            const gridRect = grid.getBoundingClientRect();
            const cs = getComputedStyle(grid);
            const gap = parseFloat(cs.gap || cs.columnGap || '0') || 0;
            const gw = grid.clientWidth;
            const gh = grid.clientHeight;
            const colW = cols > 0 ? (gw - gap * (cols - 1)) / cols : gw;
            const rowH = rows > 0 ? (gh - gap * (rows - 1)) / rows : gh;
            const occ2 = buildOccExcludingSelf();
            const dragLayer = document.createElement('div');
            dragLayer.style.position = 'absolute';
            dragLayer.style.inset = '0';
            dragLayer.style.zIndex = '200';
            dragLayer.style.pointerEvents = 'auto';
            const ghost = document.createElement('div');
            ghost.style.position = 'absolute';
            ghost.style.border = '2px solid rgba(77,163,255,0.8)';
            ghost.style.background = 'rgba(77,163,255,0.15)';
            ghost.style.borderRadius = '12px';
            const ghostW = Math.round(span * colW + (span - 1) * gap);
            const ghostH = Math.round((rspan || rows) * rowH + ((rspan || rows) - 1) * gap);
            ghost.style.width = ghostW + 'px';
            ghost.style.height = ghostH + 'px';
            dragLayer.appendChild(ghost);
            const hint = document.createElement('div');
            hint.style.position = 'absolute';
            hint.style.border = '2px dashed rgba(255,255,255,0.5)';
            hint.style.borderRadius = '12px';
            hint.style.pointerEvents = 'none';
            dragLayer.appendChild(hint);
            grid.appendChild(dragLayer);
            const pt0 = getPoint(ev);
            const startMouse = { x: pt0.x, y: pt0.y };
            const startPos = {
              left: Math.round(gridRect.left + startC * (colW + gap)),
              top: Math.round(gridRect.top + startR * (rowH + gap))
            };
            ghost.style.left = (startPos.left - gridRect.left) + 'px';
            ghost.style.top = (startPos.top - gridRect.top) + 'px';
            document.body.style.userSelect = 'none';
            dragState = { gap, colW, rowH, gridRect, dragLayer, ghost, hint, occ2, drop: null };
            window.addEventListener('mousemove', onMove, true);
            window.addEventListener('mouseup', onUp, true);
            try { window.addEventListener('touchmove', onMove, { capture: true, passive: false }); } catch { window.addEventListener('touchmove', onMove, true); }
            window.addEventListener('touchend', onUp, true);
            window.addEventListener('touchcancel', onUp, true);
          }
          function snapToCell(clientX, clientY, st) {
            const x = clientX - st.gridRect.left;
            const y = clientY - st.gridRect.top;
            // Approximate index with gap compensation
            const col = Math.max(0, Math.min(cols - 1, Math.floor((x + st.gap / 2) / (st.colW + st.gap))));
            const row = Math.max(0, Math.min(rows - 1, Math.floor((y + st.gap / 2) / (st.rowH + st.gap))));
            return { col, row };
          }
          function fitsAt(c, r, st) {
            if (c < 0 || r < 0) return false;
            if (c + span > cols) return false;
            const rrspan = (rspan || rows);
            if (r + rrspan > rows) return false;
            for (let rr = r; rr < r + rrspan; rr++) {
              for (let cc = c; cc < c + span; cc++) {
                if (st.occ2[rr][cc]) return false;
              }
            }
            return true;
          }
          function onMove(ev) {
            if (!dragState) return;
            ev.preventDefault(); ev.stopPropagation();
            const st = dragState;
            const pt = getPoint(ev);
            const snap = snapToCell(pt.x, pt.y, st);
            const left = Math.round(snap.col * (st.colW + st.gap));
            const top = Math.round(snap.row * (st.rowH + st.gap));
            st.ghost.style.left = left + 'px';
            st.ghost.style.top = top + 'px';
            if (fitsAt(snap.col, snap.row, st)) {
              st.hint.style.display = 'block';
              st.hint.style.left = left + 'px';
              st.hint.style.top = top + 'px';
              st.hint.style.width = Math.round(span * st.colW + (span - 1) * st.gap) + 'px';
              st.hint.style.height = Math.round((rspan || rows) * st.rowH + ((rspan || rows) - 1) * st.gap) + 'px';
              st.drop = { c: snap.col, r: snap.row };
            } else {
              st.hint.style.display = 'none';
              st.drop = null;
            }
          }
          function onUp(ev) {
            if (!dragState) return;
            ev.preventDefault(); ev.stopPropagation();
            const st = dragState;
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
            try { window.removeEventListener('touchmove', onMove, { capture: true }); } catch { window.removeEventListener('touchmove', onMove, true); }
            window.removeEventListener('touchend', onUp, true);
            window.removeEventListener('touchcancel', onUp, true);
            try { st.dragLayer.remove(); } catch {}
            document.body.style.userSelect = '';
            try { card.classList.remove('dragging'); grid.classList.remove('is-dragging'); } catch {}
            if (st.drop) {
              w.col = st.drop.c;
              w.row = st.drop.r;
              saveConfig();
              render();
            }
            dragState = null;
          }
          card.addEventListener('mousedown', onDown, true);
          try { card.addEventListener('touchstart', (ev)=>{ if (ev.touches && ev.touches.length>1) return; onDown(ev); }, { capture: true, passive: false }); } catch { card.addEventListener('touchstart', (ev)=>{ if (ev.touches && ev.touches.length>1) return; onDown(ev); }, true); }
        })();
                // Floating controls (overlay)
        const ctrls = document.createElement('div');
        ctrls.className = 'edit-ctrls';
        ctrls.style.position = 'absolute';
        ctrls.style.top = '8px';
        ctrls.style.right = '8px';
        ctrls.style.display = 'flex';
        ctrls.style.gap = '10px';
        ctrls.style.background = 'rgba(0,0,0,0.35)';
        ctrls.style.backdropFilter = 'blur(6px)';
        ctrls.style.padding = '6px 8px';
        ctrls.style.borderRadius = '12px';
        ctrls.style.pointerEvents = 'auto';
        const mkBtn = (label, title) => { const b = document.createElement('button'); b.className='edit-btn'; b.textContent=label; b.title=title; b.style.lineHeight='1'; return b; };
        const dec = mkBtn('-', 'Narrower');
        const spanPill = document.createElement('div'); spanPill.className='pill'; spanPill.textContent = 'x'+span; spanPill.style.fontSize='14px'; spanPill.style.padding='6px 10px';
        const inc = mkBtn('+', 'Wider');
        const half = mkBtn('Half', 'Half height');
        const full = mkBtn('Full', 'Full height');
        const del = mkBtn('Delete', 'Remove');
        const hideBtn = mkBtn(isHidden ? 'Show' : 'Hide', isHidden ? 'Show widget' : 'Hide widget');
        dec.onclick = (e) => { e.stopPropagation(); w.span = Math.max(1, Number(w.span||1) - 1); saveConfig(); render(); };
        inc.onclick = (e) => { e.stopPropagation(); w.span = Math.min(cols, Number(w.span||1) + 1); saveConfig(); render(); };
        half.onclick = (e) => { e.stopPropagation(); if (rows > 1) { w.rspan = 1; w.row = Math.max(0, Math.min((w.row|0), rows-1)); saveConfig(); render(); } };
        full.onclick = (e) => { e.stopPropagation(); w.rspan = rows; w.row = 0; saveConfig(); render(); };
        del.onclick = (e) => { e.stopPropagation(); const arr = page.widgets || []; const i0 = arr.indexOf(w); if (i0 >= 0) arr.splice(i0,1); saveConfig(); render(); };
        hideBtn.onclick = (e) => { e.stopPropagation(); w.invisible = !isHidden; saveConfig(); render(); };
        ctrls.appendChild(dec); ctrls.appendChild(spanPill); ctrls.appendChild(inc);
        if (rows>1){ ctrls.appendChild(half); ctrls.appendChild(full);} 
        ctrls.appendChild(hideBtn);
        ctrls.appendChild(del);
        card.appendChild(ctrls);
      }
      const body = document.createElement('div');
      card.appendChild(body);
      grid.appendChild(card);
      if (def && typeof def.render === 'function') def.render(body, { config, addTimer }); else body.textContent = `Unknown widget: ${w.type}`;
    });
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
    bind(document.getElementById('dashColsDec'), () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) - 1)); saveConfig(); render(); });
    bind(document.getElementById('dashColsInc'), () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) + 1)); saveConfig(); render(); });
    bind(document.getElementById('dashToggleEdit'), () => { if (dash.navEnabled === false) { editMode = false; } else { editMode = !editMode; } render(); });
    bind(document.getElementById('dashToggleSplit'), () => { const p = dash.pages[pageIndex]; p.split = !p.split; saveConfig(); render(); });
  }
  wireHeaderControls();

  // Last-resort global handler in capture phase to guarantee header clicks work
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

  // React to config updates from settings without requiring a view reload
  const onConfigUpdated = () => { try { render(); } catch {} };
  try { window.addEventListener('config-updated', onConfigUpdated); } catch {}

  render();
  // Expose safe global handlers as a fallback for header clicks
  try {
    window.dashColsDec = () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) - 1)); saveConfig(); render(); };
    window.dashColsInc = () => { const p = dash.pages[pageIndex]; p.columns = Math.max(1, Math.min(6, (p.columns|0) + 1)); saveConfig(); render(); };
    window.dashToggleEdit = () => { if (dash.navEnabled === false) { editMode = false; } else { editMode = !editMode; } render(); };
    window.dashToggleSplit = () => { const p = dash.pages[pageIndex]; p.split = !p.split; saveConfig(); render(); };
  } catch {}
  exports.onConfigUpdated = onConfigUpdated;
  exports.destroy = function destroy() {
    clearTimers();
    try { window.removeEventListener('config-updated', onConfigUpdated); } catch {}
  };
};





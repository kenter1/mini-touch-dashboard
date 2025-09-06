// System-only view module (expanded)
exports.init = function init(ctx) {
  const { config } = ctx;
  // Always show CPU/GPU temps in Celsius regardless of global setting
  const UNIT = '\u00B0C';
  const { execFile } = require('child_process');
  function execFileSafe(cmd, args, options) {
    return new Promise((resolve) => {
      const child = execFile(cmd, args, { timeout: 1500, windowsHide: true, ...options }, (err, stdout) => {
        if (err) return resolve(null);
        resolve(String(stdout || ''));
      });
      child.on('error', () => resolve(null));
    });
  }
  async function getNvidiaGpu() {
    const args = ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'];
    let out = await execFileSafe('nvidia-smi', args);
    if (!out && process.platform === 'win32') {
      out = await execFileSafe('C\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe', args);
    }
    if (!out) return null;
    try {
      const lines = out.trim().split(/\r?\n/).filter(Boolean);
      if (!lines.length) return null;
      let maxUtil = 0; let maxTemp = 0;
      for (const line of lines) {
        const parts = line.split(/\s*,\s*/);
        const util = Number(parts[0]) || 0;
        const temp = Number(parts[1]) || 0;
        if (util > maxUtil) maxUtil = util;
        if (temp > maxTemp) maxTemp = temp;
      }
      return { util: Math.max(0, Math.min(100, maxUtil)), temp: maxTemp };
    } catch { return null; }
  }
  // Force Celsius for sensor temps and charts
  const wantF = false;
  const apiCfg = (config.metrics && config.metrics.api) || {};
  const apiMode = config.metrics && config.metrics.mode === 'api' && apiCfg.type === 'glances' && apiCfg.baseUrl;
  let timer = null;
  let lastRx = 0, lastTx = 0, lastTime = 0;
  const cpuHist = Array(60).fill(0);
  const gpuHist = Array(60).fill(0);
  const lastIfTotals = {}; // per-interface last rx/tx for rate calc
  const isWin = process.platform === 'win32';
  async function getLhmTemps() {
    if (!isWin) return null;
    // Try LibreHardwareMonitor's built-in web server default
    const rawBase = ((config.metrics && config.metrics.lhm && config.metrics.lhm.baseUrl) || 'http://localhost:8085').replace(/\/+$/,'');
    const bases = (()=>{
      try {
        const u = new URL(rawBase);
        const arr = [`${u.protocol}//${u.host}`.replace(/\/+$/,'')];
        if (/^localhost(?::|$)/i.test(u.host)) {
          const port = u.port ? `:${u.port}` : '';
          arr.push(`${u.protocol}//127.0.0.1${port}`);
        }
        return arr;
      } catch { return [rawBase]; }
    })();
    try {
      let data = null;
      for (const b of bases) {
        try {
          const res = await fetch(b + '/data.json', { cache: 'no-store' });
          if (res.ok) { data = await res.json(); break; }
        } catch {}
      }
      if (!data) return null;
      const out = { cpu: null, gpu: null };
      const seen = new Set();
      function scan(node) {
        if (!node || typeof node !== 'object') return;
        if (seen.has(node)) return; seen.add(node);
        const text = String(node.Text || node.text || node.Name || node.name || '');
        const type = String(node.SensorType || node.Type || node.type || '');
        const val = (node.Value !== undefined ? node.Value : node.value);
        const tryRecord = (t, n) => {
          const label = String(t || '').toLowerCase();
          const v = Number(n);
          if (!Number.isFinite(v)) return;
          const isGpu = /(gpu|graphics|nvidia|radeon|amd)/.test(label);
          if (/(cpu|package|tctl|tdie)/.test(label) || (/core/.test(label) && !isGpu)) {
            out.cpu = Math.max(out.cpu ?? -Infinity, v);
          }
          if (isGpu) { out.gpu = Math.max(out.gpu ?? -Infinity, v); }
        };
        if (typeof val === 'number') {
          if (type.toLowerCase() === 'temperature' || /temp/i.test(text)) tryRecord(text, val);
        } else if (typeof val === 'string') {
          const m = val.match(/-?\d+(?:\.\d+)?/);
          if (m) {
            if (type.toLowerCase() === 'temperature' || /temp/i.test(text)) tryRecord(text, parseFloat(m[0]));
          }
        }
        const kids = [];
        if (Array.isArray(node.Children)) kids.push(...node.Children);
        if (Array.isArray(node.children)) kids.push(...node.children);
        if (Array.isArray(node.Sensors)) kids.push(...node.Sensors);
        if (Array.isArray(node.sensors)) kids.push(...node.sensors);
        for (const k of Object.keys(node)) {
          const v = node[k];
          if (v && typeof v === 'object' && v !== node.parent) kids.push(v);
        }
        kids.forEach(scan);
      }
      scan(data);
      if (out.cpu === -Infinity) out.cpu = null;
      if (out.gpu === -Infinity) out.gpu = null;
      return out;
    } catch { return null; }
  }
  function formatMem(bytes) {
    const b = Number(bytes) || 0;
    if (b <= 0) return '0 MB';
    const gb = b / (1024 ** 3);
    if (gb >= 1) return gb.toFixed(1) + ' GB';
    const mb = b / (1024 ** 2);
    return Math.max(mb, 0).toFixed(0) + ' MB';
  }

  function toDisplayTemp(celsius) {
    const v = Number(celsius);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return wantF ? Math.round(v * 9/5 + 32) : Math.round(v);
  }

  // Removed local sensor queries

  function formatBitsPerSec(bps) {
    const units = ['bps','Kbps','Mbps','Gbps'];
    let i = 0; let val = bps;
    while (val >= 1000 && i < units.length - 1) { val /= 1000; i++; }
    return val.toFixed(1) + ' ' + units[i];
  }

  function drawSpark(canvasId, data, color) {
    const c = document.getElementById(canvasId);
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || c.width; const h = c.clientHeight || c.height;
    if (c.width !== Math.floor(w*dpr)) { c.width = Math.floor(w*dpr); c.height = Math.floor(h*dpr); }
    const ctx = c.getContext('2d');
    ctx.clearRect(0,0,c.width,c.height);
    const max = 100; const pad = 6*dpr;
    const step = (c.width - pad*2) / Math.max(1, data.length-1);
    ctx.strokeStyle = color; ctx.lineWidth = 2*dpr; ctx.beginPath();
    data.forEach((v,i)=>{
      const x = pad + i*step;
      const y = pad + (1 - Math.min(1,v/max))*(c.height - pad*2);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  async function sampleMetrics() {
    try {
      if (apiMode) {
        // Try configured baseUrl, and if it's localhost, also try 127.0.0.1 (IPv6 vs IPv4 binding issues)
        const bases = [];
        try {
          const u = new URL(String(apiCfg.baseUrl || ''));
          const clean = `${u.protocol}//${u.host}`.replace(/\/+$/,'');
          bases.push(clean);
          if (/^localhost(?::|$)/i.test(u.host)) {
            const port = u.port ? `:${u.port}` : '';
            bases.push(`${u.protocol}//127.0.0.1${port}`);
          }
        } catch {
          const clean = String(apiCfg.baseUrl || '').replace(/\/+$/,'');
          bases.push(clean);
        }

        let data = null;
        // Try Glances API v4 first, then v3 as a fallback
        const paths = [
          '/api/4/all',
          '/api/3/all'
        ];
        outer: for (const b of bases) {
          for (const p of paths) {
            try {
              const res = await fetch(`${b}${p}`);
              if (!res.ok) continue;
              data = await res.json();
              if (data) break outer;
            } catch {}
          }
        }

        if (data) {

        const cpuTotal = Math.max(0, Math.min(100, Math.round(Number(data?.cpu?.total) || 0)));
        const cpuLoad = document.getElementById('cpuLoad');
        const cpuBar = document.getElementById('cpuBar');
        if (cpuLoad) cpuLoad.textContent = cpuTotal + '%';
        if (cpuBar) cpuBar.style.width = Math.min(cpuTotal,100) + '%';

        const sensors = Array.isArray(data?.sensors) ? data.sensors : [];
        const findSensor = (regexArr) => {
          const s = sensors.find(s => regexArr.some(r => r.test(String(s.label||s.name||''))));
          return Number(s && s.value) || 0;
        };
        // Prefer LibreHardwareMonitor temps on Windows; fallback to Glances
        let cpuTempC = 0, gpuTempC = 0;
        try {
          const lhm = await getLhmTemps();
          if (lhm) { cpuTempC = Number(lhm.cpu)||0; gpuTempC = Number(lhm.gpu)||0; }
        } catch {}
        if (!(cpuTempC > 0)) cpuTempC = findSensor([/cpu|package|tctl|tdie/i]);
        if (!(gpuTempC > 0)) {
          gpuTempC = findSensor([/gpu|nvidia|radeon/i]);
          // Final fallback: NVIDIA CLI if available
          if (!(gpuTempC > 0)) {
            try { const g = await getNvidiaGpu(); if (g && Number(g.temp) > 0) gpuTempC = Number(g.temp); } catch {}
          }
        }
        const cpuTempDisp = toDisplayTemp(cpuTempC);
        const gpuTempDisp = toDisplayTemp(gpuTempC);
        const cpuTemp = document.getElementById('cpuTemp'); if (cpuTemp) cpuTemp.textContent = (cpuTempDisp>0?cpuTempDisp+UNIT:'-');
        const gpuTemp = document.getElementById('gpuTemp'); if (gpuTemp) gpuTemp.textContent = (gpuTempDisp>0?gpuTempDisp+UNIT:'-');

        const memTotal = Number(data?.mem?.total) || 0; const memUsedB = Number(data?.mem?.used) || 0;
        const memPct = memTotal ? Math.round((memUsedB/memTotal)*100) : 0;
        const memUsed = document.getElementById('memUsed'); const memBar = document.getElementById('memBar');
        if (memUsed) memUsed.textContent = `${(memUsedB/(1024**3)).toFixed(1)} / ${(memTotal/(1024**3)).toFixed(1)} GB`;
        if (memBar) memBar.style.width = Math.min(memPct,100) + '%';

        const fs = Array.isArray(data?.fs) ? data.fs : [];
        const total = fs.reduce((a,d)=>a + (Number(d.size)||0), 0);
        const usedS = fs.reduce((a,d)=>a + (Number(d.used)||0), 0);
        const pct = total ? Math.round((usedS/total)*100) : 0;
        const storageUsed = document.getElementById('storageUsed'); const storageBar = document.getElementById('storageBar');
        if (storageUsed) storageUsed.textContent = `${(usedS/(1024**3)).toFixed(0)} / ${(total/(1024**3)).toFixed(0)} GB`;
        if (storageBar) storageBar.style.width = Math.min(pct,100) + '%';
        // Per-drive list for API mode
        const storageList = document.getElementById('storageList');
        if (storageList) {
          storageList.innerHTML = fs.map(d => {
            const u = Number(d.used)||0, sz = Number(d.size)||0;
            const pp = sz ? Math.round((u/sz)*100) : 0;
            const name = d.mnt_point || d.mount || d.label || d.fs || d.device || d.filesystem || 'drive';
            return `<div class="feed-item"><div>${name} — ${(u/(1024**3)).toFixed(0)} / ${(sz/(1024**3)).toFixed(0)} GB</div><div class="progress"><div style="width:${Math.min(pp,100)}%; background:var(--accent);"></div></div></div>`;
          }).join('');
        }

        cpuHist.push(cpuTotal); cpuHist.shift();
        // chart uses 0..100 scale; normalize using Celsius
        const gpuCForHist = wantF && gpuTempDisp>0 ? Math.round((gpuTempDisp - 32) * 5/9) : (gpuTempDisp || 0);
        gpuHist.push(Math.max(0, Math.min(100, gpuCForHist || 0))); gpuHist.shift();
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4da3ff';
        drawSpark('cpuChart', cpuHist, accent);
        drawSpark('gpuChart', gpuHist, '#f39c12');
        // Update NVIDIA GPU utilization in API mode
        try {
          const gpu = await getNvidiaGpu();
          if (gpu) {
            const util = Math.round(gpu.util);
            const el = document.getElementById('gpuLoad');
            const bar = document.getElementById('gpuBar');
            if (el) el.textContent = util + '%';
            if (bar) bar.style.width = Math.min(util, 100) + '%';
          }
        } catch {}

        const plist = Array.isArray(data?.processlist) ? data.processlist : [];
        const byCpu = plist.filter(p=>Number(p.cpu_percent)>0.1).sort((a,b)=>Number(b.cpu_percent)-Number(a.cpu_percent)).slice(0,5);
        const totalMemBytesApi = Number(data?.mem?.total) || 0;
        function getMemBytesApi(p) {
          try {
            // Prefer RSS if available
            const mi = p && p.memory_info;
            if (mi && typeof mi === 'object') {
              const rss = Number(mi.rss || mi.RSS || mi[0]) || 0; // some variants use array
              if (rss > 0) return rss;
            }
            const rssCand = Number(p.rss || p.memory_rss || p.mem_rss || p.mem_rss_bytes) || 0;
            if (rssCand > 0) return rssCand;
            const pct = Number(p.memory_percent) || 0;
            if (pct > 0 && totalMemBytesApi > 0) return Math.round(totalMemBytesApi * pct / 100);
          } catch {}
          return 0;
        }
        const withMemBytes = plist.map(p => ({ p, bytes: getMemBytesApi(p) }));
        const byMem = withMemBytes
          .filter(x => x.bytes > 0 || Number(x.p.memory_percent) > 0.1)
          .sort((a,b)=> (b.bytes||Number(b.p.memory_percent)||0) - (a.bytes||Number(a.p.memory_percent)||0))
          .slice(0,5);
        const cpuEl = document.getElementById('topCpuList'); const memEl = document.getElementById('topMemList');
        const coreCount = (() => {
          const c = Number(data?.cpu?.cpucore) || Number(data?.cpu?.logical) || Number(data?.cpu?.count) || 0;
          return Number.isFinite(c) && c > 0 ? c : (navigator.hardwareConcurrency || 1);
        })();
        if (cpuEl) cpuEl.innerHTML = byCpu.map(p=>{
          const raw = Number(p.cpu_percent) || 0; // may be 0..(cores*100)
          const norm = Math.max(0, Math.min(100, raw / coreCount));
          return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${norm.toFixed(1)}%</span>${p.name}</div>`;
        }).join('');
        if (memEl) memEl.innerHTML = byMem.map(x=>{
          const name = x.p.name;
          const bytes = x.bytes;
          if (bytes > 0) {
            return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${formatMem(bytes)}</span>${name}</div>`;
          }
          const pct = Number(x.p.memory_percent) || 0;
          return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${pct.toFixed(1)}%</span>${name}</div>`;
        }).join('');

        // Network top list from API if available
        const netArr = Array.isArray(data?.network) ? data.network : [];
        if (netArr.length) {
          // Glances network reports per-second bytes for rx/tx typically
          const rates = netArr.map(n => {
            const name = n.interface_name || n.name || n.iface || 'iface';
            const rx = Number(n.rx) || 0; const tx = Number(n.tx) || 0;
            return { name, both: (rx + tx) * 8 };
          });
          const topN = rates.sort((a,b)=>b.both - a.both).slice(0,5);
          const netEl = document.getElementById('topNetList');
          if (netEl) netEl.innerHTML = topN.map(r=>`<div class="feed-item"><span class="pill" style="margin-right:6px;">${formatBitsPerSec(r.both)}</span>${r.name}</div>`).join('');
        }

        return;
        }
        // API mode requested but no data reachable — do not fall back to local to avoid PowerShell/WMI usage
        // Optionally, clear or placeholder the UI
        const placeholders = () => {
          const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
          set('cpuLoad', '-%');
          set('cpuTemp', '-');
          set('gpuTemp', '-');
          set('memUsed', '-');
          set('netDown', '-');
          set('netUp', '-');
        };
        placeholders();
        return;
      }
      const [load, mem, temp, net, gfx, disks, procs] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.cpuTemperature(),
        si.networkStats(),
        si.graphics(),
        si.fsSize(),
        si.processes()
      ]);

      // CPU (robust against undefined/NaN)
      let cpuRaw = Number(load && load.currentload);
      if (!Number.isFinite(cpuRaw)) {
        const u = Number(load && load.currentload_user) || 0;
        const s = Number(load && load.currentload_system) || 0;
        cpuRaw = u + s;
      }
      const cpu = Math.max(0, Math.min(100, Math.round(Number.isFinite(cpuRaw) ? cpuRaw : 0)));
      const cpuLoad = document.getElementById('cpuLoad');
      const cpuBar = document.getElementById('cpuBar');
      if (cpuLoad) cpuLoad.textContent = cpu + '%';
      if (cpuBar) cpuBar.style.width = Math.min(cpu,100) + '%';

      // CPU Temp (prefer LibreHardwareMonitor on Windows)
      let cpuC = Number(temp.main) || 0;
      try {
        const lhm = await getLhmTemps();
        if (lhm && Number(lhm.cpu) > 0) cpuC = Number(lhm.cpu);
      } catch {}
      const tDisp = toDisplayTemp(cpuC);
      const cpuTemp = document.getElementById('cpuTemp');
      if (cpuTemp) cpuTemp.textContent = (tDisp>0 ? tDisp + UNIT : '-');

      // GPU Temp
      let gpuT = 0;
      try {
        const lhm = await getLhmTemps();
        if (lhm && Number(lhm.gpu) > 0) gpuT = Number(lhm.gpu);
      } catch {}
      if (!(gpuT > 0)) {
        if (gfx && Array.isArray(gfx.controllers) && gfx.controllers.length) {
          for (const ctrl of gfx.controllers) {
            const v = Number(ctrl && (ctrl.temperatureGpu || ctrl.temperature || 0)) || 0;
            if (v > 0) { gpuT = v; break; }
          }
        }
      }
      const gpuTemp = document.getElementById('gpuTemp');
      const gpuDisp = toDisplayTemp(gpuT);
      if (gpuTemp) gpuTemp.textContent = (gpuDisp > 0 ? gpuDisp + UNIT : '-');

      // Memory
      const used = mem.active || (mem.total - mem.available);
      const memPct = Math.round((used / mem.total) * 100);
      const memUsed = document.getElementById('memUsed');
      const memBar = document.getElementById('memBar');
      if (memUsed) memUsed.textContent = `${(used/ (1024**3)).toFixed(1)} / ${(mem.total/(1024**3)).toFixed(1)} GB`;
      if (memBar) memBar.style.width = Math.min(memPct,100) + '%';

      // Storage summary
      // Storage summary
      if (Array.isArray(disks) && disks.length) {
        const total = disks.reduce((a,d)=>a + (d.size||0), 0);
        const usedS = disks.reduce((a,d)=>a + (d.used||0), 0);
        const pct = total ? Math.round((usedS/total)*100) : 0;
        const storageUsed = document.getElementById("storageUsed");
        const storageBar = document.getElementById("storageBar");
        if (storageUsed) storageUsed.textContent = `${(usedS/(1024**3)).toFixed(0)} / ${(total/(1024**3)).toFixed(0)} GB`;
        if (storageBar) storageBar.style.width = Math.min(pct,100) + "%";
        // Per-drive list
        const list = document.getElementById("storageList");
        if (list) {
          list.innerHTML = disks.map(d => {
            const u = Number(d.used)||0, sz = Number(d.size)||0;
            const pp = sz ? Math.round((u/sz)*100) : 0;
            const name = d.mount || d.label || d.fs || d.device || "drive";
            return `<div class="feed-item"><div>${name} — ${(u/(1024**3)).toFixed(0)} / ${(sz/(1024**3)).toFixed(0)} GB</div><div class="progress"><div style="width:${Math.min(pp,100)}%; background:var(--accent);"></div></div></div>`;
          }).join("");
        }
      }
      // Network
      const rx = net.reduce((a,n)=>a+n.rx_bytes,0);
      const tx = net.reduce((a,n)=>a+n.tx_bytes,0);
      const now = Date.now();
      // Per-interface rates
      try {
        const rates = (net || []).map(n => {
          const name = n.iface || n.ifaceName || n.interface || 'iface';
          const key = String(name);
          const prev = lastIfTotals[key] || { rx:n.rx_bytes, tx:n.tx_bytes, t:now };
          const dt = Math.max(0.001, (now - prev.t) / 1000);
          const drx = Math.max(0, (n.rx_bytes - prev.rx) * 8 / dt);
          const dtx = Math.max(0, (n.tx_bytes - prev.tx) * 8 / dt);
          lastIfTotals[key] = { rx:n.rx_bytes, tx:n.tx_bytes, t:now };
          return { name: key, down: drx, up: dtx, both: drx + dtx };
        });
        const topN = rates.sort((a,b)=>b.both - a.both).slice(0,5);
        const netEl = document.getElementById('topNetList');
        if (netEl) netEl.innerHTML = topN.map(function(r){ return '<div class=\'feed-item\'><span class=\'pill\' style=\'margin-right:6px;\'>' + formatBitsPerSec(r.both) + '</span>' + r.name + '</div>'; }).join('');
      } catch {}
      if (lastTime) {
        const dt = (now - lastTime) / 1000;
        const downBps = (rx - lastRx) * 8 / dt;
        const upBps = (tx - lastTx) * 8 / dt;
        const netDown = document.getElementById('netDown');
        const netUp = document.getElementById('netUp');
        if (netDown) netDown.textContent = formatBitsPerSec(Math.max(0, downBps));
        if (netUp) netUp.textContent = formatBitsPerSec(Math.max(0, upBps));
      }
      lastRx = rx; lastTx = tx; lastTime = now;
      // Charts
      cpuHist.push(Math.max(0, Math.min(100, cpu))); cpuHist.shift();
      const gpuCForHistLocal = wantF && gpuDisp>0 ? Math.round((gpuDisp - 32) * 5/9) : (gpuT || 0);
      gpuHist.push(Math.max(0, Math.min(100, gpuCForHistLocal || 0))); gpuHist.shift();
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4da3ff';
      drawSpark('cpuChart', cpuHist, accent);
      drawSpark('gpuChart', gpuHist, '#f39c12');
      // Update NVIDIA GPU utilization in local branch
      try {
        const gpu = await getNvidiaGpu();
        if (gpu) {
          const util = Math.round(gpu.util);
          const el = document.getElementById('gpuLoad');
          const bar = document.getElementById('gpuBar');
          if (el) el.textContent = util + '%';
          if (bar) bar.style.width = Math.min(util, 100) + '%';
        }
      } catch {}

      // Top processes
      if (procs && procs.list) {
        const byCpu = procs.list.filter(p=>p.cpu>0.1).sort((a,b)=>b.cpu-a.cpu).slice(0,5);
        const totalMemBytesLocal = Number(mem && mem.total) || 0;
        function getMemBytesLocal(p) {
          try {
            const rss = Number(p.mem_rss || p.rss || p.memRss || p.mem_rss_bytes) || 0;
            if (rss > 0) return rss;
            const pct = Number(p.mem) || Number(p.pmem) || 0; // percent
            if (pct > 0 && totalMemBytesLocal > 0) return Math.round(totalMemBytesLocal * pct / 100);
          } catch {}
          return 0;
        }
        const withMemBytesLocal = procs.list.map(p => ({ p, bytes: getMemBytesLocal(p) }));
        const byMem = withMemBytesLocal
          .filter(x => x.bytes > 0 || (Number(x.p.mem) || 0) > 0.1)
          .sort((a,b)=> (b.bytes||Number(b.p.mem)||0) - (a.bytes||Number(a.p.mem)||0))
          .slice(0,5);
        const cpuEl = document.getElementById('topCpuList');
        const memEl = document.getElementById('topMemList');
        if (cpuEl) cpuEl.innerHTML = byCpu.map(p=>`<div class="feed-item"><span class="pill" style="margin-right:6px;">${p.cpu.toFixed(1)}%</span>${p.name}</div>`).join('');
        if (memEl) memEl.innerHTML = byMem.map(x=>{
          const name = x.p.name;
          const bytes = x.bytes;
          if (bytes > 0) {
            return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${formatMem(bytes)}</span>${name}</div>`;
          }
          const pct = Number(x.p.mem) || 0;
          return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${pct.toFixed(1)}%</span>${name}</div>`;
        }).join('');
      }
    } catch {}
  }

  sampleMetrics();
  timer = setInterval(sampleMetrics, (config.refresh && (apiMode ? config.refresh.metricsMsApi : config.refresh.metricsMs)) || (apiMode ? 2000 : 1500));

  exports.destroy = function destroy() { if (timer) clearInterval(timer); timer = null; };
};






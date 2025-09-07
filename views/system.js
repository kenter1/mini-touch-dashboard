// System view, backed by shared metricsService to avoid duplicate polling
exports.init = function init(ctx) {
  const { config } = ctx;
  const UNIT = '\u00B0C';
  const metrics = require('./metricsService');
  metrics.start(config);

  const wantF = false; // charts in Celsius scale
  const cpuHist = Array(60).fill(0);
  const gpuHist = Array(60).fill(0);

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

  function formatBitsPerSec(bps) {
    const units = ['bps','Kbps','Mbps','Gbps'];
    let i = 0; let val = Math.max(0, Number(bps)||0);
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

  const unsubscribe = metrics.subscribe((data) => {
    try {
      // CPU load
      const cpuPct = Math.max(0, Math.min(100, Math.round(Number(data?.cpu?.loadPct)||0)));
      const cpuLoad = document.getElementById('cpuLoad'); const cpuBar = document.getElementById('cpuBar');
      if (cpuLoad) cpuLoad.textContent = cpuPct + '%'; if (cpuBar) cpuBar.style.width = Math.min(cpuPct, 100) + '%';

      // Temps
      const cpuTempC = Number(data?.temps?.cpuC) || 0; const gpuTempC = Number(data?.temps?.gpuC) || 0;
      const cpuTempDisp = toDisplayTemp(cpuTempC); const gpuTempDisp = toDisplayTemp(gpuTempC);
      const cpuTemp = document.getElementById('cpuTemp'); if (cpuTemp) cpuTemp.textContent = (cpuTempDisp>0?cpuTempDisp+UNIT:'-');
      const gpuTemp = document.getElementById('gpuTemp'); if (gpuTemp) gpuTemp.textContent = (gpuTempDisp>0?gpuTempDisp+UNIT:'-');

      // Memory
      const memTotal = Number(data?.mem?.total)||0; const memUsed = Number(data?.mem?.used)||0; const memPct = memTotal? Math.round((memUsed/memTotal)*100):0;
      const memUsedEl = document.getElementById('memUsed'); const memBar = document.getElementById('memBar');
      if (memUsedEl) memUsedEl.textContent = `${(memUsed/(1024**3)).toFixed(1)} / ${(memTotal/(1024**3)).toFixed(1)} GB`;
      if (memBar) memBar.style.width = Math.min(memPct, 100) + '%';

      // Storage
      const stTotal = Number(data?.storage?.total)||0; const stUsed = Number(data?.storage?.used)||0; const stPct = stTotal? Math.round((stUsed/stTotal)*100):0;
      const storageUsed = document.getElementById('storageUsed'); const storageBar = document.getElementById('storageBar');
      if (storageUsed) storageUsed.textContent = `${(stUsed/(1024**3)).toFixed(0)} / ${(stTotal/(1024**3)).toFixed(0)} GB`;
      if (storageBar) storageBar.style.width = Math.min(stPct, 100) + '%';
      const storageList = document.getElementById('storageList');
      if (storageList && Array.isArray(data?.storage?.perDisk)) {
        storageList.innerHTML = data.storage.perDisk.map(d => {
          const sz = Number(d.size)||0; const u = Number(d.used)||0; const pp = sz? Math.round((u/sz)*100):0;
          const name = d.name || 'drive';
          return `<div class="feed-item"><div>${name} - ${(u/(1024**3)).toFixed(0)} / ${(sz/(1024**3)).toFixed(0)} GB</div><div class="progress"><div style="width:${Math.min(pp,100)}%; background:var(--accent);"></div></div></div>`;
        }).join('');
      }

      // GPU util
      const util = Number(data?.gpu?.utilPct);
      if (Number.isFinite(util)) {
        const el = document.getElementById('gpuLoad'); const bar = document.getElementById('gpuBar');
        if (el) el.textContent = Math.round(util) + '%';
        if (bar) bar.style.width = Math.min(Math.round(util), 100) + '%';
      }

      // Top processes
      const cpuEl = document.getElementById('topCpuList'); const memEl = document.getElementById('topMemList');
      if (cpuEl && Array.isArray(data?.procs?.topCpu)) {
        cpuEl.innerHTML = data.procs.topCpu.map(p => `<div class="feed-item"><span class="pill" style="margin-right:6px;">${(p.cpuPct||0).toFixed(1)}%</span>${p.name}</div>`).join('');
      }
      if (memEl && Array.isArray(data?.procs?.topMem)) {
        memEl.innerHTML = data.procs.topMem.map(x => {
          if (x.bytes && x.bytes > 0) return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${formatMem(x.bytes)}</span>${x.name}</div>`;
          const pct = Number(x.pct)||0; return `<div class="feed-item"><span class="pill" style="margin-right:6px;">${pct.toFixed(1)}%</span>${x.name}</div>`;
        }).join('');
      }

      // Network (optional containers)
      const netEl = document.getElementById('topNetList');
      if (netEl && Array.isArray(data?.net?.perIface)) {
        const topN = data.net.perIface.slice(0,5);
        netEl.innerHTML = topN.map(r => `<div class='feed-item'><span class='pill' style='margin-right:6px;'>${formatBitsPerSec(r.bothBps||0)}</span>${r.name}</div>`).join('');
      }
      const netDown = document.getElementById('netDown'); const netUp = document.getElementById('netUp');
      if (netDown) netDown.textContent = formatBitsPerSec(Math.max(0, Number(data?.net?.downBps)||0));
      if (netUp) netUp.textContent = formatBitsPerSec(Math.max(0, Number(data?.net?.upBps)||0));

      // Charts
      cpuHist.push(Math.max(0, Math.min(100, cpuPct))); cpuHist.shift();
      const gpuTempDisp = toDisplayTemp(gpuTempC);
      const gpuForHistC = wantF && gpuTempDisp>0 ? Math.round((gpuTempDisp - 32) * 5/9) : (gpuTempC || 0);
      gpuHist.push(Math.max(0, Math.min(100, gpuForHistC || 0))); gpuHist.shift();
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4da3ff';
      drawSpark('cpuChart', cpuHist, accent);
      drawSpark('gpuChart', gpuHist, '#f39c12');
    } catch {}
  });

  exports.destroy = function destroy() { try { unsubscribe && unsubscribe(); } catch {} };
};

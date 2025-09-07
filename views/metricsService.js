// Centralized metrics polling service for renderer processes
// Polls either Glances API or local systeminformation and broadcasts updates

const si = (() => {
  try { return require('systeminformation'); } catch { return null; }
})();
const { execFile } = require('child_process');

let cfg = null;
let timer = null;
let listeners = new Set();
let snapshot = null;
let lastAgg = { rx: 0, tx: 0, t: 0 };
let lastPerIface = {}; // name -> { rx, tx, t }

function safeExecFile(cmd, args, opts) {
  return new Promise((resolve) => {
    try {
      const child = execFile(cmd, args || [], { windowsHide: true, timeout: 1500, ...(opts||{}) }, (err, stdout) => {
        if (err) return resolve(null);
        resolve(String(stdout || ''));
      });
      child.on('error', () => resolve(null));
    } catch { resolve(null); }
  });
}

async function getNvidiaUtilAndTemp() {
  const args = ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'];
  let out = await safeExecFile('nvidia-smi', args);
  if (!out && process.platform === 'win32') {
    out = await safeExecFile('C\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe', args);
  }
  if (!out) return null;
  try {
    const lines = out.trim().split(/\r?\n/).filter(Boolean);
    let maxUtil = 0; let maxTemp = 0;
    for (const line of lines) {
      const parts = line.split(/\s*,\s*/);
      const util = Number(parts[0]) || 0;
      const temp = Number(parts[1]) || 0;
      if (util > maxUtil) maxUtil = util;
      if (temp > maxTemp) maxTemp = temp;
    }
    return { utilPct: Math.max(0, Math.min(100, Math.round(maxUtil))), tempC: maxTemp };
  } catch { return null; }
}

async function getLhmTemps() {
  if (process.platform !== 'win32') return null;
  const baseRaw = ((cfg && cfg.metrics && cfg.metrics.lhm && cfg.metrics.lhm.baseUrl) || 'http://localhost:8085').replace(/\/+$/, '');
  const bases = (() => {
    try {
      const u = new URL(baseRaw);
      const arr = [`${u.protocol}//${u.host}`.replace(/\/+$/, '')];
      if (/^localhost(?::|$)/i.test(u.host)) {
        const port = u.port ? `:${u.port}` : '';
        arr.push(`${u.protocol}//127.0.0.1${port}`);
      }
      return arr;
    } catch { return [baseRaw]; }
  })();
  for (const b of bases) {
    try {
      const res = await fetch(b + '/data.json', { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const out = { cpuC: null, gpuC: null };
      const seen = new Set();
      const scan = (node) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return; seen.add(node);
        const text = String(node.Text || node.text || node.Name || node.name || '');
        const type = String(node.SensorType || node.Type || node.type || '');
        const val = (node.Value !== undefined ? node.Value : node.value);
        const tryRecord = (label, value) => {
          const lbl = String(label || '').toLowerCase();
          const v = Number(value);
          if (!Number.isFinite(v)) return;
          const isGpu = /(gpu|graphics|nvidia|radeon|amd)/.test(lbl);
          if (/(cpu|package|tctl|tdie)/.test(lbl) || (/core/.test(lbl) && !isGpu)) out.cpuC = Math.max(out.cpuC ?? -Infinity, v);
          if (isGpu) out.gpuC = Math.max(out.gpuC ?? -Infinity, v);
        };
        if (typeof val === 'number') {
          if (type.toLowerCase() === 'temperature' || /temp/i.test(text)) tryRecord(text, val);
        } else if (typeof val === 'string') {
          const m = val.match(/-?\d+(?:\.\d+)?/); if (m) {
            if (type.toLowerCase() === 'temperature' || /temp/i.test(text)) tryRecord(text, parseFloat(m[0]));
          }
        }
        const kids = [];
        if (Array.isArray(node.Children)) kids.push(...node.Children);
        if (Array.isArray(node.children)) kids.push(...node.children);
        if (Array.isArray(node.Sensors)) kids.push(...node.Sensors);
        if (Array.isArray(node.sensors)) kids.push(...node.sensors);
        for (const k of Object.keys(node)) { const v = node[k]; if (v && typeof v === 'object' && v !== node.parent) kids.push(v); }
        kids.forEach(scan);
      };
      scan(data);
      if (out.cpuC === -Infinity) out.cpuC = null;
      if (out.gpuC === -Infinity) out.gpuC = null;
      return out;
    } catch {}
  }
  return null;
}

async function fetchGlancesAll() {
  const api = (cfg && cfg.metrics && cfg.metrics.api) || {};
  const baseUrl = String(api.baseUrl || '').replace(/\/+$/, '');
  if (!baseUrl) return null;
  const bases = [];
  try {
    const u = new URL(baseUrl);
    const clean = `${u.protocol}//${u.host}`.replace(/\/+$/, '');
    bases.push(clean);
    if (/^localhost(?::|$)/i.test(u.host)) {
      const port = u.port ? `:${u.port}` : '';
      bases.push(`${u.protocol}//127.0.0.1${port}`);
    }
  } catch { bases.push(baseUrl); }
  const paths = ['/api/4/all', '/api/3/all'];
  for (const b of bases) {
    for (const p of paths) {
      try {
        const res = await fetch(b + p, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        if (data) return data;
      } catch {}
    }
  }
  return null;
}

function computeRatesFromCounters(netArr) {
  const now = Date.now();
  let aggRx = 0, aggTx = 0;
  const perIface = [];
  for (const n of netArr || []) {
    const name = n.iface || n.ifaceName || n.interface || 'iface';
    const rxB = Number(n.rx_bytes || n.rxBytes || 0) || 0;
    const txB = Number(n.tx_bytes || n.txBytes || 0) || 0;
    const prev = lastPerIface[name] || { rx: rxB, tx: txB, t: now };
    const dt = Math.max(0.001, (now - prev.t) / 1000);
    const downBps = Math.max(0, (rxB - prev.rx) * 8 / dt);
    const upBps = Math.max(0, (txB - prev.tx) * 8 / dt);
    lastPerIface[name] = { rx: rxB, tx: txB, t: now };
    perIface.push({ name, downBps, upBps, bothBps: downBps + upBps });
    aggRx += rxB; aggTx += txB;
  }
  let downBpsAgg = 0, upBpsAgg = 0;
  if (lastAgg.t) {
    const dt = Math.max(0.001, (now - lastAgg.t) / 1000);
    downBpsAgg = Math.max(0, (aggRx - lastAgg.rx) * 8 / dt);
    upBpsAgg = Math.max(0, (aggTx - lastAgg.tx) * 8 / dt);
  }
  lastAgg = { rx: aggRx, tx: aggTx, t: now };
  perIface.sort((a,b)=>b.bothBps - a.bothBps);
  return { downBps: downBpsAgg, upBps: upBpsAgg, perIface };
}

async function pollOnce() {
  const mode = (cfg && cfg.metrics && cfg.metrics.mode) || 'local';
  const useApi = mode === 'api' && cfg && cfg.metrics && cfg.metrics.api && cfg.metrics.api.type === 'glances' && cfg.metrics.api.baseUrl;

  let out = {
    source: useApi ? 'api' : 'local',
    cpu: { loadPct: 0 },
    temps: { cpuC: null, gpuC: null },
    mem: { total: 0, used: 0, usedPct: 0 },
    storage: { total: 0, used: 0, usedPct: 0, perDisk: [] },
    net: { downBps: 0, upBps: 0, perIface: [] },
    gpu: { utilPct: null },
    procs: { topCpu: [], topMem: [] },
    timestamps: { at: Date.now(), intervalMs: 0 }
  };

  try {
    if (useApi) {
      const data = await fetchGlancesAll();
      if (data) {
        const cpuTotal = Math.max(0, Math.min(100, Math.round(Number(data?.cpu?.total) || 0)));
        out.cpu.loadPct = cpuTotal;

        // Memory
        const memTotal = Number(data?.mem?.total) || 0; const memUsed = Number(data?.mem?.used) || 0;
        out.mem.total = memTotal; out.mem.used = memUsed; out.mem.usedPct = memTotal ? Math.round((memUsed/memTotal)*100) : 0;

        // Storage aggregate + per drive
        const fsArr = Array.isArray(data?.fs) ? data.fs : [];
        const total = fsArr.reduce((a,d)=>a + (Number(d.size)||0), 0);
        const used = fsArr.reduce((a,d)=>a + (Number(d.used)||0), 0);
        out.storage.total = total; out.storage.used = used; out.storage.usedPct = total ? Math.round((used/total)*100) : 0;
        out.storage.perDisk = fsArr.map(d => {
          const sz = Number(d.size)||0; const u = Number(d.used)||0;
          const name = d.mnt_point || d.mount || d.label || d.fs || d.device || d.filesystem || 'drive';
          return { name, size: sz, used: u, pct: sz?Math.round((u/sz)*100):0 };
        });

        // Network: Glances reports rx/tx as per-second bytes in API usually
        const netArr = Array.isArray(data?.network) ? data.network : [];
        if (netArr.length) {
          const per = netArr.map(n => {
            const name = n.interface_name || n.name || n.iface || 'iface';
            const rx = Number(n.rx) || 0; const tx = Number(n.tx) || 0; // bytes per second
            return { name, downBps: rx*8, upBps: tx*8, bothBps: (rx+tx)*8 };
          }).sort((a,b)=>b.bothBps - a.bothBps);
          out.net.perIface = per;
          const aggDown = per.reduce((a,i)=>a+i.downBps,0);
          const aggUp = per.reduce((a,i)=>a+i.upBps,0);
          out.net.downBps = aggDown; out.net.upBps = aggUp;
        }

        // Temps: prefer LHM, then sensors, then NVIDIA
        try { const lhm = await getLhmTemps(); if (lhm) { out.temps.cpuC = lhm.cpuC ?? null; out.temps.gpuC = lhm.gpuC ?? null; } } catch {}
        if (!(out.temps.cpuC > 0)) {
          // Try Glances sensors
          const sensors = Array.isArray(data?.sensors) ? data.sensors : [];
          const findSensor = (regexArr) => {
            const s = sensors.find(s => regexArr.some(r => r.test(String(s.label||s.name||''))));
            return Number(s && s.value) || 0;
          };
          out.temps.cpuC = findSensor([/cpu|package|tctl|tdie/i]) || null;
        }
        if (!(out.temps.gpuC > 0)) {
          const sensors = Array.isArray(data?.sensors) ? data.sensors : [];
          const findSensor = (regexArr) => {
            const s = sensors.find(s => regexArr.some(r => r.test(String(s.label||s.name||''))));
            return Number(s && s.value) || 0;
          };
          out.temps.gpuC = findSensor([/gpu|nvidia|radeon/i]) || null;
        }
        try { const nv = await getNvidiaUtilAndTemp(); if (nv) { out.gpu.utilPct = nv.utilPct; if (!(out.temps.gpuC > 0)) out.temps.gpuC = nv.tempC || out.temps.gpuC; } } catch {}

        // Processes
        const plist = Array.isArray(data?.processlist) ? data.processlist : [];
        const coreCount = (() => {
          const c = Number(data?.cpu?.cpucore) || Number(data?.cpu?.logical) || Number(data?.cpu?.count) || 0;
          return Number.isFinite(c) && c > 0 ? c : (typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 1) : 1);
        })();
        const byCpu = plist
          .map(p => ({ name: p.name, cpuPct: Math.max(0, Math.min(100, (Number(p.cpu_percent)||0) / coreCount)) }))
          .filter(x => x.cpuPct > 0.1)
          .sort((a,b)=>b.cpuPct - a.cpuPct)
          .slice(0,5);
        const totalMemBytesApi = Number(data?.mem?.total) || 0;
        function procMemBytes(p) {
          try {
            const mi = p && p.memory_info; if (mi && typeof mi === 'object') { const rss = Number(mi.rss || mi.RSS || mi[0]) || 0; if (rss>0) return rss; }
            const rssCand = Number(p.rss || p.memory_rss || p.mem_rss || p.mem_rss_bytes) || 0; if (rssCand>0) return rssCand;
            const pct = Number(p.memory_percent) || 0; if (pct>0 && totalMemBytesApi>0) return Math.round(totalMemBytesApi * pct / 100);
          } catch {}
          return 0;
        }
        const byMem = plist.map(p => ({ name: p.name, bytes: procMemBytes(p), pct: Number(p.memory_percent)||0 }))
          .filter(x => x.bytes>0 || x.pct>0.1)
          .sort((a,b)=> (b.bytes||b.pct) - (a.bytes||a.pct))
          .slice(0,5);
        out.procs.topCpu = byCpu;
        out.procs.topMem = byMem;
      }
    }

    if (!useApi) {
      const [load, mem, temp, net, disks, procs] = await Promise.all([
        si?.currentLoad?.() || {},
        si?.mem?.() || {},
        si?.cpuTemperature?.() || {},
        si?.networkStats?.() || [],
        si?.fsSize?.() || [],
        si?.processes?.() || { list: [] }
      ]);
      let cpuRaw = Number(load && load.currentload);
      if (!Number.isFinite(cpuRaw)) {
        const u = Number(load && load.currentload_user) || 0;
        const s = Number(load && load.currentload_system) || 0;
        cpuRaw = u + s;
      }
      out.cpu.loadPct = Math.max(0, Math.min(100, Math.round(Number.isFinite(cpuRaw) ? cpuRaw : 0)));

      // Temps: prefer LHM, fallback to si
      try { const lhm = await getLhmTemps(); if (lhm) { out.temps.cpuC = lhm.cpuC ?? null; out.temps.gpuC = lhm.gpuC ?? null; } } catch {}
      if (!(out.temps.cpuC > 0)) out.temps.cpuC = Number(temp.main) || null;
      try { const nv = await getNvidiaUtilAndTemp(); if (nv) { out.gpu.utilPct = nv.utilPct; if (!(out.temps.gpuC > 0)) out.temps.gpuC = nv.tempC || out.temps.gpuC; } } catch {}

      // Memory
      const usedMem = Number(mem.active) || (Number(mem.total)||0) - (Number(mem.available)||0);
      out.mem.total = Number(mem.total)||0; out.mem.used = usedMem; out.mem.usedPct = out.mem.total ? Math.round((usedMem/out.mem.total)*100) : 0;

      // Storage
      const total = (disks||[]).reduce((a,d)=>a + (Number(d.size)||0), 0);
      const used = (disks||[]).reduce((a,d)=>a + (Number(d.used)||0), 0);
      out.storage.total = total; out.storage.used = used; out.storage.usedPct = total ? Math.round((used/total)*100) : 0;
      out.storage.perDisk = (disks||[]).map(d => {
        const sz = Number(d.size)||0; const u = Number(d.used)||0; const name = d.mount || d.label || d.fs || d.device || 'drive';
        return { name, size: sz, used: u, pct: sz?Math.round((u/sz)*100):0 };
      });

      // Network rates from counters
      const rates = computeRatesFromCounters(net || []);
      out.net = rates;

      // Processes
      const list = (procs && procs.list) || [];
      const byCpu = list.filter(p=>Number(p.cpu)>0.1).map(p => ({ name: p.name, cpuPct: Number(p.cpu)||0 }))
        .sort((a,b)=>b.cpuPct-a.cpuPct).slice(0,5);
      const totalMemBytesLocal = Number(mem && mem.total) || 0;
      function getMemBytesLocal(p) {
        try {
          const rss = Number(p.mem_rss || p.rss || p.memRss || p.mem_rss_bytes) || 0; if (rss>0) return rss;
          const pct = Number(p.mem) || Number(p.pmem) || 0; if (pct>0 && totalMemBytesLocal>0) return Math.round(totalMemBytesLocal * pct / 100);
        } catch {}
        return 0;
      }
      const byMem = list.map(p => ({ name: p.name, bytes: getMemBytesLocal(p), pct: Number(p.mem)||0 }))
        .filter(x => x.bytes>0 || x.pct>0.1)
        .sort((a,b)=> (b.bytes||b.pct) - (a.bytes||a.pct)).slice(0,5);
      out.procs.topCpu = byCpu;
      out.procs.topMem = byMem;
    }
  } catch {}

  snapshot = out;
  listeners.forEach(fn => { try { fn(snapshot); } catch {} });
}

function start(newCfg) {
  cfg = newCfg || cfg || {};
  const apiMode = cfg && cfg.metrics && cfg.metrics.mode === 'api';
  const interval = (cfg && cfg.refresh && (apiMode ? cfg.refresh.metricsMsApi : cfg.refresh.metricsMs)) || (apiMode ? 2000 : 1500);
  if (timer) { clearInterval(timer); timer = null; }
  lastAgg = { rx: 0, tx: 0, t: 0 }; lastPerIface = {};
  // First poll immediately then on interval
  pollOnce();
  timer = setInterval(pollOnce, interval);
}

function subscribe(fn) { if (typeof fn === 'function') { listeners.add(fn); if (snapshot) { try { fn(snapshot); } catch {} } } return () => listeners.delete(fn); }
function getSnapshot() { return snapshot; }
function stop() { if (timer) clearInterval(timer); timer = null; listeners.clear(); }

module.exports = { start, subscribe, getSnapshot, stop };


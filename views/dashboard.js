// Dashboard view module: clock + weather + system + feeds

exports.init = function init(ctx) {
  const { config } = ctx;
  const { parseStringPromise } = require('xml2js');

  const UNIT = config.temperatureUnit === 'fahrenheit' ? '°F' : '°C';

  let timers = [];
  const addTimer = (id) => { if (id) timers.push(id); };

  function formatBitsPerSec(bps) {
    const units = ['bps','Kbps','Mbps','Gbps'];
    let i = 0; let val = bps;
    while (val >= 1000 && i < units.length - 1) { val /= 1000; i++; }
    return val.toFixed(1) + ' ' + units[i];
  }

  // Clock
  function tickClock() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const clock = document.getElementById('clock');
    const date = document.getElementById('date');
    if (clock) clock.textContent = `${hh}:${mm}`;
    if (date) date.textContent = now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
  }
  tickClock(); addTimer(setInterval(tickClock, 1000));

  // Weather
  async function loadWeather() {
    const lat = config.latitude, lon = config.longitude;
    const tempUnit = config.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const windUnit = config.windSpeedUnit === 'mph' ? 'mph' : 'kmh';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
    const loc = document.getElementById('locationPill');
    if (loc) loc.textContent = `Loc: ${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const cur = data.current;
      const ct = document.getElementById('currentTemp');
      const ws = document.getElementById('weatherSummary');
      if (ct) ct.textContent = Math.round(cur.temperature_2m) + (tempUnit === 'fahrenheit' ? '°F' : '°C');
      if (ws) ws.textContent = `Wind ${Math.round(cur.wind_speed_10m)} ${windUnit.toUpperCase()}`;
      const idxNow = data.hourly.time.findIndex(t => new Date(t).getTime() >= Date.now());
      const grid = document.getElementById('weatherGrid');
      if (grid) {
        grid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
          const idx = idxNow + i;
          if (idx >= data.hourly.time.length) break;
          const t = new Date(data.hourly.time[idx]);
          const temp = Math.round(data.hourly.temperature_2m[idx]);
          const el = document.createElement('div');
          el.className = 'weather-item';
          el.innerHTML = `<div class="sub">${t.getHours()}:00</div><div class="big" style="font-size:28px">${temp}°</div>`;
          grid.appendChild(el);
        }
      }
    } catch (e) {
      const ws = document.getElementById('weatherSummary');
      if (ws) ws.textContent = 'Weather unavailable';
    }
  }
  loadWeather(); addTimer(setInterval(loadWeather, (config.refresh && config.refresh.weatherMs) || 10*60*1000));

  // System metrics (Glances + optional NVIDIA via nvidia-smi)
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
      // Fallback to default Windows install path
      out = await execFileSafe('C\\\x3a\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe', args);
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
  async function sampleMetrics() {
    try {
      const api = (config.metrics && config.metrics.api) || {};
      let bases = [];
      try {
        const u = new URL(String(api.baseUrl || 'http://127.0.0.1:61208'));
        const base = `${u.protocol}//${u.host}`.replace(/\/+$/,'');
        bases.push(base);
        if (/^localhost(?::|$)/i.test(u.host)) {
          const port = u.port ? `:${u.port}` : '';
          bases.push(`${u.protocol}//127.0.0.1${port}`);
        }
      } catch {
        bases = [String(api.baseUrl || 'http://127.0.0.1:61208').replace(/\/+$/,'')];
      }
      const paths = ['/api/4/all','/api/3/all'];
      let data = null;
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
      if (!data) {
        const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
        const setW = (id,val)=>{ const el=document.getElementById(id); if(el) el.style.width=val; };
        set('cpuLoad','-%'); setW('cpuBar','0%'); set('cpuTemp','-');
        set('memUsed','-'); setW('memBar','0%'); set('netDown','-'); set('netUp','-');
        return;
      }
      const cpu = Math.round(Number(data?.cpu?.total) || 0);
      document.getElementById('cpuLoad').textContent = cpu + '%';
      document.getElementById('cpuBar').style.width = Math.min(cpu,100) + '%';
      const sensors = Array.isArray(data?.sensors) ? data.sensors : [];
      const findSensor = (regexArr) => {
        const s = sensors.find(s => regexArr.some(r => r.test(String(s.label||s.name||''))));
        return Number(s && s.value) || 0;
      };
      let cpuTempC = findSensor([/cpu|package|tctl|tdie/i]);
      const tDisp = cpuTempC>0 ? Math.round(UNIT.includes('F') ? (cpuTempC * 9/5 + 32) : cpuTempC) : '-';
      document.getElementById('cpuTemp').textContent = tDisp + (tDisp==='-' ? '' : UNIT);
      const memTotal = Number(data?.mem?.total) || 0;
      const memUsedB = Number(data?.mem?.used) || 0;
      const memPct = memTotal ? Math.round((memUsedB/memTotal)*100) : 0;
      document.getElementById('memUsed').textContent = `${(memUsedB/(1024**3)).toFixed(1)} / ${(memTotal/(1024**3)).toFixed(1)} GB`;
      document.getElementById('memBar').style.width = Math.min(memPct,100) + '%';
      const netArr = Array.isArray(data?.network) ? data.network : [];
      if (netArr.length) {
        const rx = netArr.reduce((a,n)=>a + (Number(n.rx)||0), 0) * 8;
        const tx = netArr.reduce((a,n)=>a + (Number(n.tx)||0), 0) * 8;
        document.getElementById('netDown').textContent = formatBitsPerSec(Math.max(0, rx));
        document.getElementById('netUp').textContent = formatBitsPerSec(Math.max(0, tx));
      }

      // Optional NVIDIA GPU utilization via nvidia-smi (does not use PowerShell/WMI)
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
    } catch {}
  }
  sampleMetrics(); addTimer(setInterval(sampleMetrics, (config.refresh && config.refresh.metricsMsApi) || 2000));

  // RSS feed
  async function loadFeeds() {
    const list = document.getElementById('feedList');
    if (!list) return;
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
  loadFeeds(); addTimer(setInterval(loadFeeds, (config.refresh && config.refresh.rssMs) || 10*60*1000));

  // Expose destroy to clear timers when leaving view
  exports.destroy = function destroy() {
    timers.forEach(clearInterval);
    timers = [];
  };
};

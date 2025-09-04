// Dashboard view module: clock + weather + system + feeds

exports.init = function init(ctx) {
  const { config } = ctx;
  const si = require('systeminformation');
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

  // System metrics
  let lastRx = 0, lastTx = 0, lastTime = 0;
  async function sampleMetrics() {
    try {
      const [load, mem, temp, net] = await Promise.all([
        si.currentLoad(), si.mem(), si.cpuTemperature(), si.networkStats()
      ]);
      const cpu = Math.round(load.currentload);
      const cpuLoad = document.getElementById('cpuLoad');
      const cpuBar = document.getElementById('cpuBar');
      if (cpuLoad) cpuLoad.textContent = cpu + '%';
      if (cpuBar) cpuBar.style.width = Math.min(cpu,100) + '%';
      const t = temp.main && temp.main > 0 ? Math.round(temp.main) : '-';
      const cpuTemp = document.getElementById('cpuTemp');
      if (cpuTemp) cpuTemp.textContent = t + (t==='-' ? '' : UNIT);
      const used = mem.active || (mem.total - mem.available);
      const memPct = Math.round((used / mem.total) * 100);
      const memUsed = document.getElementById('memUsed');
      const memBar = document.getElementById('memBar');
      if (memUsed) memUsed.textContent = `${(used/ (1024**3)).toFixed(1)} / ${(mem.total/(1024**3)).toFixed(1)} GB`;
      if (memBar) memBar.style.width = Math.min(memPct,100) + '%';
      const rx = net.reduce((a,n)=>a+n.rx_bytes,0);
      const tx = net.reduce((a,n)=>a+n.tx_bytes,0);
      const now = Date.now();
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
    } catch {}
  }
  sampleMetrics(); addTimer(setInterval(sampleMetrics, (config.refresh && config.refresh.metricsMs) || 1500));

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


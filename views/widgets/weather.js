const DEG = '\u00B0';

module.exports = {
  id: 'weather',
  title: 'Weather',
  render(container, { config, addTimer } = {}) {
    container.innerHTML = `<div class="title">Weather</div><div class="big" id="wCur">-</div><div class="sub" id="wSum">-</div><div class="weather-grid" id="wGrid"></div>`;
    async function load() {
      try {
        const lat = config && config.latitude;
        const lon = config && config.longitude;
        const tempUnit = (config && config.temperatureUnit) === 'fahrenheit' ? 'fahrenheit' : 'celsius';
        const windUnit = (config && config.windSpeedUnit) === 'mph' ? 'mph' : 'kmh';
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();
        const cur = data.current;
        const ct = container.querySelector('#wCur');
        const ws = container.querySelector('#wSum');
        if (ct) ct.textContent = Math.round(cur.temperature_2m) + (tempUnit === 'fahrenheit' ? DEG + 'F' : DEG + 'C');
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
    load(); if (typeof addTimer === 'function') addTimer(setInterval(load, (config && config.refresh && config.refresh.weatherMs) || 600000));
  }
};


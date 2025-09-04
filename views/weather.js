// Weather-only view module
exports.init = function init(ctx) {
  const { config } = ctx;
  const UNIT = config.temperatureUnit === 'fahrenheit' ? '°F' : '°C';
  let timer = null;

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
          el.innerHTML = `<div class=\"sub\">${t.getHours()}:00</div><div class=\"big\" style=\"font-size:28px\">${temp}°</div>`;
          grid.appendChild(el);
        }
      }
    } catch (e) {
      const ws = document.getElementById('weatherSummary');
      if (ws) ws.textContent = 'Weather unavailable';
    }
  }

  loadWeather();
  timer = setInterval(loadWeather, (config.refresh && config.refresh.weatherMs) || 10*60*1000);

  exports.destroy = function destroy() { if (timer) clearInterval(timer); timer = null; };
};


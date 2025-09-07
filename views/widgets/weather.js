const DEG = '\u00B0';

module.exports = {
  id: 'weather',
  title: 'Weather',
  render(container, { config, addTimer } = {}) {
    container.innerHTML = `<div class="title">Weather</div><div class="sub" id="wLoc"></div><div class="big" id="wCur">-</div><div class="sub" id="wSum">-</div><div class="weather-grid" id="wGrid"></div>`;
    let locationLabel = null;
    async function load() {
      try {
        const lat = config && config.latitude;
        const lon = config && config.longitude;
        const tempUnit = (config && config.temperatureUnit) === 'fahrenheit' ? 'fahrenheit' : 'celsius';
        const windUnit = (config && config.windSpeedUnit) === 'mph' ? 'mph' : 'kmh';
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        // Resolve and cache a human-readable location label once
        try {
          const wLoc = container.querySelector('#wLoc');
          if (!locationLabel) {
            // Prefer explicit config-provided city/location if present
            const confName = (config && (config.city || config.location || config.placeName)) || '';
            if (confName) {
              locationLabel = String(confName);
            } else {
              // Fallback to reverse geocoding; do NOT show coordinates if it fails
              const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&language=en`);
              const geo = await geoRes.json();
              const r = Array.isArray(geo?.results) && geo.results[0];
              if (r) {
                // Use city name; optionally include region for clarity
                const parts = [r.name, r.admin1].filter(Boolean);
                locationLabel = parts.join(', ');
              }
            }
          }
          if (wLoc) {
            if (locationLabel) {
              wLoc.textContent = locationLabel;
              wLoc.style.display = '';
            } else {
              // Hide label entirely if we couldn't resolve a city
              wLoc.textContent = '';
              wLoc.style.display = 'none';
            }
          }
        } catch {}
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&timezone=auto`;
        const res = await fetch(url);
        const data = await res.json();
        const cur = data.current;
        const ct = container.querySelector('#wCur');
        const ws = container.querySelector('#wSum');
        if (ct) ct.textContent = Math.round(cur.temperature_2m) + (tempUnit === 'fahrenheit' ? DEG + 'F' : DEG + 'C');
        // Show wind plus current/next hour rain chance if available
        let idxNow = data.hourly.time.findIndex(t => new Date(t).getTime() >= Date.now());
        if (idxNow < 0) idxNow = 0;
        const rainNow = Array.isArray(data?.hourly?.precipitation_probability)
          ? data.hourly.precipitation_probability[idxNow]
          : null;
        if (ws) ws.textContent = `Wind ${Math.round(cur.wind_speed_10m)} ${windUnit.toUpperCase()}` + (Number.isFinite(rainNow) ? ` • Rain ${Math.round(rainNow)}%` : '');
        const grid = container.querySelector('#wGrid');
        if (grid) {
          grid.innerHTML = '';
          // Show only the next 4 hours
          for (let i = 0; i < 4; i++) {
            const idx = idxNow + i; if (idx >= data.hourly.time.length) break;
            const t = new Date(data.hourly.time[idx]);
            const temp = Math.round(data.hourly.temperature_2m[idx]);
            const rain = Array.isArray(data?.hourly?.precipitation_probability)
              ? data.hourly.precipitation_probability[idx]
              : null;
            const hourLabel = t.toLocaleString(undefined, { hour: 'numeric', hour12: true });
            const el = document.createElement('div');
            el.className = 'weather-item';
            el.innerHTML = `<div class="sub">${hourLabel}</div><div class="big" style="font-size:28px">${temp}${DEG}</div>` + (Number.isFinite(rain) ? `<div class="sub">Rain ${Math.round(rain)}%</div>` : '');
            grid.appendChild(el);
          }
        }
      } catch {}
    }
    load(); if (typeof addTimer === 'function') addTimer(setInterval(load, (config && config.refresh && config.refresh.weatherMs) || 600000));
  }
};

module.exports = {
  id: 'digital-clock',
  title: 'Digital Clock',
  render(container, { config, addTimer }) {
    const showSeconds = !!(config && (config.clockSeconds || (config.dashboard && config.dashboard.clockSeconds)));
    const use24h = !!(config && (config.clock24h || (config.dashboard && config.dashboard.clock24h)));
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;">
        <div id="dcTime" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800; letter-spacing:2px; font-size:56px; line-height:1;">--:--</div>
        <div id="dcDate" class="sub" style="opacity:0.9"></div>
      </div>`;
    const elTime = container.querySelector('#dcTime');
    const elDate = container.querySelector('#dcDate');
    function two(n){ return String(n).padStart(2,'0'); }
    function tick(){
      const now = new Date();
      let h = now.getHours();
      const m = two(now.getMinutes());
      const s = two(now.getSeconds());
      let ampm = '';
      if (!use24h) { ampm = h >= 12 ? ' PM' : ' AM'; h = h % 12; if (h === 0) h = 12; }
      const colon = (now.getSeconds() % 2 === 0) ? ':' : '·';
      const base = two(h) + colon + m + (showSeconds ? (colon + s) : '');
      if (elTime) elTime.textContent = base + ampm;
      if (elDate) elDate.textContent = now.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
    }
    tick();
    addTimer && addTimer(setInterval(tick, 500));
  }
};


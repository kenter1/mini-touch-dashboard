module.exports = {
  id: 'clock',
  title: 'Clock',
  render(container, { addTimer } = {}) {
    container.innerHTML = `<div class="row" style="justify-content: space-between; align-items: end;">
      <div><div class="title">Now</div><div class="time" id="dashClock">--:--</div><div class="sub" id="dashDate">-</div></div>
      <div style="text-align:right;"><div class="sub">Mini Touch Dashboard</div></div>
    </div>`;
    function tick() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const clock = container.querySelector('#dashClock');
      const date = container.querySelector('#dashDate');
      if (clock) clock.textContent = `${hh}:${mm}`;
      if (date) date.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    }
    tick(); if (typeof addTimer === 'function') addTimer(setInterval(tick, 1000));
  }
};


module.exports = {
  id: 'cpu',
  title: 'CPU',
  render(container, { config } = {}) {
    const size = 220, stroke = 16, r = (size/2) - stroke - 2;
    const cx = size/2, cy = size/2;
    const c = 2 * Math.PI * r;
    const gapRatio = 0.25; // 90-degree gap -> 270-degree arc
    const gap = c * gapRatio;
    const visible = c - gap;
    const gapAngleDeg = 360 * gapRatio;
    const startAngle = -90 - (gapAngleDeg / 2); // center the gap at bottom

    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; height:100%;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${cx}" cy="${cy}" r="${r}" stroke="rgba(255,255,255,0.12)" stroke-width="${stroke}" fill="none" stroke-linecap="round" transform="rotate(${startAngle} ${cx} ${cy})" stroke-dasharray="${visible} ${gap}" />
          <circle id="cpuArc" cx="${cx}" cy="${cy}" r="${r}" stroke="var(--accent)" stroke-width="${stroke}" fill="none" stroke-linecap="round" transform="rotate(${startAngle} ${cx} ${cy})" />
          <text x="${cx}" y="${cy+10}" text-anchor="middle" fill="var(--fg)" font-size="36" font-weight="800" id="cpuPctText">0%</text>
        </svg>
        <div class="sub" style="text-transform:uppercase; letter-spacing:0.8px;">CPU</div>
      </div>`;
    const arc = container.querySelector('#cpuArc');
    const txt = container.querySelector('#cpuPctText');
    if (arc) { arc.style.strokeDasharray = `${0} ${c}`; arc.style.strokeDashoffset = `0`; }
    const metrics = require('../metricsService');
    metrics.start(config || {});
    const unsubscribe = metrics.subscribe((data) => {
      try {
        if (!document.body.contains(container)) { try { unsubscribe(); } catch {} return; }
        const pct = Math.max(0, Math.min(100, Math.round(Number(data?.cpu?.loadPct) || 0)));
        if (txt) txt.textContent = pct + '%';
        if (arc) {
          const progress = visible * (pct / 100);
          // Single dash equals progress; remainder keeps the 90-degree gap intact
          arc.style.strokeDasharray = `${progress} ${c - progress}`;
        }
      } catch {}
    });
  }
};


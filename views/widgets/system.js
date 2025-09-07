const DEG = '\u00B0';

function formatBps(bps) {
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  let i = 0, v = Math.max(0, Number(bps) || 0);
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return v.toFixed(1) + ' ' + units[i];
}

module.exports = {
  id: 'system',
  title: 'System',
  render(container, { config } = {}) {
    container.innerHTML = `<div class="title">System</div>
      <div class="row">
        <div class="kpi"><div class="label">CPU</div><div class="val" id="dCpu">-%</div><div class="progress"><div id="dCpuBar"></div></div></div>
        <div class="kpi"><div class="label">CPU Temp</div><div class="val" id="dCpuT">-</div></div>
        <div class="kpi"><div class="label">Memory</div><div class="val" id="dMem">-</div><div class="progress"><div id="dMemBar"></div></div></div>
        <div class="kpi"><div class="label">Net Down</div><div class="val" id="dDown">-</div></div>
        <div class="kpi"><div class="label">Net Up</div><div class="val" id="dUp">-</div></div>
      </div>`;
    const metrics = require('../metricsService');
    metrics.start(config || {});
    const unsubscribe = metrics.subscribe((data) => {
      try {
        if (!document.body.contains(container)) { try { unsubscribe(); } catch {} return; }
        const cpu = Math.round(Number(data?.cpu?.loadPct) || 0);
        const dCpu = container.querySelector('#dCpu'); if (dCpu) dCpu.textContent = cpu + '%';
        const dCpuBar = container.querySelector('#dCpuBar'); if (dCpuBar) dCpuBar.style.width = Math.min(100, cpu) + '%';

        const t = Number(data?.temps?.cpuC) || 0; const tDisp = t > 0 ? Math.round(t) : 0;
        const dCpuT = container.querySelector('#dCpuT'); if (dCpuT) dCpuT.textContent = (tDisp > 0 ? tDisp + DEG + 'C' : '-');

        const memTotal = Number(data?.mem?.total) || 0; const memUsed = Number(data?.mem?.used) || 0; const memPct = memTotal ? Math.round((memUsed / memTotal) * 100) : 0;
        const dMem = container.querySelector('#dMem'); if (dMem) dMem.textContent = `${(memUsed / (1024 ** 3)).toFixed(1)} / ${(memTotal / (1024 ** 3)).toFixed(1)} GB`;
        const dMemBar = container.querySelector('#dMemBar'); if (dMemBar) dMemBar.style.width = Math.min(100, memPct) + '%';

        const downBps = Math.max(0, Number(data?.net?.downBps) || 0);
        const upBps = Math.max(0, Number(data?.net?.upBps) || 0);
        const dDown = container.querySelector('#dDown'); if (dDown) dDown.textContent = formatBps(downBps);
        const dUp = container.querySelector('#dUp'); if (dUp) dUp.textContent = formatBps(upBps);
      } catch {}
    });
  }
};


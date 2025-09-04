// System-only view module
exports.init = function init(ctx) {
  const { config } = ctx;
  const si = require('systeminformation');
  const UNIT = config.temperatureUnit === 'fahrenheit' ? '°F' : '°C';
  let timer = null;
  let lastRx = 0, lastTx = 0, lastTime = 0;

  function formatBitsPerSec(bps) {
    const units = ['bps','Kbps','Mbps','Gbps'];
    let i = 0; let val = bps;
    while (val >= 1000 && i < units.length - 1) { val /= 1000; i++; }
    return val.toFixed(1) + ' ' + units[i];
  }

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

  sampleMetrics();
  timer = setInterval(sampleMetrics, (config.refresh && config.refresh.metricsMs) || 1500);

  exports.destroy = function destroy() { if (timer) clearInterval(timer); timer = null; };
};


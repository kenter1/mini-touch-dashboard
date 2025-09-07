const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

function isUrl(s) {
  try { return /^https?:\/\//i.test(String(s||'')); } catch { return false; }
}

function fileExists(p) {
  try { return p && fs.existsSync(p); } catch { return false; }
}

function launchAction(act) {
  try {
    const { shell } = require('electron');
    const target = (act && (act.path || act.command || act.url || act.target)) || '';
    const args = Array.isArray(act && act.args) ? act.args : [];
    const cwd = (act && act.cwd) || (fileExists(target) ? path.dirname(target) : undefined);

    if (!target) return;

    // Open URLs in the default browser
    if (isUrl(target)) { try { shell.openExternal(target); } catch {} return; }

    // If a direct file/exe path exists, prefer shell execution to detach cleanly
    if (fileExists(target)) {
      if (process.platform === 'win32') {
        try {
          const cmd = process.env.ComSpec || 'cmd.exe';
          // Use cmd start to avoid EACCES and to detach. Quote target, keep window hidden.
          spawn(cmd, ['/c', 'start', '""', '"' + target.replace(/"/g, '""') + '"', ...args], { cwd, windowsHide: true, detached: true, stdio: 'ignore' }).unref();
          return;
        } catch {}
      }
      try {
        const child = spawn(target, args, { cwd, detached: true, stdio: 'ignore' });
        child.unref();
        return;
      } catch {}
    }

    // Fallback: treat as command name; on Windows, use PowerShell Start-Process; else spawn
    if (process.platform === 'win32') {
      try {
        const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
        const tEsc = String(target).replace(/'/g, "''");
        const aEsc = args.map(a => String(a).replace(/'/g, "''"));
        const cwdEsc = (cwd ? String(cwd) : '').replace(/'/g, "''");
        const psCmd = `Try { $p = Start-Process -FilePath '${tEsc}' ${cwd?`-WorkingDirectory '${cwdEsc}'`:''} ${aEsc.length?`-ArgumentList @('${aEsc.join("','")}')`:''} -WindowStyle Hidden -PassThru; if ($p) { $p.Id } } Catch {}`;
        spawnSync(psExe, ['-NoProfile','-NonInteractive','-Command', psCmd], { windowsHide: true, encoding: 'utf8' });
        return;
      } catch {}
      try {
        const cmd = process.env.Comspec || 'cmd.exe';
        spawn(cmd, ['/c', 'start', '""', target, ...args], { cwd, windowsHide: true, detached: true, stdio: 'ignore' }).unref();
        return;
      } catch {}
    } else {
      try { spawn(target, args, { cwd, detached: true, stdio: 'ignore' }).unref(); return; } catch {}
    }
  } catch {}
}

function normalizeActions(cfg) {
  const launchCfg = (cfg && cfg.launchpad) || {};
  let actions = Array.isArray(launchCfg.actions) ? launchCfg.actions : null;
  if (!actions || actions.length === 0) {
    // Provide sensible defaults for first-run
    actions = [
      { icon: '\u270E', label: 'Notepad', command: 'notepad.exe' },
      { icon: '\uD83D\uDDBC', label: 'Paint', command: 'mspaint.exe' },
      { icon: '\u2315', label: 'Task Mgr', command: 'taskmgr.exe' },
      { icon: '\uD83D\uDDA5', label: 'Explorer', command: 'explorer.exe' },
      { icon: '\uD83D\uDD0D', label: 'Google', url: 'https://google.com' },
      { icon: '\uD83C\uDFB5', label: 'YTM', url: 'https://music.youtube.com' },
    ];
  }
  const cols = Math.max(1, Math.min(6, Number(launchCfg.columns || 3)));
  return { actions, columns: cols };
}

module.exports = {
  id: 'launchpad',
  title: 'Launchpad',
  render(container, { config } = {}) {
    try { container.innerHTML = ''; } catch {}
    const { actions, columns } = normalizeActions(config || {});

    // Header
    const header = document.createElement('div');
    header.className = 'title';
    header.textContent = 'Launchpad';
    container.appendChild(header);

    // Grid of actions
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    grid.style.gap = '10px';
    grid.style.marginTop = '8px';
    container.appendChild(grid);

    actions.forEach((act, idx) => {
      const btn = document.createElement('div');
      btn.style.display = 'flex';
      btn.style.flexDirection = 'column';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.gap = '6px';
      btn.style.height = '78px';
      btn.style.borderRadius = '12px';
      btn.style.border = '1px solid rgba(255,255,255,0.12)';
      btn.style.background = 'rgba(255,255,255,0.04)';
      btn.style.cursor = 'pointer';
      btn.style.userSelect = 'none';
      btn.style.transition = 'transform 0.08s ease, background 0.2s ease, border-color 0.2s ease';
      btn.onmouseenter = () => { btn.style.transform = 'translateY(-1px)'; };
      btn.onmouseleave = () => { btn.style.transform = 'translateY(0)'; };
      const icon = document.createElement('div');
      icon.textContent = act.icon || '\u25A3';
      icon.style.fontSize = '28px';
      const label = document.createElement('div');
      label.textContent = act.label || (act.command || act.url || act.path || 'Action');
      label.style.fontSize = '12px';
      label.style.color = 'var(--muted)';
      label.style.textAlign = 'center';
      label.style.maxWidth = '100%';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener('click', (e) => { e.stopPropagation(); launchAction(act); });
      grid.appendChild(btn);
    });

    // Tiny helper note
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = 'Configure actions in config.json under launchpad.actions';
    sub.style.marginTop = '8px';
    container.appendChild(sub);
  }
};


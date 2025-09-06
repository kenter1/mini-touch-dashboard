const { app, BrowserWindow, screen, Menu, Tray, nativeTheme } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, 'config.json');
function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

let tray = null;
let win = null;
let reloadWatcher = null;
let glancesProc = null;
let lhmProc = null;

function pickBottomDisplay() {
  const displays = screen.getAllDisplays();
  // Choose the display with the greatest bottom edge (y + height)
  let best = displays[0];
  let bestBottom = best.bounds.y + best.bounds.height;
  for (const d of displays) {
    const bottom = d.bounds.y + d.bounds.height;
    if (bottom > bestBottom) { best = d; bestBottom = bottom; }
  }
  return best;
}

function createWindow() {
  const config = loadConfig();
  if (config.theme && config.theme !== 'auto') {
    nativeTheme.themeSource = config.theme;
  }

  // Optionally auto-start a bundled Glances web server if configured and present
  // Also try to start LibreHardwareMonitor on Windows for temps
  maybeStartLibreHardwareMonitor(config);
  maybeStartGlances(config);

  const targetDisplay = pickBottomDisplay();
  // const { x, y, width, height } = targetDisplay.bounds;

  // win = new BrowserWindow({
  //   x, y, width, height,
  //   frame: false,
  //   alwaysOnTop: true,
  //   skipTaskbar: true,
  //   autoHideMenuBar: true,
  //   resizable: false,
  //   movable: false,
  //   webPreferences: {
  //     nodeIntegration: true,      // Keep simple for a local dashboard
  //     contextIsolation: false,    // (For production harden with a preload bridge)
  //     backgroundThrottling: false,
  //     webviewTag: true            // Enable <webview> for in-app browser views
  //   }
  // });
    //Temp
    let { x, y, width, height } = targetDisplay.bounds;
    width = 800;
    height = 800;
    win = new BrowserWindow({
    x, y, width, height,
    frame: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: false,
    resizable: true,
    movable: true,
    webPreferences: {
      nodeIntegration: true,      // Keep simple for a local dashboard
      contextIsolation: false,    // (For production harden with a preload bridge)
      backgroundThrottling: false,
      webviewTag: true            // Enable <webview> for in-app browser views
    }
  });

  win.loadFile('index.html');
  // Uncomment to debug layout the first time:
  // win.webContents.openDevTools({ mode: 'detach' });

  // Create a tray icon with basic controls
  tray = new Tray(process.platform === 'win32'
    ? path.join(__dirname, 'assets', 'tray.ico')
    : path.join(__dirname, 'assets', 'trayTemplate.png'));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Toggle Always on Top', type: 'checkbox', checked: true, click: (item) => {
        win.setAlwaysOnTop(item.checked, 'screen-saver');
      }},
    { label: 'Toggle Click-Through', type: 'checkbox', click: (item) => {
        // Make window ignore mouse (useful if you want it touch-only / widget overlay)
        win.setIgnoreMouseEvents(item.checked, { forward: true });
      }},
    { type: 'separator' },
    { label: 'Reload', click: () => win.reload() },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Mini Touch Dashboard');
  tray.setContextMenu(contextMenu);

  // Simple auto-reload without external deps
  setupAutoReload(config);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => { /* keep running until quit via tray */ });

function setupAutoReload(config) {
  const enabled = config.devAutoReload !== false; // enable by default; set false in config.json to disable
  if (!enabled) return;
  try { if (reloadWatcher) { reloadWatcher.close?.(); } } catch {}
  try {
    reloadWatcher = fs.watch(__dirname, { recursive: true }, (eventType, rawFile) => {
      const file = (rawFile || '').toString().replace(/\\/g, '/');
      if (!file) return;
      // Ignore noisy folders/files
      if (file.startsWith('node_modules') || file.startsWith('assets')) return;
      // Don't reload when settings are saved; UI already updates itself
      if (/(^|\/)config\.json$/.test(file)) return;
      if (/(^|\/)main\.js$/.test(file)) {
        // Relaunch the whole app if main process changed
        setTimeout(() => { app.relaunch(); app.exit(0); }, 100);
        return;
      }
      if (/\.(html|js|css)$/.test(file)) {
        if (win && !win.isDestroyed()) {
          try { win.webContents.reloadIgnoringCache(); } catch {}
        }
      }
    });
  } catch (e) {
    // no-op if watch unsupported
  }
}

app.on('before-quit', () => { try { reloadWatcher?.close?.(); } catch {} });

function maybeStartGlances(config) {
  try {
    const apiCfg = (config.metrics && config.metrics.api) || {};
    const isGlances = config.metrics && config.metrics.mode === 'api' && apiCfg.type === 'glances';
    const auto = apiCfg.autoStart !== false; // default true
    if (!isGlances || !auto) return;

    const base = process.resourcesPath || __dirname;
    const candidates = [
      // If installed by installer step
      path.join(base, 'glances', 'glances-web.exe'),
      // If shipped as extraResource
      path.join(base, 'extras', 'glances-web.exe'),
      // Dev/runtime fallbacks
      path.join(__dirname, 'glances', 'glances-web.exe'),
      path.join(__dirname, 'extras', 'glances-web.exe')
    ];
    const exe = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    if (!exe) return;
    if (glancesProc && !glancesProc.killed) return;
    const env = { ...process.env };
    if (apiCfg.baseUrl) {
      try {
        const u = new URL(String(apiCfg.baseUrl));
        if (u.hostname) env.GLANCES_BIND = u.hostname;
        if (u.port) env.GLANCES_PORT = u.port;
      } catch {}
    }
    if (Number.isFinite(apiCfg.refreshSec)) env.GLANCES_REFRESH = String(apiCfg.refreshSec);
    if (Array.isArray(apiCfg.disablePlugins) && apiCfg.disablePlugins.length) {
      env.GLANCES_DISABLE_PLUGINS = apiCfg.disablePlugins.join(',');
    }
    glancesProc = spawn(exe, [], { stdio: 'ignore', windowsHide: true, env });
  } catch {}
}

function maybeStartLibreHardwareMonitor(config) {
  try {
    if (process.platform !== 'win32') return; // Windows-only utility
    const lhmCfg = (config.metrics && config.metrics.lhm) || {};
    const auto = lhmCfg.autoStart !== false; // default true
    if (!auto) return;

    const base = process.resourcesPath || __dirname;
    const candidates = [
      // If installed by installer step under resources
      path.join(base, 'LibreHardwareMonitor', 'LibreHardwareMonitor.exe'),
      path.join(base, 'extras', 'LibreHardwareMonitor', 'LibreHardwareMonitor.exe'),
      // Dev/runtime fallbacks
      path.join(__dirname, 'LibreHardwareMonitor', 'LibreHardwareMonitor.exe'),
      path.join(__dirname, 'extras', 'LibreHardwareMonitor', 'LibreHardwareMonitor.exe'),
      // Plain exe in extras
      path.join(base, 'extras', 'LibreHardwareMonitor.exe'),
      path.join(__dirname, 'extras', 'LibreHardwareMonitor.exe')
    ];
    const exe = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    if (!exe) return;
    if (lhmProc && !lhmProc.killed) return;
    // Best-effort: remove Mark-of-the-Web and ensure exec perms
    try { fs.unlinkSync(exe + ':Zone.Identifier'); } catch {}
    try { fs.chmodSync(exe, 0o755); } catch {}

    const cwd = path.dirname(exe);
    // Seed user config to enable LHM web server if needed
    try {
      const bundledCfgCandidates = [
        path.join(cwd, 'LibreHardwareMonitor.config'),
        path.join(__dirname, 'extras', 'LibreHardwareMonitor', 'LibreHardwareMonitor.config')
      ];
      const bundledCfg = bundledCfgCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
      const appData = process.env.APPDATA || (process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Roaming')) || '';
      if (bundledCfg && appData) {
        const targetDir = path.join(appData, 'LibreHardwareMonitor');
        const targetCfg = path.join(targetDir, 'LibreHardwareMonitor.config');
        try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
        // Copy if missing or tiny (likely default)
        let shouldCopy = false;
        try { const st = fs.statSync(targetCfg); shouldCopy = !st || st.size < 1024; } catch { shouldCopy = true; }
        if (shouldCopy) {
          try { fs.copyFileSync(bundledCfg, targetCfg); } catch {}
        }
      }
    } catch {}
    const start = (retrying) => {
      try {
        const child = spawn(exe, [], { stdio: 'ignore', windowsHide: true, cwd });
        child.on('error', async (err) => {
          // Handle EACCES due to MOTW; try PowerShell Unblock-File once
          if (!retrying && err && (err.code === 'EACCES' || err.code === 'EPERM')) {
            try {
              const ps = spawn(process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe',
                ['-NoProfile','-Command', `try { Unblock-File -Path '${exe.replace(/'/g, "''")}' } catch {}`],
                { stdio: 'ignore', windowsHide: true });
              ps.on('exit', () => start(true));
              return;
            } catch {}
          }
        });
        lhmProc = child;
      } catch {
        // ignore
      }
    };
    // Launch; omit args to avoid failing on unknown switches
    start(false);
  } catch {}
}

app.on('before-quit', () => {
  try { if (glancesProc && !glancesProc.killed) glancesProc.kill(); } catch {}
  try { if (lhmProc && !lhmProc.killed) lhmProc.kill(); } catch {}
});

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
  maybeStartGlances(config);

  const targetDisplay = pickBottomDisplay();
  const { x, y, width, height } = targetDisplay.bounds;

  win = new BrowserWindow({
    x, y, width, height,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    resizable: false,
    movable: false,
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

app.on('before-quit', () => {
  try { if (glancesProc && !glancesProc.killed) glancesProc.kill(); } catch {}
});

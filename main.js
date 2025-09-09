const { app, BrowserWindow, screen, Menu, Tray, nativeTheme } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
let lhmPid = null;
let lhmOwned = false;

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
      webviewTag: true,           // Enable <webview> for in-app browser views
      webSecurity: false          // Disable web security for iframe widgets (only for local dashboard)
    }
  });
    //Temp
  //   let { x, y, width, height } = targetDisplay.bounds;
  //   width = 800;
  //   height = 800;
  //   win = new BrowserWindow({
  //   x, y, width, height,
  //   frame: true,
  //   alwaysOnTop: true,
  //   skipTaskbar: true,
  //   autoHideMenuBar: false,
  //   resizable: true,
  //   movable: true,
  //   webPreferences: {
  //     nodeIntegration: true,      // Keep simple for a local dashboard
  //     contextIsolation: false,    // (For production harden with a preload bridge)
  //     backgroundThrottling: false,
  //     webviewTag: true            // Enable <webview> for in-app browser views
  //   }
  // });

  win.loadFile('index.html');
  // Uncomment to debug layout the first time:
  win.webContents.openDevTools({ mode: 'detach' });

  // Create a tray icon with basic controls (tolerate missing/invalid icon)
  try {
    const trayIcon = process.platform === 'win32'
      ? path.join(__dirname, 'assets', 'tray.ico')
      : path.join(__dirname, 'assets', 'trayTemplate.png');
    tray = new Tray(trayIcon);
  } catch (e) {
    try {
      // Fallback to PNG even on Windows if ICO fails
      tray = new Tray(path.join(__dirname, 'assets', 'trayTemplate.png'));
    } catch {}
  }

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
  try { tray?.setToolTip('Mini Touch Dashboard'); } catch {}
  try { tray?.setContextMenu(contextMenu); } catch {}

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

    // Skip if an instance is already running
    try {
      const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
      const psCmd = "Try { (Get-Process -Name 'LibreHardwareMonitor' -ErrorAction SilentlyContinue | Select-Object -First 1).Id } Catch {}";
      const res = spawnSync(psExe, ['-NoProfile','-NonInteractive','-Command', psCmd], { windowsHide: true, encoding: 'utf8' });
      const pid = parseInt((res && res.stdout || '').toString().trim(), 10);
      if (Number.isFinite(pid) && pid > 0) { try { console.log(`[LHM] Already running (PID ${pid}); skipping launch.`); } catch {} ; return; }
    } catch {}

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
    let exe = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
    if (!exe) { try { console.log('[LHM] Executable not found in app resources. Will try zip extraction.'); } catch {}
    }

    // If exe not found, try extracting from bundled zip into temp
    if (!exe) {
      try {
        const zipCandidates = [
          path.join(base, 'extras', 'LibreHardwareMonitor.zip'),
          path.join(__dirname, 'extras', 'LibreHardwareMonitor.zip')
        ];
        const zipPath = zipCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
        if (zipPath) {
          // User requested extraction to %TEMP% – do not overwrite existing files/configs
          const tempBase = path.join(os.tmpdir(), 'mini-touch-dashboard');
          const extractDir = path.join(tempBase, 'LibreHardwareMonitor');
          try { fs.mkdirSync(extractDir, { recursive: true }); } catch {}
          const existingExe = path.join(extractDir, 'LibreHardwareMonitor.exe');
          if (fs.existsSync(existingExe)) {
            try { console.log(`[LHM] Using existing installation at ${existingExe}`); } catch {}
            exe = existingExe;
          } else {
            try { console.log(`[LHM] Extracting ${zipPath} -> ${extractDir} (skip existing)`); } catch {}
            // Safe extraction via .NET ZipFile, skipping files that already exist
            try {
              const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
              const zEsc = zipPath.replace(/'/g, "''");
              const dEsc = extractDir.replace(/'/g, "''");
              const script = (
                "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
                "$zip=[IO.Compression.ZipFile]::OpenRead('" + zEsc + "'); " +
                "$zip.Entries | ForEach-Object { " +
                  "$dest = Join-Path '" + dEsc + "' $_.FullName; " +
                  "if ($_.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $dest -Force | Out-Null } " +
                  "else { $dir=[IO.Path]::GetDirectoryName($dest); if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null } if (-not (Test-Path $dest)) { $_.ExtractToFile($dest, $false) } } " +
                "}; $zip.Dispose()"
              );
              spawnSync(psExe, ['-NoProfile','-NonInteractive','-Command', script], { stdio: 'ignore', windowsHide: true });
            } catch {}
            // After extraction, search for the exe within the extracted folder
            try {
              const queue = [extractDir];
              while (!exe && queue.length) {
                const dir = queue.shift();
                let entries = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { entries = []; }
                for (const ent of entries) {
                  const p = path.join(dir, ent.name);
                  if (ent.isDirectory()) queue.push(p);
                  else if (/^LibreHardwareMonitor\.exe$/i.test(ent.name)) { exe = p; break; }
                }
              }
            } catch {}
          }
        }
      } catch {}
    }
    if (!exe) { try { console.warn('[LHM] Failed to locate LibreHardwareMonitor.exe after extraction.'); } catch {} return; }
    if (lhmProc && !lhmProc.killed) return;
    // Best-effort: remove Mark-of-the-Web and ensure exec perms
    try { fs.unlinkSync(exe + ':Zone.Identifier'); } catch {}
    try { fs.chmodSync(exe, 0o755); } catch {}
    try {
      // Proactively unblock the EXE and its directory contents
      const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
      const exeEsc = exe.replace(/'/g, "''");
      const dirEsc = path.dirname(exe).replace(/'/g, "''");
      const psCmd = `Try { Unblock-File -LiteralPath '${exeEsc}' -ErrorAction SilentlyContinue; Get-ChildItem -LiteralPath '${dirEsc}' -Recurse -File | ForEach-Object { Try { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } Catch {} } } Catch {}`;
      spawnSync(psExe, ['-NoProfile','-NonInteractive','-Command', psCmd], { stdio: 'ignore', windowsHide: true });
    } catch {}

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
    const start = (retrying, exePath) => {
      const target = exePath || exe;
      try {
        const cwdForLaunch = path.dirname(target);
        // Prefer shell execution to avoid EACCES from Node spawn
        try {
          const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
          const tEsc = target.replace(/'/g, "''");
          const cwdEsc = cwdForLaunch.replace(/'/g, "''");
          const psCmd = `Try { $p = Start-Process -FilePath '${tEsc}' -WorkingDirectory '${cwdEsc}' -WindowStyle Hidden -PassThru; if ($p) { $p.Id } } Catch {}`;
          const res = spawnSync(psExe, ['-NoProfile','-NonInteractive','-Command', psCmd], { windowsHide: true, encoding: 'utf8' });
          const pid = parseInt((res && res.stdout || '').toString().trim(), 10);
          if (Number.isFinite(pid) && pid > 0) { lhmPid = pid; lhmOwned = true; try { console.log(`[LHM] Launched via PowerShell. PID ${pid}`); } catch {}; return; }
        } catch {}
        // Fallback to direct spawn (may work when not blocked)
        try { console.log(`[LHM] Starting: ${target}`); } catch {}
        const child = spawn(target, [], { stdio: 'ignore', windowsHide: true, cwd: cwdForLaunch });
        child.on('error', async (err) => {
          // Handle EACCES due to MOTW; try PowerShell Unblock-File once
          if (!retrying && err && (err.code === 'EACCES' || err.code === 'EPERM')) {
            try {
              const ps = spawn(process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe',
                ['-NoProfile','-Command', `try { Unblock-File -LiteralPath '${target.replace(/'/g, "''")}' -ErrorAction SilentlyContinue } catch {}`],
                { stdio: 'ignore', windowsHide: true });
              ps.on('exit', () => start(true, target));
              return;
            } catch {}
          }
          // Second-chance fallback: copy EXE to a new file to strip ADS and retry
          if (err && (err.code === 'EACCES' || err.code === 'EPERM')) {
            try {
              // Prefer running from userData instead of temp to avoid ASR/SmartScreen
              const userDir = (app && app.getPath) ? app.getPath('userData') : cwd;
              try { fs.mkdirSync(userDir, { recursive: true }); } catch {}
              const copyPath = path.join(userDir, 'LibreHardwareMonitor_run.exe');
              try { fs.unlinkSync(copyPath); } catch {}
              fs.copyFileSync(target, copyPath);
              try { fs.unlinkSync(copyPath + ':Zone.Identifier'); } catch {}
              try { fs.chmodSync(copyPath, 0o755); } catch {}
              return start(true, copyPath);
            } catch {}
          }
          // Last-resort: Shell-execute via PowerShell Start-Process or cmd start
          try {
            const psExe = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
            const tEsc = target.replace(/'/g, "''");
            const cwdEsc = (path.dirname(target)).replace(/'/g, "''");
            const psCmd = `Try { $p = Start-Process -FilePath '${tEsc}' -WorkingDirectory '${cwdEsc}' -WindowStyle Hidden -PassThru; if ($p) { $p.Id } } Catch {}`;
            const res = spawnSync(psExe, ['-NoProfile','-NonInteractive','-Command', psCmd], { windowsHide: true, encoding: 'utf8' });
            const pid = parseInt((res && res.stdout || '').toString().trim(), 10);
            if (Number.isFinite(pid) && pid > 0) { lhmPid = pid; lhmOwned = true; try { console.log(`[LHM] Launched via PowerShell. PID ${pid}`); } catch {} ; return; }
          } catch {}
          try {
            // cmd.exe start fallback (no PID tracking)
            const cmd = process.env.ComSpec || 'cmd.exe';
            const res2 = spawnSync(cmd, ['/c', 'start', '""', '"' + target.replace(/"/g, '""') + '"'], { cwd: path.dirname(target), windowsHide: true, stdio: 'ignore' });
            if (!res2 || res2.status === 0) { try { console.log('[LHM] Launched via cmd start.'); } catch {}; return; }
          } catch {}
          try { console.warn('[LHM] Failed to start:', err && err.message || err); } catch {}
        });
        lhmProc = child;
        lhmOwned = true;
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
  try { if (lhmOwned && lhmProc && !lhmProc.killed) lhmProc.kill(); } catch {}
  try { if (lhmOwned && !lhmProc && lhmPid) spawnSync('taskkill', ['/PID', String(lhmPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch {}
});

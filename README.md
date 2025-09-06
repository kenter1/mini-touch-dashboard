# Mini Touch Dashboard

A tiny Electron dashboard for a secondary touchscreen (Windows-friendly). It shows:
- Clock/date, Weather
- CPU load/temperature, GPU temperature, Memory, Storage, Network up/down
- Simple RSS feed

Launches borderless, always-on-top, and snaps to the bottom-most monitor. Includes a tray menu for quick controls.

## Quick Start

Prereqs:
- Node.js LTS 18+ (or newer)

Run:
```bash
cd mini-touch-dashboard
npm install
npm start
```

Tray menu offers: Always-on-Top toggle, Click-Through, Reload, Quit.

## Configuration

Edit `config.json` to tailor the dashboard:
- latitude / longitude: Coordinates for weather (Open‑Meteo; no API key).
- temperatureUnit: `fahrenheit` or `celsius`.
- windSpeedUnit: `mph` or `kmh`.
- rssFeeds: Array of RSS/Atom feed URLs.
- theme: `light`, `dark`, or `auto`.
- refresh: Polling intervals (ms) per domain.
- apps: Sidebar buttons (types: `dashboard`, `system`, `weather`, `web`, `browser`, `chatgpt`).
- sidebar.itemsPerPage: How many app buttons per page.

### System Metrics Modes

There are two ways to populate system metrics in the System view (`views/system.*`):

1) Local mode (default)
- Uses the Node `systeminformation` library; no extra setup.
- Works best when the dashboard runs on the same machine you want to monitor.

2) Glances API mode (remote or local) — optional
- Default is Local mode. Glances is optional and OFF by default.
- To use Glances, set in `config.json`:
  ```json
  {
    "metrics": {
      "mode": "api",
      "api": { "type": "glances", "baseUrl": "http://127.0.0.1:61208", "autoStart": true }
    }
  }
  ```

#### Install and Run Glances
- Requires Python 3 and pip.
- Install: `pip install glances`
- Start web API locally: `glances -w`
  - Default listens on `http://0.0.0.0:61208` with endpoints like `/api/3/all`.
  - To bind to localhost only: `glances -w --bind 127.0.0.1`
  - If exposing on a LAN, protect it (firewall/VPN/reverse proxy). Avoid exposing to the internet.
- Point `config.json` `metrics.api.baseUrl` to the address (e.g., `http://<host>:61208`).

What you get with Glances mode:
- CPU %, CPU temp, GPU temp (when sensors are reported), memory, storage (per drive), top processes (CPU/Mem), and network activity lists.

Optional: Add Glances UI as a sidebar app
- Add an item in `config.json` `apps` with `type: "web"` and `url: "http://localhost:61208"` to embed Glances’ web UI.

## CPU Temperature (Windows)

In Local mode, temps come from `systeminformation`. On some hardware, CPU temp can show `-` (sensor not exposed). Running as admin or installing vendor monitoring tools can help. Glances mode often reports more sensors if available.

This app can also read temperatures from LibreHardwareMonitor (preferred on Windows). Enable its Remote Web Server and the dashboard will read temps from `http://localhost:8085/data.json` by default. You can override via `config.json`:

```
{
  "metrics": {
    "lhm": { "baseUrl": "http://127.0.0.1:8085", "autoStart": true }
  }
}
```

## Development

- Live-reload is built-in for renderer changes. Edit HTML/JS/CSS and the app reloads. Changes to `main.js` trigger a relaunch.
- Dev script: `npm run dev` (uses `electronmon`).

## Tips

- Auto-start on Windows: put a shortcut to a packaged app or a script that runs `npm start` into `shell:startup`.
- Lock to a specific monitor: adjust `pickBottomDisplay()` in `main.js` to choose by display id/position.
- Touch-only overlay: enable Click-Through from the tray so the window doesn’t capture mouse clicks; touch interactions inside still work.

## Troubleshooting

## Packaging and Installer

- Portable EXE (no install): `npm run build:win:portable`
- Windows Installer (NSIS): `npm run build:win`
  - If a Glances binary is bundled, it is copied during install; however, Local mode remains the default and Glances is not started unless you enable API mode in `config.json`.
  - To avoid bundling, simply remove `extras/glances-web.exe` before building.

Build prerequisites on Windows:
- Run the build in an elevated terminal or enable Windows Developer Mode (to avoid symlink extraction issues with electron-builder tools).
- If you prefer no installer, the portable build produces a single `.exe`.

### Bundling Glances by Default

- Place your Glances wrapper binary at `extras/glances-web.exe` before running `npm run build:win`. The installer selects "Install local Glances" by default and will copy it into the installed app.
- Alternatively, set `!define GLANCES_URL` in `build/installer.nsh` to a URL you control so the installer downloads the binary at install time.

### Bundling LibreHardwareMonitor (Windows)

- Download the latest LibreHardwareMonitor release and place `LibreHardwareMonitor.exe` into one of these paths before building:
  - `extras/LibreHardwareMonitor/LibreHardwareMonitor.exe` (preferred)
  - or `extras/LibreHardwareMonitor.exe`
- The installer bundles everything under `extras/` (see `package.json` `build.extraResources`). On first run, the app will attempt to start LibreHardwareMonitor automatically on Windows if found.
- To expose temperatures to the dashboard, open LibreHardwareMonitor once and enable "Remote Web Server" (default port 8085). The setting is persisted, so subsequent auto-starts work headlessly. If you use a different port, set `metrics.lhm.baseUrl` accordingly in `config.json`.

- Glances API unreachable: verify `glances -w` is running and `baseUrl` matches. If remote, confirm firewall allows port 61208.
- Mixed metrics or odd characters: ensure `config.json` is saved as UTF-8 and icons use standard emoji/characters.
- Weather blank: verify `latitude`/`longitude` and that outbound HTTPS is allowed.

## License

Personal/experimental project — adapt freely within your environment.

# Mini Touch Dashboard

A tiny Electron dashboard for a secondary touchscreen monitor on Windows. Shows **clock/date**, **weather**, **CPU load & temperature**, **memory**, **network up/down**, and a simple **RSS feed**. It launches borderless, **always-on-top**, and snaps itself to the *bottom-most* monitor (great for a small screen sitting under your main monitor).

## Quick Start

1. Install **Node.js LTS** (18+ recommended).
2. Extract this folder, then in a terminal:
   ```bash
   cd mini-touch-dashboard
   npm install
   npm start
   ```

The app opens on the lowest/bottom-most display it finds. It adds a **system tray** icon with options to toggle Always-on-Top, enable **Click-Through** (so mouse clicks pass through), Reload, or Quit.

## Configure

Open `config.json` and edit:
- `latitude` / `longitude`: your location (used by Open-Meteo, no API key needed).
- `temperatureUnit`: "fahrenheit" or "celsius".
- `windSpeedUnit`: "mph" or "kmh".
- `rssFeeds`: list of RSS URLs to show in the Feed card.
- `theme`: "light", "dark", or "auto".
- `refresh`: change polling intervals if you like.

> **CPU Temperature note (Windows):** We use [`systeminformation`](https://systeminformation.io/). On some systems, CPU temp may return `0` or `—` if the sensors aren't exposed. Installing motherboard vendor utilities or running the app with admin privileges sometimes helps. As a fallback, you can pair with HWiNFO and we can wire to its shared memory in a future step.

## Tips

- To **auto-start** with Windows: create a shortcut to `npm start` (or a packaged exe) in `shell:startup`.
- To lock the app to a **specific monitor**, change the selection logic in `main.js` (`pickBottomDisplay()`). You can pick by display `id` or look for a specific resolution/position.
- For **touch only** (no mouse), enable **Click-Through** from the tray to avoid accidentally selecting the window; touch taps will still work on buttons/links inside.

## Roadmap (if you want to extend)
- Add GPU temp/fans (via `systeminformation.graphics()`).
- Add calendar cards (Google/Outlook APIs).
- Integrate selected app notifications (Slack/Discord/Email) into the Feed.
- Add a settings UI editable from the touchscreen.

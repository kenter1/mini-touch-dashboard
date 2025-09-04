// Settings view module
// Exposes init(ctx) where ctx = { config, ensureApps, rebuildSidebar }

exports.init = function init(ctx) {
  const { config, ensureApps, rebuildSidebar } = ctx;
  const path = require('path');
  const fs = require('fs');

  const settingsList = document.getElementById('settingsList');
  if (!settingsList) return;

  function renderSettings() {
    settingsList.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'row';
    header.style.marginBottom = '8px';
    header.innerHTML = '<div class="kpi"><div class="label">Icon</div></div><div class="kpi"><div class="label">Label</div></div><div class="kpi"><div class="label">Type</div></div><div class="kpi"><div class="label">URL (for web/browser)</div></div><div class="kpi"><div class="label">Page</div></div>';
    settingsList.appendChild(header);
    (config.apps || []).forEach((app, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.alignItems = 'center';
      row.style.marginBottom = '8px';
      row.innerHTML = `
        <input style="width:60px; height:40px; font-size:22px; text-align:center;" value="${app.icon || ''}" data-field="icon" data-idx="${idx}">
        <input style="flex:1; height:40px; font-size:16px;" value="${app.label || ''}" data-field="label" data-idx="${idx}">
        <select style="height:40px; font-size:16px;" data-field="type" data-idx="${idx}">
          <option value="dashboard" ${app.type==='dashboard'?'selected':''}>dashboard</option>
          <option value="browser" ${app.type==='browser'?'selected':''}>browser</option>
          <option value="chatgpt" ${app.type==='chatgpt'?'selected':''}>chatgpt</option>
          <option value="weather" ${app.type==='weather'?'selected':''}>weather</option>
          <option value="system" ${app.type==='system'?'selected':''}>system</option>
          <option value="web" ${app.type==='web'?'selected':''}>web</option>
        </select>
        <input style="flex:1; height:40px; font-size:16px;" value="${app.url || ''}" placeholder="https://..." data-field="url" data-idx="${idx}">
        <input style="width:70px; height:40px; font-size:16px; text-align:center;" value="${Number.isInteger(app.page)?app.page:0}" data-field="page" data-idx="${idx}" type="number" min="0">
        <button class="small-btn" data-action="delete" data-idx="${idx}">Delete</button>
      `;
      settingsList.appendChild(row);
    });
  }

  function collectSettingsFromUI() {
    const newApps = [];
    const rows = Array.from(settingsList.querySelectorAll('.row')).slice(1); // skip header
    rows.forEach((row, i) => {
      const icon = row.querySelector('input[data-field="icon"]').value.trim() || '😀';
      const label = row.querySelector('input[data-field="label"]').value.trim() || 'App';
      const type = row.querySelector('select[data-field="type"]').value;
      const url = row.querySelector('input[data-field="url"]').value.trim();
      const page = parseInt(row.querySelector('input[data-field="page"]').value, 10) || 0;
      newApps.push({ id: `${type}-${i}`, type, label, icon, page, ...(url ? { url } : {}) });
    });
    return newApps;
  }

  document.getElementById('settingsAdd')?.addEventListener('click', () => {
    (config.apps || (config.apps = [])).push({ id: `web-${Date.now()}`, type: 'web', label: 'New', icon: '🌐', url: 'https://example.com' });
    renderSettings();
  });

  settingsList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete"]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    config.apps.splice(idx, 1);
    renderSettings();
  });

  document.getElementById('settingsRevert')?.addEventListener('click', () => {
    try {
      const fresh = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
      Object.assign(config, fresh);
      ensureApps(config);
      rebuildSidebar();
      renderSettings();
    } catch (e) {
      alert('Failed to reload config.json');
    }
  });

  document.getElementById('settingsSave')?.addEventListener('click', () => {
    try {
      config.apps = collectSettingsFromUI();
      fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
      rebuildSidebar();
      alert('Saved');
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
  });

  // initial render
  renderSettings();
};


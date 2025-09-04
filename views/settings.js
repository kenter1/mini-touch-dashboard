// Settings view module (modernized)
// Exposes init(ctx) where ctx = { config, ensureApps, rebuildSidebar }

exports.init = function init(ctx) {
  const { config, ensureApps, rebuildSidebar } = ctx;
  const path = require('path');
  const fs = require('fs');

  const settingsList = document.getElementById('settingsList');
  const generalBox = document.getElementById('generalSettings');
  if (!settingsList) return;

  const DEFAULT_ICON = '\uD83C\uDF10'; // 🌐

  function ensureSidebar(cfg) { cfg.sidebar = cfg.sidebar || {}; return cfg.sidebar; }

  function renderGeneral() {
    if (!generalBox) return;
    const sidebar = ensureSidebar(config);
    const theme = config.theme || 'auto';
    generalBox.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; align-items:center;">
        <div>
          <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Theme</div>
          <select id="genTheme" style="width:100%; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);">
            <option value="auto" ${theme==='auto'?'selected':''}>Auto</option>
            <option value="dark" ${theme==='dark'?'selected':''}>Dark</option>
            <option value="light" ${theme==='light'?'selected':''}>Light</option>
          </select>
        </div>
        <div>
          <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Sidebar Items Per Page</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="small-btn" id="itemsDec" style="width:40px;">-</button>
            <input id="itemsPerPage" type="number" min="1" max="12" value="${sidebar.itemsPerPage || 5}" style="flex:1; height:40px; font-size:16px; text-align:center; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);">
            <button class="small-btn" id="itemsInc" style="width:40px;">+</button>
          </div>
        </div>
      </div>
    `;
    generalBox.querySelector('#itemsDec').addEventListener('click', ()=>{
      const input = generalBox.querySelector('#itemsPerPage');
      input.value = Math.max(1, (parseInt(input.value,10)||1)-1);
    });
    generalBox.querySelector('#itemsInc').addEventListener('click', ()=>{
      const input = generalBox.querySelector('#itemsPerPage');
      input.value = Math.min(12, (parseInt(input.value,10)||1)+1);
    });
  }

  function renderSettings() {
    settingsList.innerHTML = '';
    (config.apps || []).forEach((app, idx) => {
      const card = document.createElement('div');
      card.className = 'app-card';
      card.style.cssText = 'border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.03); border-radius:12px; padding:12px; display:grid; grid-template-columns: 90px 1fr 180px 1fr 140px auto; gap:10px; align-items:center;';

      // Icon preview + input + picker
      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:6px;';
      iconWrap.innerHTML = `<div style=\"width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; background:var(--card); border:1px solid rgba(255,255,255,0.12); font-size:24px;\">${app.icon || DEFAULT_ICON}</div>`;
      const iconInput = document.createElement('input');
      iconInput.value = app.icon || '';
      iconInput.placeholder = 'Emoji';
      iconInput.style.cssText = 'width:100%; height:36px; text-align:center; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);';
      iconInput.addEventListener('input', ()=>{ iconWrap.firstChild.textContent = iconInput.value || DEFAULT_ICON; });
      iconInput.dataset.field = 'icon'; iconInput.dataset.idx = String(idx);
      iconWrap.appendChild(iconInput);
      const pickBtn = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'Pick' });
      pickBtn.style.marginTop = '6px';
      pickBtn.addEventListener('click', (e)=>{ e.preventDefault(); openEmojiPicker(pickBtn, (emoji)=>{ iconInput.value = emoji; iconWrap.firstChild.textContent = emoji; }); });
      iconWrap.appendChild(pickBtn);
      card.appendChild(iconWrap);

      // Label
      const labelInput = document.createElement('input');
      labelInput.value = app.label || '';
      labelInput.placeholder = 'Label';
      labelInput.style.cssText = 'width:100%; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);';
      labelInput.dataset.field = 'label'; labelInput.dataset.idx = String(idx);
      card.appendChild(labelInput);

      // Type
      const typeSel = document.createElement('select');
      typeSel.innerHTML = `
        <option value=\"dashboard\" ${app.type==='dashboard'?'selected':''}>Dashboard</option>
        <option value=\"browser\" ${app.type==='browser'?'selected':''}>Browser</option>
        <option value=\"chatgpt\" ${app.type==='chatgpt'?'selected':''}>ChatGPT</option>
        <option value=\"weather\" ${app.type==='weather'?'selected':''}>Weather</option>
        <option value=\"system\" ${app.type==='system'?'selected':''}>System</option>
        <option value=\"web\" ${app.type==='web'?'selected':''}>Web</option>`;
      typeSel.style.cssText = 'width:100%; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);';
      typeSel.dataset.field = 'type'; typeSel.dataset.idx = String(idx);
      card.appendChild(typeSel);

      // URL
      const urlInput = document.createElement('input');
      urlInput.value = app.url || '';
      urlInput.placeholder = 'https://...';
      urlInput.style.cssText = 'width:100%; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);';
      urlInput.dataset.field = 'url'; urlInput.dataset.idx = String(idx);
      card.appendChild(urlInput);

      // Page with stepper
      const pageWrap = document.createElement('div');
      pageWrap.style.cssText = 'display:flex; gap:8px; align-items:center;';
      const dec = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'-' });
      const pageInput = Object.assign(document.createElement('input'), { type:'number', value: Number.isInteger(app.page)?app.page:0, min:0 });
      pageInput.style.cssText = 'width:70px; height:40px; font-size:16px; text-align:center; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);';
      const inc = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'+' });
      dec.addEventListener('click', ()=>{ pageInput.value = Math.max(0, parseInt(pageInput.value,10)-1); });
      inc.addEventListener('click', ()=>{ pageInput.value = Math.max(0, parseInt(pageInput.value,10)+1); });
      pageInput.dataset.field = 'page'; pageInput.dataset.idx = String(idx);
      pageWrap.appendChild(dec); pageWrap.appendChild(pageInput); pageWrap.appendChild(inc);
      card.appendChild(pageWrap);

      // Controls
      const ctrls = document.createElement('div');
      ctrls.style.cssText = 'display:flex; gap:6px; justify-content:flex-end;';
      const upBtn = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'↑' });
      const downBtn = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'↓' });
      const dupBtn = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'Duplicate' });
      const delBtn = Object.assign(document.createElement('button'), { className:'small-btn', textContent:'Delete' });
      upBtn.addEventListener('click', ()=>{ if (idx>0) { const t=config.apps[idx-1]; config.apps[idx-1]=config.apps[idx]; config.apps[idx]=t; renderSettings(); } });
      downBtn.addEventListener('click', ()=>{ if (idx<config.apps.length-1) { const t=config.apps[idx+1]; config.apps[idx+1]=config.apps[idx]; config.apps[idx]=t; renderSettings(); } });
      dupBtn.addEventListener('click', ()=>{ const copy = { ...app, id: `${app.type}-${Date.now()}` }; config.apps.splice(idx+1,0,copy); renderSettings(); });
      delBtn.addEventListener('click', ()=>{ config.apps.splice(idx,1); renderSettings(); });
      ctrls.appendChild(upBtn); ctrls.appendChild(downBtn); ctrls.appendChild(dupBtn); ctrls.appendChild(delBtn);
      card.appendChild(ctrls);

      settingsList.appendChild(card);
    });
  }

  function collectSettingsFromUI() {
    const newApps = [];
    const cards = Array.from(settingsList.querySelectorAll('.app-card'));
    cards.forEach((card, i) => {
      const icon = card.querySelector('input[data-field="icon"]').value.trim() || DEFAULT_ICON;
      const label = card.querySelector('input[data-field="label"]').value.trim() || 'App';
      const type = card.querySelector('select[data-field="type"]').value;
      const url = card.querySelector('input[data-field="url"]').value.trim();
      const page = parseInt(card.querySelector('input[data-field="page"]').value, 10) || 0;
      newApps.push({ id: `${type}-${i}`, type, label, icon, page, ...(url ? { url } : {}) });
    });
    return newApps;
  }

  document.getElementById('settingsAdd')?.addEventListener('click', () => {
    (config.apps || (config.apps = [])).push({ id: `web-${Date.now()}`, type: 'web', label: 'New', icon: DEFAULT_ICON, url: 'https://example.com' });
    renderSettings();
  });

  // Resolve config path at the app root (not in views/)
  const ROOT_DIR = path.resolve(__dirname, '..');
  const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

  document.getElementById('settingsRevert')?.addEventListener('click', () => {
    try {
      const fresh = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      Object.assign(config, fresh);
      ensureApps(config);
      rebuildSidebar();
      renderGeneral();
      renderSettings();
    } catch (e) {
      alert('Failed to reload config.json');
    }
  });

  document.getElementById('settingsSave')?.addEventListener('click', () => {
    try {
      // collect general (safe lookups)
      const sidebar = ensureSidebar(config);
      const itemsEl = generalBox?.querySelector('#itemsPerPage');
      const itemsVal = itemsEl ? parseInt(itemsEl.value, 10) : (sidebar.itemsPerPage || 5);
      const items = Number.isFinite(itemsVal) ? itemsVal : 5;
      sidebar.itemsPerPage = Math.min(12, Math.max(1, items));
      const themeEl = generalBox?.querySelector('#genTheme');
      config.theme = themeEl?.value || config.theme || 'auto';

      // collect apps
      config.apps = collectSettingsFromUI();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      rebuildSidebar();
      alert('Saved');
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
  });

  // initial render
  renderGeneral();
  renderSettings();
};

// Floating emoji picker (uses code points to avoid encoding issues)
function openEmojiPicker(anchor, onPick) {
  const EMOJI_CP = [0x1F3E0,0x1F310,0x1F4AC,0x2699,0x1F4CA,0x1F4F0,0x1F4FA,0x1F3B5,0x1F4F7,0x1F680,0x2B50,0x1F525,0x1F4BB,0x1F4D1,0x1F4A1,0x1F512,0x1F4E7,0x1F50D,0x1F4C1,0x1F527];
  const pop = document.createElement('div');
  pop.style.cssText = 'position:fixed; z-index:9999; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:8px; box-shadow:0 10px 30px rgba(0,0,0,0.35); display:grid; grid-template-columns: repeat(8, 28px); gap:6px;';
  EMOJI_CP.forEach(cp => {
    const e = String.fromCodePoint(cp);
    const b = document.createElement('button');
    b.textContent = e;
    b.className = 'small-btn';
    b.style.cssText = 'width:28px; height:28px; padding:0; font-size:16px; display:flex; align-items:center; justify-content:center;';
    b.addEventListener('click', ()=>{ try { onPick(e); } finally { close(); } });
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6);
  const left = Math.min(window.innerWidth - pop.offsetWidth - 8, r.left);
  pop.style.top = `${Math.max(8, top)}px`;
  pop.style.left = `${Math.max(8, left)}px`;
  function onDoc(ev){ if (!pop.contains(ev.target)) close(); }
  function onKey(ev){ if (ev.key === 'Escape') close(); }
  document.addEventListener('mousedown', onDoc, true);
  document.addEventListener('keydown', onKey, true);
  function close(){ try { pop.remove(); } catch{} document.removeEventListener('mousedown', onDoc, true); document.removeEventListener('keydown', onKey, true); }
}

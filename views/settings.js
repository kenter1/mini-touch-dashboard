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
    const dashboard = (config.dashboard = config.dashboard || {});
    const navEnabled = dashboard.navEnabled !== false; // default on
    const theme = config.theme || 'auto';
    const bg = config.background || { mode: 'solid', color: '#0b0f1a' };
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
        <div>
          <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Dashboard Navigation Panel</div>
          <label style="display:flex; align-items:center; gap:10px; height:40px;">
            <input id="genDashNav" type="checkbox" ${navEnabled?'checked':''} />
            <span>Enable dashboard header (pages, edit, columns)</span>
          </label>
        </div>
        <div>
          <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Background</div>
          <select id="bgMode" style="width:100%; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12);">
            <option value="solid" ${bg.mode==='solid'?'selected':''}>Solid Color</option>
            <option value="image" ${bg.mode==='image'?'selected':''}>Image</option>
            <option value="windows" ${bg.mode==='windows'?'selected':''}>Windows Wallpaper</option>
          </select>
        </div>
        <div id="bgSolidWrap" style="${bg.mode==='solid'?'':'display:none;'}">
          <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Color</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input id="bgColor" type="color" value="${bg.color || '#0b0f1a'}" style="width:60px; height:40px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0;">
            <input id="bgColorText" type="text" value="${bg.color || '#0b0f1a'}" placeholder="#0b0f1a" style="flex:1; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
          </div>
        </div>
        <div id="bgImageWrap" style="${bg.mode==='image'?'':'display:none;'}">
          <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Image File</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input id="bgImagePath" type="text" value="${(bg.path||'').replace(/\\\\/g,'/')}" placeholder="C:/path/to/image.jpg" style="flex:1; height:40px; font-size:16px; border-radius:10px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
            <button id="bgBrowse" class="small-btn">Choose</button>
            <input id="bgFileInput" type="file" accept="image/*" style="display:none;" />
          </div>
        </div>
        <div id="bgWinWrap" style="${bg.mode==='windows'?'':'display:none;'}">
          <div class="sub">Uses your current Windows desktop wallpaper.</div>
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

    // Background UI behavior
    const modeSel = generalBox.querySelector('#bgMode');
    const solidWrap = generalBox.querySelector('#bgSolidWrap');
    const imageWrap = generalBox.querySelector('#bgImageWrap');
    const winWrap = generalBox.querySelector('#bgWinWrap');
    modeSel.addEventListener('change', ()=>{
      const v = modeSel.value;
      solidWrap.style.display = v==='solid'?'':'none';
      imageWrap.style.display = v==='image'?'':'none';
      winWrap.style.display = v==='windows'?'':'none';
    });
    const colorInput = generalBox.querySelector('#bgColor');
    const colorText = generalBox.querySelector('#bgColorText');
    colorInput.addEventListener('input', ()=>{ colorText.value = colorInput.value; });
    colorText.addEventListener('input', ()=>{ colorInput.value = colorText.value; });
    const fileBtn = generalBox.querySelector('#bgBrowse');
    const fileInput = generalBox.querySelector('#bgFileInput');
    const pathInput = generalBox.querySelector('#bgImagePath');
    fileBtn.addEventListener('click', (e)=>{ e.preventDefault(); fileInput.click(); });
    fileInput.addEventListener('change', ()=>{
      const f = fileInput.files && fileInput.files[0];
      if (f && f.path) { pathInput.value = f.path; }
    });
  }

  // Modernized General UI (segmented controls, sliders, toggles)
  function renderGeneralModern() {
    if (!generalBox) return;
    const sidebar = ensureSidebar(config);
    const dashboard = (config.dashboard = config.dashboard || {});
    const navEnabled = dashboard.navEnabled !== false;
    const theme = config.theme || 'auto';
    const bg = config.background || { mode: 'solid', color: '#0b0f1a' };
    const ui = (config.ui = config.ui || {});
    const glass = Number.isFinite(ui.widgetGlassOpacity) ? ui.widgetGlassOpacity : 100;
    const bgVisible = ui.widgetBackgroundVisible !== false;
    generalBox.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px; align-items:stretch;">
        <div class="card" style="gap:10px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.03);">
          <div class="title" style="gap:8px;"><span>Appearance</span></div>
          <div>
            <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Theme</div>
            <div id="themeSeg" style="display:flex; gap:6px;">
              <button class="small-btn" data-val="auto" style="flex:1; height:36px; border-radius:8px;">Auto</button>
              <button class="small-btn" data-val="dark" style="flex:1; height:36px; border-radius:8px;">Dark</button>
              <button class="small-btn" data-val="light" style="flex:1; height:36px; border-radius:8px;">Light</button>
            </div>
            <select id="genTheme" style="display:none">
              <option value="auto" ${theme==='auto'?'selected':''}>Auto</option>
              <option value="dark" ${theme==='dark'?'selected':''}>Dark</option>
              <option value="light" ${theme==='light'?'selected':''}>Light</option>
            </select>
          </div>
          <div>
            <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Background</div>
            <div id="bgSeg" style="display:flex; gap:6px; margin-bottom:8px;">
              <button class="small-btn" data-val="solid" style="flex:1; height:32px; border-radius:8px;">Solid</button>
              <button class="small-btn" data-val="image" style="flex:1; height:32px; border-radius:8px;">Image</button>
              <button class="small-btn" data-val="windows" style="flex:1; height:32px; border-radius:8px;">Windows</button>
            </div>
            <select id="bgMode" style="display:none">
              <option value="solid" ${bg.mode==='solid'?'selected':''}>Solid</option>
              <option value="image" ${bg.mode==='image'?'selected':''}>Image</option>
              <option value="windows" ${bg.mode==='windows'?'selected':''}>Windows</option>
            </select>
            <div id="bgSolidWrap" style="${bg.mode==='solid'?'':'display:none;'}">
              <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Color</div>
              <div style="display:flex; gap:8px; align-items:center;">
                <input id="bgColor" type="color" value="${bg.color || '#0b0f1a'}" style="width:48px; height:36px; border-radius:8px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0;">
                <input id="bgColorText" type="text" value="${bg.color || '#0b0f1a'}" placeholder="#0b0f1a" style="flex:1; height:36px; font-size:15px; border-radius:8px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
                <div id="bgSwatch" style="width:36px; height:36px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:${bg.color || '#0b0f1a'}"></div>
              </div>
            </div>
            <div id="bgImageWrap" style="${bg.mode==='image'?'':'display:none;'}">
              <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted);">Image File</div>
              <div style="display:flex; gap:8px; align-items:center;">
                <input id="bgImagePath" type="text" value="${(bg.path||'').replace(/\\\\/g,'/')}" placeholder="C:/path/to/image.jpg" style="flex:1; height:36px; font-size:15px; border-radius:8px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
                <button id="bgBrowse" class="small-btn" style="height:36px;">Choose</button>
                <input id="bgFileInput" type="file" accept="image/*" style="display:none;" />
              </div>
            </div>
            <div id="bgWinWrap" class="sub" style="${bg.mode==='windows'?'':'display:none;'}">Uses your current Windows wallpaper.</div>
          </div>
          <div>
            <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Widget Glass Opacity</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="small-btn" id="glassDec" style="width:36px; height:32px;">-</button>
              <input id="glassOpacity" type="range" min="0" max="100" value="${glass}" style="flex:1; accent-color: var(--accent);">
              <button class="small-btn" id="glassInc" style="width:36px; height:32px;">+</button>
              <div id="glassVal" class="pill" style="min-width:46px; text-align:center;">${glass}%</div>
            </div>
            <div class="sub">Lower values increase transparency and blur for widget cards.</div>
            <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
              <button class="small-btn" id="glassToggleBtn" style="height:32px;">
                ${bgVisible ? 'Background: Visible' : 'Background: Hidden'}
              </button>
              <div class="sub">Quick toggle for widget background visibility.</div>
            </div>
          </div>
        </div>

        <div class="card" style="gap:10px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.03);">
          <div class="title"><span>Location & Weather</span></div>
          <div>
            <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">City (display label)</div>
            <input id="genCity" type="text" value="${(config.city||'').replace(/"/g,'&quot;')}" placeholder="e.g., Orlando, FL" style="width:100%; height:36px; font-size:15px; border-radius:8px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
            <div class="sub">Shown in the Weather widget. If empty, the app attempts to resolve your city automatically.</div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div>
              <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Latitude</div>
              <input id="genLat" type="number" step="0.0001" value="${Number.isFinite(config.latitude)?config.latitude:''}" placeholder="28.5383" style="width:100%; height:36px; font-size:15px; border-radius:8px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
            </div>
            <div>
              <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Longitude</div>
              <input id="genLon" type="number" step="0.0001" value="${Number.isFinite(config.longitude)?config.longitude:''}" placeholder="-81.3792" style="width:100%; height:36px; font-size:15px; border-radius:8px; background:var(--card); color:var(--fg); border:1px solid rgba(255,255,255,0.12); padding:0 10px;">
            </div>
          </div>
        </div>

        <div class="card" style="gap:10px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.03);">
          <div class="title"><span>Layout</span></div>
          <div>
            <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Sidebar Items Per Page</div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="small-btn" id="itemsDec" style="width:36px; height:32px;">-</button>
              <input id="itemsPerPage" type="range" min="1" max="12" value="${sidebar.itemsPerPage || 5}" style="flex:1; accent-color: var(--accent);">
              <button class="small-btn" id="itemsInc" style="width:36px; height:32px;">+</button>
              <div id="itemsVal" class="pill" style="min-width:34px; text-align:center;">${sidebar.itemsPerPage || 5}</div>
            </div>
          </div>
          <div>
            <div class="label" style="text-transform:uppercase; letter-spacing:.6px; font-size:12px; color:var(--muted); margin-bottom:6px;">Dashboard Navigation Panel</div>
            <label style="display:flex; align-items:center; gap:10px; height:32px;">
              <input id="genDashNav" type="checkbox" ${navEnabled?'checked':''} style="width:0;height:0;opacity:0;position:absolute;" />
              <div id="navToggle" style="width:52px; height:28px; border-radius:999px; background:${navEnabled?'var(--accent)':'rgba(255,255,255,0.15)'}; position:relative; transition:background .2s; border:1px solid rgba(255,255,255,0.15);">
                <div style="position:absolute; top:2px; left:${navEnabled?'26px':'2px'}; width:24px; height:24px; background:#fff; border-radius:999px; transition:left .2s;"></div>
              </div>
              <span>Enable dashboard header (pages, edit, columns)</span>
            </label>
          </div>
        </div>
      </div>
    `;

    // Theme segmented
    const themeSel = generalBox.querySelector('#genTheme');
    const themeSeg = Array.from(generalBox.querySelectorAll('#themeSeg .small-btn'));
    const setThemeUI = (val) => {
      themeSeg.forEach(b => { b.style.outline = (b.dataset.val===val)?'2px solid var(--accent)':'1px solid rgba(255,255,255,0.12)'; b.style.background = (b.dataset.val===val)?'rgba(77,163,255,0.18)':'var(--card)'; });
      themeSel.value = val;
    };
    themeSeg.forEach(b => b.addEventListener('click', ()=> {
      const val = b.dataset.val;
      setThemeUI(val);
      try { config.theme = val; } catch {}
      try { window.applyTheme && window.applyTheme(config); } catch {}
      try { window.dispatchEvent(new CustomEvent('config-updated', { detail: config })); } catch {}
    }));
    setThemeUI(themeSel.value || 'auto');

    // Background segmented
    const modeSel = generalBox.querySelector('#bgMode');
    const bgSeg = Array.from(generalBox.querySelectorAll('#bgSeg .small-btn'));
    const solidWrap = generalBox.querySelector('#bgSolidWrap');
    const imageWrap = generalBox.querySelector('#bgImageWrap');
    const winWrap = generalBox.querySelector('#bgWinWrap');
    const setBgModeUI = (val) => {
      bgSeg.forEach(b => { b.style.outline = (b.dataset.val===val)?'2px solid var(--accent)':'1px solid rgba(255,255,255,0.12)'; b.style.background = (b.dataset.val===val)?'rgba(77,163,255,0.18)':'var(--card)'; });
      modeSel.value = val;
      solidWrap.style.display = val==='solid'?'':'none';
      imageWrap.style.display = val==='image'?'':'none';
      winWrap.style.display = val==='windows'?'':'none';
    };
    bgSeg.forEach(b => b.addEventListener('click', ()=> setBgModeUI(b.dataset.val)));
    setBgModeUI(modeSel.value || 'solid');

    // Color inputs sync + swatch
    const colorInput = generalBox.querySelector('#bgColor');
    const colorText = generalBox.querySelector('#bgColorText');
    const swatch = generalBox.querySelector('#bgSwatch');
    colorInput?.addEventListener('input', ()=>{ colorText.value = colorInput.value; swatch.style.background = colorInput.value; });
    colorText?.addEventListener('input', ()=>{ colorInput.value = colorText.value; swatch.style.background = colorText.value; });

    // Image chooser
    const fileBtn = generalBox.querySelector('#bgBrowse');
    const fileInput = generalBox.querySelector('#bgFileInput');
    const pathInput = generalBox.querySelector('#bgImagePath');
    fileBtn?.addEventListener('click', (e)=>{ e.preventDefault(); fileInput.click(); });
    fileInput?.addEventListener('change', ()=>{
      const f = fileInput.files && fileInput.files[0];
      if (f && f.path) { pathInput.value = f.path; }
    });

    // Glass controls
    const glassRange = generalBox.querySelector('#glassOpacity');
    const glassValEl = generalBox.querySelector('#glassVal');
    const glassDec = generalBox.querySelector('#glassDec');
    const glassInc = generalBox.querySelector('#glassInc');
    const clampGlass = () => {
      const v = Math.max(0, Math.min(100, parseInt(glassRange.value, 10) || 0));
      glassRange.value = String(v);
      glassValEl.textContent = v + '%';
      try { (config.ui = config.ui || {}).widgetGlassOpacity = v; } catch {}
      try { window.applyGlass && window.applyGlass(config); } catch {}
      try { window.dispatchEvent(new CustomEvent('config-updated', { detail: config })); } catch {}
    };
    glassRange?.addEventListener('input', clampGlass);
    glassDec?.addEventListener('click', ()=>{ glassRange.value = String(Math.max(0, (parseInt(glassRange.value,10)||0)-5)); clampGlass(); });
    glassInc?.addEventListener('click', ()=>{ glassRange.value = String(Math.min(100, (parseInt(glassRange.value,10)||0)+5)); clampGlass(); });
    const glassToggleBtn = generalBox.querySelector('#glassToggleBtn');
    glassToggleBtn?.addEventListener('click', ()=>{
      const visible = !(((config.ui || {}).widgetBackgroundVisible) === false);
      (config.ui = config.ui || {}).widgetBackgroundVisible = !visible;
      // Update button label
      try { glassToggleBtn.textContent = (!visible) ? 'Background: Visible' : 'Background: Hidden'; } catch {}
      // Notify views (dashboard will re-render and remove background/shadow when hidden)
      try { window.dispatchEvent(new CustomEvent('config-updated', { detail: config })); } catch {}
    });

    // Items per page controls
    const itemsRange = generalBox.querySelector('#itemsPerPage');
    const itemsValEl = generalBox.querySelector('#itemsVal');
    const decBtn = generalBox.querySelector('#itemsDec');
    const incBtn = generalBox.querySelector('#itemsInc');
    const clampItems = () => { const v = Math.min(12, Math.max(1, parseInt(itemsRange.value,10)||5)); itemsRange.value = String(v); itemsValEl.textContent = v; };
    itemsRange?.addEventListener('input', clampItems);
    decBtn?.addEventListener('click', ()=>{ itemsRange.value = String(Math.max(1, (parseInt(itemsRange.value,10)||1)-1)); clampItems(); });
    incBtn?.addEventListener('click', ()=>{ itemsRange.value = String(Math.min(12, (parseInt(itemsRange.value,10)||1)+1)); clampItems(); });
    clampItems();

    // Toggle switch visual sync
    const navChk = generalBox.querySelector('#genDashNav');
    const navToggle = generalBox.querySelector('#navToggle');
    const updateNavToggle = () => {
      navToggle.style.background = navChk.checked ? 'var(--accent)' : 'rgba(255,255,255,0.15)';
      const knob = navToggle.firstElementChild; if (knob) knob.style.left = navChk.checked ? '26px' : '2px';
    };
    const syncNavToConfig = () => {
      try { (config.dashboard = config.dashboard || {}).navEnabled = !!navChk.checked; } catch {}
      try { window.dispatchEvent(new CustomEvent('config-updated', { detail: config })); } catch {}
    };
    navToggle?.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); navChk.checked = !navChk.checked; updateNavToggle(); syncNavToConfig(); });
    navChk?.addEventListener('change', ()=>{ updateNavToggle(); syncNavToConfig(); });
    updateNavToggle();
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

  // Simple tabs for Settings view
  function initTabs() {
    const btnGen = document.getElementById('tabBtnGeneral');
    const btnApps = document.getElementById('tabBtnApps');
    const pageGen = document.getElementById('tab-general');
    const pageApps = document.getElementById('tab-apps');
    if (!btnGen || !btnApps || !pageGen || !pageApps) return;
    const activate = (which) => {
      const isGen = which === 'general';
      pageGen.style.display = isGen ? 'block' : 'none';
      pageApps.style.display = isGen ? 'none' : 'block';
      btnGen.style.outline = isGen ? '2px solid var(--accent)' : 'none';
      btnApps.style.outline = !isGen ? '2px solid var(--accent)' : 'none';
    };
    btnGen.addEventListener('click', ()=> activate('general'));
    btnApps.addEventListener('click', ()=> activate('apps'));
    activate('general');
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
      renderGeneralModern();
      renderSettings();
      try { window.applyTheme && window.applyTheme(config); } catch {}
      try { window.applyBackground && window.applyBackground(config); } catch {}
      try { window.applyGlass && window.applyGlass(config); } catch {}
      try { window.dispatchEvent(new CustomEvent('config-updated', { detail: config })); } catch {}
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
      // dashboard nav toggle
      const navEl = generalBox?.querySelector('#genDashNav');
      (config.dashboard = config.dashboard || {}).navEnabled = !!(navEl ? navEl.checked : true);

      // background settings
      const modeEl = generalBox?.querySelector('#bgMode');
      const bgMode = modeEl?.value || 'solid';
      const bg = (config.background = config.background || {});
      bg.mode = bgMode;
      if (bgMode === 'solid') {
        const colEl = generalBox?.querySelector('#bgColorText');
        bg.color = (colEl?.value || '#0b0f1a').trim();
        delete bg.path;
      } else if (bgMode === 'image') {
        const pEl = generalBox?.querySelector('#bgImagePath');
        bg.path = (pEl?.value || '').trim();
        if (!bg.path) delete bg.path;
        delete bg.color;
      } else if (bgMode === 'windows') {
        delete bg.color; delete bg.path;
      }

      // glass opacity
      const gEl = generalBox?.querySelector('#glassOpacity');
      const gVal = gEl ? parseInt(gEl.value, 10) : ((config.ui && config.ui.widgetGlassOpacity) || 100);
      (config.ui = config.ui || {}).widgetGlassOpacity = Math.max(0, Math.min(100, Number.isFinite(gVal) ? gVal : 100));
      // widget background visibility (button updates config live; keep current value)
      const bgVis = (config.ui && config.ui.widgetBackgroundVisible);
      (config.ui = config.ui || {}).widgetBackgroundVisible = (bgVis !== false);

      // location & weather
      const cityEl = generalBox?.querySelector('#genCity');
      const latEl = generalBox?.querySelector('#genLat');
      const lonEl = generalBox?.querySelector('#genLon');
      const cityVal = (cityEl?.value || '').trim();
      if (cityVal) { config.city = cityVal; } else { delete config.city; }
      const latVal = parseFloat(latEl?.value || '');
      const lonVal = parseFloat(lonEl?.value || '');
      if (Number.isFinite(latVal)) config.latitude = latVal;
      if (Number.isFinite(lonVal)) config.longitude = lonVal;

      // collect apps
      config.apps = collectSettingsFromUI();
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
      rebuildSidebar();
      try { window.applyTheme && window.applyTheme(config); } catch {}
      try { window.applyBackground && window.applyBackground(config); } catch {}
      try { window.applyGlass && window.applyGlass(config); } catch {}
      try { window.dispatchEvent(new CustomEvent('config-updated', { detail: config })); } catch {}
      alert('Saved');
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
  });

  // initial render
  renderGeneralModern();
  renderSettings();
  initTabs();
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




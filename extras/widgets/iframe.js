module.exports = {
  id: 'iframe',
  title: 'IFrame/HTML',
  render(container, { config, addTimer, editMode }) {
    // Get widget configuration from widget settings or use defaults
    const widgetElement = container.closest('[data-widget-config]');
    const widgetConfig = widgetElement?.dataset.widgetConfig || '{}';
    let settings = { 
      src: 'about:blank', 
      width: '100%', 
      height: '300px',
      html: '' // New field for HTML content
    };
    
    try {
      settings = { ...settings, ...JSON.parse(widgetConfig) };
    } catch (e) {
      // Use defaults if parsing fails
    }
    
    // Check if we have HTML content to render
    if (settings.html && settings.html.trim() !== '') {
      // Render HTML content directly
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;width:100%;height:100%;">
          <div style="display:flex;justify-content:center;align-items:center;">
            <div class="title">HTML Content</div>
          </div>
          ${editMode ? `
          <div style="display:flex;justify-content:center;margin:4px 0;">
            <button class="small-btn" id="editIframeBtn" style="padding:4px 8px;font-size:12px;z-index:100;position:relative;">✏️ Edit</button>
          </div>
          ` : ''}
          <div style="flex:1;min-height:0;position:relative;">
            <div style="position:absolute;top:0;left:0;right:0;bottom:0;overflow:auto;border-radius:8px;">
              ${settings.html}
            </div>
          </div>
          ${editMode ? `
          <div id="iframeEditPanel" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:90%;max-width:500px;max-height:80%;overflow:auto;padding:12px;background:var(--card);border-radius:8px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:1000;">
            <div style="margin-bottom:8px;font-weight:bold;">Edit HTML Content</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <div>
                <label style="display:block;margin-bottom:4px;font-size:12px;">HTML Content:</label>
                <textarea id="iframeHtml" style="width:100%;height:150px;padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:var(--card);color:var(--fg);font-family:monospace;">${settings.html}</textarea>
              </div>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="small-btn" id="iframeSaveBtn" style="flex:1;">💾 Save</button>
                <button class="small-btn" id="iframeCancelBtn" style="flex:1;">❌ Cancel</button>
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      `;
      
      // Execute any scripts in the HTML content when not in edit mode
      if (!editMode) {
        const scripts = container.querySelectorAll('script');
        scripts.forEach(oldScript => {
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });
      }
    } else {
      // Render iframe as fallback
      const iframeSrc = settings.src || 'about:blank';
      const iframeWidth = settings.width || '100%';
      const iframeHeight = settings.height || '300px';
      const allowFullscreen = settings.allowFullscreen !== false; // default true
      const allowScripts = settings.allowScripts === true; // default false
      
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;width:100%;height:100%;">
          <div style="display:flex;justify-content:center;align-items:center;">
            <div class="title">IFrame</div>
          </div>
          ${editMode ? `
          <div style="display:flex;justify-content:center;margin:4px 0;">
            <button class="small-btn" id="editIframeBtn" style="padding:4px 8px;font-size:12px;z-index:100;position:relative;">✏️ Edit</button>
          </div>
          ` : ''}
          <div style="flex:1;min-height:0;">
            <iframe 
              src="${iframeSrc}" 
              width="${iframeWidth}" 
              height="${iframeHeight}"
              frameborder="0"
              ${allowFullscreen ? 'allowfullscreen' : ''}
              ${allowScripts ? 'sandbox="allow-scripts allow-same-origin allow-popups allow-forms"' : 'sandbox="allow-same-origin allow-popups"'}
              style="width:100%;height:100%;border-radius:8px;"
            ></iframe>
          </div>
          <div style="font-size:10px;color:var(--muted);text-align:center;">URL: ${iframeSrc}</div>
          ${editMode ? `
          <div id="iframeEditPanel" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:90%;max-width:500px;max-height:80%;overflow:auto;padding:12px;background:var(--card);border-radius:8px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:1000;">
            <div style="margin-bottom:8px;font-weight:bold;">Edit IFrame Settings</div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <div>
                <label style="display:block;margin-bottom:4px;font-size:12px;">URL:</label>
                <input type="text" id="iframeSrc" value="${iframeSrc}" placeholder="https://example.com" style="width:100%;padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:var(--card);color:var(--fg);">
              </div>
              <div style="display:flex;gap:8px;">
                <div style="flex:1;">
                  <label style="display:block;margin-bottom:4px;font-size:12px;">Width:</label>
                  <input type="text" id="iframeWidth" value="${iframeWidth}" placeholder="100%" style="width:100%;padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:var(--card);color:var(--fg);">
                </div>
                <div style="flex:1;">
                  <label style="display:block;margin-bottom:4px;font-size:12px;">Height:</label>
                  <input type="text" id="iframeHeight" value="${iframeHeight}" placeholder="300px" style="width:100%;padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:var(--card);color:var(--fg);">
                </div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <label style="display:flex;align-items:center;gap:4px;">
                  <input type="checkbox" id="iframeFullscreen" ${allowFullscreen ? 'checked' : ''}>
                  <span style="font-size:12px;">Allow Fullscreen</span>
                </label>
                <label style="display:flex;align-items:center;gap:4px;">
                  <input type="checkbox" id="iframeScripts" ${allowScripts ? 'checked' : ''}>
                  <span style="font-size:12px;">Allow Scripts</span>
                </label>
              </div>
              <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="small-btn" id="iframeSaveBtn" style="flex:1;">💾 Save</button>
                <button class="small-btn" id="iframeCancelBtn" style="flex:1;">❌ Cancel</button>
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      `;
    }
    
    // Add event listeners if in edit mode
    if (editMode) {
      const editBtn = container.querySelector('#editIframeBtn');
      const editPanel = container.querySelector('#iframeEditPanel');
      const saveBtn = container.querySelector('#iframeSaveBtn');
      const cancelBtn = container.querySelector('#iframeCancelBtn');
      
      if (editBtn && editPanel) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          editPanel.style.display = 'block';
          // Add overlay to close when clicking outside
          const overlay = document.createElement('div');
          overlay.style.position = 'fixed';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.background = 'rgba(0,0,0,0.5)';
          overlay.style.zIndex = '999';
          overlay.id = 'iframeEditOverlay';
          document.body.appendChild(overlay);
          
          overlay.addEventListener('click', () => {
            editPanel.style.display = 'none';
            document.body.removeChild(overlay);
          });
        });
      }
      
      if (cancelBtn && editPanel) {
        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          editPanel.style.display = 'none';
          const overlay = document.getElementById('iframeEditOverlay');
          if (overlay) {
            document.body.removeChild(overlay);
          }
        });
      }
      
      if (saveBtn && editPanel) {
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          
          // Get the current widget configuration
          let currentConfig = {};
          try {
            currentConfig = JSON.parse(widgetConfig);
          } catch (err) {
            // Use empty object if parsing fails
          }
          
          // Update configuration based on content type
          if (container.querySelector('#iframeHtml')) {
            // HTML content mode
            const html = container.querySelector('#iframeHtml').value;
            currentConfig.html = html;
            // Clear iframe-specific settings
            delete currentConfig.src;
            delete currentConfig.width;
            delete currentConfig.height;
            delete currentConfig.allowFullscreen;
            delete currentConfig.allowScripts;
          } else {
            // IFrame mode
            const src = container.querySelector('#iframeSrc').value;
            const width = container.querySelector('#iframeWidth').value;
            const height = container.querySelector('#iframeHeight').value;
            const fullscreen = container.querySelector('#iframeFullscreen')?.checked;
            const scripts = container.querySelector('#iframeScripts')?.checked;
            
            currentConfig.src = src;
            currentConfig.width = width;
            currentConfig.height = height;
            currentConfig.allowFullscreen = fullscreen;
            currentConfig.allowScripts = scripts;
            // Clear HTML setting
            delete currentConfig.html;
          }
          
          // Update the widget configuration
          if (widgetElement) {
            widgetElement.dataset.widgetConfig = JSON.stringify(currentConfig);
          }
          
          // Hide the edit panel
          editPanel.style.display = 'none';
          const overlay = document.getElementById('iframeEditOverlay');
          if (overlay) {
            document.body.removeChild(overlay);
          }
          
          // Show a message that changes are saved
          const message = document.createElement('div');
          message.textContent = '✅ Changes saved! Refresh to see updates.';
          message.style.position = 'fixed';
          message.style.bottom = '20px';
          message.style.right = '20px';
          message.style.padding = '12px 16px';
          message.style.background = 'var(--accent)';
          message.style.color = 'white';
          message.style.borderRadius = '6px';
          message.style.zIndex = '10000';
          message.style.fontSize = '14px';
          message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
          message.style.transition = 'opacity 0.3s';
          document.body.appendChild(message);
          
          // Remove the message after 3 seconds
          setTimeout(() => {
            message.style.opacity = '0';
            setTimeout(() => {
              if (message.parentNode) {
                message.parentNode.removeChild(message);
              }
            }, 300);
          }, 3000);
        });
      }
    }
  }
};
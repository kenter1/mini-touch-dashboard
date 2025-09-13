module.exports = {
  id: 'iframe',
  title: 'WebView',
  render(container, { config, addTimer, editMode, widget, saveConfig, render }) {
    // Get widget configuration from widget settings or use defaults
    let settings = { 
      src: 'about:blank', 
      width: '100%', 
      height: '100%'
    };
    
    // Merge with widget config if available
    if (widget && widget.config) {
      settings = { ...settings, ...widget.config };
    }
    
    // Ensure URL is properly formatted
    let webViewSrc = settings.src || 'about:blank';
    if (webViewSrc !== 'about:blank' && !webViewSrc.startsWith('http://') && !webViewSrc.startsWith('https://') && !webViewSrc.startsWith('file://')) {
      // Handle localhost URLs without protocol
      if (webViewSrc.startsWith('localhost') || webViewSrc.match(/^[\\d\\.]+(:\\d+)?/)) {
        webViewSrc = 'http://' + webViewSrc;
      } else {
        webViewSrc = 'https://' + webViewSrc;
      }
    }
    
    // Generate a unique ID for this webview
    const webViewId = 'webView-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    
    container.innerHTML = `
  <div style="display:flex;flex-direction:column;width:100%;height:100%;min-height:0;">
    ${editMode ? `
    <div style="display:flex;justify-content:center;margin:0px 0;flex:0 0 auto;">
      <button class="small-btn" id="editIframeBtn-${webViewId}" style="padding:0px 0px;font-size:12px;z-index:100;position:relative;">✏️ Edit</button>
    </div>
    ` : ''}
    <div style="flex:1 1 auto;min-height:0;position:relative;overflow:hidden;border-radius:8px;background:rgba(0,0,0,0.1);" class="card">
      <webview id="${webViewId}" src="${webViewSrc}"
        style="width:100%; height:100%; position:absolute; inset:0; z-index:1;"
        allowpopups allowfullscreen>
      </webview>
    </div>
    ${editMode ? `
    <div id="iframeEditPanel-${webViewId}" style="display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:90%;max-width:500px;max-height:80%;overflow:auto;padding:12px;background:var(--card);border-radius:8px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:1000;">
      <div style="margin-bottom:8px;font-weight:bold;">Edit WebView Settings</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div>
          <label style="display:block;margin-bottom:4px;font-size:12px;">URL:</label>
          <input type="text" id="iframeSrc-${webViewId}" value="${webViewSrc}" placeholder="https://example.com" style="width:100%;padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:var(--card);color:var(--fg);">
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="small-btn" id="iframeSaveBtn-${webViewId}" style="flex:1;">💾 Save</button>
          <button class="small-btn" id="iframeCancelBtn-${webViewId}" style="flex:1;">❌ Cancel</button>
        </div>
      </div>
    </div>
    ` : ''}
  </div>
`;

    // Add event listeners after a short delay to ensure DOM is ready
    setTimeout(() => {
      const webview = document.getElementById(webViewId);
      if (webview) {
        console.log('WebView created with ID:', webViewId, 'and src:', webViewSrc);
        
        // Add event listeners
        webview.addEventListener('did-finish-load', function() {
          console.log('WebView finished loading:', webViewId);
        });
        
        webview.addEventListener('did-fail-load', function(event) {
          console.log('WebView failed to load:', webViewId, event.errorCode, event.errorDescription);
        });
      }
    }, 100);
    
    // Add event listeners if in edit mode
    if (editMode) {
      setTimeout(() => {
        const editBtn = document.getElementById(`editIframeBtn-${webViewId}`);
        const editPanel = document.getElementById(`iframeEditPanel-${webViewId}`);
        const saveBtn = document.getElementById(`iframeSaveBtn-${webViewId}`);
        const cancelBtn = document.getElementById(`iframeCancelBtn-${webViewId}`);
        const srcInput = document.getElementById(`iframeSrc-${webViewId}`);
        
        if (editBtn && editPanel) {
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editPanel.style.display = 'block';
          });
          
          cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editPanel.style.display = 'none';
          });
          
          saveBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Get the new URL
            const newSrc = srcInput.value;
            
            widget.config = widget.config || {};
            widget.config.src = newSrc;
            
            // Hide the edit panel
            editPanel.style.display = 'none';
            
            // Update the webview source
            const webview = document.getElementById(webViewId);
            if (webview) {
              webview.src = newSrc;
            }
            
            // Save the configuration and re-render
            try {
              if (typeof saveConfig === 'function' && typeof render === 'function') {
                saveConfig();
                render();
              }
            } catch (err) {
              console.error('Failed to save config:', err);
            }
            
            // Show a message that changes are saved
            const message = document.createElement('div');
            message.textContent = '✅ Changes saved!';
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
      }, 100);
    }
  }
};
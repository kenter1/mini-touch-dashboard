module.exports = {
  id: 'timer',
  title: 'Timer & Stopwatch',
  render(container, { config, addTimer }) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;">
        <!-- Tab Navigation -->
        <div style="display:flex;border-radius:8px;background:rgba(255,255,255,0.05);padding:4px;">
          <button id="timerTab" class="small-btn" style="flex:1;padding:8px;font-size:14px;background:var(--accent);color:white;border-radius:6px;">Timer</button>
          <button id="stopwatchTab" class="small-btn" style="flex:1;padding:8px;font-size:14px;background:transparent;color:var(--muted);border-radius:6px;">Stopwatch</button>
        </div>
        
        <!-- Timer Content -->
        <div id="timerContent" style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:center;align-items:center;gap:8px;">
            <button id="timerMute" class="small-btn" style="width:40px;font-size:18px;background:transparent;border:none;padding:8px;">🔊</button>
          </div>
          <div id="timerDisplayContainer" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800; letter-spacing:2px; font-size:48px; line-height:1;text-align:center;cursor:pointer;user-select:none;padding:10px;border-radius:8px;min-width:120px;">
            <span id="timerDisplay">00:00</span>
          </div>
          <div id="timerInputContainer" style="display:none;">
            <div id="timerDigitDisplay" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800; letter-spacing:2px; font-size:48px; line-height:1;text-align:center;padding:10px;min-height:70px;">00:00:00</div>
            <div style="text-align:center;margin-top:10px;color:var(--muted);font-size:14px;">Type digits on your keyboard (HH:MM:SS)</div>
          </div>
          <div id="timerQuickButtons" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px;">
            <button id="timerAdd30" class="small-btn" style="flex:1;min-width:70px;padding:8px;font-size:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);">+0:30</button>
            <button id="timerAdd1" class="small-btn" style="flex:1;min-width:70px;padding:8px;font-size:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);">+1:00</button>
            <button id="timerAdd5" class="small-btn" style="flex:1;min-width:70px;padding:8px;font-size:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);">+5:00</button>
          </div>
          <div id="timerControls" style="display:flex;gap:8px;margin-top:10px;justify-content:center;">
            <button id="timerMainBtn" class="small-btn" style="width:60px;height:60px;font-size:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;">▶</button>
            <button id="timerResetBtn" class="small-btn" style="width:60px;height:60px;font-size:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;display:none;">↺</button>
          </div>
        </div>
        
        <!-- Stopwatch Content -->
        <div id="stopwatchContent" style="display:none;flex-direction:column;gap:12px;">
          <div id="stopwatchDisplay" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800; letter-spacing:2px; font-size:48px; line-height:1;text-align:center;margin:10px 0;">00:00.00</div>
          <div id="stopwatchControls" style="display:flex;gap:8px;justify-content:center;">
            <button id="stopwatchMainBtn" class="small-btn" style="width:60px;height:60px;font-size:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;">▶</button>
            <button id="stopwatchResetBtn" class="small-btn" style="width:60px;height:60px;font-size:24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;display:none;">↺</button>
          </div>
        </div>
      </div>
    `;

    // Timer variables
    let timerDigits = ["0", "0", "0", "0", "0", "0"]; // Stores the 6 digits [hour1, hour2, min1, min2, sec1, sec2]
    let timerSeconds = 0;
    let timerRunning = false;
    let timerInterval = null;
    let alarmPlaying = false;
    let alarmMuted = false;
    let timerEditing = false;
    
    // Stopwatch variables
    let stopwatchMilliseconds = 0;
    let stopwatchRunning = false;
    let stopwatchInterval = null;
    
    // DOM elements
    const timerTab = container.querySelector('#timerTab');
    const stopwatchTab = container.querySelector('#stopwatchTab');
    const timerContent = container.querySelector('#timerContent');
    const stopwatchContent = container.querySelector('#stopwatchContent');
    
    const timerDisplayContainer = container.querySelector('#timerDisplayContainer');
    const timerDisplay = container.querySelector('#timerDisplay');
    const timerInputContainer = container.querySelector('#timerInputContainer');
    const timerDigitDisplay = container.querySelector('#timerDigitDisplay');
    const timerMainBtn = container.querySelector('#timerMainBtn');
    const timerResetBtn = container.querySelector('#timerResetBtn');
    const timerMuteBtn = container.querySelector('#timerMute');
    const timerAdd30Btn = container.querySelector('#timerAdd30');
    const timerAdd1Btn = container.querySelector('#timerAdd1');
    const timerAdd5Btn = container.querySelector('#timerAdd5');
    
    const stopwatchDisplay = container.querySelector('#stopwatchDisplay');
    const stopwatchMainBtn = container.querySelector('#stopwatchMainBtn');
    const stopwatchResetBtn = container.querySelector('#stopwatchResetBtn');
    
    // Format time functions
    function formatTimer(seconds) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hrs > 0) {
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      } else {
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }
    
    function formatStopwatch(milliseconds) {
      const totalSeconds = Math.floor(milliseconds / 1000);
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      const ms = Math.floor((milliseconds % 1000) / 10);
      if (hrs > 0) {
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
      } else {
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
      }
    }
    
    // Format digits as HH:MM:SS
    function formatDigits(digits) {
      return `${digits[0]}${digits[1]}:${digits[2]}${digits[3]}:${digits[4]}${digits[5]}`;
    }
    
    // Convert HH:MM:SS format to seconds
    function timeToSeconds(timeString) {
      const parts = timeString.split(':');
      if (parts.length === 3) {
        // HH:MM:SS format
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
      } else if (parts.length === 2) {
        // MM:SS format
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1]) || 0;
        return minutes * 60 + seconds;
      }
      return 0;
    }
    
    // Update displays
    function updateTimerDisplay() {
      timerDisplay.textContent = formatTimer(timerSeconds);
      // Change color when timer is running low
      if (timerRunning && timerSeconds <= 10 && timerSeconds > 0) {
        timerDisplay.style.color = '#e74c3c';
      } else {
        timerDisplay.style.color = '';
      }
    }
    
    function updateStopwatchDisplay() {
      stopwatchDisplay.textContent = formatStopwatch(stopwatchMilliseconds);
    }
    
    // Update digit display
    function updateTimerDigitDisplay() {
      timerDigitDisplay.textContent = formatDigits(timerDigits);
    }
    
    // Tab switching
    function showTimer() {
      timerTab.style.background = 'var(--accent)';
      timerTab.style.color = 'white';
      stopwatchTab.style.background = 'transparent';
      stopwatchTab.style.color = 'var(--muted)';
      timerContent.style.display = 'flex';
      stopwatchContent.style.display = 'none';
    }
    
    function showStopwatch() {
      stopwatchTab.style.background = 'var(--accent)';
      stopwatchTab.style.color = 'white';
      timerTab.style.background = 'transparent';
      timerTab.style.color = 'var(--muted)';
      stopwatchContent.style.display = 'flex';
      timerContent.style.display = 'none';
    }
    
    // Timer editing functions
    function showTimerInput() {
      if (timerRunning) return; // Don't allow editing while running
      
      timerEditing = true;
      timerDisplayContainer.style.display = 'none';
      timerInputContainer.style.display = 'block';
      
      // Reset digits to zeros for fresh input
      timerDigits = ["0", "0", "0", "0", "0", "0"];
      updateTimerDigitDisplay();
      
      // Focus on the container to capture keyboard events
      setTimeout(() => {
        timerInputContainer.focus();
      }, 0);
    }
    
    function hideTimerInput() {
      timerEditing = false;
      timerDisplayContainer.style.display = 'block';
      timerInputContainer.style.display = 'none';
    }
    
    function saveTimerInput() {
      // Convert digits to seconds
      timerSeconds = timeToSeconds(formatDigits(timerDigits));
      
      updateTimerDisplay();
      hideTimerInput();
    }
    
    // Timer functions
    function startTimer() {
      // If we're editing, save the input first
      if (timerEditing) {
        saveTimerInput();
      }
      
      // Get current values if not running
      if (!timerRunning) {
        // Validate input
        if (timerSeconds <= 0) return;
      }
      
      timerRunning = true;
      timerMainBtn.textContent = '⏹';
      timerResetBtn.style.display = 'block'; // Show reset button when running
      timerDisplayContainer.style.cursor = 'default'; // Remove edit cursor when running
    }
    
    function stopTimer() {
      if (!timerRunning) return;
      
      timerRunning = false;
      clearInterval(timerInterval);
      timerInterval = null;
      timerMainBtn.textContent = '▶';
      timerDisplayContainer.style.cursor = 'pointer'; // Restore edit cursor when stopped
    }
    
    function resetTimer() {
      stopTimer();
      // Reset to the input value
      timerSeconds = timeToSeconds(formatDigits(timerDigits));
      updateTimerDisplay();
      timerDisplay.style.color = '';
    }
    
    function toggleMute() {
      alarmMuted = !alarmMuted;
      timerMuteBtn.textContent = alarmMuted ? '🔇' : '🔊';
    }
    
    // Quick time addition functions
    function addTime(secondsToAdd) {
      timerSeconds += secondsToAdd;
      // Make sure we don't go negative
      timerSeconds = Math.max(0, timerSeconds);
      updateTimerDisplay();
      
      // If timer was at 0 and is now > 0, and it was running, restart it
      if (timerRunning && timerSeconds > 0 && !timerInterval) {
        startTimerInterval();
      }
    }
    
    // Start timer interval (separate function for better control)
    function startTimerInterval() {
      if (!timerRunning || timerInterval) return;
      
      timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        
        if (timerSeconds <= 0) {
          timerSeconds = 0;
          stopTimer();
          clearInterval(timerInterval);
          timerInterval = null;
          playAlarm();
        }
      }, 1000);
    }
    
    // Alarm function - using a more reliable method for Electron
    function playAlarm() {
      if (alarmMuted) return;
      
      alarmPlaying = true;
      
      // Try multiple methods to play sound
      try {
        // Method 1: Audio element (if we have a sound file)
        // We'll create a simple beep using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 880; // A5 note
        gainNode.gain.value = 0.3;
        
        oscillator.start();
        
        // Play for 1 second
        setTimeout(() => {
          oscillator.stop();
          alarmPlaying = false;
        }, 1000);
      } catch (e) {
        // Method 2: Fallback to visual alert
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
          timerDisplay.style.color = blinkCount % 2 === 0 ? '#e74c3c' : '';
          blinkCount++;
          if (blinkCount >= 6) { // Blink 3 times
            clearInterval(blinkInterval);
            timerDisplay.style.color = '';
            alarmPlaying = false;
          }
        }, 500);
      }
    }
    
    // Stopwatch functions
    function startStopwatch() {
      if (stopwatchRunning) return;
      
      stopwatchRunning = true;
      stopwatchMainBtn.textContent = '⏹';
      stopwatchResetBtn.style.display = 'block'; // Show reset button when running
      
      const startTime = Date.now() - stopwatchMilliseconds;
      
      stopwatchInterval = setInterval(() => {
        stopwatchMilliseconds = Date.now() - startTime;
        updateStopwatchDisplay();
      }, 10);
    }
    
    function stopStopwatch() {
      if (!stopwatchRunning) return;
      
      stopwatchRunning = false;
      clearInterval(stopwatchInterval);
      stopwatchInterval = null;
      stopwatchMainBtn.textContent = '▶';
    }
    
    function resetStopwatch() {
      stopStopwatch();
      stopwatchMilliseconds = 0;
      updateStopwatchDisplay();
    }
    
    // Digit input handling (Google timer style with keyboard)
    function addDigit(digit) {
      // Shift digits left and add new digit at the end
      timerDigits[0] = timerDigits[1];
      timerDigits[1] = timerDigits[2];
      timerDigits[2] = timerDigits[3];
      timerDigits[3] = timerDigits[4];
      timerDigits[4] = timerDigits[5];
      timerDigits[5] = digit;
      
      updateTimerDigitDisplay();
    }
    
    function clearDigits() {
      timerDigits = ["0", "0", "0", "0", "0", "0"];
      updateTimerDigitDisplay();
    }
    
    // Keyboard event handling
    function handleKeyboardInput(e) {
      // Only handle when timer input is active
      if (!timerEditing) return;
      
      // Prevent default for digit keys to avoid scrolling/page actions
      if (/[0-9]/.test(e.key)) {
        e.preventDefault();
        addDigit(e.key);
      } 
      // Handle backspace
      else if (e.key === 'Backspace') {
        e.preventDefault();
        // Shift digits right and add zero at the beginning
        timerDigits[5] = timerDigits[4];
        timerDigits[4] = timerDigits[3];
        timerDigits[3] = timerDigits[2];
        timerDigits[2] = timerDigits[1];
        timerDigits[1] = timerDigits[0];
        timerDigits[0] = "0";
        updateTimerDigitDisplay();
      }
      // Handle escape to clear
      else if (e.key === 'Escape') {
        e.preventDefault();
        clearDigits();
      }
    }
    
    // Click on timer display to edit (only when not running)
    timerDisplayContainer.addEventListener('click', function() {
      if (!timerRunning) {
        showTimerInput();
      }
    });
    
    // Keyboard event listener
    document.addEventListener('keydown', handleKeyboardInput);
    
    // Quick time buttons
    timerAdd30Btn.addEventListener('click', () => addTime(30));
    timerAdd1Btn.addEventListener('click', () => addTime(60));
    timerAdd5Btn.addEventListener('click', () => addTime(300));
    
    // Event listeners for tabs
    timerTab.addEventListener('click', showTimer);
    stopwatchTab.addEventListener('click', showStopwatch);
    
    // Event listeners for timer
    timerMainBtn.addEventListener('click', () => {
      if (timerRunning) {
        stopTimer();
      } else {
        startTimer();
        // Start the interval after a short delay to allow for input saving
        setTimeout(() => {
          if (timerRunning) {
            startTimerInterval();
          }
        }, 10);
      }
    });
    
    timerResetBtn.addEventListener('click', resetTimer);
    timerMuteBtn.addEventListener('click', toggleMute);
    
    // Event listeners for stopwatch
    stopwatchMainBtn.addEventListener('click', () => {
      if (stopwatchRunning) {
        stopStopwatch();
      } else {
        startStopwatch();
      }
    });
    
    stopwatchResetBtn.addEventListener('click', resetStopwatch);
    
    // Initialize displays
    updateTimerDisplay();
    updateStopwatchDisplay();
    updateTimerDigitDisplay();
    
    // Show timer by default
    showTimer();
  }
};
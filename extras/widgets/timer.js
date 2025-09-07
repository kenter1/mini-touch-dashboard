module.exports = {
  id: 'timer',
  title: 'Timer & Stopwatch',
  render(container, { config, addTimer }) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;">
        <!-- Timer Section -->
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div id="timerDisplay" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800; letter-spacing:2px; font-size:48px; line-height:1;text-align:center;">00:00</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <button id="timerStart" class="small-btn" style="flex:1;min-width:80px;">Start</button>
            <button id="timerStop" class="small-btn" style="flex:1;min-width:80px;">Stop</button>
            <button id="timerReset" class="small-btn" style="flex:1;min-width:80px;">Reset</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <button id="timerAdd30" class="small-btn" style="flex:1;min-width:60px;">+0:30</button>
            <button id="timerAdd1" class="small-btn" style="flex:1;min-width:60px;">+1:00</button>
            <button id="timerAdd5" class="small-btn" style="flex:1;min-width:60px;">+5:00</button>
          </div>
          <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:4px;">
            <span class="sub">Mute Alarm:</span>
            <button id="timerMute" class="small-btn" style="width:60px;">On</button>
          </div>
        </div>
        
        <!-- Stopwatch Section -->
        <div style="display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);">
          <div id="stopwatchDisplay" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-weight:800; letter-spacing:2px; font-size:36px; line-height:1;text-align:center;">00:00.00</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <button id="stopwatchStart" class="small-btn" style="flex:1;min-width:80px;">Start</button>
            <button id="stopwatchStop" class="small-btn" style="flex:1;min-width:80px;">Stop</button>
            <button id="stopwatchReset" class="small-btn" style="flex:1;min-width:80px;">Reset</button>
          </div>
        </div>
      </div>
    `;

    // Timer variables
    let timerSeconds = 0;
    let timerRunning = false;
    let timerInterval = null;
    let alarmPlaying = false;
    let alarmMuted = false;
    
    // Stopwatch variables
    let stopwatchMilliseconds = 0;
    let stopwatchRunning = false;
    let stopwatchInterval = null;
    
    // DOM elements
    const timerDisplay = container.querySelector('#timerDisplay');
    const timerStartBtn = container.querySelector('#timerStart');
    const timerStopBtn = container.querySelector('#timerStop');
    const timerResetBtn = container.querySelector('#timerReset');
    const timerAdd30Btn = container.querySelector('#timerAdd30');
    const timerAdd1Btn = container.querySelector('#timerAdd1');
    const timerAdd5Btn = container.querySelector('#timerAdd5');
    const timerMuteBtn = container.querySelector('#timerMute');
    
    const stopwatchDisplay = container.querySelector('#stopwatchDisplay');
    const stopwatchStartBtn = container.querySelector('#stopwatchStart');
    const stopwatchStopBtn = container.querySelector('#stopwatchStop');
    const stopwatchResetBtn = container.querySelector('#stopwatchReset');
    
    // Format time functions
    function formatTimer(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    function formatStopwatch(milliseconds) {
      const totalSeconds = Math.floor(milliseconds / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const ms = Math.floor((milliseconds % 1000) / 10);
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
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
    
    // Timer functions
    function startTimer() {
      if (timerRunning) return;
      if (timerSeconds <= 0) return;
      
      timerRunning = true;
      timerStartBtn.textContent = 'Pause';
      
      timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();
        
        if (timerSeconds <= 0) {
          timerSeconds = 0;
          stopTimer();
          playAlarm();
        }
      }, 1000);
    }
    
    function pauseTimer() {
      if (!timerRunning) return;
      
      timerRunning = false;
      clearInterval(timerInterval);
      timerStartBtn.textContent = 'Start';
    }
    
    function stopTimer() {
      pauseTimer();
      timerStartBtn.textContent = 'Start';
    }
    
    function resetTimer() {
      stopTimer();
      timerSeconds = 0;
      updateTimerDisplay();
      timerDisplay.style.color = '';
    }
    
    function addTime(seconds) {
      timerSeconds += seconds;
      updateTimerDisplay();
    }
    
    function toggleMute() {
      alarmMuted = !alarmMuted;
      timerMuteBtn.textContent = alarmMuted ? 'Off' : 'On';
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
      stopwatchStartBtn.textContent = 'Pause';
      
      const startTime = Date.now() - stopwatchMilliseconds;
      
      stopwatchInterval = setInterval(() => {
        stopwatchMilliseconds = Date.now() - startTime;
        updateStopwatchDisplay();
      }, 10);
    }
    
    function pauseStopwatch() {
      if (!stopwatchRunning) return;
      
      stopwatchRunning = false;
      clearInterval(stopwatchInterval);
      stopwatchStartBtn.textContent = 'Start';
    }
    
    function stopStopwatch() {
      pauseStopwatch();
      stopwatchStartBtn.textContent = 'Start';
    }
    
    function resetStopwatch() {
      stopStopwatch();
      stopwatchMilliseconds = 0;
      updateStopwatchDisplay();
    }
    
    // Event listeners for timer
    timerStartBtn.addEventListener('click', () => {
      if (timerRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
    });
    
    timerStopBtn.addEventListener('click', stopTimer);
    timerResetBtn.addEventListener('click', resetTimer);
    timerAdd30Btn.addEventListener('click', () => addTime(30));
    timerAdd1Btn.addEventListener('click', () => addTime(60));
    timerAdd5Btn.addEventListener('click', () => addTime(300));
    timerMuteBtn.addEventListener('click', toggleMute);
    
    // Event listeners for stopwatch
    stopwatchStartBtn.addEventListener('click', () => {
      if (stopwatchRunning) {
        pauseStopwatch();
      } else {
        startStopwatch();
      }
    });
    
    stopwatchStopBtn.addEventListener('click', stopStopwatch);
    stopwatchResetBtn.addEventListener('click', resetStopwatch);
    
    // Initialize displays
    updateTimerDisplay();
    updateStopwatchDisplay();
  }
};
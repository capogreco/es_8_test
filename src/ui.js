import { stateManager } from "./StateManager.js";
import { MODE_ICONS } from "./constants.js";

// --- DOM Element Cache ---

export const els = {
  initBtn: null, playBtn: null, clearBtn: null, cycleTime: null,
  subdivisions: null, gridDisplay: null, zoomIn: null, zoomOut: null,
  multiChannelView: null, status: null, info: null,
  clockDuration: null, clockDurationMs: null, rampPolarity: null
};

/**
 * Initializes the UI module by caching DOM elements.
 * Must be called after the DOM is fully loaded.
 */
export function initUI() {
  Object.keys(els).forEach(key => {
    const el = document.getElementById(key);
    if (!el) console.warn(`UI element not found: #${key}`);
    els[key] = el;
  });
}

// --- Utility Functions ---

function getChannelMode(channel) {
  return channel.mode;
}

// --- Rendering Functions ---

export function renderAll() {
  renderMultiChannelView();
  renderUtilityControls();
}

function renderUtilityControls() {
  const state = stateManager.getState();
  const clockChannel = state.channels[7]; // Channel 8
  const rampChannel = state.channels[6]; // Channel 7
  
  if (clockChannel && els.clockDuration) {
    els.clockDuration.value = clockChannel.duration || 960;
    if (els.clockDurationMs) {
      const durationMs = (clockChannel.duration || 960) / 48000 * 1000;
      els.clockDurationMs.textContent = `samples (${durationMs.toFixed(1)} ms)`;
    }
  }
  
  if (rampChannel && els.rampPolarity) {
    els.rampPolarity.value = rampChannel.polarity ? '-ve' : '+ve';
  }
}

export function renderMultiChannelView() {
  const state = stateManager.getState();
  els.multiChannelView.innerHTML = '';

  // Render channels 1-6 only (channels 7-8 are controlled from transport)
  for (let ch = 0; ch < 6; ch++) {
    const channelRow = document.createElement('div');
    channelRow.className = 'channel-row';
    channelRow.dataset.channel = ch;

    // Channel label
    const label = document.createElement('div');
    label.className = 'channel-label';
    label.textContent = ch + 1;
    channelRow.appendChild(label);

    const channel = state.channels[ch];
    const mode = getChannelMode(channel);

    // Channel parameters section - minimal inline controls
    const params = document.createElement('div');
    params.className = 'channel-params';
    
    if (mode === 'trigger') {
      params.innerHTML = `
        <button class="mode-btn" data-channel="${ch}" data-param="mode">${MODE_ICONS[mode]}</button>
        <span class="param-label">s:</span>
        <input type="text" class="param-input steps-input" data-channel="${ch}" data-param="steps" value="${channel.steps}" title="steps">
        <span class="param-label">t:</span>
        <input type="text" class="param-input dur-input" data-channel="${ch}" data-param="triggerDuration" value="${channel.triggerDuration}" title="duration">
      `;
    } else if (mode === 'pitch') {
      const showCoupleToggle = (ch + 1) % 2 === 0; // Channels 2, 4, 6
      
      // For coupled channels, show the parent's steps and disable the input
      const isCoupled = showCoupleToggle && channel.isCoupled;
      const stepsValue = isCoupled ? state.channels[ch - 1].steps : channel.steps;
      const stepsDisabled = isCoupled ? 'disabled' : '';
      const stepsClass = isCoupled ? 'steps-input disabled-input' : 'steps-input';
      
      const coupleHTML = showCoupleToggle ? 
        `<span class="param-label">⬆️:</span><input type="checkbox" class="couple-checkbox" data-channel="${ch}" data-param="isCoupled" ${channel.isCoupled ? 'checked' : ''} title="couple to channel above">` : 
        `<span class="spacer"></span>`;
      
      params.innerHTML = `
        <button class="mode-btn" data-channel="${ch}" data-param="mode">${MODE_ICONS[mode]}</button>
        <span class="param-label">s:</span>
        <input type="text" class="param-input ${stepsClass}" data-channel="${ch}" data-param="steps" value="${stepsValue}" title="steps" ${stepsDisabled}>
        ${coupleHTML}
      `;
    } else if (mode === 'clock') {
      params.innerHTML = `<span class="util-label">${MODE_ICONS[mode]} CLOCK</span>`;
    } else if (mode === 'ramp') {
      params.innerHTML = `
        <span class="util-label">${MODE_ICONS[mode]} RAMP</span>
        <input type="text" class="param-input amp-input" data-channel="${ch}" data-param="amplitude" value="${channel.amplitude}" title="amplitude">
      `;
    }
    
    channelRow.appendChild(params);

    // Pattern grid section
    const grid = document.createElement('div');
    
    // Utility channels (clock/ramp) show status instead of pattern grid
    if (mode === 'clock' || mode === 'ramp') {
      grid.className = 'utility-status';
      const statusText = mode === 'clock' ? 'CLOCK OUTPUT' : `RAMP ${channel.polarity ? '↘' : '↗'} ${channel.amplitude}V`;
      grid.innerHTML = `<span class="utility-label">${statusText}</span>`;
    } else {
      // Regular sequencer channels show pattern grid
      grid.className = 'pattern-grid';
      grid.style.gridTemplateColumns = `repeat(${state.gridSubdivisions}, 1fr)`;
      
      // Visual state logic
      const isDisabled = mode === 'pitch' && channel.isCoupled;
      if (isDisabled) {
        grid.classList.add('disabled');
      }

      for (let i = 0; i < state.gridSubdivisions; i++) {
        const isPitchMode = mode === 'pitch';
        const cell = document.createElement(isPitchMode ? 'input' : 'div');
        cell.className = `pattern-step ${isPitchMode ? 'pitch-cell' : ''}`;
        cell.dataset.step = i;
        cell.dataset.channel = ch;

        // Ghosting logic - for coupled pitch channels, use parent's step length
        let effectiveSteps = channel.steps;
        if (mode === 'pitch' && channel.isCoupled && ch > 0) {
          const parentChannel = state.channels[ch - 1];
          if (parentChannel && parentChannel.mode === 'trigger') {
            effectiveSteps = parentChannel.steps;
          }
        }
        
        const isInactiveStep = i >= effectiveSteps;
        if (isInactiveStep) {
          cell.classList.add('inactive');
        }

        if (isPitchMode) {
          cell.type = 'text';
          cell.value = channel.pitches[i] ?? '';
          
          // Coupling logic: Disable cells that don't correspond to triggers
          if (channel.isCoupled && ch > 0) {
            const triggerChannelAbove = state.channels[ch - 1];
            if (triggerChannelAbove.mode === 'trigger') {
              const triggerPatternLength = triggerChannelAbove.steps || state.subdivisions;
              const triggerStep = i % triggerPatternLength;
              const hasTrigger = state.pattern[ch - 1][triggerStep];
              
              if (!hasTrigger) {
                cell.disabled = true;
                cell.classList.add('disabled-cell');
              }
            }
          }
        } else if (mode === 'trigger' && state.pattern[ch][i]) {
          cell.classList.add('active');
        }

        if (i === channel.currentStep) {
          cell.classList.add('current');
        }
        grid.appendChild(cell);
      }
    }
    channelRow.appendChild(grid);
    els.multiChannelView.appendChild(channelRow);
  }
}

export function updateVisibleGrids() {
  const state = stateManager.getState();
  
  // Update channels 1-6 only
  for (let ch = 0; ch < 6; ch++) {
    const channelRow = els.multiChannelView.querySelector(`[data-channel="${ch}"]`);
    if (!channelRow) continue;

    const currentStep = state.channels[ch].currentStep;
    
    channelRow.querySelectorAll('.pattern-step, .pitch-cell').forEach(cell => {
      const step = parseInt(cell.dataset.step);
      const isCurrent = (step === currentStep);
      
      // Toggle class, but don't remove from the focused element
      if (document.activeElement !== cell) {
        cell.classList.toggle('current', isCurrent);
      }
    });
  }
}

export function updateStatus(message, duration = 2000) {
  els.status.textContent = message;
  if (duration > 0) {
    setTimeout(() => {
      els.status.textContent = 'Ready';
    }, duration);
  }
}
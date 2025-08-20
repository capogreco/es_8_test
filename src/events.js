import { stateManager } from "./StateManager.js";
import { els, renderAll, renderMultiChannelView, updateStatus } from "./ui.js";
import { initAudio, togglePlayback, sendStateToWorklet } from "./audio.js";
import { CHANNEL_MODES, SEQUENCER_CONSTANTS } from "./constants.js";

// Module-level state for UI interactions
let isDragging = false;
let dragValue = false;
let copiedChannel = null;

// Mode cycle order
const MODE_CYCLE = ['trigger', 'pitch'];

function getChannelMode(channel) {
  return channel.mode;
}

function cycleChannelMode(channelIndex) {
  // Channels 7 and 8 (index 6 and 7) are dedicated utility channels - not user configurable
  if (channelIndex >= 6) {
    return; // Do nothing for utility channels
  }

  const state = stateManager.getState();
  const currentMode = getChannelMode(state.channels[channelIndex]);
  const currentIndex = MODE_CYCLE.indexOf(currentMode);
  const nextMode = MODE_CYCLE[(currentIndex + 1) % MODE_CYCLE.length];

  if (nextMode === 'trigger') {
    stateManager.set(`channels.${channelIndex}.mode`, CHANNEL_MODES.TRIGGER);
  } else if (nextMode === 'pitch') {
    stateManager.set(`channels.${channelIndex}.mode`, CHANNEL_MODES.PITCH);
  }
  renderAll();
  sendStateToWorklet();
}

function toggleStep(channel, step, value) {
  const currentVal = stateManager.get(`pattern.${channel}.${step}`);
  if (currentVal === value) return; // No change

  stateManager.set(`pattern.${channel}.${step}`, value);
  
  const cell = els.multiChannelView.querySelector(`[data-channel="${channel}"][data-step="${step}"]:not(.pitch-cell)`);
  if (cell) cell.classList.toggle('active', value);
  
  sendStateToWorklet();
  
  // Handle coupled channel behavior when trigger changes
  if (channel < 5) { // channels 0-4 can have coupled channels below
    const state = stateManager.getState();
    const channelBelow = state.channels[channel + 1];
    
    if (channelBelow && channelBelow.mode === 'pitch' && channelBelow.isCoupled) {
      // Calculate the corresponding step in the pitch channel
      const pitchPatternLength = channelBelow.steps || state.subdivisions;
      const pitchStep = step % pitchPatternLength;
      
      if (value) {
        // Activating trigger: focus the corresponding pitch cell
        renderAll();
        setTimeout(() => {
          const pitchCell = els.multiChannelView.querySelector(`[data-channel="${channel + 1}"][data-step="${pitchStep}"].pitch-cell`);
          if (pitchCell && !pitchCell.disabled) {
            pitchCell.focus();
            pitchCell.select();
          }
        }, 50);
      } else {
        // Deactivating trigger: clear the corresponding pitch cell content
        stateManager.set(`channels.${channel + 1}.pitches.${pitchStep}`, null);
        sendStateToWorklet();
        renderAll();
      }
    }
  }
}

function clearAll() {
  const pattern = Array(SEQUENCER_CONSTANTS.MAX_CHANNELS).fill(null).map(() => Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false));
  stateManager.set('pattern', pattern);
  
  for (let i = 0; i < SEQUENCER_CONSTANTS.MAX_CHANNELS; i++) {
    stateManager.set(`channels.${i}.pitches`, Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null));
  }
  
  renderAll();
  sendStateToWorklet();
  updateStatus('Cleared all patterns');
}

export function setupEventListeners() {
  // Transport
  els.initBtn.addEventListener('click', initAudio);
  els.playBtn.addEventListener('click', togglePlayback);
  els.clearBtn.addEventListener('click', clearAll);

  // --- NEW: EVENT DELEGATION FOR ALL CHANNEL PARAMS ---
  els.multiChannelView.addEventListener('change', e => {
    const target = e.target;
    const channel = target.dataset.channel;
    const param = target.dataset.param;
    if (!channel || !param || target.disabled) return; // Ignore disabled inputs

    const channelIndex = parseInt(channel);
    let value;

    // Handle different input types
    if (target.type === 'checkbox') {
      value = target.checked;
    } else if (param === 'mode') {
      // Mode button clicked - cycle mode
      cycleChannelMode(channelIndex);
      return;
    } else if (param === 'amplitude') {
      // Special case for ramp amplitude - parse as float with validation
      value = parseFloat(target.value);
      if (isNaN(value) || value <= 0 || value > 12) {
        renderAll(); // Re-render to show the original value if input is invalid
        return;
      }
    } else {
      // For text inputs, parse as an integer
      value = parseInt(target.value);
      if (isNaN(value)) {
        renderAll(); // Re-render to show the original value if input is invalid
        return;
      }
    }
    
    // Update the state using a dynamic path
    stateManager.set(`channels.${channelIndex}.${param}`, value);

    // Sync the new state with the audio worklet
    sendStateToWorklet();
    
    // Re-render the entire UI to reflect any changes (e.g., ghosting steps)
    renderAll();
  });

  // Handle mode button clicks
  els.multiChannelView.addEventListener('click', e => {
    if (e.target.classList.contains('mode-btn')) {
      const channel = parseInt(e.target.dataset.channel);
      cycleChannelMode(channel);
    }
  });

  // --- UTILITY CHANNEL CONTROLS IN TRANSPORT ---
  if (els.clockDuration) {
    els.clockDuration.addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      if (!isNaN(value) && value > 0) {
        stateManager.set('channels.7.duration', value);
        sendStateToWorklet();
        renderAll();
      }
    });
  }

  if (els.rampPolarity) {
    els.rampPolarity.addEventListener('change', (e) => {
      const value = e.target.value === '-ve';
      stateManager.set('channels.6.polarity', value);
      sendStateToWorklet();
      renderAll();
    });
  }
  
  // Global params
  els.cycleTime.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0.5 && value <= 8) {
      stateManager.set('cycleTime', value);
      sendStateToWorklet();
    }
  });
  
  els.subdivisions.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 2 && value <= 96) {
      stateManager.set('subdivisions', value);
      const currentGrid = stateManager.get('gridSubdivisions');
      stateManager.set('gridSubdivisions', Math.min(currentGrid, value));
      els.gridDisplay.textContent = stateManager.get('gridSubdivisions');
      renderMultiChannelView();
      sendStateToWorklet();
    }
  });
  
  // Grid zoom
  els.zoomIn.addEventListener('click', () => {
    const currentGrid = stateManager.get('gridSubdivisions');
    const maxSubdivisions = stateManager.get('subdivisions');
    const newGrid = Math.min(currentGrid * 2, maxSubdivisions, 96);
    stateManager.set('gridSubdivisions', newGrid);
    els.gridDisplay.textContent = newGrid;
    renderMultiChannelView();
  });
  
  els.zoomOut.addEventListener('click', () => {
    const currentGrid = stateManager.get('gridSubdivisions');
    const newGrid = Math.max(Math.floor(currentGrid / 2), 8);
    stateManager.set('gridSubdivisions', newGrid);
    els.gridDisplay.textContent = newGrid;
    renderMultiChannelView();
  });

  // --- GRID INTERACTION LOGIC ---
  
  els.multiChannelView.addEventListener('mousedown', e => {
    const target = e.target;
    if (!target.classList.contains('pattern-step')) return;

    // IMPORTANT: If the target is a pitch cell, do nothing.
    // Allow the browser's default behavior to focus the input.
    if (target.classList.contains('pitch-cell')) {
      return; 
    }

    // For all other steps (e.g., trigger), start the drag-to-toggle logic.
    e.preventDefault();
    isDragging = true;
    document.body.classList.add('dragging');

    const { channel, step } = target.dataset;
    const state = stateManager.getState();
    const mode = getChannelMode(state.channels[channel]);

    if (mode === 'trigger') {
      const currentVal = state.pattern[channel][step];
      dragValue = !currentVal;
      toggleStep(parseInt(channel), parseInt(step), dragValue);
    }
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging || !e.target.classList.contains('pattern-step')) return;
    const { channel, step } = e.target.dataset;
    toggleStep(parseInt(channel), parseInt(step), dragValue);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.classList.remove('dragging');
  });

  // --- PITCH CELL EVENT DELEGATION ---
  
  els.multiChannelView.addEventListener('input', e => {
    if (!e.target.classList.contains('pitch-cell')) return;
    const { step, channel } = e.target.dataset;
    const value = e.target.value.trim();
    const pitch = value === '' ? null : Math.max(-120, Math.min(120, parseFloat(value)));
    
    if (value === '' || !isNaN(pitch)) {
      stateManager.set(`channels.${channel}.pitches.${step}`, pitch);
      sendStateToWorklet();
    }
  });

  els.multiChannelView.addEventListener('keydown', e => {
    if (!e.target.classList.contains('pitch-cell')) return;
    
    const { step, channel } = e.target.dataset;
    const currentStep = parseInt(step);
    const currentChannel = parseInt(channel);
    
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      // Only get enabled (non-disabled) pitch cells for tab navigation
      const cells = Array.from(els.multiChannelView.querySelectorAll('.pitch-cell:not([disabled])'));
      const currentIndex = cells.indexOf(e.target);
      
      if (currentIndex === -1) return; // Safety check
      
      const nextIndex = e.shiftKey ? (currentIndex - 1 + cells.length) % cells.length : (currentIndex + 1) % cells.length;
      cells[nextIndex].focus();
      cells[nextIndex].select();
    }
    
    // Arrow key navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      let targetStep = currentStep;
      let targetChannel = currentChannel;
      
      if (e.key === 'ArrowLeft') {
        targetStep = Math.max(0, currentStep - 1);
      } else if (e.key === 'ArrowRight') {
        const state = stateManager.getState();
        targetStep = Math.min(state.gridSubdivisions - 1, currentStep + 1);
      } else if (e.key === 'ArrowUp') {
        // Move to pitch channel above (only even numbered channels: 2, 4, 6)
        for (let ch = currentChannel - 2; ch >= 0; ch -= 2) {
          const state = stateManager.getState();
          if (state.channels[ch]?.mode === 'pitch') {
            targetChannel = ch;
            break;
          }
        }
      } else if (e.key === 'ArrowDown') {
        // Move to pitch channel below (only even numbered channels: 2, 4, 6)
        for (let ch = currentChannel + 2; ch < 6; ch += 2) {
          const state = stateManager.getState();
          if (state.channels[ch]?.mode === 'pitch') {
            targetChannel = ch;
            break;
          }
        }
      }
      
      // Find and focus the target cell if it exists and is enabled
      const targetCell = els.multiChannelView.querySelector(`[data-channel="${targetChannel}"][data-step="${targetStep}"].pitch-cell:not([disabled])`);
      if (targetCell) {
        targetCell.focus();
        targetCell.select();
      }
    }
  });
  
  els.multiChannelView.addEventListener('focusin', e => {
    if (!e.target.classList.contains('pitch-cell')) return;
    e.target.select();
  });

  // --- GLOBAL KEYBOARD SHORTCUTS ---
  
  document.addEventListener('keydown', (e) => {
    // Skip shortcuts if user is typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
    
    switch(e.key) {
      case ' ': // Spacebar - Play/Stop
        e.preventDefault(); 
        togglePlayback(); 
        break;
        
      case 'Enter': // Enter - Initialize Audio
        e.preventDefault();
        if (!els.initBtn.classList.contains('active')) {
          initAudio();
        }
        break;
        
      case 'Escape': // Escape - Clear All
        e.preventDefault();
        clearAll();
        break;
        
      case 'm': // M - Mute focused channel
      case 'M':
        e.preventDefault();
        const focusedElement = document.activeElement;
        if (focusedElement && focusedElement.classList.contains('pitch-cell')) {
          const channelIndex = parseInt(focusedElement.dataset.channel);
          if (channelIndex >= 0 && channelIndex < 6) {
            const currentMuteState = stateManager.get(`channels.${channelIndex}.isMuted`);
            stateManager.set(`channels.${channelIndex}.isMuted`, !currentMuteState);
            sendStateToWorklet();
            renderAll();
            updateStatus(`Channel ${channelIndex + 1} ${!currentMuteState ? 'muted' : 'unmuted'}`);
          }
        }
        break;
    }
  });
}
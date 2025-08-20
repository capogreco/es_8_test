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
  
  // If activating a trigger, focus the corresponding pitch cell in coupled channel below
  if (value && channel < 5) { // channels 0-4 can have coupled channels below
    const state = stateManager.getState();
    const channelBelow = state.channels[channel + 1];
    
    if (channelBelow && channelBelow.mode === 'pitch' && channelBelow.isCoupled) {
      // Re-render to update disabled/enabled state of pitch cells
      renderAll();
      
      // Calculate the corresponding step in the pitch channel
      const pitchPatternLength = channelBelow.steps || state.subdivisions;
      const pitchStep = step % pitchPatternLength;
      
      // Find and focus the corresponding pitch cell after render
      setTimeout(() => {
        const pitchCell = els.multiChannelView.querySelector(`[data-channel="${channel + 1}"][data-step="${pitchStep}"].pitch-cell`);
        if (pitchCell && !pitchCell.disabled) {
          pitchCell.focus();
          pitchCell.select();
        }
      }, 50); // Longer delay to ensure render is complete
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
  });
  
  els.multiChannelView.addEventListener('focusin', e => {
    if (!e.target.classList.contains('pitch-cell')) return;
    e.target.select();
  });

  // --- GLOBAL KEYBOARD SHORTCUTS ---
  
  document.addEventListener('keydown', (e) => {
    // This guard clause is now effective because pitch cells can get focus.
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
    
    if (e.key === ' ') { e.preventDefault(); togglePlayback(); }
  });
}
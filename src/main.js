import {
  CHANNEL_MODES,
  CV_MODES,
  MESSAGE_TYPES,
  SEQUENCER_CONSTANTS,
  DEFAULT_LFO,
  DEFAULT_SH,
} from "./constants.js";

import { stateManager } from "./StateManager.js";

// Audio context
let audioContext;
let es8Node;
let isPlaying = false;

// UI state
let selectedChannel = 0;
let gridSubdivisions = 16; // How many steps to show in grid
let isDragging = false;
let dragValue = false;
let visibleChannels = new Set([0, 1, 2, 3, 4, 5, 6, 7]); // Start with all channels visible by default

// Mode cycle order
const MODE_CYCLE = ['trigger', 'pitch', 'lfo', 'sh'];
const MODE_ICONS = {
  'trigger': '⚡',
  'lfo': '🌊',
  'pitch': '🎹',
  'sh': '🔀'
};

// Initialize state
const initialState = {
  subdivisions: 16, // Match the UI default
  cycleTime: SEQUENCER_CONSTANTS.DEFAULT_CYCLE_TIME,
  pattern: Array(SEQUENCER_CONSTANTS.MAX_CHANNELS)
    .fill(null)
    .map(() => Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false)),
  channels: Array(SEQUENCER_CONSTANTS.MAX_CHANNELS)
    .fill(null)
    .map(() => ({
      mode: CHANNEL_MODES.TRIGGER,
      cvMode: CV_MODES.LFO,
      useCustomSubdivisions: false,
      subdivisions: 16, // Match global default
      usePolyrhythm: false,
      polyrhythmSteps: 16, // Match global default
      triggerDuration: SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES,
      lfo: { ...DEFAULT_LFO },
      pitches: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null),
      sh: {
        ...DEFAULT_SH,
        values: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0),
      },
      currentStep: 0,
    })),
};

stateManager._state = initialState;

// Helper to get current state
function getState() {
  return stateManager._state;
}

// DOM Elements
const els = {
  initBtn: null,
  playBtn: null,
  clearBtn: null,
  cycleTime: null,
  subdivisions: null,
  gridDisplay: null,
  zoomIn: null,
  zoomOut: null,
  contextPanel: null,
  contextHeader: null,
  contextParams: null,
  contextViz: null,
  multiChannelView: null,
  status: null,
  info: null,
};

// Initialize after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM elements
  Object.keys(els).forEach(key => {
    els[key] = document.getElementById(key);
  });
  
  // Set up event listeners
  setupEventListeners();
  
  // Initial render
  renderChannels();
  renderMultiChannelView();
  selectChannel(0);
});

function setupEventListeners() {
  // Transport
  els.initBtn.addEventListener('click', initAudio);
  els.playBtn.addEventListener('click', togglePlayback);
  els.clearBtn.addEventListener('click', clearAll);
  
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
      gridSubdivisions = Math.min(gridSubdivisions, value);
      renderGrid();
      sendStateToWorklet();
    }
  });
  
  // Grid zoom
  els.zoomIn.addEventListener('click', () => {
    const state = getState();
    gridSubdivisions = Math.min(gridSubdivisions * 2, state.subdivisions, 96);
    els.gridDisplay.textContent = gridSubdivisions;
    renderGrid();
  });
  
  els.zoomOut.addEventListener('click', () => {
    gridSubdivisions = Math.max(Math.floor(gridSubdivisions / 2), 8);
    els.gridDisplay.textContent = gridSubdivisions;
    renderGrid();
  });
  
  // Channel selection
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('channel-select')) {
      const channel = parseInt(e.target.dataset.channel);
      selectChannel(channel);
    }
    
    if (e.target.classList.contains('channel-mode')) {
      const channel = parseInt(e.target.dataset.channel);
      cycleChannelMode(channel);
    }
    
    if (e.target.classList.contains('visibility-checkbox')) {
      const channel = parseInt(e.target.dataset.channel);
      const isVisible = visibleChannels.has(channel);
      toggleChannelVisibility(channel, !isVisible);
    }
  });
  
  // Pattern grid (delegate to multi-channel view)
  els.multiChannelView.addEventListener('mousedown', handleGridMouseDown);
  document.addEventListener('mousemove', handleGridMouseMove);
  document.addEventListener('mouseup', handleGridMouseUp);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts if user is typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.isContentEditable) {
      return;
    }
    
    if (e.key === ' ') {
      e.preventDefault();
      togglePlayback();
    }
    if (e.key >= '1' && e.key <= '8') {
      selectChannel(parseInt(e.key) - 1);
    }
    if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      copyChannel();
    }
    if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      pasteChannel();
    }
  });
}

function renderChannels() {
  const state = getState();
  const channelBlocks = document.querySelectorAll('.channel-block');
  const channelSelects = document.querySelectorAll('.channel-select');
  const channelModes = document.querySelectorAll('.channel-mode');
  const visibilityCheckboxes = document.querySelectorAll('.visibility-checkbox');
  
  channelBlocks.forEach((block, i) => {
    block.classList.toggle('active', i === selectedChannel);
  });
  
  channelSelects.forEach((el, i) => {
    el.classList.toggle('active', i === selectedChannel);
  });
  
  channelModes.forEach((el, i) => {
    const channel = state.channels[i];
    const mode = getChannelMode(channel);
    el.textContent = MODE_ICONS[mode];
    el.className = `channel-mode ${mode}`;
    el.dataset.channel = i;
  });
  
  visibilityCheckboxes.forEach((checkbox, i) => {
    const isVisible = visibleChannels.has(i);
    checkbox.classList.toggle('checked', isVisible);
    checkbox.textContent = isVisible ? '👁️' : '❌';
  });
}

function getChannelMode(channel) {
  if (channel.mode === CHANNEL_MODES.TRIGGER) return 'trigger';
  if (channel.cvMode === CV_MODES.LFO) return 'lfo';
  if (channel.cvMode === CV_MODES.PITCH) return 'pitch';
  if (channel.cvMode === CV_MODES.SH) return 'sh';
  return 'trigger';
}

function cycleChannelMode(channel) {
  const state = getState();
  const currentMode = getChannelMode(state.channels[channel]);
  const currentIndex = MODE_CYCLE.indexOf(currentMode);
  const nextMode = MODE_CYCLE[(currentIndex + 1) % MODE_CYCLE.length];
  
  if (nextMode === 'trigger') {
    state.channels[channel].mode = CHANNEL_MODES.TRIGGER;
  } else {
    state.channels[channel].mode = CHANNEL_MODES.CV;
    if (nextMode === 'lfo') state.channels[channel].cvMode = CV_MODES.LFO;
    if (nextMode === 'pitch') state.channels[channel].cvMode = CV_MODES.PITCH;
    if (nextMode === 'sh') state.channels[channel].cvMode = CV_MODES.SH;
  }
  
  renderChannels();
  if (channel === selectedChannel) {
    renderContextPanel();
  }
  // If this channel is visible, need to update the grid to show new mode
  if (channel === selectedChannel || visibleChannels.has(channel)) {
    renderMultiChannelView();
  }
  sendStateToWorklet();
}

function selectChannel(channel) {
  selectedChannel = channel;
  // Selected channel is always visible, no need to modify visibleChannels
  renderChannels();
  renderMultiChannelView();
  renderContextPanel();
}

function toggleChannelVisibility(channel, visible) {
  if (visible) {
    visibleChannels.add(channel);
  } else {
    visibleChannels.delete(channel);
    // No restrictions - allow hiding any channel, even the selected one
  }
  renderChannels(); // Update checkbox states
  renderMultiChannelView();
}

function renderContextPanel() {
  const state = getState();
  const channel = state.channels[selectedChannel];
  const mode = getChannelMode(channel);
  
  // Update header
  els.contextHeader.textContent = `CH${selectedChannel + 1}: ${mode.toUpperCase()}`;
  
  // Show/hide panel based on mode
  els.contextPanel.classList.add('active');
  
  // Clear params
  els.contextParams.innerHTML = '';
  
  // Render mode-specific params
  switch (mode) {
    case 'trigger':
      renderTriggerParams(channel);
      els.contextViz.style.display = 'none';
      break;
    case 'lfo':
      renderLFOParams(channel);
      els.contextViz.style.display = 'block';
      renderLFOVisualization(channel);
      break;
    case 'pitch':
      renderPitchParams(channel);
      els.contextViz.style.display = 'none';
      break;
    case 'sh':
      renderSHParams(channel);
      els.contextViz.style.display = 'block';
      renderSHVisualization(channel);
      break;
  }
}

function renderTriggerParams(channel) {
  els.contextParams.innerHTML = `
    <div class="context-param">
      <label>duration:</label>
      <input type="text" class="param-input" id="triggerDuration" value="${channel.triggerDuration}">
    </div>
    <div class="context-param">
      <label>subdivisions:</label>
      <input type="text" class="param-input" id="channelSubdivisions" 
             value="${channel.useCustomSubdivisions ? channel.subdivisions : 'global'}">
    </div>
    <div class="context-param">
      <label>polyrhythm:</label>
      <input type="text" class="param-input" id="polyrhythm" 
             value="${channel.usePolyrhythm ? channel.polyrhythmSteps : 'off'}">
    </div>
  `;
  
  // Add listeners
  document.getElementById('triggerDuration')?.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      const state = getState();
      state.channels[selectedChannel].triggerDuration = value;
      sendStateToWorklet();
    }
  });
}

function renderLFOParams(channel) {
  els.contextParams.innerHTML = `
    <div class="context-param">
      <label>wave:</label>
      <select class="param-input" id="lfoWaveform">
        <option value="ramp" ${channel.lfo.waveform === 'ramp' ? 'selected' : ''}>ramp</option>
        <option value="sine" ${channel.lfo.waveform === 'sine' ? 'selected' : ''}>sine</option>
      </select>
    </div>
    <div class="context-param">
      <label>rate:</label>
      <input type="text" class="param-input" id="lfoRate" value="${channel.lfo.rate}">
    </div>
    <div class="context-param">
      <label>duty:</label>
      <input type="text" class="param-input" id="lfoDuty" value="${channel.lfo.duty}">
    </div>
    <div class="context-param">
      <label>width:</label>
      <input type="text" class="param-input" id="lfoWidth" value="${channel.lfo.width}">
    </div>
  `;
  
  // Add listeners
  document.getElementById('lfoWaveform')?.addEventListener('change', (e) => {
    const state = getState();
    state.channels[selectedChannel].lfo.waveform = e.target.value;
    renderLFOVisualization(state.channels[selectedChannel]);
    sendStateToWorklet();
  });
  
  document.getElementById('lfoRate')?.addEventListener('change', (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 1 && value <= 16) {
      const state = getState();
      state.channels[selectedChannel].lfo.rate = value;
      renderLFOVisualization(state.channels[selectedChannel]);
      sendStateToWorklet();
    }
  });
}

function renderPitchParams(channel) {
  els.contextParams.innerHTML = `
    <div class="context-param">
      <label>range:</label>
      <span style="color: #666;">-120 to +120 semitones</span>
    </div>
    <div class="context-param">
      <label>subdivisions:</label>
      <input type="text" class="param-input" id="pitchSubdivisions" 
             value="${channel.useCustomSubdivisions ? channel.subdivisions : 'global'}">
    </div>
  `;
}

function renderSHParams(channel) {
  els.contextParams.innerHTML = `
    <div class="context-param">
      <label>mode:</label>
      <select class="param-input" id="shMode">
        <option value="rand" ${channel.sh.mode === 'rand' ? 'selected' : ''}>rand</option>
        <option value="shuf" ${channel.sh.mode === 'shuf' ? 'selected' : ''}>shuf</option>
      </select>
    </div>
    <div class="context-param">
      <label>width:</label>
      <input type="text" class="param-input" id="shWidth" value="${channel.sh.width}">
    </div>
  `;
  
  document.getElementById('shMode')?.addEventListener('change', (e) => {
    const state = getState();
    state.channels[selectedChannel].sh.mode = e.target.value;
    if (e.target.value === 'rand') {
      // Generate new random values
      state.channels[selectedChannel].sh.values = Array.from(
        { length: gridSubdivisions },
        () => Math.random() * 2 - 1
      );
    }
    renderSHVisualization(state.channels[selectedChannel]);
    sendStateToWorklet();
  });
}

function renderLFOVisualization(channel) {
  // Simple ASCII visualization for now
  els.contextViz.textContent = `LFO: ${channel.lfo.waveform} @ ${channel.lfo.rate}x`;
}

function renderSHVisualization(channel) {
  // Simple ASCII visualization for now
  els.contextViz.textContent = `S&H: ${channel.sh.mode}`;
}

function renderMultiChannelView() {
  const state = getState();
  els.multiChannelView.innerHTML = '';
  
  // Render visible channels in order (selected channel + checked channels)
  for (let ch = 0; ch < 8; ch++) {
    const isSelected = (ch === selectedChannel);
    const isChecked = visibleChannels.has(ch);
    if (!isSelected && !isChecked) continue;
    
    const channelRow = document.createElement('div');
    channelRow.className = `channel-row ${ch === selectedChannel ? 'selected' : ''}`;
    channelRow.dataset.channel = ch;
    
    // Channel label
    const label = document.createElement('div');
    label.className = 'channel-label';
    label.textContent = ch + 1;
    channelRow.appendChild(label);
    
    // Pattern grid for this channel
    const grid = document.createElement('div');
    grid.className = 'pattern-grid';
    grid.style.gridTemplateColumns = `repeat(${gridSubdivisions}, 1fr)`;
    
    const channel = state.channels[ch];
    const mode = getChannelMode(channel);
    
    for (let i = 0; i < gridSubdivisions; i++) {
      if (mode === 'pitch') {
        // Create input for pitch mode
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pattern-step pitch-cell';
        input.dataset.step = i;
        input.dataset.channel = ch;
        input.value = channel.pitches[i] !== null ? channel.pitches[i] : '';
        input.placeholder = '';
        
        // Simple: just make it focusable
        input.tabIndex = 0;
        
        // Current step indicator
        if (i === channel.currentStep) {
          input.classList.add('current');
        }
        
        grid.appendChild(input);
      } else {
        // Regular div for other modes
        const cell = document.createElement('div');
        cell.className = 'pattern-step';
        cell.dataset.step = i;
        cell.dataset.channel = ch;
        
        if (mode === 'trigger') {
          if (state.pattern[ch][i]) {
            cell.classList.add('active');
          }
        }
        
        // Current step indicator
        if (i === channel.currentStep) {
          cell.classList.add('current');
        }
        
        grid.appendChild(cell);
      }
    }
    
    channelRow.appendChild(grid);
    els.multiChannelView.appendChild(channelRow);
  }
  
  // Set up pitch cell event listeners
  setupAllPitchCellListeners();
}

function setupAllPitchCellListeners() {
  const pitchCells = document.querySelectorAll('.pitch-cell');
  console.log('Setting up listeners for', pitchCells.length, 'pitch cells');
  
  pitchCells.forEach(input => {
    // Handle value changes
    input.addEventListener('input', (e) => {
      const step = parseInt(e.target.dataset.step);
      const channel = parseInt(e.target.dataset.channel);
      const value = e.target.value.trim();
      const state = getState();
      
      if (value === '') {
        state.channels[channel].pitches[step] = null;
      } else {
        const pitch = parseFloat(value);
        if (!isNaN(pitch)) {
          state.channels[channel].pitches[step] = Math.max(-120, Math.min(120, pitch));
        }
      }
      sendStateToWorklet();
    });
    
    // Tab navigation
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const cells = Array.from(pitchCells);
        const currentIndex = cells.indexOf(e.target);
        const nextIndex = e.shiftKey ? 
          (currentIndex - 1 + cells.length) % cells.length :
          (currentIndex + 1) % cells.length;
        cells[nextIndex].focus();
        cells[nextIndex].select();
      }
    });
    
    // Select on focus
    input.addEventListener('focus', e => e.target.select());
  });
}

function handleGridMouseDown(e) {
  if (!e.target.classList.contains('pattern-step')) return;
  if (e.target.classList.contains('pitch-cell')) return; // Skip for pitch inputs
  
  e.preventDefault();
  isDragging = true;
  document.body.classList.add('dragging');
  
  const step = parseInt(e.target.dataset.step);
  const channel = parseInt(e.target.dataset.channel);
  const state = getState();
  const mode = getChannelMode(state.channels[channel]);
  
  if (mode === 'trigger') {
    dragValue = !state.pattern[channel][step];
    toggleStep(channel, step, dragValue);
  }
}

function handleGridMouseMove(e) {
  if (!isDragging) return;
  if (!e.target.classList.contains('pattern-step')) return;
  
  const step = parseInt(e.target.dataset.step);
  const channel = parseInt(e.target.dataset.channel);
  const state = getState();
  const mode = getChannelMode(state.channels[channel]);
  
  if (mode === 'trigger') {
    toggleStep(channel, step, dragValue);
  }
}

function handleGridMouseUp() {
  isDragging = false;
  document.body.classList.remove('dragging');
}

function toggleStep(channel, step, value) {
  const state = getState();
  state.pattern[channel][step] = value;
  
  // Just update the specific cell instead of rebuilding everything
  const cell = els.multiChannelView.querySelector(
    `[data-channel="${channel}"][data-step="${step}"]:not(.pitch-cell)`
  );
  if (cell) {
    if (value) {
      cell.classList.add('active');
    } else {
      cell.classList.remove('active');
    }
  }
  
  sendStateToWorklet();
}

function clearAll() {
  const state = getState();
  state.pattern = Array(SEQUENCER_CONSTANTS.MAX_CHANNELS)
    .fill(null)
    .map(() => Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false));
  
  state.channels.forEach(channel => {
    channel.pitches = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null);
    channel.sh.values = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0);
  });
  
  renderGrid();
  sendStateToWorklet();
  updateStatus('Cleared all patterns');
}

let copiedChannel = null;

function copyChannel() {
  const state = getState();
  copiedChannel = {
    pattern: [...state.pattern[selectedChannel]],
    channel: JSON.parse(JSON.stringify(state.channels[selectedChannel]))
  };
  updateStatus(`Copied CH${selectedChannel + 1}`);
}

function pasteChannel() {
  if (!copiedChannel) {
    updateStatus('Nothing to paste');
    return;
  }
  
  const state = getState();
  state.pattern[selectedChannel] = [...copiedChannel.pattern];
  state.channels[selectedChannel] = JSON.parse(JSON.stringify(copiedChannel.channel));
  
  renderChannels();
  renderGrid();
  renderContextPanel();
  sendStateToWorklet();
  updateStatus(`Pasted to CH${selectedChannel + 1}`);
}

// Audio functions
async function initAudio() {
  try {
    audioContext = new AudioContext({ sampleRate: 48000 });
    
    // Configure destination for 8 channels (like the working test)
    if (audioContext.destination.maxChannelCount >= 8) {
      audioContext.destination.channelCount = 8;
      audioContext.destination.channelCountMode = 'explicit';
      audioContext.destination.channelInterpretation = 'discrete';
      console.log('Configured audio destination for 8 channels');
    } else {
      console.warn('Only', audioContext.destination.maxChannelCount, 'channels available');
    }
    
    await audioContext.audioWorklet.addModule("/src/sequencer-processor.js");
    
    es8Node = new AudioWorkletNode(audioContext, "sequencer-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });
    
    es8Node.port.onmessage = (e) => {
      if (e.data.type === 'stepChange') {
        const state = getState();
        const { channel, step } = e.data;

        if (channel >= 0 && channel < 8) {
          // 1. Always update the state for the reporting channel.
          state.channels[channel].currentStep = step;

          // 2. Always update the small progress bars. This is a lightweight operation.
          updateStepIndicators();

          // 3. Only when the LAST channel (7) reports its step,
          //    update the main grid visuals for all visible channels at once.
          if (channel === 7) {
            updateVisibleGrids();
          }
        }
      } else if (e.data.type === 'log') {
        console.log('[AudioWorklet]', e.data.message);
      }
    };
    
    es8Node.connect(audioContext.destination);
    sendStateToWorklet();
    
    els.initBtn.classList.add('active');
    els.playBtn.disabled = false;
    updateStatus('Audio initialized');
    
  } catch (error) {
    console.error("Failed to initialize audio:", error);
    updateStatus(`Error: ${error.message}`);
  }
}

function togglePlayback() {
  if (!es8Node) {
    updateStatus('Initialize audio first');
    return;
  }

  isPlaying = !isPlaying;

  if (isPlaying) {
    // When starting, get the complete current state...
    const state = getState();

    // --- FIX STARTS HERE ---
    // Explicitly reset the visual step counter for all channels before starting.
    // This ensures all UI indicators snap to their zero position simultaneously.
    for (const channel of state.channels) {
      channel.currentStep = -1; // Use -1 to represent a "pre-start" state.
    }
    // Immediately apply this visual reset to the DOM.
    updateStepIndicators();
    // --- FIX ENDS HERE ---

    // ...and send the clean state bundled with the 'start' command.
    es8Node.port.postMessage({
      type: 'start',
      state: state
    });
  } else {
    // The 'stop' command can remain simple.
    es8Node.port.postMessage({
      type: 'stop'
    });
  }

  // Update UI elements to reflect the new state.
  els.playBtn.textContent = isPlaying ? '■' : '▶';
  els.playBtn.classList.toggle('active', isPlaying);
  updateStatus(isPlaying ? 'Playing' : 'Stopped');
}

/**
 * Sends the entire current state of the sequencer to the audio worklet.
 * This is used for making live updates while the sequencer is running.
 */
function sendStateToWorklet() {
  if (!es8Node) return;

  const state = getState();
  es8Node.port.postMessage({
    type: 'setState',
    state: state
  });
}

function updateStepIndicators() {
  const state = getState();
  const indicators = document.querySelectorAll('.step-indicator-bar');
  
  indicators.forEach((bar, i) => {
    const channel = state.channels[i];
    // Get the actual subdivisions for this channel
    let effectiveSubdivisions = state.subdivisions;
    if (channel.usePolyrhythm) {
      effectiveSubdivisions = channel.polyrhythmSteps;
    } else if (channel.useCustomSubdivisions) {
      effectiveSubdivisions = channel.subdivisions;
    }
    
    const progress = (channel.currentStep / effectiveSubdivisions) * 100;
    bar.style.left = `${progress}%`;
  });
}

/**
 * Updates the main pattern grid highlights for all visible channels.
 * Renamed from updateCurrentStepIndicator for clarity.
 */
function updateVisibleGrids() {
  const state = getState();
  
  // Update current step indicators for all visible channels (selected + checked)
  for (let ch = 0; ch < 8; ch++) {
    const isSelected = (ch === selectedChannel);
    const isChecked = visibleChannels.has(ch);
    if (!isSelected && !isChecked) continue;
    
    const channel = state.channels[ch];
    const channelRow = els.multiChannelView.querySelector(`[data-channel="${ch}"]`);
    if (!channelRow) continue;
    
    // Remove current class from all cells in this channel
    const gridCells = channelRow.querySelectorAll('.pattern-step, .pitch-cell');
    gridCells.forEach(cell => {
      // Don't modify focused inputs - preserve user interaction
      if (document.activeElement === cell) return;
      cell.classList.remove('current');
    });
    
    // Add current class to the current step (unless it's focused)
    const currentCell = channelRow.querySelector(`[data-step="${channel.currentStep}"]`);
    if (currentCell && document.activeElement !== currentCell) {
      currentCell.classList.add('current');
    }
  }
}

function updateStatus(message) {
  els.status.textContent = message;
  setTimeout(() => {
    els.status.textContent = 'Ready';
  }, 2000);
}

// Export for debugging
window.minimalistDebug = {
  getState: () => getState(),
  selectedChannel: () => selectedChannel,
  gridSubdivisions: () => gridSubdivisions,
};
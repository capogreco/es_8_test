import {
  CHANNEL_MODES,
  MESSAGE_TYPES,
  SEQUENCER_CONSTANTS,
  DEFAULT_LFO,
  DEFAULT_SH,
  CV_MODES,
} from "./constants.js";

import { stateManager } from "./StateManager.js";
import { UIComponents } from "./UIComponents.js";
import { Visualizations } from "./Visualizations.js";
import { eventDelegation } from "./EventDelegation.js";
import {
  migratePattern,
  migratePitches,
  migrateSHValues,
} from "./PatternMigration.js";

// Audio context and worklet
let audioContext;
let es8Node;
let isPlaying = false;

// Initialize state
const initialState = {
  subdivisions: SEQUENCER_CONSTANTS.DEFAULT_SUBDIVISIONS,
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
      subdivisions: SEQUENCER_CONSTANTS.DEFAULT_SUBDIVISIONS,
      usePolyrhythm: false,
      polyrhythmSteps: SEQUENCER_CONSTANTS.DEFAULT_SUBDIVISIONS,
      triggerDuration: SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES,
      lfo: { ...DEFAULT_LFO },
      pitches: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null),
      sh: {
        ...DEFAULT_SH,
        values: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0),
      },
    })),
};

stateManager._state = initialState;

// UI render function
function renderUI() {
  const state = stateManager.getState();
  const sequencerGrid = document.getElementById("sequencerGrid");
  
  if (!sequencerGrid) return;
  
  // Clear existing content
  sequencerGrid.innerHTML = "";
  
  // Render each channel
  for (let channel = 0; channel < SEQUENCER_CONSTANTS.MAX_CHANNELS; channel++) {
    const channelRow = UIComponents.createChannelRow(channel, state);
    sequencerGrid.appendChild(channelRow);
  }
  
  // Timing controls are already in HTML, no need to recreate them
  
  // Update step indicators
  updateStepIndicators();
}

// Step indicator updates
function updateStepIndicators() {
  const channels = document.querySelectorAll(".channel");
  channels.forEach((channelEl) => {
    const channel = parseInt(channelEl.dataset.channel);
    const currentStep = stateManager.getState().channels[channel].currentStep || 0;
    
    // Clear previous indicators
    channelEl.querySelectorAll(".step-btn.current").forEach(btn => {
      btn.classList.remove("current");
    });
    
    // Set current step
    const currentBtn = channelEl.querySelector(`.step-btn[data-step="${currentStep}"]`);
    if (currentBtn) {
      currentBtn.classList.add("current");
    }
  });
}

// Send state to worklet
function sendStateToWorklet() {
  if (!es8Node) return;
  
  const state = stateManager.getState();
  const message = {
    type: MESSAGE_TYPES.UPDATE_PATTERN,
    pattern: state.pattern,
    channels: state.channels.map(ch => ({
      mode: ch.mode,
      cvMode: ch.cvMode,
      lfo: ch.lfo,
      pitches: ch.pitches,
      sh: ch.sh,
      useCustomSubdivisions: ch.useCustomSubdivisions,
      subdivisions: ch.subdivisions,
      usePolyrhythm: ch.usePolyrhythm,
      polyrhythmSteps: ch.polyrhythmSteps,
      triggerDuration: ch.triggerDuration,
    })),
    subdivisions: state.subdivisions,
    cycleTime: state.cycleTime,
  };
  
  es8Node.port.postMessage(message);
}

// Audio initialization
async function initAudio() {
  try {
    audioContext = new AudioContext({ sampleRate: 48000 });
    await audioContext.audioWorklet.addModule("sequencer-processor.js");
    
    es8Node = new AudioWorkletNode(audioContext, "es8-sequencer", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });
    
    // Handle messages from worklet
    es8Node.port.onmessage = (e) => {
      if (e.data.type === MESSAGE_TYPES.STEP_UPDATE) {
        stateManager.transaction(() => {
          e.data.channels.forEach((stepData, channel) => {
            stateManager._state.channels[channel].currentStep = stepData.step;
          });
        });
        updateStepIndicators();
      }
    };
    
    es8Node.connect(audioContext.destination);
    
    // Send initial state
    sendStateToWorklet();
    
    document.getElementById("status").textContent = "Audio initialized";
    document.getElementById("playButton").disabled = false;
    
  } catch (error) {
    console.error("Failed to initialize audio:", error);
    document.getElementById("status").textContent = `Error: ${error.message}`;
  }
}

// Playback control
function togglePlayback() {
  if (!es8Node) return;
  
  isPlaying = !isPlaying;
  es8Node.port.postMessage({
    type: isPlaying ? MESSAGE_TYPES.START : MESSAGE_TYPES.STOP,
  });
  
  const playButton = document.getElementById("playButton");
  if (playButton) {
    playButton.textContent = isPlaying ? "Stop" : "Play";
  }
}

// Clear all patterns
function clearAllPatterns() {
  stateManager.updateState((state) => {
    state.pattern = Array(SEQUENCER_CONSTANTS.MAX_CHANNELS)
      .fill(null)
      .map(() => Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false));
    
    state.channels.forEach(channel => {
      channel.pitches = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null);
      channel.sh.values = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0);
    });
  });
}

// State change subscriptions
stateManager.subscribe("*", (value, oldValue, path) => {
  // Skip initial undefined values
  if (oldValue === undefined) return;
  
  // Handle pattern migrations when subdivisions change
  if (path === "subdivisions" || path.includes("subdivisions") || path.includes("polyrhythm")) {
    handleSubdivisionChange(path);
  }
  
  // Update UI for visual changes
  if (shouldRebuildUI(path)) {
    renderUI();
  } else if (shouldUpdateVisualization(path)) {
    updateVisualization(path);
  }
  
  // Send updates to worklet
  sendStateToWorklet();
});

function shouldRebuildUI(path) {
  return path.includes("mode") || 
         path.includes("cvMode") ||
         path.includes("useCustomSubdivisions") ||
         path.includes("usePolyrhythm") ||
         path === "subdivisions";
}

function shouldUpdateVisualization(path) {
  return path.includes("lfo") || path.includes("sh");
}

function updateVisualization(path) {
  const match = path.match(/channels\.(\d+)\.(lfo|sh)/);
  if (!match) return;
  
  const channel = parseInt(match[1]);
  const type = match[2];
  const state = stateManager.getState();
  const channelState = state.channels[channel];
  
  if (type === "lfo" && channelState.mode === CHANNEL_MODES.CV && channelState.cvMode === CV_MODES.LFO) {
    const effectiveSubdivisions = UIComponents.getEffectiveSubdivisions(channel, state);
    Visualizations.updateLFOVisualization(channel, channelState.lfo, effectiveSubdivisions);
  } else if (type === "sh" && channelState.mode === CHANNEL_MODES.CV && channelState.cvMode === CV_MODES.SH) {
    Visualizations.updateSHVisualization(channel, channelState.sh.values, channelState.sh.mode, channelState.sh.width);
  }
}

function handleSubdivisionChange(path) {
  const state = stateManager.getState();
  
  if (path === "subdivisions") {
    // Global subdivision change
    const oldSubdivisions = state.subdivisions;
    stateManager.transaction(() => {
      for (let channel = 0; channel < SEQUENCER_CONSTANTS.MAX_CHANNELS; channel++) {
        if (!state.channels[channel].useCustomSubdivisions) {
          // Migrate patterns
          const newPattern = migratePattern(
            state.pattern[channel],
            oldSubdivisions,
            state.subdivisions
          );
          state.pattern[channel] = newPattern;
          
          // Migrate pitches
          if (state.channels[channel].pitches) {
            state.channels[channel].pitches = migratePitches(
              state.channels[channel].pitches,
              oldSubdivisions,
              state.subdivisions
            );
          }
          
          // Migrate S&H values
          if (state.channels[channel].sh.mode === "shuf") {
            state.channels[channel].sh.values = migrateSHValues(
              state.channels[channel].sh.values,
              oldSubdivisions,
              state.subdivisions
            );
          }
        }
      }
    });
  }
}

// Event listeners
document.addEventListener("togglePlayback", togglePlayback);

document.getElementById("startButton")?.addEventListener("click", initAudio);
document.getElementById("playButton")?.addEventListener("click", togglePlayback);
document.getElementById("clearButton")?.addEventListener("click", clearAllPatterns);

// Value display updates
document.getElementById("subdivisions")?.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  if (!isNaN(value) && value >= 2 && value <= 96) {
    stateManager.updateState((state) => {
      state.subdivisions = value;
    });
  }
});

document.getElementById("cycleTime")?.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  document.getElementById("cycleTimeValue").textContent = `${value.toFixed(1)}s`;
  stateManager.updateState((state) => {
    state.cycleTime = value;
  });
});

// Initial render
document.addEventListener("DOMContentLoaded", () => {
  renderUI();
});

// Export for debugging
window.sequencerDebug = {
  getState: () => stateManager.getState(),
  setState: (state) => stateManager._state = state,
  renderUI,
  isPlaying: () => isPlaying,
};
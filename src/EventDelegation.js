import { stateManager } from "./StateManager.js";
import { CHANNEL_MODES, SEQUENCER_CONSTANTS } from "./constants.js";

export class EventDelegation {
  constructor() {
    this.isDragging = false;
    this.dragStartValue = false;
    this.draggedCells = new Set();
    this.setupGlobalListeners();
  }

  setupGlobalListeners() {
    // Single event listener on document for all delegated events
    document.addEventListener("click", this.handleClick.bind(this));
    document.addEventListener("mousedown", this.handleMouseDown.bind(this));
    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));
    document.addEventListener("change", this.handleChange.bind(this));
    document.addEventListener("input", this.handleInput.bind(this));
    
    // Prevent text selection during drag
    document.addEventListener("selectstart", (e) => {
      if (this.isDragging) e.preventDefault();
    });
  }

  handleClick(e) {
    // Mode buttons
    if (e.target.closest(".mode-btn")) {
      const btn = e.target.closest(".mode-btn");
      const channel = parseInt(btn.closest(".channel").dataset.channel);
      const mode = btn.dataset.mode;
      this.handleModeChange(channel, mode);
      return;
    }

    // Play/Stop button
    if (e.target.id === "playButton") {
      this.togglePlayback();
      return;
    }

    // Clear button
    if (e.target.id === "clearButton") {
      this.clearAllPatterns();
      return;
    }

    // CV mode buttons
    if (e.target.closest(".cv-mode-btn")) {
      const btn = e.target.closest(".cv-mode-btn");
      const channel = parseInt(btn.closest(".channel").dataset.channel);
      const cvMode = btn.dataset.cvMode;
      this.handleCVModeChange(channel, cvMode);
      return;
    }

    // Subdivision toggle
    if (e.target.closest(".subdivision-toggle")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.toggleCustomSubdivisions(channel);
      return;
    }

    // Polyrhythm toggle
    if (e.target.closest(".polyrhythm-toggle")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.togglePolyrhythm(channel);
      return;
    }
  }

  handleMouseDown(e) {
    const cell = e.target.closest(".step-btn");
    if (!cell) return;

    e.preventDefault();
    this.isDragging = true;
    this.draggedCells.clear();
    
    const channel = parseInt(cell.dataset.channel);
    const step = parseInt(cell.dataset.step);
    const state = stateManager.getState();
    
    this.dragStartValue = !state.pattern[channel][step];
    this.updateCell(channel, step, this.dragStartValue);
    this.draggedCells.add(`${channel}-${step}`);
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;
    
    const cell = e.target.closest(".step-btn");
    if (!cell) return;

    const channel = parseInt(cell.dataset.channel);
    const step = parseInt(cell.dataset.step);
    const cellKey = `${channel}-${step}`;

    if (!this.draggedCells.has(cellKey)) {
      this.updateCell(channel, step, this.dragStartValue);
      this.draggedCells.add(cellKey);
    }
  }

  handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedCells.clear();
    }
  }

  handleChange(e) {
    // Pitch inputs
    if (e.target.classList.contains("pitch-input")) {
      const channel = parseInt(e.target.dataset.channel);
      const step = parseInt(e.target.dataset.step);
      const value = e.target.value;
      this.updatePitch(channel, step, value);
      return;
    }

    // Waveform select
    if (e.target.classList.contains("waveform-select")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateLFOWaveform(channel, e.target.value);
      return;
    }

    // S&H mode select
    if (e.target.classList.contains("sh-mode-select")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateSHMode(channel, e.target.value);
      return;
    }

    // Subdivisions input
    if (e.target.classList.contains("subdivisions-input")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateChannelSubdivisions(channel, parseInt(e.target.value));
      return;
    }

    // Polyrhythm steps input
    if (e.target.classList.contains("polyrhythm-steps-input")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updatePolyrhythmSteps(channel, parseInt(e.target.value));
      return;
    }

    // Trigger duration select
    if (e.target.classList.contains("trigger-duration-select")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateTriggerDuration(channel, parseInt(e.target.value));
      return;
    }
  }

  handleInput(e) {
    // LFO rate
    if (e.target.classList.contains("lfo-rate")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateLFOParam(channel, "rate", parseInt(e.target.value));
      return;
    }

    // LFO duty
    if (e.target.classList.contains("lfo-duty")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateLFOParam(channel, "duty", parseInt(e.target.value));
      return;
    }

    // LFO width
    if (e.target.classList.contains("lfo-width")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateLFOParam(channel, "width", parseInt(e.target.value));
      return;
    }

    // S&H width
    if (e.target.classList.contains("sh-width")) {
      const channel = parseInt(e.target.closest(".channel").dataset.channel);
      this.updateSHParam(channel, "width", parseInt(e.target.value));
      return;
    }

    // Global subdivisions
    if (e.target.id === "subdivisions") {
      this.updateGlobalSubdivisions(parseInt(e.target.value));
      return;
    }

    // Cycle time
    if (e.target.id === "cycleTime") {
      this.updateCycleTime(parseFloat(e.target.value));
      return;
    }
  }

  // Action methods
  handleModeChange(channel, mode) {
    stateManager.updateState((state) => {
      state.channels[channel].mode = mode;
    });
  }

  handleCVModeChange(channel, cvMode) {
    stateManager.updateState((state) => {
      state.channels[channel].cvMode = cvMode;
    });
  }

  toggleCustomSubdivisions(channel) {
    stateManager.updateState((state) => {
      state.channels[channel].useCustomSubdivisions = 
        !state.channels[channel].useCustomSubdivisions;
    });
  }

  togglePolyrhythm(channel) {
    stateManager.updateState((state) => {
      state.channels[channel].usePolyrhythm = 
        !state.channels[channel].usePolyrhythm;
    });
  }

  updateCell(channel, step, value) {
    stateManager.updateState((state) => {
      state.pattern[channel][step] = value;
    });
  }

  updatePitch(channel, step, value) {
    stateManager.updateState((state) => {
      if (!state.channels[channel].pitches) {
        state.channels[channel].pitches = new Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill("");
      }
      state.channels[channel].pitches[step] = value;
    });
  }

  updateLFOWaveform(channel, waveform) {
    stateManager.updateState((state) => {
      state.channels[channel].lfo.waveform = waveform;
    });
  }

  updateLFOParam(channel, param, value) {
    stateManager.updateState((state) => {
      state.channels[channel].lfo[param] = value;
    });
  }

  updateSHMode(channel, mode) {
    stateManager.updateState((state) => {
      state.channels[channel].sh.mode = mode;
      if (mode === "rand") {
        // Generate new random values
        const subdivisions = state.channels[channel].useCustomSubdivisions
          ? state.channels[channel].subdivisions
          : state.subdivisions;
        state.channels[channel].sh.values = Array.from(
          { length: subdivisions },
          () => Math.random() * 2 - 1
        );
      }
    });
  }

  updateSHParam(channel, param, value) {
    stateManager.updateState((state) => {
      state.channels[channel].sh[param] = value;
    });
  }

  updateChannelSubdivisions(channel, value) {
    stateManager.updateState((state) => {
      state.channels[channel].subdivisions = value;
    });
  }

  updatePolyrhythmSteps(channel, value) {
    stateManager.updateState((state) => {
      state.channels[channel].polyrhythmSteps = value;
    });
  }

  updateTriggerDuration(channel, value) {
    stateManager.updateState((state) => {
      state.channels[channel].triggerDuration = value;
    });
  }

  updateGlobalSubdivisions(value) {
    stateManager.updateState((state) => {
      state.subdivisions = value;
    });
  }

  updateCycleTime(value) {
    stateManager.updateState((state) => {
      state.cycleTime = value;
    });
  }

  togglePlayback() {
    // This will be connected to the audio system
    const event = new CustomEvent("togglePlayback");
    document.dispatchEvent(event);
  }

  clearAllPatterns() {
    stateManager.updateState((state) => {
      state.pattern = Array(SEQUENCER_CONSTANTS.MAX_CHANNELS)
        .fill(null)
        .map(() => Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false));
      
      // Clear pitches for all channels
      state.channels.forEach(channel => {
        if (channel.pitches) {
          channel.pitches = new Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill("");
        }
      });
    });
  }
}

// Create singleton instance
export const eventDelegation = new EventDelegation();
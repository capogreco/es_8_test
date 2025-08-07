import {
  CHANNEL_MODES,
  COLORS,
  CV_MODES,
  DEFAULT_LFO,
  DEFAULT_SH,
  LFO_WAVEFORMS,
  MESSAGE_TYPES,
  PITCH_CONSTANTS,
  SEQUENCER_CONSTANTS,
  SH_MODES,
  UI_CLASSES,
} from "./constants.js";

import { stateManager } from "./StateManager.js";
import { initializeUISubscriptions } from "./UISubscriptions.js";
import {
  migratePattern,
  migratePitches,
  migrateSHValues,
} from "./PatternMigration.js";

// Make AudioWorkletService available globally for module
window.audioWorkletService = window.audioWorkletService || {};

let audioContext;
let es8Node;
let isPlaying = false;
// Use the audio worklet service for all communication
const workletService = window.audioWorkletService;
// let currentStep = -1;  // Removed - now tracked per channel

// Initialize sequencer state
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
      triggerDuration: SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES, // Default to 20ms
      lfo: { ...DEFAULT_LFO },
      pitches: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null),
      sh: {
        ...DEFAULT_SH,
        values: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0),
      },
    })),
};

// Initialize state manager
stateManager._state = initialState;

// Keep a reference for backwards compatibility during migration
const sequencerState = stateManager._state;

// UI Elements
const startButton = document.getElementById("startButton");
const playButton = document.getElementById("playButton");
const pauseButton = document.getElementById("pauseButton");
const clearButton = document.getElementById("clearButton");
const statusEl = document.getElementById("status");
const cycleTimeSlider = document.getElementById("cycleTime");
const cycleTimeValue = document.getElementById("cycleTimeValue");
const subdivisionsInput = document.getElementById("subdivisions");
const sequencerGrid = document.getElementById("sequencerGrid");

// Subscribe to cycle time changes
stateManager.subscribe("cycleTime", (value) => {
  cycleTimeValue.textContent = `${value.toFixed(1)}s`;
  workletService.setCycleTime(value);
});

// Initialize UI
cycleTimeSlider.addEventListener("input", (e) => {
  stateManager.set("cycleTime", parseFloat(e.target.value));
});

// Subscribe to global subdivisions changes
stateManager.subscribe(
  "subdivisions",
  (newGlobalSubdivisions, oldGlobalSubdivisions) => {
    if (oldGlobalSubdivisions === undefined) return; // Skip initial subscription

    subdivisionsInput.value = newGlobalSubdivisions;

    // Update all channels that don't use custom subdivisions
    stateManager.transaction(() => {
      for (let channel = 0; channel < 8; channel++) {
        if (!sequencerState.channels[channel].useCustomSubdivisions) {
          // Migrate patterns for channels using global subdivisions
          const newPattern = migratePattern(
            sequencerState.pattern[channel],
            oldGlobalSubdivisions,
            newGlobalSubdivisions,
          );
          stateManager.set(`pattern.${channel}`, newPattern);

          // Migrate pitches if in 1V/Oct mode
          if (
            sequencerState.channels[channel].mode === "cv" &&
            sequencerState.channels[channel].cvMode === "1voct"
          ) {
            const newPitches = migratePitches(
              sequencerState.channels[channel].pitches,
              oldGlobalSubdivisions,
              newGlobalSubdivisions,
            );
            stateManager.setChannelProperty(channel, "pitches", newPitches);
          }

          // Migrate S&H values if in S&H mode
          if (
            sequencerState.channels[channel].mode === "cv" &&
            sequencerState.channels[channel].cvMode === "sh"
          ) {
            const sh = { ...sequencerState.channels[channel].sh };
            sh.values = migrateSHValues(
              sh.values,
              oldGlobalSubdivisions,
              newGlobalSubdivisions,
            );
            stateManager.setChannelProperty(channel, "sh", sh);
          }

          // Update channel subdivision value
          stateManager.setChannelProperty(
            channel,
            "subdivisions",
            newGlobalSubdivisions,
          );
        }

        // Scale polyrhythm values to maintain timing relationship
        if (sequencerState.channels[channel].usePolyrhythm) {
          const oldPolyrhythm =
            sequencerState.channels[channel].polyrhythmSteps;
          const newPolyrhythm = Math.round(
            (oldPolyrhythm / oldGlobalSubdivisions) * newGlobalSubdivisions,
          );
          // Ensure it's within valid range (1 to newGlobalSubdivisions)
          const clampedPolyrhythm = Math.max(
            1,
            Math.min(newPolyrhythm, newGlobalSubdivisions),
          );
          stateManager.setChannelProperty(
            channel,
            "polyrhythmSteps",
            clampedPolyrhythm,
          );
        }
      }
    });

    buildGrid();

    if (es8Node) {
      workletService.setGlobalSubdivisions(newGlobalSubdivisions);
      // Re-send pattern after subdivision change
      sendPatternToWorklet();
    }
  },
);

// Handle subdivision input
subdivisionsInput.addEventListener("input", (e) => {
  let newGlobalSubdivisions = parseInt(e.target.value);
  if (isNaN(newGlobalSubdivisions)) return;

  // Clamp to valid range
  newGlobalSubdivisions = Math.max(
    SEQUENCER_CONSTANTS.MIN_SUBDIVISIONS,
    Math.min(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS, newGlobalSubdivisions),
  );
  e.target.value = newGlobalSubdivisions;

  stateManager.set("subdivisions", newGlobalSubdivisions);
});

// Also handle blur to ensure valid value
subdivisionsInput.addEventListener("blur", (e) => {
  let value = parseInt(e.target.value);
  if (isNaN(value) || value < 2) {
    e.target.value = 8; // Default
    value = 8;
  } else if (value > 96) {
    e.target.value = 96;
    value = 96;
  }

  // Only update if different from current
  if (value !== sequencerState.subdivisions) {
    // Use StateManager to trigger the subscription which handles the migration
    stateManager.set("subdivisions", value);
  }
});

// Drag state
let isDragging = false;
let dragStartState = null;
const draggedCells = new Set();

// Create trigger parameter controls
function createTriggerParams(channel) {
  const container = document.createElement("div");
  container.className = "trigger-params";
  container.id = `trigger-params-${channel}`;
  container.style.display = sequencerState.channels[channel].mode === "trigger"
    ? "flex"
    : "none";
  container.style.flexDirection = "column";
  container.style.gap = "5px";
  container.style.marginTop = "5px";
  container.style.padding = "5px";
  container.style.background = "#1a1a1a";
  container.style.borderRadius = "4px";

  // Trigger duration selector
  const durationParam = document.createElement("div");
  durationParam.className = "cv-param";
  durationParam.style.display = "flex";
  durationParam.style.alignItems = "center";
  durationParam.style.gap = "10px";

  const durationLabel = document.createElement("label");
  durationLabel.textContent = "Duration";
  durationLabel.style.fontSize = "10px";
  durationLabel.style.minWidth = "50px";
  durationParam.appendChild(durationLabel);

  const durationSelect = document.createElement("select");
  durationSelect.style.fontSize = "10px";
  durationSelect.style.padding = "2px 4px";
  durationSelect.style.background = "#2a2a2a";
  durationSelect.style.border = "1px solid #444";
  durationSelect.style.borderRadius = "3px";
  durationSelect.style.color = "#e0e0e0";
  durationSelect.innerHTML = `
    <option value="${SEQUENCER_CONSTANTS.TRIGGER_DURATION_SHORT_SAMPLES}">Short (~0.17ms)</option>
    <option value="${SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES}">Long (20ms)</option>
  `;
  durationSelect.value = sequencerState.channels[channel].triggerDuration;
  durationSelect.addEventListener("change", (e) => {
    const value = parseInt(e.target.value);
    stateManager.set(`channels.${channel}.triggerDuration`, value);
    workletService.setTriggerDuration(channel, value);
  });
  durationParam.appendChild(durationSelect);

  container.appendChild(durationParam);
  return container;
}

// Create CV parameter controls
function createCVParams(channel) {
  const container = document.createElement("div");
  container.className = "cv-params";
  container.id = `cv-params-${channel}`;

  // Show for CV modes (LFO and S&H)
  if (
    sequencerState.channels[channel].mode === "cv" &&
    (sequencerState.channels[channel].cvMode === "lfo" ||
      sequencerState.channels[channel].cvMode === "sh")
  ) {
    container.classList.add("visible");
  }

  // LFO parameters
  const lfoParams = document.createElement("div");
  lfoParams.className = "lfo-params";
  lfoParams.style.display = sequencerState.channels[channel].cvMode === "lfo"
    ? "flex"
    : "none";
  lfoParams.style.flexDirection = "column";
  lfoParams.style.gap = "5px";

  // Waveform selector
  const waveParam = document.createElement("div");
  waveParam.className = "cv-param";
  const waveLabel = document.createElement("label");
  waveLabel.textContent = "Wave";
  waveParam.appendChild(waveLabel);
  const waveSelect = document.createElement("select");
  waveSelect.innerHTML = `
    <option value="ramp">Ramp</option>
    <option value="sine">Sine</option>
  `;
  waveSelect.value = sequencerState.channels[channel].lfo.waveform;
  waveSelect.addEventListener(
    "change",
    (e) => updateLFO(channel, "waveform", e.target.value),
  );
  waveParam.appendChild(waveSelect);
  lfoParams.appendChild(waveParam);

  // Rate control
  const rateParam = document.createElement("div");
  rateParam.className = "cv-param";
  const rateLabel = document.createElement("label");
  rateLabel.textContent = "Rate";
  const rateValue = document.createElement("span");
  rateValue.className = "value";
  rateValue.textContent = sequencerState.channels[channel].lfo.rate;
  const rateInput = document.createElement("input");
  rateInput.type = "range";
  rateInput.min = "1";
  rateInput.max = "16";
  rateInput.step = "1";
  rateInput.value = sequencerState.channels[channel].lfo.rate;
  rateInput.addEventListener("input", (e) => {
    const value = parseInt(e.target.value);
    rateValue.textContent = value;
    updateLFO(channel, "rate", value);
  });
  rateParam.appendChild(rateLabel);
  rateParam.appendChild(rateValue);
  rateParam.appendChild(rateInput);
  lfoParams.appendChild(rateParam);

  // Duty cycle (for ramp only)
  const dutyParam = document.createElement("div");
  dutyParam.className = "cv-param";
  dutyParam.id = `duty-param-${channel}`;
  dutyParam.style.display =
    sequencerState.channels[channel].lfo.waveform === "ramp" ? "grid" : "none";
  const dutyLabel = document.createElement("label");
  dutyLabel.textContent = "Duty";
  const dutyValue = document.createElement("span");
  dutyValue.className = "value";
  dutyValue.textContent =
    (sequencerState.channels[channel].lfo.duty * 100).toFixed(0) + "%";
  const dutyInput = document.createElement("input");
  dutyInput.type = "range";
  dutyInput.min = "0";
  dutyInput.max = "1";
  dutyInput.step = "0.01";
  dutyInput.value = sequencerState.channels[channel].lfo.duty;
  dutyInput.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    dutyValue.textContent = (value * 100).toFixed(0) + "%";
    updateLFO(channel, "duty", value);
  });
  dutyParam.appendChild(dutyLabel);
  dutyParam.appendChild(dutyValue);
  dutyParam.appendChild(dutyInput);
  lfoParams.appendChild(dutyParam);

  // Width/amplitude
  const widthParam = document.createElement("div");
  widthParam.className = "cv-param";
  const widthLabel = document.createElement("label");
  widthLabel.textContent = "Width";
  const widthValue = document.createElement("span");
  widthValue.className = "value";
  widthValue.textContent =
    (sequencerState.channels[channel].lfo.width * 100).toFixed(0) + "%";
  const widthInput = document.createElement("input");
  widthInput.type = "range";
  widthInput.min = "0";
  widthInput.max = "1";
  widthInput.step = "0.01";
  widthInput.value = sequencerState.channels[channel].lfo.width;
  widthInput.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    widthValue.textContent = (value * 100).toFixed(0) + "%";
    updateLFO(channel, "width", value);
  });
  widthParam.appendChild(widthLabel);
  widthParam.appendChild(widthValue);
  widthParam.appendChild(widthInput);
  lfoParams.appendChild(widthParam);

  // Phase offset
  const phaseParam = document.createElement("div");
  phaseParam.className = "cv-param";
  const phaseLabel = document.createElement("label");
  phaseLabel.textContent = "Phase";
  const phaseValue = document.createElement("span");
  phaseValue.className = "value";
  phaseValue.textContent =
    ((sequencerState.channels[channel].lfo.phase || 0) * 360).toFixed(0) + "°";
  const phaseInput = document.createElement("input");
  phaseInput.type = "range";
  phaseInput.min = "0";
  phaseInput.max = "1";
  phaseInput.step = "0.01";
  phaseInput.value = sequencerState.channels[channel].lfo.phase || 0;
  phaseInput.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    phaseValue.textContent = (value * 360).toFixed(0) + "°";
    updateLFO(channel, "phase", value);
  });
  phaseParam.appendChild(phaseLabel);
  phaseParam.appendChild(phaseValue);
  phaseParam.appendChild(phaseInput);
  lfoParams.appendChild(phaseParam);

  container.appendChild(lfoParams);

  // S&H parameters
  const shParams = document.createElement("div");
  shParams.className = "sh-params";
  shParams.style.display = sequencerState.channels[channel].cvMode === "sh"
    ? "flex"
    : "none";
  shParams.style.flexDirection = "column";
  shParams.style.gap = "5px";

  // S&H mode selector
  const shModeParam = document.createElement("div");
  shModeParam.className = "cv-param";
  const shModeLabel = document.createElement("label");
  shModeLabel.textContent = "Mode";
  const shModeSelect = document.createElement("select");
  shModeSelect.innerHTML = `
    <option value="rand">Rand</option>
    <option value="shuf">Shuf</option>
  `;
  shModeSelect.value = sequencerState.channels[channel].sh.mode;
  shModeSelect.addEventListener(
    "change",
    (e) => updateSH(channel, "mode", e.target.value),
  );
  shModeParam.appendChild(shModeLabel);
  shModeParam.appendChild(shModeSelect);
  shParams.appendChild(shModeParam);

  // S&H width control
  const shWidthParam = document.createElement("div");
  shWidthParam.className = "cv-param";
  const shWidthLabel = document.createElement("label");
  shWidthLabel.textContent = "Width";
  const shWidthValue = document.createElement("span");
  shWidthValue.className = "value";
  shWidthValue.textContent =
    (sequencerState.channels[channel].sh.width * 100).toFixed(0) + "%";
  const shWidthInput = document.createElement("input");
  shWidthInput.type = "range";
  shWidthInput.min = "0";
  shWidthInput.max = "1";
  shWidthInput.step = "0.01";
  shWidthInput.value = sequencerState.channels[channel].sh.width;
  shWidthInput.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    shWidthValue.textContent = (value * 100).toFixed(0) + "%";
    updateSH(channel, "width", value);
  });
  shWidthParam.appendChild(shWidthLabel);
  shWidthParam.appendChild(shWidthValue);
  shWidthParam.appendChild(shWidthInput);
  shParams.appendChild(shWidthParam);

  container.appendChild(shParams);

  return container;
}

// Create subdivision info display
// Create timing controls (polyrhythm and subdivisions)
function createTimingControls(channel) {
  const container = document.createElement("div");
  container.className = "timing-controls";

  // Polyrhythm control
  const polyControl = document.createElement("div");
  polyControl.className = "timing-control polyrhythm";

  const polyCheckbox = document.createElement("input");
  polyCheckbox.type = "checkbox";
  polyCheckbox.id = `poly-checkbox-${channel}`;
  polyCheckbox.checked = sequencerState.channels[channel].usePolyrhythm;

  const polyLabel = document.createElement("label");
  polyLabel.htmlFor = `poly-checkbox-${channel}`;
  polyLabel.textContent = "P";
  polyLabel.title = "Polyrhythm";

  const polyInput = document.createElement("input");
  polyInput.type = "number";
  polyInput.id = `poly-input-${channel}`;
  polyInput.min = "1";
  polyInput.max = sequencerState.subdivisions;
  // When polyrhythm is disabled, show global subdivisions
  polyInput.value = sequencerState.channels[channel].usePolyrhythm
    ? sequencerState.channels[channel].polyrhythmSteps
    : sequencerState.subdivisions;
  polyInput.disabled = !sequencerState.channels[channel].usePolyrhythm;

  polyControl.appendChild(polyLabel);
  polyControl.appendChild(polyInput);
  polyControl.appendChild(polyCheckbox);

  // Subdivision control
  const subdivControl = document.createElement("div");
  subdivControl.className = "timing-control subdivision";

  const subdivCheckbox = document.createElement("input");
  subdivCheckbox.type = "checkbox";
  subdivCheckbox.id = `subdiv-checkbox-${channel}`;
  subdivCheckbox.checked =
    sequencerState.channels[channel].useCustomSubdivisions;

  const subdivLabel = document.createElement("label");
  subdivLabel.htmlFor = `subdiv-checkbox-${channel}`;
  subdivLabel.textContent = "S";
  subdivLabel.title = "Custom Subdivisions";

  const subdivInput = document.createElement("input");
  subdivInput.type = "number";
  subdivInput.id = `subdiv-input-${channel}`;
  subdivInput.min = "2";
  subdivInput.max = "96";

  // Determine subdivision value to display
  let subdivValue;
  if (
    !sequencerState.channels[channel].useCustomSubdivisions &&
    sequencerState.channels[channel].usePolyrhythm
  ) {
    subdivValue = sequencerState.channels[channel].polyrhythmSteps;
  } else {
    subdivValue = sequencerState.channels[channel].subdivisions;
  }
  subdivInput.value = subdivValue;
  subdivInput.disabled = !sequencerState.channels[channel]
    .useCustomSubdivisions;

  subdivControl.appendChild(subdivLabel);
  subdivControl.appendChild(subdivInput);
  subdivControl.appendChild(subdivCheckbox);

  container.appendChild(polyControl);
  container.appendChild(subdivControl);

  // Event handlers
  polyCheckbox.addEventListener("change", (e) => {
    const enabled = e.target.checked;
    polyInput.disabled = !enabled;

    stateManager.setChannelProperty(channel, "usePolyrhythm", enabled);

    if (enabled) {
      // When enabling, if the polyrhythmSteps doesn't match global, use the current value
      // Otherwise keep the existing polyrhythmSteps
      const currentPolySteps = sequencerState.channels[channel].polyrhythmSteps;
      const globalSubdivisions = sequencerState.subdivisions;
      const steps = currentPolySteps !== globalSubdivisions
        ? currentPolySteps
        : parseInt(polyInput.value);
      stateManager.setChannelProperty(channel, "polyrhythmSteps", steps);

      // If custom subdivisions are disabled, update subdivision to match
      if (!sequencerState.channels[channel].useCustomSubdivisions) {
        stateManager.setChannelProperty(channel, "subdivisions", steps);
        subdivInput.value = steps;
        if (es8Node) {
          workletService.setChannelSubdivisions(channel, steps);
        }
      }

      if (es8Node) {
        workletService.setPolyrhythm(channel, true, steps);
      }
    } else {
      // Reset subdivisions to global if custom is disabled
      if (!sequencerState.channels[channel].useCustomSubdivisions) {
        const globalSubdivisions = sequencerState.subdivisions;
        stateManager.setChannelProperty(
          channel,
          "subdivisions",
          globalSubdivisions,
        );
        subdivInput.value = globalSubdivisions;
        if (es8Node) {
          workletService.setChannelSubdivisions(channel, globalSubdivisions);
        }
      }

      if (es8Node) {
        workletService.setPolyrhythm(channel, false);
      }
    }

    buildGrid();
  });

  polyInput.addEventListener("change", (e) => {
    let value = parseInt(e.target.value);
    if (!isNaN(value)) {
      value = Math.max(1, Math.min(sequencerState.subdivisions, value));
      e.target.value = value;

      stateManager.setChannelProperty(channel, "polyrhythmSteps", value);

      // If custom subdivisions are disabled, update subdivision to match
      if (!sequencerState.channels[channel].useCustomSubdivisions) {
        stateManager.setChannelProperty(channel, "subdivisions", value);
        subdivInput.value = value;
        if (es8Node) {
          workletService.setChannelSubdivisions(channel, value);
        }
      }

      if (es8Node) {
        workletService.setPolyrhythm(channel, true, value);
      }

      buildGrid();
    }
  });

  subdivCheckbox.addEventListener("change", (e) => {
    const enabled = e.target.checked;
    subdivInput.disabled = !enabled;

    stateManager.setChannelProperty(channel, "useCustomSubdivisions", enabled);

    if (!enabled) {
      // Reset to polyrhythm value or global value
      const targetSubdivisions = sequencerState.channels[channel].usePolyrhythm
        ? sequencerState.channels[channel].polyrhythmSteps
        : sequencerState.subdivisions;

      stateManager.setChannelProperty(
        channel,
        "subdivisions",
        targetSubdivisions,
      );
      subdivInput.value = targetSubdivisions;

      if (es8Node) {
        workletService.setChannelSubdivisions(channel, targetSubdivisions);
      }
    }

    buildGrid();
  });

  subdivInput.addEventListener("change", (e) => {
    if (!subdivInput.disabled) {
      let value = parseInt(e.target.value);
      if (!isNaN(value)) {
        value = Math.max(2, Math.min(96, value));
        e.target.value = value;

        updateChannelSubdivisions(channel, value);
      }
    }
  });

  return container;
}

// Set channel mode (trigger/lfo/1voct/sh)
function setChannelMode(channel, mode) {
  // Use state manager transaction for atomic updates
  stateManager.transaction(() => {
    if (mode === CHANNEL_MODES.TRIGGER) {
      stateManager.setChannelProperty(channel, "mode", CHANNEL_MODES.TRIGGER);
    } else if (mode === CV_MODES.LFO) {
      stateManager.setChannelProperty(channel, "mode", CHANNEL_MODES.CV);
      stateManager.setChannelProperty(channel, "cvMode", CV_MODES.LFO);
    } else if (mode === CV_MODES.PITCH) {
      stateManager.setChannelProperty(channel, "mode", CHANNEL_MODES.CV);
      stateManager.setChannelProperty(channel, "cvMode", CV_MODES.PITCH);
    } else if (mode === CV_MODES.SH) {
      stateManager.setChannelProperty(channel, "mode", CHANNEL_MODES.CV);
      stateManager.setChannelProperty(channel, "cvMode", CV_MODES.SH);
    }
  });

  // Update UI
  const rows = document.querySelectorAll(".channel-row");
  const row = rows[channel];
  const triggerBtn = row.querySelector('.mode-selector[data-mode="trigger"]');
  const lfoBtn = row.querySelector('.mode-selector[data-mode="lfo"]');
  const voctBtn = row.querySelector('.mode-selector[data-mode="1voct"]');
  const shBtn = row.querySelector('.mode-selector[data-mode="sh"]');
  const stepGrid = document.getElementById(`step-grid-${channel}`);
  const lfoViz = document.getElementById(`lfo-viz-${channel}`);
  const pitchGrid = document.getElementById(`pitch-grid-${channel}`);
  const shViz = document.getElementById(`sh-viz-${channel}`);
  const cvParams = document.getElementById(`cv-params-${channel}`);
  const triggerParams = document.getElementById(`trigger-params-${channel}`);
  const lfoParams = row.querySelector(".lfo-params");
  const shParams = row.querySelector(".sh-params");
  // Clear all active states
  triggerBtn.classList.remove("active");
  lfoBtn.classList.remove("active");
  voctBtn.classList.remove("active");
  shBtn.classList.remove("active");

  if (mode === "trigger") {
    triggerBtn.classList.add("active");
    stepGrid.style.display = "";
    lfoViz.classList.remove("visible");
    pitchGrid.classList.remove("visible");
    shViz.classList.remove("visible");
    cvParams.classList.remove("visible");
    if (triggerParams) triggerParams.style.display = "flex";
  } else if (mode === "lfo") {
    lfoBtn.classList.add("active");
    stepGrid.style.display = "none";
    lfoViz.classList.add("visible");
    pitchGrid.classList.remove("visible");
    shViz.classList.remove("visible");
    cvParams.classList.add("visible");
    if (triggerParams) triggerParams.style.display = "none";
    if (lfoParams) lfoParams.style.display = "flex";
    if (shParams) shParams.style.display = "none";
    updateLFOVisualization(channel);
  } else if (mode === "1voct") {
    voctBtn.classList.add("active");
    stepGrid.style.display = "none";
    lfoViz.classList.remove("visible");
    pitchGrid.classList.add("visible");
    shViz.classList.remove("visible");
    cvParams.classList.remove("visible"); // No params for 1V/Oct
    if (triggerParams) triggerParams.style.display = "none";
  } else if (mode === "sh") {
    shBtn.classList.add("active");
    stepGrid.style.display = "none";
    lfoViz.classList.remove("visible");
    pitchGrid.classList.remove("visible");
    shViz.classList.add("visible");
    cvParams.classList.add("visible");
    if (triggerParams) triggerParams.style.display = "none";
    if (lfoParams) lfoParams.style.display = "none";
    if (shParams) shParams.style.display = "flex";
    generateSHValues(channel);
    updateSHVisualization(channel);
  }

  // Update worklet
  workletService.setChannelMode(
    channel,
    sequencerState.channels[channel].mode,
    sequencerState.channels[channel].cvMode,
    sequencerState.channels[channel].lfo,
    sequencerState.channels[channel].sh,
  );
}

// Update LFO parameter
function updateLFO(channel, param, value) {
  const lfo = { ...sequencerState.channels[channel].lfo };
  lfo[param] = value;
  stateManager.setChannelProperty(channel, "lfo", lfo);

  // Show/hide duty cycle for ramp vs sine
  if (param === "waveform") {
    const dutyParam = document.getElementById(`duty-param-${channel}`);
    dutyParam.style.display = value === "ramp" ? "grid" : "none";
  }

  // Update visualization
  updateLFOVisualization(channel);

  // Update worklet
  workletService.updateLFO(channel, lfo);
}

// Update S&H parameter
function updateSH(channel, param, value) {
  const sh = { ...sequencerState.channels[channel].sh };
  sh[param] = value;
  stateManager.setChannelProperty(channel, "sh", sh);

  // If width changed, update visualization
  if (param === "width") {
    updateSHVisualization(channel);
  }

  // Update worklet
  workletService.updateSH(channel, sh);
}

// Generate S&H values
function generateSHValues(channel) {
  const sh = { ...sequencerState.channels[channel].sh };

  // Get channel-specific subdivisions
  const channelSubdivisions = sequencerState.channels[channel]
      .useCustomSubdivisions
    ? sequencerState.channels[channel].subdivisions
    : sequencerState.subdivisions;

  // Only generate new values in rand mode or if not initialized
  if (sh.mode === "rand" || sh.values.every((v) => v === 0)) {
    const newValues = [...sh.values];
    for (let i = 0; i < channelSubdivisions; i++) {
      // Generate random value between -1 and 1
      newValues[i] = Math.random() * 2 - 1;
    }
    sh.values = newValues;
    stateManager.setChannelProperty(channel, "sh", sh);
  }

  // Update worklet with new values
  workletService.setSHValues(channel, sh.values.slice(0, channelSubdivisions));
}

// Update S&H visualization
function updateSHVisualization(channel) {
  const viz = document.getElementById(`sh-viz-${channel}`);
  const sh = sequencerState.channels[channel].sh;

  if (!viz) return;

  // Clear existing content
  viz.innerHTML = "";

  // Get channel-specific subdivisions
  const channelSubdivisions = sequencerState.channels[channel]
      .useCustomSubdivisions
    ? sequencerState.channels[channel].subdivisions
    : sequencerState.subdivisions;

  // When polyrhythm is active, only show cells up to polyrhythmSteps
  const visibleSteps = sequencerState.channels[channel].usePolyrhythm
    ? sequencerState.channels[channel].polyrhythmSteps
    : channelSubdivisions;

  // Create grid container
  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gap = "3px";
  grid.style.height = "100%";
  grid.style.alignItems = "stretch"; // Ensure cells fill the height

  if (
    sequencerState.channels[channel].usePolyrhythm &&
    sequencerState.channels[channel].useCustomSubdivisions
  ) {
    // Both active: custom subdivisions within polyrhythm width
    const polyrhythmWidth = (sequencerState.channels[channel].polyrhythmSteps /
      sequencerState.subdivisions) *
      100;
    grid.style.gridTemplateColumns = `repeat(${channelSubdivisions}, 1fr)`;
    grid.style.width = `${polyrhythmWidth}%`;
  } else if (sequencerState.channels[channel].usePolyrhythm) {
    // Only polyrhythm: maintain cell width from global subdivisions
    grid.style.gridTemplateColumns =
      `repeat(${sequencerState.subdivisions}, 1fr)`;
    grid.style.width = "100%";
  } else {
    // Normal mode or custom subdivisions only
    grid.style.gridTemplateColumns = `repeat(${visibleSteps}, 1fr)`;
    grid.style.width = "100%";
  }

  // Create cells based on mode
  let totalSHCells;
  if (
    sequencerState.channels[channel].usePolyrhythm &&
    sequencerState.channels[channel].useCustomSubdivisions
  ) {
    // Both active: create custom subdivision cells
    totalSHCells = channelSubdivisions;
  } else if (sequencerState.channels[channel].usePolyrhythm) {
    // Only polyrhythm: create global subdivision cells
    totalSHCells = sequencerState.subdivisions;
  } else {
    // Normal or custom subdivisions only
    totalSHCells = visibleSteps;
  }

  for (let i = 0; i < totalSHCells; i++) {
    const cell = document.createElement("div");
    cell.className = "sh-cell";
    cell.id = `sh-cell-${channel}-${i}`;
    cell.style.background = "#2a2a2a";
    cell.style.border = "1px solid #333";
    cell.style.borderRadius = "4px";
    cell.style.height = "100%";
    cell.style.minHeight = "30px";
    cell.style.position = "relative";
    cell.style.overflow = "hidden";

    // Hide cells beyond polyrhythmSteps when only polyrhythm is active
    if (
      sequencerState.channels[channel].usePolyrhythm &&
      !sequencerState.channels[channel].useCustomSubdivisions &&
      i >= sequencerState.channels[channel].polyrhythmSteps
    ) {
      cell.style.visibility = "hidden";
      cell.style.pointerEvents = "none";
    }

    // Create SVG for this cell
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";

    // Add center line (0V)
    const centerLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line",
    );
    centerLine.setAttribute("x1", "0");
    centerLine.setAttribute("y1", "50%");
    centerLine.setAttribute("x2", "100%");
    centerLine.setAttribute("y2", "50%");
    centerLine.setAttribute("stroke", "#444");
    centerLine.setAttribute("stroke-width", "0.5");
    centerLine.setAttribute("stroke-dasharray", "2,4");
    svg.appendChild(centerLine);

    // Apply width scaling to the value
    const scaledValue = sh.values[i] * sh.width;
    // Convert to Y percentage (0% = top/+10V, 50% = center/0V, 100% = bottom/-10V)
    const yPercent = 50 - scaledValue * 50;

    // Create the horizontal line for this value
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", `${yPercent}%`);
    line.setAttribute("x2", "100%");
    line.setAttribute("y2", `${yPercent}%`);
    line.setAttribute("stroke-width", "2");

    // Color based on value: interpolate between red (-1) and green (+1) through white (0)
    const normalizedValue = scaledValue; // -1 to 1
    let color;
    if (normalizedValue > 0) {
      // Positive: white to green
      const greenIntensity = normalizedValue;
      const r = Math.round(255 * (1 - greenIntensity));
      const g = 255;
      const b = Math.round(255 * (1 - greenIntensity) + 136 * greenIntensity);
      color = `rgb(${r}, ${g}, ${b})`;
    } else if (normalizedValue < 0) {
      // Negative: white to red
      const redIntensity = -normalizedValue;
      const r = 255;
      const g = Math.round(255 * (1 - redIntensity) + 51 * redIntensity);
      const b = Math.round(255 * (1 - redIntensity) + 102 * redIntensity);
      color = `rgb(${r}, ${g}, ${b})`;
    } else {
      // Zero: white
      color = "rgb(255, 255, 255)";
    }

    line.setAttribute("stroke", color);
    svg.appendChild(line);

    cell.appendChild(svg);
    grid.appendChild(cell);
  }

  viz.appendChild(grid);

  // Ensure container heights are correct after rendering
  requestAnimationFrame(() => {
    adjustPatternContainerHeights();
  });
}

// Update LFO visualization
function updateLFOVisualization(channel) {
  const viz = document.getElementById(`lfo-viz-${channel}`);
  const lfo = sequencerState.channels[channel].lfo;

  // Clear existing content
  viz.innerHTML = "";

  // Create canvas instead of SVG for better control over line rendering
  const canvas = document.createElement("canvas");
  canvas.width = viz.offsetWidth || 400;

  // Get height from the parent container or visualization element
  canvas.height = viz.offsetHeight || 40;

  const ctx = canvas.getContext("2d");

  // Enable anti-aliasing
  ctx.imageSmoothingEnabled = true;

  // Set line properties
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2.5; // Fixed thickness
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Generate waveform
  const segments = canvas.width;
  const centerY = canvas.height / 2;
  // At width=100%, use nearly full height (leave small margin to prevent clipping)
  const amplitude = lfo.width * (canvas.height * 0.48); // Use 48% of height for amplitude (96% total range)
  const phaseOffset = (lfo.phase || 0) * 2 * Math.PI; // Convert 0-1 to radians

  ctx.beginPath();

  for (let i = 0; i <= segments; i++) {
    const x = i;
    const normalizedX = i / segments;
    // Apply phase offset - note that one LFO period is shown, so phase affects the whole visible waveform
    const phase = normalizedX * 2 * Math.PI + phaseOffset;
    let y;

    if (lfo.waveform === "sine") {
      y = centerY - Math.sin(phase) * amplitude;
    } else {
      // Ramp with duty cycle - generate values from -1 to 1
      const cyclePos = (((phase / (2 * Math.PI)) % 1) + 1) % 1; // Ensure positive
      let normalizedValue;

      if (cyclePos < lfo.duty) {
        // Rising phase: 0 to 1 mapped to -1 to 1
        normalizedValue = (cyclePos / lfo.duty) * 2 - 1;
      } else {
        // Falling phase: 1 to 0 mapped to 1 to -1
        normalizedValue = ((1 - cyclePos) / (1 - lfo.duty)) * 2 - 1;
      }

      y = centerY - normalizedValue * amplitude;
    }

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  viz.appendChild(canvas);
}

// Build the sequencer grid
function buildGrid() {
  sequencerGrid.innerHTML = "";

  // Create step indicator row
  const indicatorRow = document.createElement("div");
  indicatorRow.className = "step-indicator-row";

  // Spacer to align with channel labels
  const spacer = document.createElement("div");
  spacer.className = "step-indicator-spacer";
  indicatorRow.appendChild(spacer);

  // Spacer for timing controls
  const spacer2 = document.createElement("div");
  indicatorRow.appendChild(spacer2);

  // Another spacer for mode controls
  const spacer3 = document.createElement("div");
  spacer3.style.width = "120px"; // Match the mode controls width
  indicatorRow.appendChild(spacer3);

  // Step indicators
  const stepIndicators = document.createElement("div");
  stepIndicators.className = "step-indicators";
  stepIndicators.style.gridTemplateColumns =
    `repeat(${sequencerState.subdivisions}, 1fr)`;

  for (let step = 0; step < sequencerState.subdivisions; step++) {
    const indicator = document.createElement("div");
    indicator.className = "step-indicator";
    indicator.id = `indicator-${step}`;
    stepIndicators.appendChild(indicator);
  }

  indicatorRow.appendChild(stepIndicators);
  sequencerGrid.appendChild(indicatorRow);

  // Create channel rows
  for (let channel = 0; channel < 8; channel++) {
    const row = document.createElement("div");
    row.className = "channel-row";

    // Get channel-specific subdivisions
    const channelSubdivisions = sequencerState.channels[channel]
        .useCustomSubdivisions
      ? sequencerState.channels[channel].subdivisions
      : sequencerState.subdivisions;

    // Channel label
    const labelContainer = document.createElement("div");
    labelContainer.className = "channel-label";

    const label = document.createElement("div");
    label.textContent = channel + 1;
    labelContainer.appendChild(label);

    row.appendChild(labelContainer);

    // Add timing controls
    const timingControls = createTimingControls(channel);
    row.appendChild(timingControls);

    // Mode controls container
    const modeControls = document.createElement("div");
    modeControls.className = "mode-controls";

    // Mode buttons container
    const modeButtons = document.createElement("div");
    modeButtons.className = "mode-buttons";

    // Three-way mode selector
    const triggerBtn = document.createElement("button");
    triggerBtn.className = "mode-selector";
    triggerBtn.textContent = "Trig";
    triggerBtn.dataset.mode = "trigger";
    if (sequencerState.channels[channel].mode === "trigger") {
      triggerBtn.classList.add("active");
    }

    const lfoBtn = document.createElement("button");
    lfoBtn.className = "mode-selector";
    lfoBtn.textContent = "LFO";
    lfoBtn.dataset.mode = "lfo";
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "lfo"
    ) {
      lfoBtn.classList.add("active");
    }

    const voctBtn = document.createElement("button");
    voctBtn.className = "mode-selector";
    voctBtn.textContent = "1V/O";
    voctBtn.dataset.mode = "1voct";
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "1voct"
    ) {
      voctBtn.classList.add("active");
    }

    const shBtn = document.createElement("button");
    shBtn.className = "mode-selector";
    shBtn.textContent = "S&H";
    shBtn.dataset.mode = "sh";
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "sh"
    ) {
      shBtn.classList.add("active");
    }

    triggerBtn.addEventListener(
      "click",
      () => setChannelMode(channel, "trigger"),
    );
    lfoBtn.addEventListener("click", () => setChannelMode(channel, "lfo"));
    voctBtn.addEventListener("click", () => setChannelMode(channel, "1voct"));
    shBtn.addEventListener("click", () => setChannelMode(channel, "sh"));

    modeButtons.appendChild(triggerBtn);
    modeButtons.appendChild(lfoBtn);
    modeButtons.appendChild(voctBtn);
    modeButtons.appendChild(shBtn);
    modeControls.appendChild(modeButtons);

    // CV parameters (initially hidden, inside mode controls)
    const cvParams = createCVParams(channel);
    modeControls.appendChild(cvParams);

    // Trigger parameters (initially hidden, inside mode controls)
    const triggerParams = createTriggerParams(channel);
    modeControls.appendChild(triggerParams);

    row.appendChild(modeControls);

    // Pattern area container
    const patternContainer = document.createElement("div");
    patternContainer.style.width = "100%";

    // Step grid for trigger mode
    const stepGrid = document.createElement("div");
    stepGrid.className = "step-grid";
    stepGrid.id = `step-grid-${channel}`;

    // Determine visible steps based on mode combination
    let visibleSteps;
    if (
      sequencerState.channels[channel].usePolyrhythm &&
      sequencerState.channels[channel].useCustomSubdivisions
    ) {
      // Both active: use custom subdivisions for cell count
      visibleSteps = channelSubdivisions;
    } else if (sequencerState.channels[channel].usePolyrhythm) {
      // Only polyrhythm: use polyrhythm steps
      visibleSteps = sequencerState.channels[channel].polyrhythmSteps;
    } else {
      // Normal or custom subdivisions only
      visibleSteps = channelSubdivisions;
    }

    if (
      sequencerState.channels[channel].usePolyrhythm &&
      sequencerState.channels[channel].useCustomSubdivisions
    ) {
      // Both active: custom subdivisions within polyrhythm width
      const polyrhythmWidth =
        (sequencerState.channels[channel].polyrhythmSteps /
          sequencerState.subdivisions) *
        100;
      stepGrid.style.gridTemplateColumns =
        `repeat(${channelSubdivisions}, 1fr)`;
      stepGrid.style.width = `${polyrhythmWidth}%`;
    } else if (sequencerState.channels[channel].usePolyrhythm) {
      // Only polyrhythm: maintain cell width from global subdivisions
      stepGrid.style.gridTemplateColumns =
        `repeat(${sequencerState.subdivisions}, 1fr)`;
      stepGrid.style.width = "100%";
    } else {
      // Normal mode or custom subdivisions only
      stepGrid.style.gridTemplateColumns = `repeat(${visibleSteps}, 1fr)`;
      stepGrid.style.width = "100%";
    }

    if (sequencerState.channels[channel].mode !== "trigger") {
      stepGrid.style.display = "none";
    }

    // Create cells based on mode
    let totalCells;
    if (
      sequencerState.channels[channel].usePolyrhythm &&
      sequencerState.channels[channel].useCustomSubdivisions
    ) {
      // Both active: create custom subdivision cells
      totalCells = channelSubdivisions;
    } else if (sequencerState.channels[channel].usePolyrhythm) {
      // Only polyrhythm: create global subdivision cells
      totalCells = sequencerState.subdivisions;
    } else {
      // Normal or custom subdivisions only
      totalCells = visibleSteps;
    }

    for (let step = 0; step < totalCells; step++) {
      const cell = document.createElement("div");
      cell.className = UI_CLASSES.STEP_CELL;
      cell.dataset.channel = channel;
      cell.dataset.step = step;
      cell.id = `cell-${channel}-${step}`;

      // Hide cells beyond polyrhythmSteps when only polyrhythm is active
      if (
        sequencerState.channels[channel].usePolyrhythm &&
        !sequencerState.channels[channel].useCustomSubdivisions &&
        step >= sequencerState.channels[channel].polyrhythmSteps
      ) {
        cell.style.visibility = "hidden";
        cell.style.pointerEvents = "none";
      }

      // Set active state from pattern
      if (sequencerState.pattern[channel][step]) {
        cell.classList.add("active");
      }

      // Mouse down - start drag
      cell.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isDragging = true;
        draggedCells.clear();

        // Toggle the clicked cell and remember its new state
        const isActive = !cell.classList.contains("active");
        dragStartState = isActive;

        cell.classList.toggle("active");
        const pattern = [...sequencerState.pattern[channel]];
        pattern[step] = isActive;
        stateManager.set(`pattern.${channel}`, pattern);
        draggedCells.add(`${channel}-${step}`);

        // Update worklet
        workletService.updatePattern(channel, step, isActive);
      });

      // Mouse enter - continue drag
      cell.addEventListener("mouseenter", () => {
        if (isDragging) {
          const cellKey = `${channel}-${step}`;

          // Only update if we haven't already dragged over this cell
          if (!draggedCells.has(cellKey)) {
            draggedCells.add(cellKey);

            // Set to the same state as the initial drag
            if (dragStartState) {
              cell.classList.add("active");
            } else {
              cell.classList.remove("active");
            }

            const pattern = [...sequencerState.pattern[channel]];
            pattern[step] = dragStartState;
            stateManager.set(`pattern.${channel}`, pattern);

            // Update worklet
            workletService.updatePattern(channel, step, dragStartState);
          }
        }
      });

      stepGrid.appendChild(cell);
    }

    // LFO visualization for CV LFO mode
    const lfoViz = document.createElement("div");
    lfoViz.className = "lfo-visualization";
    lfoViz.id = `lfo-viz-${channel}`;
    if (
      sequencerState.channels[channel].mode === CHANNEL_MODES.CV &&
      sequencerState.channels[channel].cvMode === CV_MODES.LFO
    ) {
      lfoViz.classList.add("visible");
    }

    // Pitch grid for CV 1V/Oct mode
    const pitchGrid = document.createElement("div");
    pitchGrid.className = "pitch-grid";
    pitchGrid.id = `pitch-grid-${channel}`;

    if (
      sequencerState.channels[channel].usePolyrhythm &&
      sequencerState.channels[channel].useCustomSubdivisions
    ) {
      // Both active: custom subdivisions within polyrhythm width
      const polyrhythmWidth =
        (sequencerState.channels[channel].polyrhythmSteps /
          sequencerState.subdivisions) *
        100;
      pitchGrid.style.gridTemplateColumns =
        `repeat(${channelSubdivisions}, 1fr)`;
      pitchGrid.style.width = `${polyrhythmWidth}%`;
    } else if (sequencerState.channels[channel].usePolyrhythm) {
      // Only polyrhythm: maintain cell width from global subdivisions
      pitchGrid.style.gridTemplateColumns =
        `repeat(${sequencerState.subdivisions}, 1fr)`;
      pitchGrid.style.width = "100%";
    } else {
      // Normal mode or custom subdivisions only
      pitchGrid.style.gridTemplateColumns = `repeat(${visibleSteps}, 1fr)`;
      pitchGrid.style.width = "100%";
    }

    if (
      sequencerState.channels[channel].mode === CHANNEL_MODES.CV &&
      sequencerState.channels[channel].cvMode === CV_MODES.PITCH
    ) {
      pitchGrid.classList.add("visible");
    }

    // Create cells based on mode
    let totalPitchCells;
    if (
      sequencerState.channels[channel].usePolyrhythm &&
      sequencerState.channels[channel].useCustomSubdivisions
    ) {
      // Both active: create custom subdivision cells
      totalPitchCells = channelSubdivisions;
    } else if (sequencerState.channels[channel].usePolyrhythm) {
      // Only polyrhythm: create global subdivision cells
      totalPitchCells = sequencerState.subdivisions;
    } else {
      // Normal or custom subdivisions only
      totalPitchCells = visibleSteps;
    }

    for (let step = 0; step < totalPitchCells; step++) {
      const pitchCell = document.createElement("div");
      pitchCell.className = "pitch-cell";
      pitchCell.dataset.channel = channel;
      pitchCell.dataset.step = step;
      pitchCell.id = `pitch-${channel}-${step}`;

      // Hide cells beyond polyrhythmSteps when only polyrhythm is active
      if (
        sequencerState.channels[channel].usePolyrhythm &&
        !sequencerState.channels[channel].useCustomSubdivisions &&
        step >= sequencerState.channels[channel].polyrhythmSteps
      ) {
        pitchCell.style.visibility = "hidden";
        pitchCell.style.pointerEvents = "none";
      }

      const pitchInput = document.createElement("input");
      pitchInput.type = "number";
      pitchInput.min = PITCH_CONSTANTS.MIN_SEMITONES.toString();
      pitchInput.max = PITCH_CONSTANTS.MAX_SEMITONES.toString();
      pitchInput.value = sequencerState.channels[channel].pitches[step] || "";
      pitchInput.placeholder = "-";

      pitchInput.addEventListener("input", (e) => {
        const value = e.target.value === "" ? null : parseInt(e.target.value);
        if (
          value === null ||
          (value >= PITCH_CONSTANTS.MIN_SEMITONES &&
            value <= PITCH_CONSTANTS.MAX_SEMITONES)
        ) {
          const pitches = [...sequencerState.channels[channel].pitches];
          pitches[step] = value;
          stateManager.setChannelProperty(channel, "pitches", pitches);

          // Update visual state
          if (value !== null) {
            pitchCell.classList.add("has-value");
          } else {
            pitchCell.classList.remove("has-value");
          }

          workletService.updatePitch(channel, step, value);
        }
      });

      pitchCell.appendChild(pitchInput);
      pitchGrid.appendChild(pitchCell);
    }

    // S&H visualization
    const shViz = document.createElement("div");
    shViz.className = "sh-visualization";
    shViz.id = `sh-viz-${channel}`;
    if (
      sequencerState.channels[channel].mode === CHANNEL_MODES.CV &&
      sequencerState.channels[channel].cvMode === CV_MODES.SH
    ) {
      shViz.classList.add("visible");
      // Initialize with random values
      generateSHValues(channel);
    }

    patternContainer.appendChild(stepGrid);
    patternContainer.appendChild(lfoViz);
    patternContainer.appendChild(pitchGrid);
    patternContainer.appendChild(shViz);

    row.appendChild(patternContainer);

    sequencerGrid.appendChild(row);
  }

  // After all rows are added, set pattern container heights dynamically
  // Use requestAnimationFrame to ensure DOM has rendered
  requestAnimationFrame(() => {
    adjustPatternContainerHeights();

    // Now update visualizations that need rendering
    for (let index = 0; index < 8; index++) {
      if (sequencerState.channels[index].mode === CHANNEL_MODES.CV) {
        if (sequencerState.channels[index].cvMode === CV_MODES.LFO) {
          updateLFOVisualization(index);
        } else if (sequencerState.channels[index].cvMode === CV_MODES.SH) {
          updateSHVisualization(index);
        }
      }
    }
  });
}

// Update channel subdivisions with pattern migration
function updateChannelSubdivisions(channel, newSubdivisions) {
  const oldSubdivisions = sequencerState.channels[channel].subdivisions;

  // Skip if no change
  if (oldSubdivisions === newSubdivisions) return;

  // Use transaction for atomic updates
  stateManager.transaction(() => {
    // Migrate patterns
    const newPattern = migratePattern(
      sequencerState.pattern[channel],
      oldSubdivisions,
      newSubdivisions,
    );
    stateManager.set(`pattern.${channel}`, newPattern);

    // Migrate pitches if in 1V/Oct mode
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "1voct"
    ) {
      const newPitches = migratePitches(
        sequencerState.channels[channel].pitches,
        oldSubdivisions,
        newSubdivisions,
      );
      stateManager.setChannelProperty(channel, "pitches", newPitches);
    }

    // Migrate S&H values if in S&H mode
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "sh"
    ) {
      const sh = { ...sequencerState.channels[channel].sh };
      sh.values = migrateSHValues(sh.values, oldSubdivisions, newSubdivisions);
      stateManager.setChannelProperty(channel, "sh", sh);
      // Update visualization after migration
      setTimeout(() => updateSHVisualization(channel), 0);
    }

    // Update subdivision value
    stateManager.setChannelProperty(channel, "subdivisions", newSubdivisions);
  });

  // Send update to audio processor
  if (es8Node) {
    workletService.setChannelSubdivisions(channel, newSubdivisions);

    // Re-send pattern data for this channel
    sendChannelPatternToWorklet(channel);
  }

  // Rebuild grid
  buildGrid();
}

// Send pattern data for a single channel
function sendChannelPatternToWorklet(channel) {
  if (!es8Node) return;

  const subdivisions = sequencerState.channels[channel].useCustomSubdivisions
    ? sequencerState.channels[channel].subdivisions
    : sequencerState.subdivisions;

  // Use the service to send channel pattern
  workletService.sendChannelPattern(
    channel,
    sequencerState.pattern[channel],
    subdivisions,
  );

  // Send pitch data if in 1V/Oct mode
  if (
    sequencerState.channels[channel].mode === "cv" &&
    sequencerState.channels[channel].cvMode === "1voct"
  ) {
    workletService.sendChannelPitches(
      channel,
      sequencerState.channels[channel].pitches,
      subdivisions,
    );
  }

  // Send S&H values if in S&H mode
  if (
    sequencerState.channels[channel].mode === "cv" &&
    sequencerState.channels[channel].cvMode === "sh"
  ) {
    workletService.setSHValues(
      channel,
      sequencerState.channels[channel].sh.values.slice(0, subdivisions),
    );
  }
}

// Phase-based pattern migration when subdivisions change
// Send entire pattern to worklet
function sendPatternToWorklet() {
  if (!es8Node) return;

  // Send channel configurations
  for (let channel = 0; channel < 8; channel++) {
    const channelSubdivisions = sequencerState.channels[channel]
        .useCustomSubdivisions
      ? sequencerState.channels[channel].subdivisions
      : sequencerState.subdivisions;

    // Send polyrhythm settings
    if (sequencerState.channels[channel].usePolyrhythm) {
      workletService.setPolyrhythm(
        channel,
        true,
        sequencerState.channels[channel].polyrhythmSteps,
      );
    }

    workletService.setChannelMode(
      channel,
      sequencerState.channels[channel].mode,
      sequencerState.channels[channel].cvMode,
      sequencerState.channels[channel].lfo,
      sequencerState.channels[channel].sh,
    );

    // Send trigger duration if in trigger mode
    if (sequencerState.channels[channel].mode === "trigger") {
      workletService.setTriggerDuration(
        channel,
        sequencerState.channels[channel].triggerDuration,
      );
    }

    // Send channel subdivision
    workletService.setChannelSubdivisions(channel, channelSubdivisions);

    // Send trigger patterns
    for (let step = 0; step < channelSubdivisions; step++) {
      if (sequencerState.pattern[channel][step]) {
        workletService.updatePattern(channel, step, true);
      }
    }

    // Send pitch data for 1V/Oct mode
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "1voct"
    ) {
      workletService.sendChannelPitches(
        channel,
        sequencerState.channels[channel].pitches,
        channelSubdivisions,
      );
    }

    // Send S&H values
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "sh"
    ) {
      workletService.setSHValues(
        channel,
        sequencerState.channels[channel].sh.values.slice(
          0,
          channelSubdivisions,
        ),
      );
    }
  }
}

// Latency tracking
let latencyMeasurements = [];
let measurementCount = 0;

// Update visual indicators based on worklet messages
function updateStepIndicator(step, audioTime, channel = -1) {
  // Measure latency using audio context time
  if (audioTime && audioContext) {
    const currentAudioTime = audioContext.currentTime;
    const latency = (currentAudioTime - audioTime) * 1000; // Convert to milliseconds
    latencyMeasurements.push(latency);
    measurementCount++;

    // Log average latency every 10 steps
    if (measurementCount % 10 === 0) {
      const avgLatency = latencyMeasurements.reduce((a, b) => a + b, 0) /
        latencyMeasurements.length;
      const minLatency = Math.min(...latencyMeasurements);
      const maxLatency = Math.max(...latencyMeasurements);
      // Latency tracking disabled - uncomment for debugging
      // console.log(
      //   `Audio → Display latency - Avg: ${avgLatency.toFixed(2)}ms, Min: ${
      //     minLatency.toFixed(2)
      //   }ms, Max: ${maxLatency.toFixed(2)}ms`,
      // );

      // Keep only last 100 measurements
      if (latencyMeasurements.length > 100) {
        latencyMeasurements = latencyMeasurements.slice(-100);
      }
    }
  }

  if (channel === -1) {
    // Global step indicator
    document.querySelectorAll(".step-indicator").forEach((indicator) => {
      indicator.classList.remove("active");
    });
    const currentIndicator = document.getElementById(`indicator-${step}`);
    if (currentIndicator) {
      currentIndicator.classList.add("active");
    }

    // Remove previous triggered cell highlights
    document.querySelectorAll(".step-cell.triggered").forEach((cell) => {
      cell.classList.remove("triggered");
    });

    // Highlight triggered cells in current step
    for (let ch = 0; ch < 8; ch++) {
      if (sequencerState.pattern[ch][step]) {
        const cell = document.getElementById(`cell-${ch}-${step}`);
        if (cell) {
          cell.classList.add("triggered");
        }
      }
    }
  } else {
    // Per-channel step update
    if (sequencerState.channels[channel].mode === "trigger") {
      // Trigger mode - remove previous highlight for this channel
      for (let i = 0; i < 96; i++) {
        const cell = document.getElementById(`cell-${channel}-${i}`);
        if (cell) {
          cell.classList.remove("triggered");
        }
      }

      // Highlight current step if it has a trigger
      if (sequencerState.pattern[channel][step]) {
        const cell = document.getElementById(`cell-${channel}-${step}`);
        if (cell) {
          cell.classList.add("triggered");
        }
      }
    } else if (sequencerState.channels[channel].mode === "cv") {
      if (sequencerState.channels[channel].cvMode === "sh") {
        // S&H mode highlighting
        document
          .querySelectorAll(`#sh-viz-${channel} .sh-cell`)
          .forEach((cell) => {
            cell.style.boxShadow = "";
            cell.style.borderColor = "#333";
          });

        const activeCell = document.getElementById(
          `sh-cell-${channel}-${step}`,
        );
        if (activeCell) {
          activeCell.style.boxShadow = "0 0 10px #00ff88";
          activeCell.style.borderColor = "#00ff88";
        }
      } else if (sequencerState.channels[channel].cvMode === "1voct") {
        // 1V/Oct mode highlighting
        document
          .querySelectorAll(`#pitch-grid-${channel} .pitch-cell`)
          .forEach((cell) => {
            cell.classList.remove("active");
          });

        const activePitchCell = document.getElementById(
          `pitch-${channel}-${step}`,
        );
        if (activePitchCell) {
          activePitchCell.classList.add("active");
        }
      }
    }
  }
}

// Start audio context and create nodes
startButton.addEventListener("click", async () => {
  try {
    audioContext = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 48000,
    });

    // Force the destination to use maximum channels
    console.log(
      "AudioContext max channels:",
      audioContext.destination.maxChannelCount,
    );
    audioContext.destination.channelCount =
      audioContext.destination.maxChannelCount;
    audioContext.destination.channelCountMode = "explicit";
    audioContext.destination.channelInterpretation = "discrete";

    await audioContext.audioWorklet.addModule("sequencer-processor.js");

    es8Node = new AudioWorkletNode(audioContext, "sequencer-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });

    es8Node.connect(audioContext.destination);

    // Initialize the worklet service
    workletService.initialize(es8Node);

    // Register message handlers
    workletService.onMessage(MESSAGE_TYPES.STEP_CHANGE, (message) => {
      if (message && typeof message.step !== "undefined") {
        updateStepIndicator(message.step, message.audioTime, message.channel);
      }
    });

    workletService.onMessage(MESSAGE_TYPES.SH_VALUES_UPDATED, (message) => {
      if (message && typeof message.channel !== "undefined" && message.values) {
        // Update S&H visualization when values are regenerated
        const channel = message.channel;
        sequencerState.channels[channel].sh.values = message.values;
        updateSHVisualization(channel);
      }
    });

    workletService.onMessage("log", (message) => {
      if (message && message.message) {
        console.log(`[Worklet] ${message.message}`);
      }
    });

    // Send initial configuration
    workletService.setCycleTime(sequencerState.cycleTime);
    workletService.setGlobalSubdivisions(sequencerState.subdivisions);

    // Update UI
    statusEl.textContent =
      `Connected • ${audioContext.sampleRate}Hz • ${SEQUENCER_CONSTANTS.MAX_CHANNELS} channels`;
    statusEl.classList.add("connected");
    startButton.textContent = "Connected";
    startButton.disabled = true;
    playButton.disabled = false;
    pauseButton.disabled = false;
    clearButton.disabled = false;

    buildGrid();
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    console.error(error);
  }
});

// Play/Stop button
playButton.addEventListener("click", () => {
  if (isPlaying) {
    stopSequencer();
  } else {
    startSequencer();
  }
});

// Pause button
pauseButton.addEventListener("click", () => {
  if (isPlaying) {
    pauseSequencer();
  }
});

// Clear button
clearButton.addEventListener("click", () => {
  stateManager.transaction(() => {
    // Clear all patterns
    for (
      let channel = 0;
      channel < SEQUENCER_CONSTANTS.MAX_CHANNELS;
      channel++
    ) {
      const emptyPattern = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(
        false,
      );
      stateManager.set(`pattern.${channel}`, emptyPattern);

      // Also clear pitch data
      const emptyPitches = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(
        null,
      );
      stateManager.setChannelProperty(channel, "pitches", emptyPitches);
    }
  });

  buildGrid();

  // Clear pattern in worklet
  if (es8Node) {
    workletService.clearAllPatterns();
    // Clear pitch data in worklet
    for (
      let channel = 0;
      channel < SEQUENCER_CONSTANTS.MAX_CHANNELS;
      channel++
    ) {
      for (let step = 0; step < SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS; step++) {
        workletService.updatePitch(channel, step, null);
      }
    }
  }
});

function startSequencer() {
  isPlaying = true;
  playButton.textContent = "Stop";
  playButton.classList.add("playing");

  // Generate new S&H values for channels in rand mode
  for (let channel = 0; channel < 8; channel++) {
    if (
      sequencerState.channels[channel].mode === "cv" &&
      sequencerState.channels[channel].cvMode === "sh" &&
      sequencerState.channels[channel].sh.mode === "rand"
    ) {
      generateSHValues(channel);
      updateSHVisualization(channel);
    }
  }

  // Send pattern to worklet before starting
  sendPatternToWorklet();

  // Start the worklet sequencer
  workletService.start();
}

function stopSequencer() {
  isPlaying = false;
  playButton.textContent = "Play";
  playButton.classList.remove("playing");
  pauseButton.textContent = "Pause";

  // Stop the worklet sequencer (with reset)
  workletService.stop();

  // Reset visuals
  document.querySelectorAll(".step-indicator").forEach((indicator) => {
    indicator.classList.remove("active");
  });
  document.querySelectorAll(".step-cell.triggered").forEach((cell) => {
    cell.classList.remove("triggered");
  });
}

function pauseSequencer() {
  isPlaying = false;
  playButton.textContent = "Play";
  playButton.classList.remove("playing");
  pauseButton.textContent = "Paused";

  // Send pause message to worklet (no reset)
  workletService.pause();
}

// Initialize UI subscriptions
initializeUISubscriptions();

// Initialize grid on load
buildGrid();

// Helper function to adjust pattern container heights
function adjustPatternContainerHeights() {
  const rows = document.querySelectorAll(".channel-row");
  rows.forEach((row, index) => {
    const modeControls = row.querySelector(".mode-controls");
    const patternContainer = row.lastElementChild;

    if (modeControls && patternContainer) {
      const height = modeControls.offsetHeight;
      patternContainer.style.height = `${height}px`;

      // Also update any visible visualizations
      const lfoViz = row.querySelector(`#lfo-viz-${index}`);
      const shViz = row.querySelector(`#sh-viz-${index}`);
      const pitchGrid = row.querySelector(`#pitch-grid-${index}`);
      const stepGrid = row.querySelector(`#step-grid-${index}`);

      [lfoViz, shViz, pitchGrid, stepGrid].forEach((elem) => {
        if (elem) {
          elem.style.height = `${height}px`;
        }
      });
    }
  });
}

// Global mouse up to stop dragging
document.addEventListener("mouseup", () => {
  isDragging = false;
  draggedCells.clear();
});

// Export functions for UISubscriptions
window.updateLFOVisualization = updateLFOVisualization;
window.generateSHValues = generateSHValues;
window.updateSHVisualization = updateSHVisualization;
window.adjustPatternContainerHeights = adjustPatternContainerHeights;

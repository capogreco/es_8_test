import { stateManager } from './StateManager.js';
import { CHANNEL_MODES, CV_MODES, SEQUENCER_CONSTANTS } from './constants.js';

/**
 * Set up all state subscriptions for UI updates
 * This centralizes the relationship between state changes and UI updates
 */
export function initializeUISubscriptions() {
  
  // Subscribe to channel mode changes for each channel
  for (let channel = 0; channel < SEQUENCER_CONSTANTS.MAX_CHANNELS; channel++) {
    
    // Channel mode changes
    stateManager.subscribe(`channels.${channel}.mode`, (mode) => {
      updateChannelModeUI(channel, mode);
    });
    
    // CV mode changes
    stateManager.subscribe(`channels.${channel}.cvMode`, (cvMode) => {
      const mode = stateManager.getChannelProperty(channel, 'mode');
      if (mode === CHANNEL_MODES.CV) {
        updateChannelCVModeUI(channel, cvMode);
      }
    });
    
    // Custom subdivisions changes
    stateManager.subscribe(`channels.${channel}.useCustomSubdivisions`, (useCustom) => {
      updateSubdivisionUI(channel, useCustom);
    });
    
    // LFO parameter changes
    stateManager.subscribe(`channels.${channel}.lfo`, (lfo) => {
      const mode = stateManager.getChannelProperty(channel, 'mode');
      const cvMode = stateManager.getChannelProperty(channel, 'cvMode');
      if (mode === CHANNEL_MODES.CV && cvMode === CV_MODES.LFO) {
        updateLFOVisualization(channel);
      }
    });
    
    // S&H parameter changes
    stateManager.subscribe(`channels.${channel}.sh`, (sh) => {
      const mode = stateManager.getChannelProperty(channel, 'mode');
      const cvMode = stateManager.getChannelProperty(channel, 'cvMode');
      if (mode === CHANNEL_MODES.CV && cvMode === CV_MODES.SH) {
        updateSHVisualization(channel);
      }
    });
    
    // Polyrhythm changes
    stateManager.subscribe(`channels.${channel}.polyrhythmSteps`, (steps) => {
      updateSubdivisionDisplay(channel);
    });
    
    // Polyrhythm enable/disable
    stateManager.subscribe(`channels.${channel}.usePolyrhythm`, (enabled) => {
      updateSubdivisionDisplay(channel);
    });
  }
  
  // Subscribe to global subdivision changes
  stateManager.subscribe('subdivisions', (newSubdivisions) => {
    // Update all polyrhythm inputs that are disabled
    for (let channel = 0; channel < SEQUENCER_CONSTANTS.MAX_CHANNELS; channel++) {
      const polyInput = document.querySelector(`#poly-input-${channel}`);
      const polyCheckbox = document.querySelector(`#poly-checkbox-${channel}`);
      
      if (polyInput && polyCheckbox && !polyCheckbox.checked) {
        polyInput.value = newSubdivisions;
        polyInput.max = newSubdivisions;
      }
    }
  });
  
  // Global UI update functions
  window.updateChannelModeUI = updateChannelModeUI;
  window.updateChannelCVModeUI = updateChannelCVModeUI;
  window.updateSubdivisionUI = updateSubdivisionUI;
}

function updateChannelModeUI(channel, mode) {
  const rows = document.querySelectorAll(".channel-row");
  const row = rows[channel];
  if (!row) return;
  
  const triggerBtn = row.querySelector('.mode-selector[data-mode="trigger"]');
  const lfoBtn = row.querySelector('.mode-selector[data-mode="lfo"]');
  const voctBtn = row.querySelector('.mode-selector[data-mode="1voct"]');
  const shBtn = row.querySelector('.mode-selector[data-mode="sh"]');
  const stepGrid = document.getElementById(`step-grid-${channel}`);
  const lfoViz = document.getElementById(`lfo-viz-${channel}`);
  const pitchGrid = document.getElementById(`pitch-grid-${channel}`);
  const shViz = document.getElementById(`sh-viz-${channel}`);
  const cvParams = document.getElementById(`cv-params-${channel}`);
  
  // Clear all active states
  [triggerBtn, lfoBtn, voctBtn, shBtn].forEach(btn => {
    if (btn) btn.classList.remove("active");
  });
  
  // Show/hide appropriate UI elements based on mode
  if (mode === CHANNEL_MODES.TRIGGER) {
    if (triggerBtn) triggerBtn.classList.add("active");
    if (stepGrid) stepGrid.style.display = "";
    if (lfoViz) lfoViz.classList.remove("visible");
    if (pitchGrid) pitchGrid.classList.remove("visible");
    if (shViz) shViz.classList.remove("visible");
    if (cvParams) cvParams.classList.remove("visible");
  }
}

function updateChannelCVModeUI(channel, cvMode) {
  const rows = document.querySelectorAll(".channel-row");
  const row = rows[channel];
  if (!row) return;
  
  const lfoBtn = row.querySelector('.mode-selector[data-mode="lfo"]');
  const voctBtn = row.querySelector('.mode-selector[data-mode="1voct"]');
  const shBtn = row.querySelector('.mode-selector[data-mode="sh"]');
  const stepGrid = document.getElementById(`step-grid-${channel}`);
  const lfoViz = document.getElementById(`lfo-viz-${channel}`);
  const pitchGrid = document.getElementById(`pitch-grid-${channel}`);
  const shViz = document.getElementById(`sh-viz-${channel}`);
  const cvParams = document.getElementById(`cv-params-${channel}`);
  const lfoParams = row.querySelector(".lfo-params");
  const shParams = row.querySelector(".sh-params");
  
  // Clear CV mode buttons
  [lfoBtn, voctBtn, shBtn].forEach(btn => {
    if (btn) btn.classList.remove("active");
  });
  
  // Hide step grid for CV modes
  if (stepGrid) stepGrid.style.display = "none";
  
  // Show appropriate CV mode UI
  switch (cvMode) {
    case CV_MODES.LFO:
      if (lfoBtn) lfoBtn.classList.add("active");
      if (lfoViz) lfoViz.classList.add("visible");
      if (pitchGrid) pitchGrid.classList.remove("visible");
      if (shViz) shViz.classList.remove("visible");
      if (cvParams) cvParams.classList.add("visible");
      if (lfoParams) lfoParams.style.display = "flex";
      if (shParams) shParams.style.display = "none";
      // Import updateLFOVisualization from sequencer.js
      if (window.updateLFOVisualization) {
        window.updateLFOVisualization(channel);
      }
      break;
      
    case CV_MODES.PITCH:
      if (voctBtn) voctBtn.classList.add("active");
      if (lfoViz) lfoViz.classList.remove("visible");
      if (pitchGrid) pitchGrid.classList.add("visible");
      if (shViz) shViz.classList.remove("visible");
      if (cvParams) cvParams.classList.remove("visible");
      break;
      
    case CV_MODES.SH:
      if (shBtn) shBtn.classList.add("active");
      if (lfoViz) lfoViz.classList.remove("visible");
      if (pitchGrid) pitchGrid.classList.remove("visible");
      if (shViz) shViz.classList.add("visible");
      if (cvParams) cvParams.classList.add("visible");
      if (lfoParams) lfoParams.style.display = "none";
      if (shParams) shParams.style.display = "flex";
      // Import generateSHValues and updateSHVisualization from sequencer.js
      if (window.generateSHValues) {
        window.generateSHValues(channel);
      }
      if (window.updateSHVisualization) {
        window.updateSHVisualization(channel);
      }
      break;
  }
  
  // Adjust container heights after mode change
  if (window.adjustPatternContainerHeights) {
    requestAnimationFrame(() => {
      window.adjustPatternContainerHeights();
    });
  }
}

function updateSubdivisionUI(channel, useCustom) {
  // This will be called when custom subdivisions are toggled
  updateSubdivisionDisplay(channel);
}

function updateSubdivisionDisplay(channel) {
  // Update the subdivision input value
  const subdivInput = document.querySelector(`#subdiv-input-${channel}`);
  if (!subdivInput) return;
  
  const useCustom = stateManager.getChannelProperty(channel, 'useCustomSubdivisions');
  const usePolyrhythm = stateManager.getChannelProperty(channel, 'usePolyrhythm');
  const polyrhythmSteps = stateManager.getChannelProperty(channel, 'polyrhythmSteps');
  const globalSubdivisions = stateManager.get('subdivisions');
  
  // Determine what subdivision value to show
  let subdivisions;
  if (!useCustom && usePolyrhythm) {
    // When custom subdivisions are disabled and polyrhythm is active,
    // show the polyrhythm value
    subdivisions = polyrhythmSteps;
  } else {
    subdivisions = stateManager.getChannelProperty(channel, 'subdivisions');
  }
  
  subdivInput.value = subdivisions;
  
  // Also update polyrhythm input
  const polyInput = document.querySelector(`#poly-input-${channel}`);
  if (polyInput) {
    // When polyrhythm is disabled, show global subdivisions
    polyInput.value = usePolyrhythm ? polyrhythmSteps : globalSubdivisions;
  }
}
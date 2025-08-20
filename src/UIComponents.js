import { 
  CHANNEL_MODES, 
  CV_MODES, 
  LFO_WAVEFORMS, 
  SH_MODES,
  SEQUENCER_CONSTANTS,
  TRIGGER_DURATIONS
} from "./constants.js";
import { Visualizations } from "./Visualizations.js";

export class UIComponents {
  static createChannelRow(channel, state) {
    const channelState = state.channels[channel];
    const effectiveSubdivisions = this.getEffectiveSubdivisions(channel, state);
    
    const channelDiv = document.createElement("div");
    channelDiv.className = "channel";
    channelDiv.dataset.channel = channel;
    
    channelDiv.innerHTML = `
      <div class="channel-header">
        <div class="channel-label">CH ${channel + 1}</div>
        <div class="mode-selector">
          ${this.createModeButtons(channel, channelState.mode)}
        </div>
      </div>
      <div class="channel-content">
        ${this.createChannelContent(channel, channelState, state, effectiveSubdivisions)}
      </div>
    `;
    
    return channelDiv;
  }

  static createModeButtons(channel, currentMode) {
    return Object.values(CHANNEL_MODES).map(mode => `
      <button class="mode-btn ${currentMode === mode ? 'active' : ''}" 
              data-mode="${mode}">
        ${mode.charAt(0).toUpperCase() + mode.slice(1)}
      </button>
    `).join("");
  }

  static createChannelContent(channel, channelState, state, effectiveSubdivisions) {
    const content = [];
    
    // Add parameter controls based on mode
    if (channelState.mode === CHANNEL_MODES.TRIGGER) {
      content.push(this.createTriggerParams(channel, channelState));
    } else if (channelState.mode === CHANNEL_MODES.CV) {
      content.push(this.createCVParams(channel, channelState, effectiveSubdivisions));
    }
    
    // Add pattern grid
    content.push(this.createPatternGrid(channel, channelState, state, effectiveSubdivisions));
    
    return content.join("");
  }

  static createTriggerParams(channel, channelState) {
    return `
      <div class="trigger-params">
        <div class="param-group">
          <label>Duration:</label>
          <select class="trigger-duration-select">
            ${TRIGGER_DURATIONS.map(dur => `
              <option value="${dur.value}" 
                      ${channelState.triggerDuration === dur.value ? 'selected' : ''}>
                ${dur.label}
              </option>
            `).join("")}
          </select>
        </div>
        <div class="param-group">
          <label class="checkbox-label">
            <input type="checkbox" 
                   class="subdivision-toggle" 
                   ${channelState.useCustomSubdivisions ? 'checked' : ''}>
            Custom Subdivisions
          </label>
          ${channelState.useCustomSubdivisions ? `
            <input type="number" 
                   class="subdivisions-input" 
                   value="${channelState.subdivisions}" 
                   min="2" max="24">
          ` : ''}
        </div>
        <div class="param-group">
          <label class="checkbox-label">
            <input type="checkbox" 
                   class="polyrhythm-toggle" 
                   ${channelState.usePolyrhythm ? 'checked' : ''}>
            Polyrhythm
          </label>
          ${channelState.usePolyrhythm ? `
            <input type="number" 
                   class="polyrhythm-steps-input" 
                   value="${channelState.polyrhythmSteps}" 
                   min="2" max="24">
          ` : ''}
        </div>
      </div>
    `;
  }

  static createCVParams(channel, channelState, effectiveSubdivisions) {
    const cvModeButtons = Object.values(CV_MODES).map(mode => `
      <button class="cv-mode-btn ${channelState.cvMode === mode ? 'active' : ''}" 
              data-cv-mode="${mode}">
        ${mode.toUpperCase()}
      </button>
    `).join("");

    let paramContent = '';
    
    if (channelState.cvMode === CV_MODES.LFO) {
      paramContent = this.createLFOParams(channel, channelState.lfo, effectiveSubdivisions);
    } else if (channelState.cvMode === CV_MODES.SH) {
      paramContent = this.createSHParams(channel, channelState.sh);
    } else if (channelState.cvMode === CV_MODES.PITCH) {
      paramContent = this.createPitchParams(channel, channelState);
    }

    return `
      <div class="cv-params">
        <div class="cv-mode-selector">${cvModeButtons}</div>
        ${paramContent}
      </div>
    `;
  }

  static createLFOParams(channel, lfo, subdivisions) {
    const visualization = Visualizations.createLFOVisualization(channel, lfo, subdivisions);
    
    return `
      <div class="lfo-params">
        <div class="param-row">
          <div class="param-group">
            <label>Waveform:</label>
            <select class="waveform-select">
              ${Object.values(LFO_WAVEFORMS).map(wf => `
                <option value="${wf}" ${lfo.waveform === wf ? 'selected' : ''}>
                  ${wf.charAt(0).toUpperCase() + wf.slice(1)}
                </option>
              `).join("")}
            </select>
          </div>
          <div class="param-group">
            <label>Rate: <span class="param-value">${lfo.rate}</span></label>
            <input type="range" class="lfo-rate" min="1" max="16" value="${lfo.rate}">
          </div>
          <div class="param-group">
            <label>Duty: <span class="param-value">${lfo.duty}%</span></label>
            <input type="range" class="lfo-duty" min="0" max="100" value="${lfo.duty}">
          </div>
          <div class="param-group">
            <label>Width: <span class="param-value">${lfo.width}%</span></label>
            <input type="range" class="lfo-width" min="0" max="100" value="${lfo.width}">
          </div>
        </div>
        ${visualization.outerHTML}
      </div>
    `;
  }

  static createSHParams(channel, sh) {
    const visualization = Visualizations.createSHVisualization(
      channel, 
      sh.values, 
      sh.mode, 
      sh.width
    );
    
    return `
      <div class="sh-params">
        <div class="param-row">
          <div class="param-group">
            <label>Mode:</label>
            <select class="sh-mode-select">
              ${Object.values(SH_MODES).map(mode => `
                <option value="${mode}" ${sh.mode === mode ? 'selected' : ''}>
                  ${mode.charAt(0).toUpperCase() + mode.slice(1)}
                </option>
              `).join("")}
            </select>
          </div>
          <div class="param-group">
            <label>Width: <span class="param-value">${sh.width}%</span></label>
            <input type="range" class="sh-width" min="0" max="100" value="${sh.width}">
          </div>
        </div>
        ${visualization.outerHTML}
      </div>
    `;
  }

  static createPitchParams(channel, channelState) {
    return `
      <div class="pitch-params">
        <div class="param-group">
          <label class="checkbox-label">
            <input type="checkbox" 
                   class="subdivision-toggle" 
                   ${channelState.useCustomSubdivisions ? 'checked' : ''}>
            Custom Subdivisions
          </label>
          ${channelState.useCustomSubdivisions ? `
            <input type="number" 
                   class="subdivisions-input" 
                   value="${channelState.subdivisions}" 
                   min="2" max="24">
          ` : ''}
        </div>
      </div>
    `;
  }

  static createPatternGrid(channel, channelState, state, effectiveSubdivisions) {
    const gridType = this.getGridType(channelState);
    const gridContent = this.createGridCells(
      channel, 
      channelState, 
      state, 
      effectiveSubdivisions, 
      gridType
    );
    
    return `
      <div class="pattern-grid ${gridType}-grid" data-grid-type="${gridType}">
        ${gridContent}
      </div>
    `;
  }

  static createGridCells(channel, channelState, state, subdivisions, gridType) {
    const cells = [];
    
    for (let i = 0; i < subdivisions; i++) {
      if (gridType === 'trigger') {
        const isActive = state.pattern[channel][i];
        cells.push(`
          <button class="step-btn ${isActive ? 'active' : ''}" 
                  data-channel="${channel}" 
                  data-step="${i}">
            ${i + 1}
          </button>
        `);
      } else if (gridType === 'pitch') {
        const pitchValue = channelState.pitches?.[i] || "";
        cells.push(`
          <input type="number" 
                 class="pitch-input" 
                 data-channel="${channel}" 
                 data-step="${i}"
                 value="${pitchValue}" 
                 min="-120" 
                 max="120" 
                 placeholder="0">
        `);
      } else if (gridType === 'sh') {
        // S&H grid shows visual representation only
        cells.push(`
          <div class="sh-step" data-step="${i}">
            ${i + 1}
          </div>
        `);
      }
    }
    
    return cells.join("");
  }

  static getGridType(channelState) {
    if (channelState.mode === CHANNEL_MODES.TRIGGER) {
      return 'trigger';
    } else if (channelState.mode === CHANNEL_MODES.CV) {
      if (channelState.cvMode === CV_MODES.PITCH) {
        return 'pitch';
      } else if (channelState.cvMode === CV_MODES.SH) {
        return 'sh';
      }
    }
    return 'trigger'; // default
  }

  static getEffectiveSubdivisions(channel, state) {
    const channelState = state.channels[channel];
    
    if (channelState.usePolyrhythm) {
      return channelState.polyrhythmSteps;
    } else if (channelState.useCustomSubdivisions) {
      return channelState.subdivisions;
    } else {
      return state.subdivisions;
    }
  }

  static createTimingControls(state) {
    return `
      <div class="timing-controls">
        <div class="control-group">
          <label for="subdivisions">
            Subdivisions: <span id="subdivisionValue">${state.subdivisions}</span>
          </label>
          <input type="range" 
                 id="subdivisions" 
                 min="2" 
                 max="24" 
                 value="${state.subdivisions}">
        </div>
        <div class="control-group">
          <label for="cycleTime">
            Cycle Time: <span id="cycleTimeValue">${state.cycleTime.toFixed(1)}s</span>
          </label>
          <input type="range" 
                 id="cycleTime" 
                 min="0.5" 
                 max="8" 
                 step="0.1" 
                 value="${state.cycleTime}">
        </div>
      </div>
    `;
  }

  static createTransportControls() {
    return `
      <div class="transport-controls">
        <button id="playButton" class="transport-btn">Play</button>
        <button id="clearButton" class="transport-btn">Clear</button>
      </div>
    `;
  }
}
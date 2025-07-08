import { 
  UI_CLASSES, 
  CHANNEL_MODES, 
  CV_MODES,
  LFO_WAVEFORMS,
  SH_MODES,
  PITCH_CONSTANTS,
  SEQUENCER_CONSTANTS
} from './constants.js';

/**
 * UI Component Factory
 * Provides standardized methods for creating UI elements
 * Ensures consistency across the application
 */

/**
 * Create a button element with standard styling
 * @param {Object} options - Button configuration
 * @returns {HTMLButtonElement}
 */
export function createButton({ text, className, dataAttributes = {}, onClick }) {
  const button = document.createElement('button');
  button.textContent = text;
  if (className) button.className = className;
  
  // Add data attributes
  Object.entries(dataAttributes).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  
  if (onClick) {
    button.addEventListener('click', onClick);
  }
  
  return button;
}

/**
 * Create a mode selector button
 * @param {Object} options - Mode selector configuration
 * @returns {HTMLButtonElement}
 */
export function createModeButton({ mode, text, isActive = false, onClick }) {
  return createButton({
    text,
    className: `mode-selector${isActive ? ' active' : ''}`,
    dataAttributes: { mode },
    onClick
  });
}

/**
 * Create a slider input with label and value display
 * @param {Object} options - Slider configuration
 * @returns {HTMLDivElement} Container with slider and associated elements
 */
export function createSlider({ 
  id, 
  label, 
  min, 
  max, 
  value, 
  step = 1, 
  onChange,
  displayFormatter = (v) => v
}) {
  const container = document.createElement('div');
  container.className = 'parameter';
  
  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.min = min;
  slider.max = max;
  slider.value = value;
  slider.step = step;
  
  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = displayFormatter(value);
  
  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valueDisplay.textContent = displayFormatter(val);
    if (onChange) onChange(val);
  });
  
  container.appendChild(labelEl);
  container.appendChild(slider);
  container.appendChild(valueDisplay);
  
  return { container, slider, valueDisplay };
}

/**
 * Create a dropdown select element
 * @param {Object} options - Dropdown configuration
 * @returns {HTMLDivElement} Container with select element
 */
export function createDropdown({ id, label, options, value, onChange }) {
  const container = document.createElement('div');
  container.className = 'parameter';
  
  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  
  const select = document.createElement('select');
  select.id = id;
  
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    if (opt.value === value) option.selected = true;
    select.appendChild(option);
  });
  
  if (onChange) {
    select.addEventListener('change', (e) => onChange(e.target.value));
  }
  
  container.appendChild(labelEl);
  container.appendChild(select);
  
  return { container, select };
}

/**
 * Create LFO parameter controls
 * @param {number} channel - Channel index
 * @param {Object} lfo - LFO configuration
 * @param {Function} onUpdate - Callback for parameter updates
 * @returns {HTMLDivElement}
 */
export function createLFOParams(channel, lfo, onUpdate) {
  const container = document.createElement('div');
  container.className = 'lfo-params';
  
  // Waveform selector
  const waveformDropdown = createDropdown({
    id: `lfo-waveform-${channel}`,
    label: 'Waveform',
    options: [
      { value: LFO_WAVEFORMS.SINE, text: 'Sine' },
      { value: LFO_WAVEFORMS.RAMP, text: 'Ramp' }
    ],
    value: lfo.waveform,
    onChange: (value) => onUpdate('waveform', value)
  });
  
  // Rate slider
  const rateSlider = createSlider({
    id: `lfo-rate-${channel}`,
    label: 'Rate',
    min: 0.01,
    max: 10,
    step: 0.01,
    value: lfo.rate,
    displayFormatter: (v) => `${v.toFixed(2)} Hz`,
    onChange: (value) => onUpdate('rate', value)
  });
  
  // Depth slider
  const depthSlider = createSlider({
    id: `lfo-depth-${channel}`,
    label: 'Depth',
    min: 0,
    max: 1,
    step: 0.01,
    value: lfo.depth,
    displayFormatter: (v) => `${(v * 100).toFixed(0)}%`,
    onChange: (value) => onUpdate('depth', value)
  });
  
  // Duty cycle (only for ramp)
  const dutyContainer = document.createElement('div');
  dutyContainer.id = `duty-param-${channel}`;
  dutyContainer.style.display = lfo.waveform === LFO_WAVEFORMS.RAMP ? 'grid' : 'none';
  
  const dutySlider = createSlider({
    id: `lfo-duty-${channel}`,
    label: 'Duty',
    min: 0.01,
    max: 0.99,
    step: 0.01,
    value: lfo.duty,
    displayFormatter: (v) => `${(v * 100).toFixed(0)}%`,
    onChange: (value) => onUpdate('duty', value)
  });
  
  dutyContainer.appendChild(dutySlider.container);
  
  // Phase offset slider
  const phaseSlider = createSlider({
    id: `lfo-phase-${channel}`,
    label: 'Phase',
    min: 0,
    max: 1,
    step: 0.01,
    value: lfo.phase || 0,
    displayFormatter: (v) => `${(v * 360).toFixed(0)}°`,
    onChange: (value) => onUpdate('phase', value)
  });
  
  container.appendChild(waveformDropdown.container);
  container.appendChild(rateSlider.container);
  container.appendChild(depthSlider.container);
  container.appendChild(phaseSlider.container);
  container.appendChild(dutyContainer);
  
  return container;
}

/**
 * Create S&H parameter controls
 * @param {number} channel - Channel index
 * @param {Object} sh - S&H configuration
 * @param {Function} onUpdate - Callback for parameter updates
 * @returns {HTMLDivElement}
 */
export function createSHParams(channel, sh, onUpdate) {
  const container = document.createElement('div');
  container.className = 'sh-params';
  container.style.display = 'none'; // Hidden by default
  
  // Mode selector
  const modeDropdown = createDropdown({
    id: `sh-mode-${channel}`,
    label: 'Mode',
    options: [
      { value: SH_MODES.STATIC, text: 'Static' },
      { value: SH_MODES.RANDOM, text: 'Random' }
    ],
    value: sh.mode,
    onChange: (value) => onUpdate('mode', value)
  });
  
  // Width slider
  const widthSlider = createSlider({
    id: `sh-width-${channel}`,
    label: 'Width',
    min: 1,
    max: 96,
    step: 1,
    value: sh.width,
    displayFormatter: (v) => `${v} steps`,
    onChange: (value) => onUpdate('width', value)
  });
  
  container.appendChild(modeDropdown.container);
  container.appendChild(widthSlider.container);
  
  return container;
}

/**
 * Create subdivision info badge
 * @param {number} channel - Channel index
 * @param {number} subdivisions - Current subdivisions
 * @param {boolean} isCustom - Whether using custom subdivisions
 * @param {Function} onClick - Click handler
 * @returns {HTMLDivElement}
 */
export function createSubdivisionBadge(channel, subdivisions, isCustom, onClick) {
  const container = document.createElement('div');
  container.className = 'subdiv-info';
  container.id = `subdivInfo-${channel}`;
  container.textContent = `${subdivisions}`;
  container.title = 'Click to toggle custom subdivisions';
  
  if (isCustom) {
    container.style.color = '#00ff88';
    container.style.background = 'rgba(0, 255, 136, 0.1)';
  } else {
    container.style.color = '#666';
    container.style.background = 'rgba(0, 0, 0, 0.5)';
  }
  
  if (onClick) {
    container.addEventListener('click', onClick);
  }
  
  return container;
}

/**
 * Create step grid for trigger mode
 * @param {number} channel - Channel index
 * @param {number} subdivisions - Number of subdivisions
 * @param {Array<boolean>} pattern - Pattern data
 * @param {Object} handlers - Event handlers
 * @returns {HTMLDivElement}
 */
export function createStepGrid(channel, subdivisions, pattern, handlers) {
  const grid = document.createElement('div');
  grid.className = 'step-grid';
  grid.id = `step-grid-${channel}`;
  grid.style.gridTemplateColumns = `repeat(${subdivisions}, 1fr)`;
  
  for (let step = 0; step < subdivisions; step++) {
    const cell = document.createElement('div');
    cell.className = UI_CLASSES.STEP_CELL;
    cell.dataset.channel = channel;
    cell.dataset.step = step;
    cell.id = `cell-${channel}-${step}`;
    
    if (pattern[step]) {
      cell.classList.add('active');
    }
    
    // Add step indicator for first row
    if (channel === 0) {
      const indicator = document.createElement('div');
      indicator.className = UI_CLASSES.STEP_INDICATOR;
      indicator.id = `indicator-${step}`;
      cell.appendChild(indicator);
    }
    
    // Attach event handlers
    if (handlers.onMouseDown) {
      cell.addEventListener('mousedown', handlers.onMouseDown);
    }
    if (handlers.onMouseEnter) {
      cell.addEventListener('mouseenter', handlers.onMouseEnter);
    }
    
    grid.appendChild(cell);
  }
  
  return grid;
}

/**
 * Create pitch grid for 1V/Oct mode
 * @param {number} channel - Channel index
 * @param {number} subdivisions - Number of subdivisions
 * @param {Array<number|null>} pitches - Pitch data
 * @param {Function} onPitchChange - Pitch change handler
 * @returns {HTMLDivElement}
 */
export function createPitchGrid(channel, subdivisions, pitches, onPitchChange) {
  const grid = document.createElement('div');
  grid.className = 'pitch-grid';
  grid.id = `pitch-grid-${channel}`;
  
  for (let step = 0; step < subdivisions; step++) {
    const cell = document.createElement('div');
    cell.className = 'pitch-cell';
    cell.id = `pitch-cell-${channel}-${step}`;
    
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'pitch-input';
    input.min = PITCH_CONSTANTS.MIN_SEMITONES;
    input.max = PITCH_CONSTANTS.MAX_SEMITONES;
    input.value = pitches[step] || '';
    input.placeholder = '-';
    
    if (pitches[step] !== null) {
      cell.classList.add('has-value');
    }
    
    input.addEventListener('input', (e) => {
      const value = e.target.value === '' ? null : parseInt(e.target.value);
      if (value === null || (value >= PITCH_CONSTANTS.MIN_SEMITONES && value <= PITCH_CONSTANTS.MAX_SEMITONES)) {
        onPitchChange(step, value);
        
        if (value !== null) {
          cell.classList.add('has-value');
        } else {
          cell.classList.remove('has-value');
        }
      }
    });
    
    cell.appendChild(input);
    grid.appendChild(cell);
  }
  
  return grid;
}

/**
 * Create LFO visualization
 * @param {number} channel - Channel index
 * @returns {Object} Canvas and context
 */
export function createLFOVisualization(channel) {
  const container = document.createElement('div');
  container.className = 'lfo-visualization';
  container.id = `lfo-viz-${channel}`;
  
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 60;
  const ctx = canvas.getContext('2d');
  
  container.appendChild(canvas);
  
  return { container, canvas, ctx };
}

/**
 * Create S&H visualization
 * @param {number} channel - Channel index
 * @returns {HTMLDivElement}
 */
export function createSHVisualization(channel) {
  const container = document.createElement('div');
  container.className = 'sh-visualization';
  container.id = `sh-viz-${channel}`;
  
  return container;
}
let audioContext;
let es8Node;
let isPlaying = false;
let currentStep = -1;

// Sequencer state
const sequencerState = {
  subdivisions: 8,
  cycleTime: 2.0, // seconds
  pattern: Array(8).fill(null).map(() => Array(24).fill(false)),
  channels: Array(8).fill(null).map(() => ({
    mode: 'trigger', // 'trigger' or 'cv'
    cvMode: 'lfo', // 'lfo' or '1voct' or 'sh'
    lfo: {
      waveform: 'ramp', // 'ramp' or 'sine'
      rate: 1, // sub-cycles per pattern
      duty: 0.5, // 0-1 (for ramp only)
      width: 1.0 // 0-1 (amplitude)
    },
    pitches: Array(24).fill(null), // null or -36 to +36
    sh: {
      mode: 'rand', // 'rand' or 'shuf'
      width: 1.0, // 0-1 (amplitude)
      values: Array(24).fill(0) // Random values for each step
    }
  }))
};

// UI Elements
const startButton = document.getElementById('startButton');
const playButton = document.getElementById('playButton');
const clearButton = document.getElementById('clearButton');
const statusEl = document.getElementById('status');
const cycleTimeSlider = document.getElementById('cycleTime');
const cycleTimeValue = document.getElementById('cycleTimeValue');
const subdivisionsSlider = document.getElementById('subdivisions');
const subdivisionsValue = document.getElementById('subdivisionsValue');
const sequencerGrid = document.getElementById('sequencerGrid');

// Initialize UI
cycleTimeSlider.addEventListener('input', (e) => {
  sequencerState.cycleTime = parseFloat(e.target.value);
  cycleTimeValue.textContent = `${sequencerState.cycleTime.toFixed(1)}s`;
  
  if (es8Node) {
    es8Node.port.postMessage({ 
      type: 'setCycleTime', 
      data: sequencerState.cycleTime 
    });
  }
});

subdivisionsSlider.addEventListener('input', (e) => {
  sequencerState.subdivisions = parseInt(e.target.value);
  subdivisionsValue.textContent = sequencerState.subdivisions;
  buildGrid();
  
  if (es8Node) {
    es8Node.port.postMessage({ 
      type: 'setSubdivisions', 
      data: sequencerState.subdivisions 
    });
    // Re-send pattern after subdivision change
    sendPatternToWorklet();
  }
});

// Drag state
let isDragging = false;
let dragStartState = null;
let draggedCells = new Set();

// Create CV parameter controls
function createCVParams(channel) {
  const container = document.createElement('div');
  container.className = 'cv-params';
  container.id = `cv-params-${channel}`;
  
  // Only show for LFO and S&H modes
  if (sequencerState.channels[channel].mode === 'cv' && 
      (sequencerState.channels[channel].cvMode === 'lfo' || sequencerState.channels[channel].cvMode === 'sh')) {
    container.classList.add('visible');
  }
  
  // LFO parameters
  const lfoParams = document.createElement('div');
  lfoParams.className = 'lfo-params';
  lfoParams.style.display = sequencerState.channels[channel].cvMode === 'lfo' ? 'flex' : 'none';
  lfoParams.style.flexDirection = 'column';
  lfoParams.style.gap = '5px';
  
  // Waveform selector
  const waveParam = document.createElement('div');
  waveParam.className = 'cv-param';
  const waveLabel = document.createElement('label');
  waveLabel.textContent = 'Wave';
  waveParam.appendChild(waveLabel);
  const waveSelect = document.createElement('select');
  waveSelect.innerHTML = `
    <option value="ramp">Ramp</option>
    <option value="sine">Sine</option>
  `;
  waveSelect.value = sequencerState.channels[channel].lfo.waveform;
  waveSelect.addEventListener('change', (e) => updateLFO(channel, 'waveform', e.target.value));
  waveParam.appendChild(waveSelect);
  lfoParams.appendChild(waveParam);
  
  // Rate control
  const rateParam = document.createElement('div');
  rateParam.className = 'cv-param';
  const rateLabel = document.createElement('label');
  rateLabel.textContent = 'Rate';
  const rateValue = document.createElement('span');
  rateValue.className = 'value';
  rateValue.textContent = sequencerState.channels[channel].lfo.rate;
  const rateInput = document.createElement('input');
  rateInput.type = 'range';
  rateInput.min = '1';
  rateInput.max = '16';
  rateInput.step = '1';
  rateInput.value = sequencerState.channels[channel].lfo.rate;
  rateInput.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    rateValue.textContent = value;
    updateLFO(channel, 'rate', value);
  });
  rateParam.appendChild(rateLabel);
  rateParam.appendChild(rateValue);
  rateParam.appendChild(rateInput);
  lfoParams.appendChild(rateParam);
  
  // Duty cycle (for ramp only)
  const dutyParam = document.createElement('div');
  dutyParam.className = 'cv-param';
  dutyParam.id = `duty-param-${channel}`;
  dutyParam.style.display = sequencerState.channels[channel].lfo.waveform === 'ramp' ? 'grid' : 'none';
  const dutyLabel = document.createElement('label');
  dutyLabel.textContent = 'Duty';
  const dutyValue = document.createElement('span');
  dutyValue.className = 'value';
  dutyValue.textContent = (sequencerState.channels[channel].lfo.duty * 100).toFixed(0) + '%';
  const dutyInput = document.createElement('input');
  dutyInput.type = 'range';
  dutyInput.min = '0';
  dutyInput.max = '1';
  dutyInput.step = '0.01';
  dutyInput.value = sequencerState.channels[channel].lfo.duty;
  dutyInput.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    dutyValue.textContent = (value * 100).toFixed(0) + '%';
    updateLFO(channel, 'duty', value);
  });
  dutyParam.appendChild(dutyLabel);
  dutyParam.appendChild(dutyValue);
  dutyParam.appendChild(dutyInput);
  lfoParams.appendChild(dutyParam);
  
  // Width/amplitude
  const widthParam = document.createElement('div');
  widthParam.className = 'cv-param';
  const widthLabel = document.createElement('label');
  widthLabel.textContent = 'Width';
  const widthValue = document.createElement('span');
  widthValue.className = 'value';
  widthValue.textContent = (sequencerState.channels[channel].lfo.width * 100).toFixed(0) + '%';
  const widthInput = document.createElement('input');
  widthInput.type = 'range';
  widthInput.min = '0';
  widthInput.max = '1';
  widthInput.step = '0.01';
  widthInput.value = sequencerState.channels[channel].lfo.width;
  widthInput.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    widthValue.textContent = (value * 100).toFixed(0) + '%';
    updateLFO(channel, 'width', value);
  });
  widthParam.appendChild(widthLabel);
  widthParam.appendChild(widthValue);
  widthParam.appendChild(widthInput);
  lfoParams.appendChild(widthParam);
  
  container.appendChild(lfoParams);
  
  // S&H parameters
  const shParams = document.createElement('div');
  shParams.className = 'sh-params';
  shParams.style.display = sequencerState.channels[channel].cvMode === 'sh' ? 'flex' : 'none';
  shParams.style.flexDirection = 'column';
  shParams.style.gap = '5px';
  
  // S&H mode selector
  const shModeParam = document.createElement('div');
  shModeParam.className = 'cv-param';
  const shModeLabel = document.createElement('label');
  shModeLabel.textContent = 'Mode';
  const shModeSelect = document.createElement('select');
  shModeSelect.innerHTML = `
    <option value="rand">Rand</option>
    <option value="shuf">Shuf</option>
  `;
  shModeSelect.value = sequencerState.channels[channel].sh.mode;
  shModeSelect.addEventListener('change', (e) => updateSH(channel, 'mode', e.target.value));
  shModeParam.appendChild(shModeLabel);
  shModeParam.appendChild(shModeSelect);
  shParams.appendChild(shModeParam);
  
  // S&H width control
  const shWidthParam = document.createElement('div');
  shWidthParam.className = 'cv-param';
  const shWidthLabel = document.createElement('label');
  shWidthLabel.textContent = 'Width';
  const shWidthValue = document.createElement('span');
  shWidthValue.className = 'value';
  shWidthValue.textContent = (sequencerState.channels[channel].sh.width * 100).toFixed(0) + '%';
  const shWidthInput = document.createElement('input');
  shWidthInput.type = 'range';
  shWidthInput.min = '0';
  shWidthInput.max = '1';
  shWidthInput.step = '0.01';
  shWidthInput.value = sequencerState.channels[channel].sh.width;
  shWidthInput.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    shWidthValue.textContent = (value * 100).toFixed(0) + '%';
    updateSH(channel, 'width', value);
  });
  shWidthParam.appendChild(shWidthLabel);
  shWidthParam.appendChild(shWidthValue);
  shWidthParam.appendChild(shWidthInput);
  shParams.appendChild(shWidthParam);
  
  container.appendChild(shParams);
  
  return container;
}

// Set channel mode (trigger/lfo/1voct/sh)
function setChannelMode(channel, mode) {
  // Update state
  if (mode === 'trigger') {
    sequencerState.channels[channel].mode = 'trigger';
  } else if (mode === 'lfo') {
    sequencerState.channels[channel].mode = 'cv';
    sequencerState.channels[channel].cvMode = 'lfo';
  } else if (mode === '1voct') {
    sequencerState.channels[channel].mode = 'cv';
    sequencerState.channels[channel].cvMode = '1voct';
  } else if (mode === 'sh') {
    sequencerState.channels[channel].mode = 'cv';
    sequencerState.channels[channel].cvMode = 'sh';
  }
  
  // Update UI
  const rows = document.querySelectorAll('.channel-row');
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
  const lfoParams = row.querySelector('.lfo-params');
  const shParams = row.querySelector('.sh-params');
  
  // Clear all active states
  triggerBtn.classList.remove('active');
  lfoBtn.classList.remove('active');
  voctBtn.classList.remove('active');
  shBtn.classList.remove('active');
  
  if (mode === 'trigger') {
    triggerBtn.classList.add('active');
    stepGrid.style.display = '';
    lfoViz.classList.remove('visible');
    pitchGrid.classList.remove('visible');
    shViz.classList.remove('visible');
    cvParams.classList.remove('visible');
  } else if (mode === 'lfo') {
    lfoBtn.classList.add('active');
    stepGrid.style.display = 'none';
    lfoViz.classList.add('visible');
    pitchGrid.classList.remove('visible');
    shViz.classList.remove('visible');
    cvParams.classList.add('visible');
    if (lfoParams) lfoParams.style.display = 'flex';
    if (shParams) shParams.style.display = 'none';
    updateLFOVisualization(channel);
  } else if (mode === '1voct') {
    voctBtn.classList.add('active');
    stepGrid.style.display = 'none';
    lfoViz.classList.remove('visible');
    pitchGrid.classList.add('visible');
    shViz.classList.remove('visible');
    cvParams.classList.remove('visible'); // No params for 1V/Oct
  } else if (mode === 'sh') {
    shBtn.classList.add('active');
    stepGrid.style.display = 'none';
    lfoViz.classList.remove('visible');
    pitchGrid.classList.remove('visible');
    shViz.classList.add('visible');
    cvParams.classList.add('visible');
    if (lfoParams) lfoParams.style.display = 'none';
    if (shParams) shParams.style.display = 'flex';
    generateSHValues(channel);
    updateSHVisualization(channel);
  }
  
  // Update worklet
  if (es8Node) {
    es8Node.port.postMessage({
      type: 'setChannelMode',
      data: {
        channel: channel,
        mode: sequencerState.channels[channel].mode,
        cvMode: sequencerState.channels[channel].cvMode,
        lfo: sequencerState.channels[channel].lfo,
        sh: sequencerState.channels[channel].sh
      }
    });
  }
}


// Update LFO parameter
function updateLFO(channel, param, value) {
  sequencerState.channels[channel].lfo[param] = value;
  
  // Show/hide duty cycle for ramp vs sine
  if (param === 'waveform') {
    const dutyParam = document.getElementById(`duty-param-${channel}`);
    dutyParam.style.display = value === 'ramp' ? 'grid' : 'none';
  }
  
  // Update visualization
  updateLFOVisualization(channel);
  
  // Update worklet
  if (es8Node) {
    es8Node.port.postMessage({
      type: 'updateLFO',
      data: {
        channel: channel,
        lfo: sequencerState.channels[channel].lfo
      }
    });
  }
}

// Update S&H parameter
function updateSH(channel, param, value) {
  sequencerState.channels[channel].sh[param] = value;
  
  // If width changed, update visualization
  if (param === 'width') {
    updateSHVisualization(channel);
  }
  
  // Update worklet
  if (es8Node) {
    es8Node.port.postMessage({
      type: 'updateSH',
      data: {
        channel: channel,
        sh: sequencerState.channels[channel].sh
      }
    });
  }
}

// Generate S&H values
function generateSHValues(channel) {
  const sh = sequencerState.channels[channel].sh;
  
  // Only generate new values in rand mode or if not initialized
  if (sh.mode === 'rand' || sh.values.every(v => v === 0)) {
    for (let i = 0; i < sequencerState.subdivisions; i++) {
      // Generate random value between -1 and 1
      sh.values[i] = (Math.random() * 2 - 1);
    }
  }
  
  // Update worklet with new values
  if (es8Node) {
    es8Node.port.postMessage({
      type: 'setSHValues',
      data: {
        channel: channel,
        values: sh.values.slice(0, sequencerState.subdivisions)
      }
    });
  }
}

// Update S&H visualization
function updateSHVisualization(channel) {
  const viz = document.getElementById(`sh-viz-${channel}`);
  const sh = sequencerState.channels[channel].sh;
  
  if (!viz) return;
  
  // Clear existing content
  viz.innerHTML = '';
  
  // Create grid container
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `repeat(${sequencerState.subdivisions}, 1fr)`;
  grid.style.gap = '3px';
  grid.style.height = '100%';
  
  for (let i = 0; i < sequencerState.subdivisions; i++) {
    const cell = document.createElement('div');
    cell.className = 'sh-cell';
    cell.style.background = '#2a2a2a';
    cell.style.border = '1px solid #333';
    cell.style.borderRadius = '4px';
    cell.style.position = 'relative';
    cell.style.overflow = 'hidden';
    
    // Create SVG for this cell
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    
    // Add center line (0V)
    const centerLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    centerLine.setAttribute('x1', '0');
    centerLine.setAttribute('y1', '50%');
    centerLine.setAttribute('x2', '100%');
    centerLine.setAttribute('y2', '50%');
    centerLine.setAttribute('stroke', '#444');
    centerLine.setAttribute('stroke-width', '0.5');
    centerLine.setAttribute('stroke-dasharray', '2,4');
    svg.appendChild(centerLine);
    
    // Apply width scaling to the value
    const scaledValue = sh.values[i] * sh.width;
    // Convert to Y percentage (0% = top/+10V, 50% = center/0V, 100% = bottom/-10V)
    const yPercent = 50 - (scaledValue * 50);
    
    // Create the horizontal line for this value
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', `${yPercent}%`);
    line.setAttribute('x2', '100%');
    line.setAttribute('y2', `${yPercent}%`);
    line.setAttribute('stroke-width', '2');
    
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
      color = 'rgb(255, 255, 255)';
    }
    
    line.setAttribute('stroke', color);
    svg.appendChild(line);
    
    cell.appendChild(svg);
    grid.appendChild(cell);
  }
  
  viz.appendChild(grid);
}

// Update LFO visualization
function updateLFOVisualization(channel) {
  const viz = document.getElementById(`lfo-viz-${channel}`);
  const lfo = sequencerState.channels[channel].lfo;
  
  // Clear existing content
  viz.innerHTML = '';
  
  // Create SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.setAttribute('preserveAspectRatio', 'none');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.classList.add('lfo-wave');
  
  // Generate path based on waveform
  let d = '';
  const segments = 100;
  const centerY = 60; // Center of 120px viewBox
  const amplitude = lfo.width * 50; // Scale to viewBox
  
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * 100;
    const phase = (i / segments) * lfo.rate * 2 * Math.PI;
    let y;
    
    if (lfo.waveform === 'sine') {
      y = centerY - Math.sin(phase) * amplitude;
    } else {
      // Ramp with duty cycle
      const cyclePos = (phase / (2 * Math.PI)) % 1;
      if (cyclePos < lfo.duty) {
        // Rising phase
        y = centerY - (cyclePos / lfo.duty) * amplitude * 2 + amplitude;
      } else {
        // Falling phase
        y = centerY - ((1 - cyclePos) / (1 - lfo.duty)) * amplitude * 2 + amplitude;
      }
    }
    
    if (i === 0) {
      d += `M ${x} ${y}`;
    } else {
      d += ` L ${x} ${y}`;
    }
  }
  
  path.setAttribute('d', d);
  svg.appendChild(path);
  viz.appendChild(svg);
}

// Build the sequencer grid
function buildGrid() {
  sequencerGrid.innerHTML = '';
  
  // Create step indicator row
  const indicatorRow = document.createElement('div');
  indicatorRow.className = 'step-indicator-row';
  
  // Spacer to align with channel labels
  const spacer = document.createElement('div');
  spacer.className = 'step-indicator-spacer';
  indicatorRow.appendChild(spacer);
  
  // Another spacer for mode controls
  const spacer2 = document.createElement('div');
  spacer2.style.width = '120px'; // Match the mode controls width
  indicatorRow.appendChild(spacer2);
  
  // Step indicators
  const stepIndicators = document.createElement('div');
  stepIndicators.className = 'step-indicators';
  stepIndicators.style.gridTemplateColumns = `repeat(${sequencerState.subdivisions}, 1fr)`;
  
  for (let step = 0; step < sequencerState.subdivisions; step++) {
    const indicator = document.createElement('div');
    indicator.className = 'step-indicator';
    indicator.id = `indicator-${step}`;
    stepIndicators.appendChild(indicator);
  }
  
  indicatorRow.appendChild(stepIndicators);
  sequencerGrid.appendChild(indicatorRow);
  
  // Create channel rows
  for (let channel = 0; channel < 8; channel++) {
    const row = document.createElement('div');
    row.className = 'channel-row';
    
    // Channel label
    const label = document.createElement('div');
    label.className = 'channel-label';
    label.textContent = channel + 1;
    row.appendChild(label);
    
    // Mode controls container
    const modeControls = document.createElement('div');
    modeControls.className = 'mode-controls';
    
    // Mode buttons container
    const modeButtons = document.createElement('div');
    modeButtons.className = 'mode-buttons';
    
    // Three-way mode selector
    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'mode-selector';
    triggerBtn.textContent = 'Trig';
    triggerBtn.dataset.mode = 'trigger';
    if (sequencerState.channels[channel].mode === 'trigger') {
      triggerBtn.classList.add('active');
    }
    
    const lfoBtn = document.createElement('button');
    lfoBtn.className = 'mode-selector';
    lfoBtn.textContent = 'LFO';
    lfoBtn.dataset.mode = 'lfo';
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === 'lfo') {
      lfoBtn.classList.add('active');
    }
    
    const voctBtn = document.createElement('button');
    voctBtn.className = 'mode-selector';
    voctBtn.textContent = '1V/O';
    voctBtn.dataset.mode = '1voct';
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === '1voct') {
      voctBtn.classList.add('active');
    }
    
    const shBtn = document.createElement('button');
    shBtn.className = 'mode-selector';
    shBtn.textContent = 'S&H';
    shBtn.dataset.mode = 'sh';
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === 'sh') {
      shBtn.classList.add('active');
    }
    
    triggerBtn.addEventListener('click', () => setChannelMode(channel, 'trigger'));
    lfoBtn.addEventListener('click', () => setChannelMode(channel, 'lfo'));
    voctBtn.addEventListener('click', () => setChannelMode(channel, '1voct'));
    shBtn.addEventListener('click', () => setChannelMode(channel, 'sh'));
    
    modeButtons.appendChild(triggerBtn);
    modeButtons.appendChild(lfoBtn);
    modeButtons.appendChild(voctBtn);
    modeButtons.appendChild(shBtn);
    modeControls.appendChild(modeButtons);
    
    // CV parameters (initially hidden, inside mode controls)
    const cvParams = createCVParams(channel);
    modeControls.appendChild(cvParams);
    
    row.appendChild(modeControls);
    
    // Pattern area container
    const patternContainer = document.createElement('div');
    patternContainer.style.width = '100%';
    
    // Step grid for trigger mode
    const stepGrid = document.createElement('div');
    stepGrid.className = 'step-grid';
    stepGrid.id = `step-grid-${channel}`;
    stepGrid.style.gridTemplateColumns = `repeat(${sequencerState.subdivisions}, 1fr)`;
    if (sequencerState.channels[channel].mode !== 'trigger') {
      stepGrid.style.display = 'none';
    }
    
    for (let step = 0; step < sequencerState.subdivisions; step++) {
      const cell = document.createElement('div');
      cell.className = 'step-cell';
      cell.dataset.channel = channel;
      cell.dataset.step = step;
      cell.id = `cell-${channel}-${step}`;
      
      // Set active state from pattern
      if (sequencerState.pattern[channel][step]) {
        cell.classList.add('active');
      }
      
      // Mouse down - start drag
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        draggedCells.clear();
        
        // Toggle the clicked cell and remember its new state
        const isActive = !cell.classList.contains('active');
        dragStartState = isActive;
        
        cell.classList.toggle('active');
        sequencerState.pattern[channel][step] = isActive;
        draggedCells.add(`${channel}-${step}`);
        
        // Update worklet
        if (es8Node) {
          es8Node.port.postMessage({
            type: 'updatePattern',
            data: {
              channel: channel,
              step: step,
              active: isActive
            }
          });
        }
      });
      
      // Mouse enter - continue drag
      cell.addEventListener('mouseenter', () => {
        if (isDragging) {
          const cellKey = `${channel}-${step}`;
          
          // Only update if we haven't already dragged over this cell
          if (!draggedCells.has(cellKey)) {
            draggedCells.add(cellKey);
            
            // Set to the same state as the initial drag
            if (dragStartState) {
              cell.classList.add('active');
            } else {
              cell.classList.remove('active');
            }
            
            sequencerState.pattern[channel][step] = dragStartState;
            
            // Update worklet
            if (es8Node) {
              es8Node.port.postMessage({
                type: 'updatePattern',
                data: {
                  channel: channel,
                  step: step,
                  active: dragStartState
                }
              });
            }
          }
        }
      });
      
      stepGrid.appendChild(cell);
    }
    
    // LFO visualization for CV LFO mode
    const lfoViz = document.createElement('div');
    lfoViz.className = 'lfo-visualization';
    lfoViz.id = `lfo-viz-${channel}`;
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === 'lfo') {
      lfoViz.classList.add('visible');
    }
    
    // Pitch grid for CV 1V/Oct mode
    const pitchGrid = document.createElement('div');
    pitchGrid.className = 'pitch-grid';
    pitchGrid.id = `pitch-grid-${channel}`;
    pitchGrid.style.gridTemplateColumns = `repeat(${sequencerState.subdivisions}, 1fr)`;
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === '1voct') {
      pitchGrid.classList.add('visible');
    }
    
    for (let step = 0; step < sequencerState.subdivisions; step++) {
      const pitchCell = document.createElement('div');
      pitchCell.className = 'pitch-cell';
      pitchCell.dataset.channel = channel;
      pitchCell.dataset.step = step;
      pitchCell.id = `pitch-${channel}-${step}`;
      
      const pitchInput = document.createElement('input');
      pitchInput.type = 'number';
      pitchInput.min = '-36';
      pitchInput.max = '36';
      pitchInput.value = sequencerState.channels[channel].pitches[step] || '';
      pitchInput.placeholder = '-';
      
      pitchInput.addEventListener('input', (e) => {
        const value = e.target.value === '' ? null : parseInt(e.target.value);
        if (value === null || (value >= -36 && value <= 36)) {
          sequencerState.channels[channel].pitches[step] = value;
          
          // Update visual state
          if (value !== null) {
            pitchCell.classList.add('has-value');
          } else {
            pitchCell.classList.remove('has-value');
          }
          
          if (es8Node) {
            es8Node.port.postMessage({
              type: 'updatePitch',
              data: {
                channel: channel,
                step: step,
                pitch: value
              }
            });
          }
        }
      });
      
      pitchCell.appendChild(pitchInput);
      pitchGrid.appendChild(pitchCell);
    }
    
    // S&H visualization
    const shViz = document.createElement('div');
    shViz.className = 'sh-visualization';
    shViz.id = `sh-viz-${channel}`;
    shViz.style.gridTemplateColumns = `repeat(${sequencerState.subdivisions}, 1fr)`;
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === 'sh') {
      shViz.classList.add('visible');
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
}

// Send entire pattern to worklet
function sendPatternToWorklet() {
  if (!es8Node) return;
  
  // Send channel configurations
  for (let channel = 0; channel < 8; channel++) {
    es8Node.port.postMessage({
      type: 'setChannelMode',
      data: {
        channel: channel,
        mode: sequencerState.channels[channel].mode,
        cvMode: sequencerState.channels[channel].cvMode,
        lfo: sequencerState.channels[channel].lfo
      }
    });
    
    // Send trigger patterns
    for (let step = 0; step < sequencerState.subdivisions; step++) {
      if (sequencerState.pattern[channel][step]) {
        es8Node.port.postMessage({
          type: 'updatePattern',
          data: {
            channel: channel,
            step: step,
            active: true
          }
        });
      }
    }
    
    // Send pitch data for 1V/Oct mode
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === '1voct') {
      for (let step = 0; step < sequencerState.subdivisions; step++) {
        if (sequencerState.channels[channel].pitches[step] !== null) {
          es8Node.port.postMessage({
            type: 'updatePitch',
            data: {
              channel: channel,
              step: step,
              pitch: sequencerState.channels[channel].pitches[step]
            }
          });
        }
      }
    }
    
    // Send S&H values
    if (sequencerState.channels[channel].mode === 'cv' && sequencerState.channels[channel].cvMode === 'sh') {
      es8Node.port.postMessage({
        type: 'setSHValues',
        data: {
          channel: channel,
          values: sequencerState.channels[channel].sh.values.slice(0, sequencerState.subdivisions)
        }
      });
    }
  }
}

// Latency tracking
let latencyMeasurements = [];
let measurementCount = 0;

// Update visual indicators based on worklet messages
function updateStepIndicator(step, audioTime) {
  // Measure latency using audio context time
  if (audioTime && audioContext) {
    const currentAudioTime = audioContext.currentTime;
    const latency = (currentAudioTime - audioTime) * 1000; // Convert to milliseconds
    latencyMeasurements.push(latency);
    measurementCount++;
    
    // Log average latency every 10 steps
    if (measurementCount % 10 === 0) {
      const avgLatency = latencyMeasurements.reduce((a, b) => a + b, 0) / latencyMeasurements.length;
      const minLatency = Math.min(...latencyMeasurements);
      const maxLatency = Math.max(...latencyMeasurements);
      console.log(`Audio → Display latency - Avg: ${avgLatency.toFixed(2)}ms, Min: ${minLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);
      
      // Keep only last 100 measurements
      if (latencyMeasurements.length > 100) {
        latencyMeasurements = latencyMeasurements.slice(-100);
      }
    }
  }
  
  // Update step indicator row
  document.querySelectorAll('.step-indicator').forEach(indicator => {
    indicator.classList.remove('active');
  });
  const currentIndicator = document.getElementById(`indicator-${step}`);
  if (currentIndicator) {
    currentIndicator.classList.add('active');
  }
  
  // Remove previous triggered cell highlights
  document.querySelectorAll('.step-cell.triggered').forEach(cell => {
    cell.classList.remove('triggered');
  });
  
  // Highlight triggered cells in current step
  for (let channel = 0; channel < 8; channel++) {
    if (sequencerState.pattern[channel][step]) {
      const cell = document.getElementById(`cell-${channel}-${step}`);
      if (cell) {
        cell.classList.add('triggered');
      }
    }
  }
  
  currentStep = step;
}

// Start audio context and create nodes
startButton.addEventListener('click', async () => {
  try {
    audioContext = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000
    });

    // Force the destination to use maximum channels
    console.log('AudioContext max channels:', audioContext.destination.maxChannelCount);
    audioContext.destination.channelCount = audioContext.destination.maxChannelCount;
    audioContext.destination.channelCountMode = 'explicit';
    audioContext.destination.channelInterpretation = 'discrete';

    await audioContext.audioWorklet.addModule('sequencer-processor.js');

    es8Node = new AudioWorkletNode(audioContext, 'sequencer-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });

    es8Node.connect(audioContext.destination);

    // Listen for messages from worklet
    es8Node.port.onmessage = (event) => {
      if (event.data.type === 'stepChange') {
        updateStepIndicator(event.data.step, event.data.audioTime);
      } else if (event.data.type === 'shValuesUpdated') {
        // Update S&H visualization when values are regenerated
        const channel = event.data.channel;
        sequencerState.channels[channel].sh.values = event.data.values;
        updateSHVisualization(channel);
      }
    };

    // Send initial configuration
    es8Node.port.postMessage({ type: 'setCycleTime', data: sequencerState.cycleTime });
    es8Node.port.postMessage({ type: 'setSubdivisions', data: sequencerState.subdivisions });

    // Update UI
    statusEl.textContent = `Connected • ${audioContext.sampleRate}Hz • 8 channels`;
    statusEl.classList.add('connected');
    startButton.textContent = 'Connected';
    startButton.disabled = true;
    playButton.disabled = false;
    clearButton.disabled = false;

    buildGrid();

  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    console.error(error);
  }
});

// Play/Stop button
playButton.addEventListener('click', () => {
  if (isPlaying) {
    stopSequencer();
  } else {
    startSequencer();
  }
});

// Clear button
clearButton.addEventListener('click', () => {
  sequencerState.pattern = Array(8).fill(null).map(() => Array(24).fill(false));
  // Also clear pitch data
  for (let channel = 0; channel < 8; channel++) {
    sequencerState.channels[channel].pitches = Array(24).fill(null);
  }
  buildGrid();
  
  // Clear pattern in worklet
  if (es8Node) {
    es8Node.port.postMessage({ type: 'clearPattern' });
    // Clear pitch data in worklet
    for (let channel = 0; channel < 8; channel++) {
      for (let step = 0; step < 24; step++) {
        es8Node.port.postMessage({
          type: 'updatePitch',
          data: {
            channel: channel,
            step: step,
            pitch: null
          }
        });
      }
    }
  }
});

function startSequencer() {
  isPlaying = true;
  playButton.textContent = 'Stop';
  playButton.classList.add('playing');
  
  // Generate new S&H values for channels in rand mode
  for (let channel = 0; channel < 8; channel++) {
    if (sequencerState.channels[channel].mode === 'cv' && 
        sequencerState.channels[channel].cvMode === 'sh' &&
        sequencerState.channels[channel].sh.mode === 'rand') {
      generateSHValues(channel);
      updateSHVisualization(channel);
    }
  }
  
  // Send pattern to worklet before starting
  sendPatternToWorklet();
  
  // Start the worklet sequencer
  es8Node.port.postMessage({ type: 'start' });
}

function stopSequencer() {
  isPlaying = false;
  playButton.textContent = 'Play';
  playButton.classList.remove('playing');
  
  // Stop the worklet sequencer
  es8Node.port.postMessage({ type: 'stop' });
  
  // Reset visuals
  document.querySelectorAll('.step-indicator').forEach(indicator => {
    indicator.classList.remove('active');
  });
  document.querySelectorAll('.step-cell.triggered').forEach(cell => {
    cell.classList.remove('triggered');
  });
}

// Initialize grid on load
buildGrid();

// Global mouse up to stop dragging
document.addEventListener('mouseup', () => {
  isDragging = false;
  draggedCells.clear();
});
/**
 * Constants and configuration values for the ES-8 Sequencer
 */

// Sequencer limits
export const SEQUENCER_CONSTANTS = {
  MAX_CHANNELS: 8,
  MAX_SUBDIVISIONS: 96,
  MIN_SUBDIVISIONS: 2,
  DEFAULT_SUBDIVISIONS: 8,
  DEFAULT_CYCLE_TIME: 2.0,
  MIN_CYCLE_TIME: 0.5,
  MAX_CYCLE_TIME: 8.0,
  TRIGGER_DURATION_MS: 20,
  TRIGGER_DURATION_SAMPLES: 960, // 20ms at 48kHz
  SAMPLE_RATE: 48000,
};

// Channel modes
export const CHANNEL_MODES = {
  TRIGGER: 'trigger',
  CV: 'cv',
};

// CV modes
export const CV_MODES = {
  LFO: 'lfo',
  PITCH: '1voct',
  SH: 'sh',
};

// LFO waveforms
export const LFO_WAVEFORMS = {
  RAMP: 'ramp',
  SINE: 'sine',
};

// S&H modes
export const SH_MODES = {
  RANDOM: 'rand',
  SHUFFLE: 'shuf',
};

// Pitch/1V per octave constants
export const PITCH_CONSTANTS = {
  MIN_SEMITONES: -120,
  MAX_SEMITONES: 120,
  SEMITONES_PER_VOLT: 12,
  VOLTAGE_SCALE: 10, // Maps ±1.0 audio to ±10V
};

// Message types for worklet communication
export const MESSAGE_TYPES = {
  // Transport control
  START: 'start',
  STOP: 'stop',
  
  // Configuration
  SET_CYCLE_TIME: 'setCycleTime',
  SET_SUBDIVISIONS: 'setSubdivisions',
  SET_CHANNEL_SUBDIVISIONS: 'setChannelSubdivisions',
  
  // Channel configuration
  SET_CHANNEL_MODE: 'setChannelMode',
  SET_CV_MODE: 'setCVMode',
  
  // Pattern data
  UPDATE_PATTERN: 'updatePattern',
  CLEAR_PATTERN: 'clearPattern',
  
  // CV parameters
  UPDATE_LFO: 'updateLFO',
  UPDATE_PITCH: 'updatePitch',
  UPDATE_SH: 'updateSH',
  SET_SH_VALUES: 'setSHValues',
  
  // UI updates from worklet
  STEP_CHANGE: 'stepChange',
  SH_VALUES_UPDATED: 'shValuesUpdated',
};

// UI Classes and IDs
export const UI_CLASSES = {
  STEP_CELL: 'step-cell',
  STEP_CELL_ACTIVE: 'active',
  STEP_CELL_TRIGGERED: 'triggered',
  PITCH_CELL: 'pitch-cell',
  PITCH_CELL_HAS_VALUE: 'has-value',
  SH_CELL: 'sh-cell',
  STEP_INDICATOR: 'step-indicator',
  STEP_INDICATOR_ACTIVE: 'active',
  MODE_SELECTOR: 'mode-selector',
  MODE_SELECTOR_ACTIVE: 'active',
};

// Default LFO configuration
export const DEFAULT_LFO = {
  waveform: LFO_WAVEFORMS.RAMP,
  rate: 1,
  duty: 0.5,
  width: 1.0,
  phase: 0,  // Phase offset 0-1 (0 = no offset, 1 = full cycle)
};

// Default S&H configuration  
export const DEFAULT_SH = {
  mode: SH_MODES.RANDOM,
  width: 1.0,
};

// Color constants
export const COLORS = {
  ACTIVE_GREEN: '#00ff88',
  INACTIVE_GRAY: '#333',
  BACKGROUND_DARK: '#2a2a2a',
  BACKGROUND_DARKER: '#1a1a1a',
  TEXT_LIGHT: '#e0e0e0',
  TEXT_DIM: '#888',
  TRIGGER_RED: '#ff3366',
};
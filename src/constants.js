/**
 * Constants and configuration values for the ES-8 Sequencer
 */

// Sequencer limits
export const SEQUENCER_CONSTANTS = {
  MAX_CHANNELS: 8,
  NUM_CHANNELS: 8, // The total number of physical outputs
  NUM_SEQUENCER_CHANNELS: 6, // The number of channels for user patterns
  MAX_SUBDIVISIONS: 96,
  MIN_SUBDIVISIONS: 2,
  DEFAULT_SUBDIVISIONS: 8,
  DEFAULT_CYCLE_TIME: 2.0,
  MIN_CYCLE_TIME: 0.5,
  MAX_CYCLE_TIME: 8.0,
  TRIGGER_DURATION_MS: 20,
  TRIGGER_DURATION_SAMPLES: 48, // ~1ms at 48kHz
  TRIGGER_DURATION_SHORT_SAMPLES: 8, // ~0.167ms at 48kHz
  SAMPLE_RATE: 48000,
};

// Channel modes - EVOLVED MODEL
export const CHANNEL_MODES = {
  TRIGGER: "trigger",
  PITCH: "pitch",
  CLOCK: "clock", // New dedicated clock output
  RAMP: "ramp",   // New dedicated ramp output
};

// Ramp polarities
export const RAMP_POLARITIES = {
  POSITIVE: false, // 0V → +amplitude (normal)
  NEGATIVE: true,  // +amplitude → 0V (inverted)
};



// Trigger duration options
export const TRIGGER_DURATIONS = [
  { label: "Short", value: 8 }, // ~0.167ms
  { label: "20ms", value: 960 }, // 20ms at 48kHz
  { label: "50ms", value: 2400 }, // 50ms
  { label: "100ms", value: 4800 }, // 100ms
];

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
  START: "start",
  STOP: "stop",
  PAUSE: "pause",

  // Configuration
  SET_CYCLE_TIME: "setCycleTime",
  SET_SUBDIVISIONS: "setSubdivisions",
  SET_CHANNEL_SUBDIVISIONS: "setChannelSubdivisions",
  SET_POLYRHYTHM: "setPolyrhythm",

  // Channel configuration
  SET_CHANNEL_MODE: "setChannelMode",
  SET_CV_MODE: "setCVMode",

  // Pattern data
  UPDATE_PATTERN: "updatePattern",
  CLEAR_PATTERN: "clearPattern",

  // Trigger parameters
  SET_TRIGGER_DURATION: "setTriggerDuration",

  // CV parameters
  UPDATE_PITCH: "updatePitch",

  // UI updates from worklet
  STEP_UPDATE: "stepUpdate",
  STEP_CHANGE: "stepChange",
};

// UI Classes and IDs
export const UI_CLASSES = {
  STEP_CELL: "step-cell",
  STEP_CELL_ACTIVE: "active",
  STEP_CELL_TRIGGERED: "triggered",
  PITCH_CELL: "pitch-cell",
  PITCH_CELL_HAS_VALUE: "has-value",
  STEP_INDICATOR: "step-indicator",
  STEP_INDICATOR_ACTIVE: "active",
  MODE_SELECTOR: "mode-selector",
  MODE_SELECTOR_ACTIVE: "active",
};


// Mode icons
export const MODE_ICONS = {
  'trigger': '⚡',
  'pitch': '🎹',
  'clock': '🕒',
  'ramp': '📈',
};

// Color constants
export const COLORS = {
  ACTIVE_GREEN: "#00ff88",
  INACTIVE_GRAY: "#333",
  BACKGROUND_DARK: "#2a2a2a",
  BACKGROUND_DARKER: "#1a1a1a",
  TEXT_LIGHT: "#e0e0e0",
  TEXT_DIM: "#888",
  TRIGGER_RED: "#ff3366",
  GRID_LINE: "#444",
  STEP_MARKER: "#555",
};

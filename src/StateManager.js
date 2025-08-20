import { SEQUENCER_CONSTANTS, CHANNEL_MODES, RAMP_POLARITIES } from "./constants.js";

// --- Channel Factory Functions ---

function createTriggerChannel() {
  return {
    mode: CHANNEL_MODES.TRIGGER,
    pitches: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null),
    triggerDuration: SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES,
    steps: 16,
    currentStep: -1,
    isMuted: false,
  };
}

function createPitchChannel(isCoupled = true) {
  return {
    mode: CHANNEL_MODES.PITCH,
    pitches: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null),
    triggerDuration: SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES,
    steps: 16,
    currentStep: -1,
    isCoupled,
    isMuted: false,
  };
}

function createClockChannel() {
  return {
    mode: CHANNEL_MODES.CLOCK,
    duration: SEQUENCER_CONSTANTS.TRIGGER_DURATION_SAMPLES,
    currentStep: -1,
    isMuted: false,
  };
}

function createRampChannel(polarity = RAMP_POLARITIES.POSITIVE, amplitude = 12) {
  return {
    mode: CHANNEL_MODES.RAMP,
    polarity,
    amplitude,
    currentStep: -1,
    isMuted: false,
  };
}

function createSequencerChannels() {
  return [
    createTriggerChannel(),  // Channel 1
    createPitchChannel(),    // Channel 2 (coupled by default)
    createTriggerChannel(),  // Channel 3  
    createPitchChannel(),    // Channel 4 (coupled by default)
    createTriggerChannel(),  // Channel 5
    createPitchChannel(),    // Channel 6 (coupled by default)
  ];
}

function createUtilityChannels() {
  return [
    createRampChannel(),     // Channel 7
    createClockChannel(),    // Channel 8
  ];
}

const initialState = {
  // Global params
  subdivisions: 16,
  cycleTime: SEQUENCER_CONSTANTS.DEFAULT_CYCLE_TIME,
  
  // UI State
  gridSubdivisions: 16, // Visual zoom level of the grid

  // Sequencer Data
  pattern: Array(SEQUENCER_CONSTANTS.MAX_CHANNELS).fill(null).map(() => Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false)),
  channels: [...createSequencerChannels(), ...createUtilityChannels()],
};

export class StateManager {
  constructor(initialState = {}) {
    this._state = this.deepClone(initialState);
    this._listeners = new Map();
    this._globalListeners = new Set();
    this._transactionDepth = 0;
    this._pendingNotifications = new Set();
  }

  get(path) {
    if (!path) return this.deepClone(this._state);
    const keys = path.split('.');
    let value = this._state;
    for (const key of keys) {
      if (value == null) return undefined;
      value = value[key];
    }
    return this.deepClone(value);
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this._state;
    for (const key of keys) {
      if (!(key in target)) target[key] = {};
      target = target[key];
    }
    const oldValue = target[lastKey];
    target[lastKey] = value;
    // We are not using listeners in this simplified refactor, so notify is commented out.
    // this.notifyListeners(path, value, oldValue);
  }

  getState() {
    return this.get();
  }
  
  deepClone(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Set) return new Set(Array.from(obj).map(item => this.deepClone(item)));
    if (obj instanceof Array) return obj.map((item) => this.deepClone(item));
    if (obj instanceof Object) {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  /**
   * Subscribe to changes on a specific path
   * @param {string} path - Path to watch
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, listener) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }

    this._listeners.get(path).add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(path);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this._listeners.delete(path);
        }
      }
    };
  }

  /**
   * Subscribe to all state changes
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(listener) {
    this._globalListeners.add(listener);

    return () => {
      this._globalListeners.delete(listener);
    };
  }

  /**
   * Helper method to update a channel property
   * @param {number} channel - Channel index
   * @param {string} property - Property name
   * @param {*} value - New value
   */
  setChannelProperty(channel, property, value) {
    this.set(`channels.${channel}.${property}`, value);
  }

  /**
   * Helper method to get a channel property
   * @param {number} channel - Channel index
   * @param {string} property - Property name
   * @returns {*} The property value
   */
  getChannelProperty(channel, property) {
    return this.get(`channels.${channel}.${property}`);
  }
}

export const stateManager = new StateManager(initialState);

// Export factory functions for external use
export { createTriggerChannel, createPitchChannel, createClockChannel, createRampChannel };
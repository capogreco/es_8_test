import { MESSAGE_TYPES } from "./constants.js";

/**
 * AudioWorkletService - Centralizes all communication with the audio worklet
 * Provides a clean interface for sending messages and handles initialization
 */
class AudioWorkletService {
  constructor() {
    this.workletNode = null;
    this.messageQueue = [];
    this.isInitialized = false;
    this.messageHandlers = new Map();
  }

  /**
   * Initialize the service with the audio worklet node
   * @param {AudioWorkletNode} workletNode
   */
  initialize(workletNode) {
    this.workletNode = workletNode;
    this.isInitialized = true;

    // Set up message handler
    this.workletNode.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Process any queued messages
    this.processMessageQueue();
  }

  /**
   * Register a handler for a specific message type
   * @param {string} messageType
   * @param {Function} handler
   */
  onMessage(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType).push(handler);
  }

  /**
   * Handle incoming messages from the worklet
   * @param {Object} message
   */
  handleMessage(message) {
    if (!message || typeof message !== "object") {
      console.warn("Invalid message received:", message);
      return;
    }

    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  /**
   * Send a message to the worklet
   * @param {string} type
   * @param {Object} data
   */
  sendMessage(type, data) {
    const message = { type, data };

    if (this.isInitialized && this.workletNode) {
      this.workletNode.port.postMessage(message);
    } else {
      // Queue the message if not initialized
      this.messageQueue.push(message);
    }
  }

  /**
   * Process any messages that were queued before initialization
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.workletNode.port.postMessage(message);
    }
  }

  // === Transport Control Methods ===

  start() {
    this.sendMessage(MESSAGE_TYPES.START);
  }

  stop() {
    this.sendMessage(MESSAGE_TYPES.STOP);
  }

  pause() {
    this.sendMessage(MESSAGE_TYPES.PAUSE);
  }

  // === Configuration Methods ===

  setCycleTime(cycleTime) {
    this.sendMessage(MESSAGE_TYPES.SET_CYCLE_TIME, cycleTime);
  }

  setGlobalSubdivisions(subdivisions) {
    this.sendMessage(MESSAGE_TYPES.SET_SUBDIVISIONS, subdivisions);
  }

  setChannelSubdivisions(channel, subdivisions) {
    this.sendMessage(MESSAGE_TYPES.SET_CHANNEL_SUBDIVISIONS, {
      channel,
      subdivisions,
    });
  }

  setPolyrhythm(channel, enabled, steps) {
    this.sendMessage(MESSAGE_TYPES.SET_POLYRHYTHM, {
      channel,
      enabled,
      steps,
    });
  }

  // === Pattern Methods ===

  updatePattern(channel, step, active) {
    this.sendMessage(MESSAGE_TYPES.UPDATE_PATTERN, {
      channel,
      step,
      active,
    });
  }

  clearAllPatterns() {
    this.sendMessage(MESSAGE_TYPES.CLEAR_PATTERN);
  }

  clearChannelPattern(channel, maxSteps = 96) {
    // Clear all steps for a specific channel
    for (let step = 0; step < maxSteps; step++) {
      this.updatePattern(channel, step, false);
    }
  }

  // === Channel Mode Methods ===

  setChannelMode(channel, mode, cvMode, lfo, sh) {
    this.sendMessage(MESSAGE_TYPES.SET_CHANNEL_MODE, {
      channel,
      mode,
      cvMode,
      lfo,
      sh,
    });
  }

  setTriggerDuration(channel, duration) {
    this.sendMessage(MESSAGE_TYPES.SET_TRIGGER_DURATION, {
      channel,
      duration,
    });
  }

  setCVMode(channel, cvMode) {
    this.sendMessage(MESSAGE_TYPES.SET_CV_MODE, {
      channel,
      cvMode,
    });
  }

  // === LFO Methods ===

  updateLFO(channel, lfo) {
    this.sendMessage(MESSAGE_TYPES.UPDATE_LFO, {
      channel,
      lfo,
    });
  }

  // === Pitch Methods ===

  updatePitch(channel, step, pitch) {
    this.sendMessage(MESSAGE_TYPES.UPDATE_PITCH, {
      channel,
      step,
      pitch,
    });
  }

  // === S&H Methods ===

  updateSH(channel, sh) {
    this.sendMessage(MESSAGE_TYPES.UPDATE_SH, {
      channel,
      sh,
    });
  }

  setSHValues(channel, values) {
    this.sendMessage(MESSAGE_TYPES.SET_SH_VALUES, {
      channel,
      values,
    });
  }

  // === Batch Operations ===

  /**
   * Send pattern data for a single channel
   * @param {number} channel
   * @param {Array} pattern
   * @param {number} subdivisions
   */
  sendChannelPattern(channel, pattern, subdivisions) {
    // Clear existing pattern first
    this.clearChannelPattern(channel);

    // Send active steps
    for (let step = 0; step < subdivisions; step++) {
      if (pattern[step]) {
        this.updatePattern(channel, step, true);
      }
    }
  }

  /**
   * Send pitch data for a channel
   * @param {number} channel
   * @param {Array} pitches
   * @param {number} subdivisions
   */
  sendChannelPitches(channel, pitches, subdivisions) {
    for (let step = 0; step < subdivisions; step++) {
      if (pitches[step] !== null) {
        this.updatePitch(channel, step, pitches[step]);
      }
    }
  }
}

// Create singleton instance
const audioWorkletService = new AudioWorkletService();

// Make it available globally for non-module scripts
window.audioWorkletService = audioWorkletService;

// Export for use in ES modules
export default audioWorkletService;

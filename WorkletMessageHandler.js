/**
 * WorkletMessageHandler.js
 *
 * Enhanced message handling for audio worklet processor
 * Supports batch operations, validation, and improved error handling
 */

// Import would normally be done, but worklets have limited module support
// So we'll define the message types inline
const MESSAGE_TYPES = {
  START: "start",
  STOP: "stop",
  PAUSE: "pause",
  SET_CYCLE_TIME: "setCycleTime",
  SET_SUBDIVISIONS: "setSubdivisions",
  SET_CHANNEL_SUBDIVISIONS: "setChannelSubdivisions",
  SET_POLYRHYTHM: "setPolyrhythm",
  SET_CHANNEL_MODE: "setChannelMode",
  SET_CV_MODE: "setCVMode",
  UPDATE_PATTERN: "updatePattern",
  CLEAR_PATTERN: "clearPattern",
  UPDATE_LFO: "updateLFO",
  UPDATE_PITCH: "updatePitch",
  UPDATE_SH: "updateSH",
  SET_SH_VALUES: "setSHValues",
  STEP_CHANGE: "stepChange",
  SH_VALUES_UPDATED: "shValuesUpdated",
};

/**
 * WorkletMessageHandler class
 * Handles incoming messages in the audio worklet with validation and batching
 */
class WorkletMessageHandler {
  constructor(processor) {
    this.processor = processor;
    this.messageHandlers = new Map();
    this.debugMode = false;
    this.messageStats = {
      received: 0,
      processed: 0,
      failed: 0,
      batches: 0,
    };

    // Register default handlers
    this.registerDefaultHandlers();
  }

  /**
   * Register default message handlers
   */
  registerDefaultHandlers() {
    // Transport control
    this.registerHandler(MESSAGE_TYPES.START, (data) => {
      this.processor.isPlaying = true;
      this.processor.masterPhasor = 0;
      this.processor.currentCycleSample = 0;
      this.processor.previousSteps.fill(-1);
      this.processor.previousGlobalStep = -1;
      this.processor.lastGlobalStepTime = currentTime;

      for (let channel = 0; channel < 8; channel++) {
        this.processor.channels[channel].lfoPhase = 0;
        this.processor.channels[channel].lastStepTime = currentTime;
        this.processor.channels[channel].polyrhythmSampleCount = 0;
      }
    });

    this.registerHandler(MESSAGE_TYPES.STOP, (data) => {
      this.processor.isPlaying = false;
      this.processor.masterPhasor = 0;
      this.processor.currentCycleSample = 0;

      for (let channel = 0; channel < 8; channel++) {
        this.processor.channels[channel].lfoPhase = 0;
        this.processor.channels[channel].polyrhythmSampleCount = 0;
      }

      // Reset all triggers
      for (let i = 0; i < 8; i++) {
        this.processor.triggerStates[i].active = false;
        this.processor.triggerStates[i].sampleCount = 0;
      }
    });

    this.registerHandler(MESSAGE_TYPES.PAUSE, (data) => {
      this.processor.isPlaying = false;
    });

    // Configuration
    this.registerHandler(MESSAGE_TYPES.SET_CYCLE_TIME, (data) => {
      this.processor.cycleTime = data;
      this.processor.updateTiming();
    });

    this.registerHandler(MESSAGE_TYPES.SET_SUBDIVISIONS, (data) => {
      this.processor.subdivisions = data;
      this.processor.updateTiming();
    });

    this.registerHandler(MESSAGE_TYPES.SET_CHANNEL_SUBDIVISIONS, (data) => {
      const { channel, subdivisions } = data;
      if (this.validateChannel(channel)) {
        this.processor.channels[channel].subdivisions = subdivisions;
        // Don't automatically set useCustomSubdivisions - let the UI control this flag
      }
    });

    this.registerHandler(MESSAGE_TYPES.SET_POLYRHYTHM, (data) => {
      const { channel, enabled, steps } = data;
      if (this.validateChannel(channel)) {
        this.processor.channels[channel].usePolyrhythm = enabled;
        if (steps !== undefined) {
          this.processor.channels[channel].polyrhythmSteps = steps;
        }
        // Update polyrhythm cycle samples
        if (enabled) {
          const cycleRatio =
            this.processor.channels[channel].polyrhythmSteps /
            this.processor.subdivisions;
          this.processor.channels[channel].polyrhythmCycleSamples = Math.floor(
            this.processor.totalCycleSamples * cycleRatio,
          );
        }
      }
    });

    // Channel mode
    this.registerHandler(MESSAGE_TYPES.SET_CHANNEL_MODE, (data) => {
      const { channel, mode, cvMode, lfo, sh } = data;
      if (this.validateChannel(channel)) {
        this.processor.channels[channel].mode = mode;
        if (cvMode !== undefined) {
          this.processor.channels[channel].cvMode = cvMode;
        }
        if (lfo !== undefined) {
          Object.assign(this.processor.channels[channel].lfo, lfo);
        }
        if (sh !== undefined) {
          Object.assign(this.processor.channels[channel].sh, sh);
        }
      }
    });

    // Pattern
    this.registerHandler(MESSAGE_TYPES.UPDATE_PATTERN, (data) => {
      const { channel, step, active } = data;
      if (this.validateChannel(channel) && this.validateStep(step)) {
        this.processor.pattern[channel][step] = active;
      }
    });

    this.registerHandler(MESSAGE_TYPES.CLEAR_PATTERN, (data) => {
      if (data.channel !== undefined) {
        // Clear specific channel
        if (this.validateChannel(data.channel)) {
          this.processor.pattern[data.channel].fill(false);
        }
      } else {
        // Clear all channels
        for (let i = 0; i < 8; i++) {
          this.processor.pattern[i].fill(false);
        }
      }
    });

    // LFO
    this.registerHandler(MESSAGE_TYPES.UPDATE_LFO, (data) => {
      const { channel, lfo } = data;
      if (this.validateChannel(channel)) {
        Object.assign(this.processor.channels[channel].lfo, lfo);
      }
    });

    // Pitch
    this.registerHandler(MESSAGE_TYPES.UPDATE_PITCH, (data) => {
      const { channel, step, pitch } = data;
      if (this.validateChannel(channel) && this.validateStep(step)) {
        this.processor.channels[channel].pitches[step] = pitch;
      }
    });

    // S&H
    this.registerHandler(MESSAGE_TYPES.UPDATE_SH, (data) => {
      const { channel, sh } = data;
      if (this.validateChannel(channel)) {
        Object.assign(this.processor.channels[channel].sh, sh);
      }
    });

    this.registerHandler(MESSAGE_TYPES.SET_SH_VALUES, (data) => {
      const { channel, values } = data;
      if (this.validateChannel(channel) && Array.isArray(values)) {
        // Copy values, ensuring we don't exceed array bounds
        const maxValues = Math.min(values.length, 96);
        for (let i = 0; i < maxValues; i++) {
          this.processor.channels[channel].sh.values[i] = values[i];
        }
      }
    });
  }

  /**
   * Register a message handler
   * @param {string} type
   * @param {Function} handler
   */
  registerHandler(type, handler) {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Handle incoming message
   * @param {Object} message
   */
  handleMessage(message) {
    this.messageStats.received++;

    if (!message || typeof message !== "object") {
      this.logError("Invalid message format", message);
      this.messageStats.failed++;
      return;
    }

    // Handle batch messages
    if (message.type === "batch" && Array.isArray(message.messages)) {
      this.handleBatch(message.messages);
      return;
    }

    // Handle single message
    this.processMessage(message);
  }

  /**
   * Process a single message
   * @param {Object} message
   */
  processMessage(message) {
    const { type, data } = message;

    if (!type) {
      this.logError("Message missing type", message);
      this.messageStats.failed++;
      return;
    }

    const handler = this.messageHandlers.get(type);
    if (!handler) {
      this.logError(`Unknown message type: ${type}`, message);
      this.messageStats.failed++;
      return;
    }

    try {
      handler(data);
      this.messageStats.processed++;

      if (this.debugMode) {
        this.log(`Processed message: ${type}`, data);
      }
    } catch (error) {
      this.logError(`Error processing message ${type}:`, error);
      this.messageStats.failed++;
    }
  }

  /**
   * Handle batch of messages
   * @param {Array} messages
   */
  handleBatch(messages) {
    this.messageStats.batches++;

    if (this.debugMode) {
      this.log(`Processing batch of ${messages.length} messages`);
    }

    // Process messages in order
    for (const message of messages) {
      this.processMessage(message);
    }
  }

  /**
   * Validate channel number
   * @param {number} channel
   * @returns {boolean}
   */
  validateChannel(channel) {
    if (typeof channel !== "number" || channel < 0 || channel > 7) {
      this.logError(`Invalid channel: ${channel}`);
      return false;
    }
    return true;
  }

  /**
   * Validate step number
   * @param {number} step
   * @returns {boolean}
   */
  validateStep(step) {
    if (typeof step !== "number" || step < 0 || step > 95) {
      this.logError(`Invalid step: ${step}`);
      return false;
    }
    return true;
  }

  /**
   * Send message to main thread
   * @param {string} type
   * @param {*} data
   */
  sendMessage(type, data) {
    try {
      this.processor.port.postMessage({ type, data });
    } catch (error) {
      this.logError("Failed to send message:", error);
    }
  }

  /**
   * Send step change notification
   * @param {number} step
   * @param {number} audioTime
   * @param {number} channel - Optional, -1 for global
   */
  sendStepChange(step, audioTime, channel = -1) {
    this.sendMessage(MESSAGE_TYPES.STEP_CHANGE, {
      step,
      audioTime,
      channel,
    });
  }

  /**
   * Send S&H values update notification
   * @param {number} channel
   * @param {Array} values
   */
  sendSHValuesUpdated(channel, values) {
    this.sendMessage(MESSAGE_TYPES.SH_VALUES_UPDATED, {
      channel,
      values,
    });
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  /**
   * Log message (only in debug mode)
   * @param  {...any} args
   */
  log(...args) {
    if (this.debugMode) {
      this.sendMessage("log", {
        message: args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg) : String(arg),
          )
          .join(" "),
      });
    }
  }

  /**
   * Log error
   * @param  {...any} args
   */
  logError(...args) {
    this.sendMessage("error", {
      message: args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg),
        )
        .join(" "),
    });
  }

  /**
   * Get message statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.messageStats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.messageStats = {
      received: 0,
      processed: 0,
      failed: 0,
      batches: 0,
    };
  }
}

// Export for use in worklet
if (typeof AudioWorkletProcessor !== "undefined") {
  // Make available in worklet global scope
  globalThis.WorkletMessageHandler = WorkletMessageHandler;
}

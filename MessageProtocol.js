/**
 * MessageProtocol.js
 * 
 * A comprehensive message passing protocol for ES-8 Sequencer
 * Provides type-safe message creation, validation, and batch operations
 * between the UI thread and audio worklet.
 */

import { MESSAGE_TYPES, SEQUENCER_CONSTANTS, CHANNEL_MODES, CV_MODES } from './constants.js';

/**
 * Message validation schemas
 * Each schema defines the expected structure and validation rules for a message type
 */
const MESSAGE_SCHEMAS = {
  // Transport control messages
  [MESSAGE_TYPES.START]: {
    type: 'object',
    properties: {}
  },
  
  [MESSAGE_TYPES.STOP]: {
    type: 'object',
    properties: {}
  },
  
  [MESSAGE_TYPES.PAUSE]: {
    type: 'object',
    properties: {}
  },
  
  // Configuration messages
  [MESSAGE_TYPES.SET_CYCLE_TIME]: {
    type: 'number',
    min: SEQUENCER_CONSTANTS.MIN_CYCLE_TIME,
    max: SEQUENCER_CONSTANTS.MAX_CYCLE_TIME
  },
  
  [MESSAGE_TYPES.SET_SUBDIVISIONS]: {
    type: 'number',
    min: SEQUENCER_CONSTANTS.MIN_SUBDIVISIONS,
    max: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS,
    integer: true
  },
  
  [MESSAGE_TYPES.SET_CHANNEL_SUBDIVISIONS]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      subdivisions: {
        type: 'number',
        min: SEQUENCER_CONSTANTS.MIN_SUBDIVISIONS,
        max: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS,
        integer: true
      }
    },
    required: ['channel', 'subdivisions']
  },
  
  [MESSAGE_TYPES.SET_POLYRHYTHM]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      enabled: {
        type: 'boolean'
      },
      steps: {
        type: 'number',
        min: 1,
        max: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS,
        integer: true,
        optional: true
      }
    },
    required: ['channel', 'enabled']
  },
  
  // Channel mode messages
  [MESSAGE_TYPES.SET_CHANNEL_MODE]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      mode: {
        type: 'string',
        enum: Object.values(CHANNEL_MODES)
      },
      cvMode: {
        type: 'string',
        enum: Object.values(CV_MODES),
        optional: true
      },
      lfo: {
        type: 'object',
        optional: true
      },
      sh: {
        type: 'object',
        optional: true
      }
    },
    required: ['channel', 'mode']
  },
  
  // Pattern messages
  [MESSAGE_TYPES.UPDATE_PATTERN]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      step: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS - 1,
        integer: true
      },
      active: {
        type: 'boolean'
      }
    },
    required: ['channel', 'step', 'active']
  },
  
  [MESSAGE_TYPES.CLEAR_PATTERN]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true,
        optional: true
      }
    }
  },
  
  // LFO messages
  [MESSAGE_TYPES.UPDATE_LFO]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      lfo: {
        type: 'object',
        properties: {
          waveform: { type: 'string', optional: true },
          rate: { type: 'number', min: 1, max: 16, optional: true },
          duty: { type: 'number', min: 0, max: 1, optional: true },
          width: { type: 'number', min: 0, max: 1, optional: true },
          phase: { type: 'number', min: 0, max: 1, optional: true }
        }
      }
    },
    required: ['channel', 'lfo']
  },
  
  // Pitch messages
  [MESSAGE_TYPES.UPDATE_PITCH]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      step: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS - 1,
        integer: true
      },
      pitch: {
        type: 'number',
        min: -120,
        max: 120,
        integer: true,
        nullable: true
      }
    },
    required: ['channel', 'step', 'pitch']
  },
  
  // S&H messages
  [MESSAGE_TYPES.UPDATE_SH]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      sh: {
        type: 'object',
        properties: {
          mode: { type: 'string', optional: true },
          width: { type: 'number', min: 0, max: 1, optional: true }
        }
      }
    },
    required: ['channel', 'sh']
  },
  
  [MESSAGE_TYPES.SET_SH_VALUES]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      values: {
        type: 'array',
        items: { type: 'number', min: -1, max: 1 },
        maxItems: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS
      }
    },
    required: ['channel', 'values']
  },
  
  // UI update messages (from worklet)
  [MESSAGE_TYPES.STEP_CHANGE]: {
    type: 'object',
    properties: {
      step: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS - 1,
        integer: true
      },
      channel: {
        type: 'number',
        min: -1,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true,
        optional: true
      },
      audioTime: {
        type: 'number',
        optional: true
      }
    },
    required: ['step']
  },
  
  [MESSAGE_TYPES.SH_VALUES_UPDATED]: {
    type: 'object',
    properties: {
      channel: {
        type: 'number',
        min: 0,
        max: SEQUENCER_CONSTANTS.MAX_CHANNELS - 1,
        integer: true
      },
      values: {
        type: 'array',
        items: { type: 'number' }
      }
    },
    required: ['channel', 'values']
  }
};

/**
 * Validate a value against a schema
 * @param {*} value - The value to validate
 * @param {Object} schema - The schema to validate against
 * @param {string} path - The property path for error messages
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validateValue(value, schema, path = '') {
  // Handle nullable values
  if (schema.nullable && value === null) {
    return { valid: true };
  }
  
  // Handle optional values
  if (schema.optional && value === undefined) {
    return { valid: true };
  }
  
  // Check required values
  if (!schema.optional && value === undefined) {
    return { valid: false, error: `${path} is required` };
  }
  
  // Type validation
  if (schema.type === 'number') {
    if (typeof value !== 'number' || isNaN(value)) {
      return { valid: false, error: `${path} must be a number` };
    }
    if (schema.min !== undefined && value < schema.min) {
      return { valid: false, error: `${path} must be >= ${schema.min}` };
    }
    if (schema.max !== undefined && value > schema.max) {
      return { valid: false, error: `${path} must be <= ${schema.max}` };
    }
    if (schema.integer && !Number.isInteger(value)) {
      return { valid: false, error: `${path} must be an integer` };
    }
  }
  
  else if (schema.type === 'string') {
    if (typeof value !== 'string') {
      return { valid: false, error: `${path} must be a string` };
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return { valid: false, error: `${path} must be one of: ${schema.enum.join(', ')}` };
    }
  }
  
  else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { valid: false, error: `${path} must be a boolean` };
    }
  }
  
  else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return { valid: false, error: `${path} must be an array` };
    }
    if (schema.maxItems && value.length > schema.maxItems) {
      return { valid: false, error: `${path} must have at most ${schema.maxItems} items` };
    }
    // Validate array items
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const itemResult = validateValue(value[i], schema.items, `${path}[${i}]`);
        if (!itemResult.valid) {
          return itemResult;
        }
      }
    }
  }
  
  else if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null) {
      return { valid: false, error: `${path} must be an object` };
    }
    
    // Validate object properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propPath = path ? `${path}.${key}` : key;
        const propResult = validateValue(value[key], propSchema, propPath);
        if (!propResult.valid) {
          return propResult;
        }
      }
    }
    
    // Check required properties
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          return { valid: false, error: `${path ? path + '.' : ''}${key} is required` };
        }
      }
    }
  }
  
  return { valid: true };
}

/**
 * MessageProtocol class
 * Handles message creation, validation, and batch operations
 */
export class MessageProtocol {
  constructor() {
    this.debugMode = false;
    this.messageLog = [];
    this.maxLogSize = 1000;
  }
  
  /**
   * Enable/disable debug mode
   * @param {boolean} enabled 
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
  }
  
  /**
   * Create and validate a message
   * @param {string} type - Message type from MESSAGE_TYPES
   * @param {*} data - Message data
   * @returns {Object} - { success: boolean, message?: Object, error?: string }
   */
  createMessage(type, data) {
    // Check if message type exists
    if (!MESSAGE_SCHEMAS[type]) {
      return { 
        success: false, 
        error: `Unknown message type: ${type}` 
      };
    }
    
    // Get schema and validate
    const schema = MESSAGE_SCHEMAS[type];
    const validation = validateValue(data, schema, 'data');
    
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed for ${type}: ${validation.error}`
      };
    }
    
    // Create message
    const message = { type, data };
    
    // Log if debug mode
    if (this.debugMode) {
      this.logMessage('create', message);
    }
    
    return { success: true, message };
  }
  
  /**
   * Create a batch of messages
   * @param {Array} operations - Array of { type, data } objects
   * @returns {Object} - { success: boolean, messages?: Array, errors?: Array }
   */
  createBatch(operations) {
    const messages = [];
    const errors = [];
    
    for (let i = 0; i < operations.length; i++) {
      const { type, data } = operations[i];
      const result = this.createMessage(type, data);
      
      if (result.success) {
        messages.push(result.message);
      } else {
        errors.push({
          index: i,
          type,
          error: result.error
        });
      }
    }
    
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    return { success: true, messages };
  }
  
  /**
   * Log a message for debugging
   * @param {string} action - 'create', 'send', 'receive'
   * @param {Object} message 
   */
  logMessage(action, message) {
    const entry = {
      timestamp: Date.now(),
      action,
      message: { ...message }
    };
    
    this.messageLog.push(entry);
    
    // Trim log if too large
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-this.maxLogSize);
    }
    
    if (this.debugMode) {
      console.log(`[MessageProtocol] ${action}:`, message);
    }
  }
  
  /**
   * Get recent message log
   * @param {number} count - Number of recent messages to return
   * @returns {Array}
   */
  getRecentMessages(count = 50) {
    return this.messageLog.slice(-count);
  }
  
  /**
   * Clear message log
   */
  clearLog() {
    this.messageLog = [];
  }
  
  // === Message Factory Methods ===
  
  /**
   * Transport control messages
   */
  start() {
    return this.createMessage(MESSAGE_TYPES.START, {});
  }
  
  stop() {
    return this.createMessage(MESSAGE_TYPES.STOP, {});
  }
  
  pause() {
    return this.createMessage(MESSAGE_TYPES.PAUSE, {});
  }
  
  /**
   * Configuration messages
   */
  setCycleTime(cycleTime) {
    return this.createMessage(MESSAGE_TYPES.SET_CYCLE_TIME, cycleTime);
  }
  
  setGlobalSubdivisions(subdivisions) {
    return this.createMessage(MESSAGE_TYPES.SET_SUBDIVISIONS, subdivisions);
  }
  
  setChannelSubdivisions(channel, subdivisions) {
    return this.createMessage(MESSAGE_TYPES.SET_CHANNEL_SUBDIVISIONS, {
      channel,
      subdivisions
    });
  }
  
  setPolyrhythm(channel, enabled, steps) {
    const data = { channel, enabled };
    if (steps !== undefined) {
      data.steps = steps;
    }
    return this.createMessage(MESSAGE_TYPES.SET_POLYRHYTHM, data);
  }
  
  /**
   * Channel mode messages
   */
  setChannelMode(channel, mode, cvMode, lfo, sh) {
    const data = { channel, mode };
    if (cvMode !== undefined) data.cvMode = cvMode;
    if (lfo !== undefined) data.lfo = lfo;
    if (sh !== undefined) data.sh = sh;
    return this.createMessage(MESSAGE_TYPES.SET_CHANNEL_MODE, data);
  }
  
  /**
   * Pattern messages
   */
  updatePattern(channel, step, active) {
    return this.createMessage(MESSAGE_TYPES.UPDATE_PATTERN, {
      channel,
      step,
      active
    });
  }
  
  clearPattern(channel) {
    const data = {};
    if (channel !== undefined) {
      data.channel = channel;
    }
    return this.createMessage(MESSAGE_TYPES.CLEAR_PATTERN, data);
  }
  
  /**
   * Create batch pattern update
   * @param {number} channel 
   * @param {Array} pattern - Array of boolean values
   * @returns {Object}
   */
  setChannelPattern(channel, pattern) {
    const operations = [];
    
    // Clear channel first
    operations.push({
      type: MESSAGE_TYPES.CLEAR_PATTERN,
      data: { channel }
    });
    
    // Add active steps
    for (let step = 0; step < pattern.length; step++) {
      if (pattern[step]) {
        operations.push({
          type: MESSAGE_TYPES.UPDATE_PATTERN,
          data: { channel, step, active: true }
        });
      }
    }
    
    return this.createBatch(operations);
  }
  
  /**
   * LFO messages
   */
  updateLFO(channel, lfo) {
    return this.createMessage(MESSAGE_TYPES.UPDATE_LFO, { channel, lfo });
  }
  
  /**
   * Pitch messages
   */
  updatePitch(channel, step, pitch) {
    return this.createMessage(MESSAGE_TYPES.UPDATE_PITCH, {
      channel,
      step,
      pitch
    });
  }
  
  /**
   * Create batch pitch update
   * @param {number} channel 
   * @param {Array} pitches - Array of pitch values (or null)
   * @returns {Object}
   */
  setChannelPitches(channel, pitches) {
    const operations = [];
    
    for (let step = 0; step < pitches.length; step++) {
      if (pitches[step] !== null) {
        operations.push({
          type: MESSAGE_TYPES.UPDATE_PITCH,
          data: { channel, step, pitch: pitches[step] }
        });
      }
    }
    
    return this.createBatch(operations);
  }
  
  /**
   * S&H messages
   */
  updateSH(channel, sh) {
    return this.createMessage(MESSAGE_TYPES.UPDATE_SH, { channel, sh });
  }
  
  setSHValues(channel, values) {
    return this.createMessage(MESSAGE_TYPES.SET_SH_VALUES, { channel, values });
  }
  
  /**
   * Validate incoming message from worklet
   * @param {Object} message 
   * @returns {Object} - { valid: boolean, error?: string }
   */
  validateIncomingMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Message must be an object' };
    }
    
    if (!message.type) {
      return { valid: false, error: 'Message must have a type' };
    }
    
    const schema = MESSAGE_SCHEMAS[message.type];
    if (!schema) {
      return { valid: false, error: `Unknown message type: ${message.type}` };
    }
    
    // Validate data if present
    if (message.data !== undefined) {
      return validateValue(message.data, schema, 'data');
    }
    
    return { valid: true };
  }
  
  /**
   * Create a complete channel configuration message batch
   * @param {number} channel 
   * @param {Object} config - Complete channel configuration
   * @returns {Object}
   */
  configureChannel(channel, config) {
    const operations = [];
    
    // Set mode
    if (config.mode) {
      operations.push({
        type: MESSAGE_TYPES.SET_CHANNEL_MODE,
        data: {
          channel,
          mode: config.mode,
          cvMode: config.cvMode,
          lfo: config.lfo,
          sh: config.sh
        }
      });
    }
    
    // Set subdivisions
    if (config.subdivisions !== undefined) {
      operations.push({
        type: MESSAGE_TYPES.SET_CHANNEL_SUBDIVISIONS,
        data: { channel, subdivisions: config.subdivisions }
      });
    }
    
    // Set polyrhythm
    if (config.usePolyrhythm !== undefined) {
      operations.push({
        type: MESSAGE_TYPES.SET_POLYRHYTHM,
        data: {
          channel,
          enabled: config.usePolyrhythm,
          steps: config.polyrhythmSteps
        }
      });
    }
    
    // Set pattern
    if (config.pattern) {
      const patternOps = this.setChannelPattern(channel, config.pattern);
      if (patternOps.success) {
        operations.push(...patternOps.messages.map(m => ({ type: m.type, data: m.data })));
      }
    }
    
    // Set pitches
    if (config.pitches) {
      const pitchOps = this.setChannelPitches(channel, config.pitches);
      if (pitchOps.success) {
        operations.push(...pitchOps.messages.map(m => ({ type: m.type, data: m.data })));
      }
    }
    
    // Set S&H values
    if (config.shValues) {
      operations.push({
        type: MESSAGE_TYPES.SET_SH_VALUES,
        data: { channel, values: config.shValues }
      });
    }
    
    return this.createBatch(operations);
  }
}

// Create singleton instance
const messageProtocol = new MessageProtocol();

// Export both the class and singleton
export default messageProtocol;
import { MESSAGE_TYPES } from './constants.js';
import messageProtocol from './MessageProtocol.js';

/**
 * AudioWorkletServiceV2 - Enhanced audio worklet communication service
 * 
 * Improvements over V1:
 * - Uses MessageProtocol for validated message creation
 * - Supports batch operations for better performance
 * - Enhanced error handling and debugging
 * - Message queuing with priority support
 * - Automatic retry for failed messages
 */
class AudioWorkletServiceV2 {
  constructor() {
    this.workletNode = null;
    this.messageQueue = [];
    this.isInitialized = false;
    this.messageHandlers = new Map();
    
    // Enhanced features
    this.debugMode = false;
    this.messageStats = {
      sent: 0,
      received: 0,
      failed: 0,
      retried: 0
    };
    
    // Batch operation settings
    this.batchMode = false;
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchDelay = 10; // ms
    this.maxBatchSize = 50;
    
    // Retry settings
    this.enableRetry = true;
    this.maxRetries = 3;
    this.retryDelay = 100; // ms
    this.retryQueue = new Map();
  }
  
  /**
   * Initialize the service with the audio worklet node
   * @param {AudioWorkletNode} workletNode 
   * @param {Object} options - Configuration options
   */
  initialize(workletNode, options = {}) {
    this.workletNode = workletNode;
    this.isInitialized = true;
    
    // Apply options
    if (options.debugMode !== undefined) {
      this.setDebugMode(options.debugMode);
    }
    if (options.batchDelay !== undefined) {
      this.batchDelay = options.batchDelay;
    }
    if (options.enableRetry !== undefined) {
      this.enableRetry = options.enableRetry;
    }
    
    // Set up message handler
    this.workletNode.port.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };
    
    // Process any queued messages
    this.processMessageQueue();
    
    console.log('AudioWorkletServiceV2 initialized with enhanced features');
  }
  
  /**
   * Enable/disable debug mode
   * @param {boolean} enabled 
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    messageProtocol.setDebugMode(enabled);
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
  handleIncomingMessage(message) {
    this.messageStats.received++;
    
    // Validate incoming message
    const validation = messageProtocol.validateIncomingMessage(message);
    if (!validation.valid) {
      console.warn('Invalid message received:', validation.error, message);
      return;
    }
    
    if (this.debugMode) {
      messageProtocol.logMessage('receive', message);
    }
    
    // Call registered handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    }
  }
  
  /**
   * Send a message to the worklet with validation
   * @param {string} type 
   * @param {*} data 
   * @param {Object} options - { priority: boolean, skipBatch: boolean }
   */
  sendMessage(type, data, options = {}) {
    // Create and validate message
    const result = messageProtocol.createMessage(type, data);
    
    if (!result.success) {
      console.error('Failed to create message:', result.error);
      this.messageStats.failed++;
      return false;
    }
    
    const message = result.message;
    
    // Add metadata
    message.id = this.generateMessageId();
    message.timestamp = Date.now();
    
    // Handle batching
    if (this.batchMode && !options.skipBatch) {
      this.addToBatch(message);
      return true;
    }
    
    // Send immediately or queue
    if (this.isInitialized && this.workletNode) {
      this.sendMessageInternal(message);
    } else {
      // Queue with priority support
      if (options.priority) {
        this.messageQueue.unshift(message);
      } else {
        this.messageQueue.push(message);
      }
    }
    
    return true;
  }
  
  /**
   * Internal method to send message to worklet
   * @param {Object} message 
   */
  sendMessageInternal(message) {
    try {
      this.workletNode.port.postMessage(message);
      this.messageStats.sent++;
      
      if (this.debugMode) {
        messageProtocol.logMessage('send', message);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      this.messageStats.failed++;
      
      // Retry if enabled
      if (this.enableRetry) {
        this.scheduleRetry(message);
      }
    }
  }
  
  /**
   * Schedule a message for retry
   * @param {Object} message 
   */
  scheduleRetry(message) {
    const retryInfo = this.retryQueue.get(message.id) || { count: 0 };
    retryInfo.count++;
    
    if (retryInfo.count <= this.maxRetries) {
      this.retryQueue.set(message.id, retryInfo);
      
      setTimeout(() => {
        if (this.isInitialized && this.workletNode) {
          this.messageStats.retried++;
          this.sendMessageInternal(message);
        }
      }, this.retryDelay * retryInfo.count);
    } else {
      console.error('Max retries exceeded for message:', message);
      this.retryQueue.delete(message.id);
    }
  }
  
  /**
   * Enable batch mode for sending multiple messages efficiently
   * @param {boolean} enabled 
   */
  setBatchMode(enabled) {
    this.batchMode = enabled;
    
    if (!enabled && this.batchQueue.length > 0) {
      this.flushBatch();
    }
  }
  
  /**
   * Add message to batch queue
   * @param {Object} message 
   */
  addToBatch(message) {
    this.batchQueue.push(message);
    
    // Auto-flush if batch is full
    if (this.batchQueue.length >= this.maxBatchSize) {
      this.flushBatch();
      return;
    }
    
    // Schedule batch flush
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.flushBatch();
      }, this.batchDelay);
    }
  }
  
  /**
   * Flush the batch queue
   */
  flushBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    if (this.batchQueue.length === 0) return;
    
    // Send batch message
    const batchMessage = {
      type: 'batch',
      messages: this.batchQueue,
      id: this.generateMessageId(),
      timestamp: Date.now()
    };
    
    this.batchQueue = [];
    
    if (this.isInitialized && this.workletNode) {
      this.sendMessageInternal(batchMessage);
    } else {
      this.messageQueue.unshift(batchMessage);
    }
  }
  
  /**
   * Process any messages that were queued before initialization
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.sendMessageInternal(message);
    }
  }
  
  /**
   * Generate unique message ID
   * @returns {string}
   */
  generateMessageId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get message statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.messageStats };
  }
  
  /**
   * Reset message statistics
   */
  resetStats() {
    this.messageStats = {
      sent: 0,
      received: 0,
      failed: 0,
      retried: 0
    };
  }
  
  // === High-level API methods using MessageProtocol ===
  
  // Transport control
  start() {
    return this.sendMessage(MESSAGE_TYPES.START, {});
  }
  
  stop() {
    return this.sendMessage(MESSAGE_TYPES.STOP, {});
  }
  
  pause() {
    return this.sendMessage(MESSAGE_TYPES.PAUSE, {});
  }
  
  // Configuration
  setCycleTime(cycleTime) {
    return this.sendMessage(MESSAGE_TYPES.SET_CYCLE_TIME, cycleTime);
  }
  
  setGlobalSubdivisions(subdivisions) {
    return this.sendMessage(MESSAGE_TYPES.SET_SUBDIVISIONS, subdivisions);
  }
  
  setChannelSubdivisions(channel, subdivisions) {
    return this.sendMessage(MESSAGE_TYPES.SET_CHANNEL_SUBDIVISIONS, {
      channel,
      subdivisions
    });
  }
  
  setPolyrhythm(channel, enabled, steps) {
    const data = { channel, enabled };
    if (steps !== undefined) {
      data.steps = steps;
    }
    return this.sendMessage(MESSAGE_TYPES.SET_POLYRHYTHM, data);
  }
  
  // Pattern operations
  updatePattern(channel, step, active) {
    return this.sendMessage(MESSAGE_TYPES.UPDATE_PATTERN, {
      channel,
      step,
      active
    });
  }
  
  clearAllPatterns() {
    return this.sendMessage(MESSAGE_TYPES.CLEAR_PATTERN, {});
  }
  
  clearChannelPattern(channel) {
    return this.sendMessage(MESSAGE_TYPES.CLEAR_PATTERN, { channel });
  }
  
  // Channel modes
  setChannelMode(channel, mode, cvMode, lfo, sh) {
    const data = { channel, mode };
    if (cvMode !== undefined) data.cvMode = cvMode;
    if (lfo !== undefined) data.lfo = lfo;
    if (sh !== undefined) data.sh = sh;
    return this.sendMessage(MESSAGE_TYPES.SET_CHANNEL_MODE, data);
  }
  
  // LFO
  updateLFO(channel, lfo) {
    return this.sendMessage(MESSAGE_TYPES.UPDATE_LFO, { channel, lfo });
  }
  
  // Pitch
  updatePitch(channel, step, pitch) {
    return this.sendMessage(MESSAGE_TYPES.UPDATE_PITCH, {
      channel,
      step,
      pitch
    });
  }
  
  // S&H
  updateSH(channel, sh) {
    return this.sendMessage(MESSAGE_TYPES.UPDATE_SH, { channel, sh });
  }
  
  setSHValues(channel, values) {
    return this.sendMessage(MESSAGE_TYPES.SET_SH_VALUES, { channel, values });
  }
  
  // === Batch Operations ===
  
  /**
   * Send complete channel pattern using batch mode
   * @param {number} channel 
   * @param {Array} pattern 
   * @param {number} subdivisions 
   */
  sendChannelPattern(channel, pattern, subdivisions) {
    const result = messageProtocol.setChannelPattern(channel, pattern);
    
    if (!result.success) {
      console.error('Failed to create channel pattern batch:', result.errors);
      return false;
    }
    
    // Send in batch mode
    const prevBatchMode = this.batchMode;
    this.setBatchMode(true);
    
    result.messages.forEach(msg => {
      this.sendMessage(msg.type, msg.data);
    });
    
    this.flushBatch();
    this.setBatchMode(prevBatchMode);
    
    return true;
  }
  
  /**
   * Send channel pitches using batch mode
   * @param {number} channel 
   * @param {Array} pitches 
   * @param {number} subdivisions 
   */
  sendChannelPitches(channel, pitches, subdivisions) {
    const result = messageProtocol.setChannelPitches(channel, pitches);
    
    if (!result.success) {
      console.error('Failed to create channel pitches batch:', result.errors);
      return false;
    }
    
    // Send in batch mode
    const prevBatchMode = this.batchMode;
    this.setBatchMode(true);
    
    result.messages.forEach(msg => {
      this.sendMessage(msg.type, msg.data);
    });
    
    this.flushBatch();
    this.setBatchMode(prevBatchMode);
    
    return true;
  }
  
  /**
   * Configure entire channel with batch operation
   * @param {number} channel 
   * @param {Object} config 
   */
  configureChannel(channel, config) {
    const result = messageProtocol.configureChannel(channel, config);
    
    if (!result.success) {
      console.error('Failed to create channel configuration batch:', result.errors);
      return false;
    }
    
    // Send in batch mode
    const prevBatchMode = this.batchMode;
    this.setBatchMode(true);
    
    result.messages.forEach(msg => {
      this.sendMessage(msg.type, msg.data);
    });
    
    this.flushBatch();
    this.setBatchMode(prevBatchMode);
    
    return true;
  }
  
  /**
   * Get message protocol instance for advanced usage
   * @returns {MessageProtocol}
   */
  getProtocol() {
    return messageProtocol;
  }
}

// Create singleton instance
const audioWorkletServiceV2 = new AudioWorkletServiceV2();

// Make it available globally for non-module scripts
window.audioWorkletServiceV2 = audioWorkletServiceV2;

// Export for use in ES modules
export default audioWorkletServiceV2;
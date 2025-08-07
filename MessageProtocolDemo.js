/**
 * MessageProtocolDemo.js
 *
 * Demonstrates usage of the improved message protocol system
 * Shows examples of validation, batch operations, and error handling
 */

import messageProtocol from "./MessageProtocol.js";
import audioWorkletServiceV2 from "./AudioWorkletServiceV2.js";

/**
 * Demo 1: Basic message creation and validation
 */
function demoBasicMessages() {
  console.log("=== Demo 1: Basic Message Creation ===");

  // Valid message
  const validMsg = messageProtocol.setCycleTime(2.5);
  console.log("Valid cycle time message:", validMsg);

  // Invalid message (out of range)
  const invalidMsg = messageProtocol.setCycleTime(10.0);
  console.log("Invalid cycle time message:", invalidMsg);

  // Pattern update
  const patternMsg = messageProtocol.updatePattern(0, 5, true);
  console.log("Pattern update message:", patternMsg);

  // Invalid channel
  const invalidChannel = messageProtocol.updatePattern(10, 5, true);
  console.log("Invalid channel message:", invalidChannel);
}

/**
 * Demo 2: Batch operations
 */
function demoBatchOperations() {
  console.log("\n=== Demo 2: Batch Operations ===");

  // Create a pattern for channel 0
  const pattern = [true, false, true, false, true, true, false, true];
  const batchResult = messageProtocol.setChannelPattern(0, pattern);

  console.log("Batch pattern result:", batchResult);
  console.log("Number of messages in batch:", batchResult.messages?.length);

  // Create pitch sequence
  const pitches = [0, 12, 7, 5, null, 3, -12, 0];
  const pitchBatch = messageProtocol.setChannelPitches(1, pitches);

  console.log("Pitch batch result:", pitchBatch);
  console.log("Number of pitch messages:", pitchBatch.messages?.length);
}

/**
 * Demo 3: Complex channel configuration
 */
function demoChannelConfiguration() {
  console.log("\n=== Demo 3: Channel Configuration ===");

  const channelConfig = {
    mode: "cv",
    cvMode: "lfo",
    lfo: {
      waveform: "sine",
      rate: 4,
      duty: 0.5,
      width: 0.8,
      phase: 0.25,
    },
    subdivisions: 16,
    usePolyrhythm: true,
    polyrhythmSteps: 12,
    pattern: [true, false, false, true, false, false, true, false],
    pitches: [0, null, null, 12, null, null, 7, null],
  };

  const configResult = messageProtocol.configureChannel(2, channelConfig);
  console.log("Channel configuration result:", configResult);
  console.log("Total messages generated:", configResult.messages?.length);

  // List message types in batch
  if (configResult.success) {
    const messageTypes = configResult.messages.map((m) => m.type);
    console.log("Message types in batch:", messageTypes);
  }
}

/**
 * Demo 4: Error handling and validation
 */
function demoErrorHandling() {
  console.log("\n=== Demo 4: Error Handling ===");

  // Enable debug mode
  messageProtocol.setDebugMode(true);

  // Try various invalid operations
  const errors = [];

  // Invalid subdivision
  const result1 = messageProtocol.setGlobalSubdivisions(200);
  if (!result1.success) errors.push(result1.error);

  // Invalid LFO rate
  const result2 = messageProtocol.updateLFO(0, { rate: 50 });
  if (!result2.success) errors.push(result2.error);

  // Invalid pitch
  const result3 = messageProtocol.updatePitch(0, 0, 200);
  if (!result3.success) errors.push(result3.error);

  // Missing required field
  const result4 = messageProtocol.createMessage("updatePattern", {
    channel: 0,
  });
  if (!result4.success) errors.push(result4.error);

  console.log("Validation errors caught:", errors);

  // Disable debug mode
  messageProtocol.setDebugMode(false);
}

/**
 * Demo 5: Using AudioWorkletServiceV2
 */
async function demoWorkletService() {
  console.log("\n=== Demo 5: AudioWorkletServiceV2 Usage ===");

  // Note: This is a simulation since we don't have an actual AudioWorkletNode
  console.log("Simulating worklet service usage...");

  // Enable debug mode
  audioWorkletServiceV2.setDebugMode(true);

  // Enable batch mode for efficient updates
  audioWorkletServiceV2.setBatchMode(true);

  // Send multiple pattern updates
  for (let channel = 0; channel < 4; channel++) {
    for (let step = 0; step < 8; step++) {
      if ((channel + step) % 2 === 0) {
        audioWorkletServiceV2.updatePattern(channel, step, true);
      }
    }
  }

  // Flush the batch
  audioWorkletServiceV2.flushBatch();

  // Send channel configuration
  const config = {
    mode: "trigger",
    subdivisions: 16,
    pattern: Array(16).fill(false).map((_, i) => i % 4 === 0),
  };

  audioWorkletServiceV2.configureChannel(0, config);

  // Get statistics
  const stats = audioWorkletServiceV2.getStats();
  console.log("Service statistics:", stats);

  // Disable batch mode
  audioWorkletServiceV2.setBatchMode(false);
}

/**
 * Demo 6: Message logging and debugging
 */
function demoMessageLogging() {
  console.log("\n=== Demo 6: Message Logging ===");

  // Enable debug mode
  messageProtocol.setDebugMode(true);

  // Create several messages
  messageProtocol.start();
  messageProtocol.setCycleTime(4.0);
  messageProtocol.setChannelMode(0, "cv", "lfo");
  messageProtocol.updatePattern(0, 0, true);
  messageProtocol.updatePattern(0, 4, true);

  // Get recent messages
  const recentMessages = messageProtocol.getRecentMessages(5);
  console.log("Recent messages:", recentMessages);

  // Clear log
  messageProtocol.clearLog();
  console.log("Log cleared");

  messageProtocol.setDebugMode(false);
}

/**
 * Demo 7: Incoming message validation
 */
function demoIncomingValidation() {
  console.log("\n=== Demo 7: Incoming Message Validation ===");

  // Simulate incoming messages from worklet
  const incomingMessages = [
    // Valid step change
    {
      type: "stepChange",
      data: {
        step: 5,
        audioTime: 1.234,
        channel: 2,
      },
    },
    // Invalid step change (missing required field)
    {
      type: "stepChange",
      data: {
        audioTime: 1.234,
      },
    },
    // Unknown message type
    {
      type: "unknownType",
      data: {},
    },
    // Invalid format
    "not an object",
  ];

  incomingMessages.forEach((msg, index) => {
    const validation = messageProtocol.validateIncomingMessage(msg);
    console.log(`Message ${index + 1} validation:`, validation);
  });
}

/**
 * Run all demos
 */
export function runAllDemos() {
  console.log("ES-8 Message Protocol Demo\n");

  demoBasicMessages();
  demoBatchOperations();
  demoChannelConfiguration();
  demoErrorHandling();
  demoWorkletService();
  demoMessageLogging();
  demoIncomingValidation();

  console.log("\n=== Demo Complete ===");
}

// If running as a module, execute demos
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllDemos();
}

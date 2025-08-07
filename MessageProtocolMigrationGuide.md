# Message Protocol Migration Guide

This guide explains how to migrate from the current message passing system to
the improved MessageProtocol system.

## Overview

The new MessageProtocol system provides:

- **Type-safe message creation** with validation
- **Batch operations** for improved performance
- **Better error handling** and debugging
- **Unified message schema** with documentation
- **Automatic retry** for failed messages

## Key Components

### 1. MessageProtocol.js

The core protocol implementation that handles:

- Message validation against schemas
- Message factory methods
- Batch message creation
- Debug logging

### 2. AudioWorkletServiceV2.js

Enhanced service that:

- Uses MessageProtocol for validation
- Supports batch mode for efficiency
- Provides retry mechanism
- Tracks message statistics

### 3. WorkletMessageHandler.js

Worklet-side handler that:

- Validates incoming messages
- Processes batch messages
- Provides consistent error handling

## Migration Steps

### Step 1: Update imports in sequencer.js

```javascript
// Old
import { audioWorkletService } from "./AudioWorkletService.js";

// New
import audioWorkletServiceV2 from "./AudioWorkletServiceV2.js";
const workletService = audioWorkletServiceV2;
```

### Step 2: Initialize with options

```javascript
// Old
workletService.initialize(es8Node);

// New
workletService.initialize(es8Node, {
  debugMode: false, // Enable for debugging
  batchDelay: 10, // Delay before sending batch
  enableRetry: true, // Auto-retry failed messages
});
```

### Step 3: Use batch mode for pattern updates

```javascript
// Old - multiple individual messages
for (let step = 0; step < subdivisions; step++) {
  if (pattern[step]) {
    workletService.updatePattern(channel, step, true);
  }
}

// New - single batch operation
workletService.sendChannelPattern(channel, pattern, subdivisions);
```

### Step 4: Update worklet processor

In `sequencer-processor.js`, add the message handler:

```javascript
// At the top of the file
importScripts("WorkletMessageHandler.js");

class SequencerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // ... existing initialization ...

    // Initialize message handler
    this.messageHandler = new WorkletMessageHandler(this);

    // Replace existing onmessage handler
    this.port.onmessage = (event) => {
      this.messageHandler.handleMessage(event.data);
    };
  }

  // Use message handler for outgoing messages
  sendStepUpdate(step, audioTime, channel = -1) {
    this.messageHandler.sendStepChange(step, audioTime, channel);
  }
}
```

### Step 5: Error handling improvements

```javascript
// Old - no validation
workletService.setChannelSubdivisions(channel, value);

// New - with validation
const success = workletService.setChannelSubdivisions(channel, value);
if (!success) {
  console.error("Failed to set channel subdivisions");
}
```

### Step 6: Use channel configuration batching

```javascript
// Old - multiple messages
workletService.setChannelMode(channel, mode, cvMode, lfo, sh);
workletService.setChannelSubdivisions(channel, subdivisions);
workletService.setPolyrhythm(channel, enabled, steps);
// ... send pattern
// ... send pitches

// New - single batch configuration
workletService.configureChannel(channel, {
  mode: mode,
  cvMode: cvMode,
  lfo: lfo,
  sh: sh,
  subdivisions: subdivisions,
  usePolyrhythm: enabled,
  polyrhythmSteps: steps,
  pattern: pattern,
  pitches: pitches,
});
```

## Performance Optimizations

### 1. Enable batch mode for bulk updates

```javascript
// When doing many updates
workletService.setBatchMode(true);

// Perform updates...
for (let i = 0; i < manyUpdates; i++) {
  workletService.updatePattern(channel, step, active);
}

// Flush when done
workletService.flushBatch();
workletService.setBatchMode(false);
```

### 2. Use priority messages for time-critical updates

```javascript
// High priority message (skips queue)
workletService.sendMessage(MESSAGE_TYPES.START, {}, {
  priority: true,
  skipBatch: true,
});
```

### 3. Monitor performance

```javascript
// Get message statistics
const stats = workletService.getStats();
console.log("Messages sent:", stats.sent);
console.log("Messages failed:", stats.failed);
console.log("Messages retried:", stats.retried);
```

## Debugging

### Enable debug mode

```javascript
// Enable comprehensive logging
workletService.setDebugMode(true);

// Get recent message history
const protocol = workletService.getProtocol();
const recentMessages = protocol.getRecentMessages(50);
console.log("Recent messages:", recentMessages);
```

### Validate messages manually

```javascript
const protocol = workletService.getProtocol();

// Test message creation
const result = protocol.createMessage(MESSAGE_TYPES.UPDATE_PATTERN, {
  channel: 0,
  step: 5,
  active: true,
});

if (!result.success) {
  console.error("Invalid message:", result.error);
}
```

## Benefits

1. **Type Safety**: All messages are validated before sending
2. **Performance**: Batch operations reduce message overhead
3. **Reliability**: Automatic retry for failed messages
4. **Debugging**: Comprehensive logging and statistics
5. **Maintainability**: Centralized message definitions and validation

## Gradual Migration

You can migrate gradually by:

1. Keep both services running initially
2. Migrate one feature at a time
3. Test thoroughly before removing old code
4. Use debug mode to verify message flow

## Example: Complete Migration

Here's a complete example of migrating the pattern update functionality:

```javascript
// Old implementation
function sendPatternToWorklet() {
  if (!es8Node) return;

  for (let channel = 0; channel < 8; channel++) {
    const subdivisions = getChannelSubdivisions(channel);

    // Clear existing pattern
    for (let step = 0; step < 96; step++) {
      workletService.updatePattern(channel, step, false);
    }

    // Send active steps
    for (let step = 0; step < subdivisions; step++) {
      if (sequencerState.pattern[channel][step]) {
        workletService.updatePattern(channel, step, true);
      }
    }
  }
}

// New implementation
function sendPatternToWorklet() {
  if (!es8Node) return;

  // Enable batch mode for efficiency
  workletService.setBatchMode(true);

  for (let channel = 0; channel < 8; channel++) {
    const subdivisions = getChannelSubdivisions(channel);
    const pattern = sequencerState.pattern[channel].slice(0, subdivisions);

    // Send entire pattern in one batch
    workletService.sendChannelPattern(channel, pattern, subdivisions);
  }

  // Send all batched messages
  workletService.flushBatch();
  workletService.setBatchMode(false);
}
```

This approach reduces the number of messages from potentially hundreds to just a
few dozen, significantly improving performance.

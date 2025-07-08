# ES-8 Web Sequencer - Refactoring Guide

## Overview

The ES-8 Web Sequencer has been refactored into a modular, maintainable architecture with clear separation of concerns. This guide explains the new structure and how to work with it.

## Architecture

### Core Modules

1. **AudioWorkletService.js**
   - Centralized communication with the audio worklet
   - Handles all message passing and queuing
   - Provides clean API for worklet operations

2. **StateManager.js**
   - Reactive state management with pub/sub pattern
   - Centralized state updates
   - Automatic UI updates through subscriptions

3. **constants.js**
   - All magic numbers and strings in one place
   - Organized by category (sequencer, channel, UI, etc.)
   - Single source of truth for configuration

4. **PatternMigration.js**
   - Phase-based pattern migration logic
   - Handles subdivision changes for all data types
   - Preserves musical timing relationships

5. **UIComponentFactory.js**
   - Standardized UI component creation
   - Consistent styling and behavior
   - Reusable component patterns

6. **ChannelClasses.js**
   - Object-oriented channel representation
   - Encapsulated channel-specific logic
   - Clean API for channel operations

7. **UISubscriptions.js**
   - Maps state changes to UI updates
   - Centralizes UI update logic
   - Reduces coupling between state and UI

## Usage Examples

### Working with State

```javascript
import { stateManager } from './StateManager.js';

// Get state
const subdivisions = stateManager.get('subdivisions');
const channelMode = stateManager.getChannelProperty(0, 'mode');

// Update state (triggers UI updates automatically)
stateManager.set('subdivisions', 16);
stateManager.setChannelProperty(0, 'mode', 'trigger');

// Subscribe to changes
const unsubscribe = stateManager.subscribe('channels.0.mode', (newMode) => {
  console.log('Channel 0 mode changed to:', newMode);
});

// Batch updates
stateManager.transaction(() => {
  stateManager.set('subdivisions', 32);
  stateManager.setChannelProperty(0, 'subdivisions', 32);
});
```

### Working with Channels

```javascript
import { ChannelFactory, TriggerChannel } from './ChannelClasses.js';

// Create a channel
const channel = ChannelFactory.createChannel(0, 'trigger');

// Work with trigger channel
if (channel instanceof TriggerChannel) {
  channel.toggleStep(4);
  channel.setStep(8, true);
  const pattern = channel.getCurrentPattern();
}

// Change channel mode
const lfoChannel = ChannelFactory.createChannel(0, 'cv', 'lfo');
lfoChannel.setWaveform('sine');
lfoChannel.setRate(2.5);
```

### Creating UI Components

```javascript
import * as UI from './UIComponentFactory.js';

// Create a mode button
const triggerBtn = UI.createModeButton({
  mode: 'trigger',
  text: 'Trig',
  isActive: true,
  onClick: () => setChannelMode(channel, 'trigger')
});

// Create parameter slider
const { container, slider } = UI.createSlider({
  id: 'lfo-rate',
  label: 'Rate',
  min: 0.01,
  max: 10,
  value: 1,
  step: 0.01,
  displayFormatter: (v) => `${v.toFixed(2)} Hz`,
  onChange: (value) => updateLFO(channel, 'rate', value)
});

// Create step grid
const grid = UI.createStepGrid(channel, subdivisions, pattern, {
  onMouseDown: handleStepClick,
  onMouseEnter: handleStepDrag
});
```

### Pattern Migration

```javascript
import { migratePattern, migratePitches } from './PatternMigration.js';

// Migrate trigger pattern
const newPattern = migratePattern(oldPattern, 8, 16);

// Migrate pitches
const newPitches = migratePitches(oldPitches, 8, 16);

// Batch migration
import { batchMigrate, MIGRATION_STRATEGIES } from './PatternMigration.js';

const migrated = batchMigrate({
  pattern: { data: oldPattern, strategy: MIGRATION_STRATEGIES.PATTERN },
  pitches: { data: oldPitches, strategy: MIGRATION_STRATEGIES.PITCH }
}, 8, 16);
```

### Audio Worklet Communication

```javascript
// The AudioWorkletService is available globally
const workletService = window.audioWorkletService;

// Send commands
workletService.start();
workletService.setCycleTime(2.0);
workletService.updatePattern(channel, step, true);
workletService.setChannelSubdivisions(channel, 16);

// Handle messages from worklet
workletService.onMessage('step', (message) => {
  updateStepIndicator(message.channel, message.step);
});
```

## Best Practices

1. **State Updates**
   - Always use StateManager for state changes
   - Use transactions for multiple related updates
   - Subscribe to state changes instead of polling

2. **UI Creation**
   - Use UIComponentFactory for consistency
   - Pass configuration objects for flexibility
   - Keep event handlers small and focused

3. **Channel Operations**
   - Use the appropriate channel class methods
   - Don't access internal properties directly
   - Use ChannelFactory for creation

4. **Pattern Migration**
   - Always use the migration functions when changing subdivisions
   - Consider the musical relationship between old and new patterns
   - Test edge cases (empty patterns, full patterns)

## File Structure

```
es_8_test/
├── index.html              # Main HTML file
├── sequencer.js            # Main sequencer logic
├── sequencer-processor.js  # Audio worklet processor
├── server.ts               # Deno server
│
├── Core Modules/
│   ├── AudioWorkletService.js
│   ├── StateManager.js
│   ├── constants.js
│   └── PatternMigration.js
│
├── UI Modules/
│   ├── UIComponentFactory.js
│   └── UISubscriptions.js
│
└── Channel System/
    └── ChannelClasses.js
```

## Migration from Old Code

If you're updating existing code to use the new architecture:

1. Replace direct state modifications with StateManager calls
2. Replace UI element creation with UIComponentFactory methods
3. Use constants instead of magic numbers/strings
4. Replace worklet communication with AudioWorkletService
5. Consider using ChannelClasses for channel logic

## Future Enhancements

The refactored architecture makes it easy to add:

- Preset management
- Undo/redo functionality
- Advanced pattern operations
- Additional channel types
- Export/import functionality
- Real-time collaboration features

The modular structure ensures new features can be added without affecting existing functionality.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

ES-8 Web Sequencer is a browser-based control interface for the Expert Sleepers
ES-8 DC-coupled audio interface. It enables precise CV and gate control of
Eurorack modular synthesizers directly from a web browser using the Web Audio
API.

## Development Commands

```bash
# Start development server with hot reload
deno task dev

# Start production server
deno task start

# Format code
deno task fmt

# Lint code
deno task lint
```

## Architecture

The project uses a client-server architecture with real-time audio processing:

1. **server.ts**: Deno HTTP server that serves static files
2. **index.html**: Main UI entry point
3. **sequencer.js**: UI logic and pattern management (runs in main thread)
4. **sequencer-processor.js**: AudioWorklet processor for sample-accurate audio
   generation (runs in audio thread)

### Key Technical Details

- **No external dependencies**: Pure vanilla JavaScript implementation
- **Web Audio API AudioWorklet**: Provides low-latency, sample-accurate timing
- **Message passing**: Communication between UI thread and audio thread via
  postMessage
- **48kHz sample rate**: Required for precise CV control
- **Multi-channel output**: Requires aggregate audio device on macOS for
  channels 3-8

### Channel Modes

Each of the 8 channels can operate in one of four modes:

- **Trigger**: Gate/trigger patterns (10V gates, 20ms duration)
- **LFO**: Continuous CV with ramp/sine waveforms
- **1V/Oct**: Pitch CV sequencing (-36 to +36 semitones)
- **S&H**: Sample & Hold random voltages

## Important Considerations

1. **Browser Compatibility**: Multi-channel audio (>2 channels) has limited
   browser support. Chrome, Edge, and Safari work best.

2. **macOS Audio Setup**: Users must create an aggregate audio device to access
   all 8 channels of the ES-8.

3. **Real-time Constraints**: The audio worklet runs in a real-time thread.
   Avoid complex computations in sequencer-processor.js.

4. **No Build Process**: This is a vanilla JavaScript project with no bundling
   or transpilation. Keep imports minimal and use modern ES6+ features directly.

5. **Testing**: Use debug/multichannel-test.html to verify multi-channel audio
   output functionality.

## Common Development Tasks

When modifying the sequencer functionality:

1. UI changes go in sequencer.js
2. Audio generation changes go in sequencer-processor.js
3. Communication between threads uses the established message protocol
4. Always test with an actual ES-8 or multi-channel audio interface

When adding new channel modes:

1. Add UI controls in the mode-specific sections of index.html
2. Update message handling in both sequencer.js and sequencer-processor.js
3. Implement audio generation logic in the processor's process() method

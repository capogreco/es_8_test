# ES-8 Web Sequencer

A browser-based control interface for Expert Sleepers ES-8 DC-coupled audio
interface, enabling precise CV and gate control of Eurorack modular synthesizers
directly from your web browser.

## Features

- **8-channel sequencer** with multiple modes per channel:
  - **Trigger mode**: Traditional gate/trigger sequencing
  - **LFO mode**: Continuous CV with ramp/sine waveforms
  - **1V/Oct mode**: Pitch CV sequencing (-36 to +36 semitones)
  - **S&H mode**: Sample & Hold random voltages with rand/shuf modes

- **Flexible timing**:
  - Adjustable cycle period (0.5-8 seconds)
  - Variable subdivisions (2-24 steps)
  - Sample-accurate timing via Web Audio API AudioWorklet

- **Visual feedback**:
  - Real-time step indicators
  - Waveform visualization for LFO mode
  - Color-coded voltage display for S&H mode
  - Drag-to-edit pattern creation

## Requirements

- Expert Sleepers ES-8 audio interface
- macOS (tested) or Windows/Linux (should work)
- Modern web browser with Web Audio API support
- Deno runtime

## Setup

### macOS Audio Configuration

1. Create an aggregate audio device in Audio MIDI Setup:
   - Open Audio MIDI Setup
   - Click the '+' button and select "Create Aggregate Device"
   - Add ES-8 to the aggregate
   - This enables access to all 8 output channels

### Running the Server

1. Install [Deno](https://deno.land/)
2. Start the server:
   ```bash
   deno task start
   ```
3. Open http://localhost:8000 in your browser

## Usage

### Basic Operation

1. Click "Start Audio" to initialize the audio system
2. Select a mode for each channel using the 2x2 button grid
3. Click "Play" to start the sequencer

### Channel Modes

#### Trigger Mode

- Click cells to create trigger patterns
- Outputs 10V gates (20ms duration)

#### LFO Mode

- **Waveform**: Ramp or Sine
- **Rate**: 1-16 sub-cycles per pattern
- **Duty**: Ramp shape control (0-100%)
- **Width**: Output amplitude (0-100%)

#### 1V/Oct Mode

- Enter pitch values (-36 to +36 semitones)
- Empty cells maintain previous voltage
- Follows 1V/octave standard

#### S&H Mode

- **Rand**: New random values each cycle
- **Shuf**: Same values between cycles
- **Width**: Scales output amplitude
- Visualized as color-coded lines (green=positive, red=negative)

### Pattern Editing

- **Click**: Toggle single cell
- **Click & Drag**: Edit multiple cells in one gesture
- **Clear**: Reset all patterns

## Technical Details

- Uses Web Audio API AudioWorklet for low-latency, sample-accurate timing
- Outputs calibrated CV/gate signals via ES-8's DC-coupled outputs
- 48kHz sample rate for precise CV control
- Message passing between UI and audio thread for responsive controls

## Channel Mapping

The ES-8 channel mapping may vary by system. The interface automatically maps to
the first 8 available output channels. If you experience channel routing issues,
check your audio device configuration.

## Troubleshooting

- **No output on channels 3-8**: Create an aggregate audio device (see Setup)
- **Timing issues**: Ensure no other applications are using the ES-8
- **Browser compatibility**: Use Chrome, Edge, or Safari for best results

## Development

Built with:

- Deno for the HTTP server
- Vanilla JavaScript with Web Audio API
- AudioWorklet for real-time audio processing

## License

MIT

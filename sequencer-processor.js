class SequencerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Sequencer state
    this.isPlaying = false;
    this.subdivisions = 8;
    this.cycleTime = 2.0;
    this.currentStep = 0;
    this.samplesSinceLastStep = 0;
    this.samplesPerStep = 0;

    // Master phasor for all timing
    this.masterPhasor = 0; // 0-1 representing position in cycle
    this.totalCycleSamples = 0; // Total samples in one cycle
    this.currentCycleSample = 0; // Current sample position in cycle

    // Track previous steps for edge detection
    this.previousSteps = Array(8).fill(-1);
    this.previousGlobalStep = -1;

    // Pattern storage - 8 channels x 96 max steps
    this.pattern = Array(8).fill(null).map(() => Array(96).fill(false));

    // Channel configurations
    this.channels = Array(8).fill(null).map(() => ({
      mode: "trigger", // 'trigger' or 'cv'
      cvMode: "lfo", // 'lfo' or '1voct' or 'sh'
      useCustomSubdivisions: false, // Whether this channel uses custom subdivisions
      subdivisions: 8, // Per-channel subdivisions (2-96)
      lfo: {
        waveform: "ramp",
        rate: 1,
        duty: 0.5,
        width: 1.0,
      },
      pitches: Array(96).fill(null),
      currentPitch: 0, // Current CV output for 1V/Oct mode
      lfoPhase: 0, // Current phase for LFO
      sh: {
        mode: "rand", // 'rand' or 'shuf'
        width: 1.0,
        values: Array(96).fill(0),
        currentValue: 0, // Current S&H output
      },
    }));

    // Trigger states for each channel
    this.triggerStates = Array(8).fill(null).map(() => ({
      active: false,
      sampleCount: 0,
    }));

    // Calculate initial timing
    this.updateTiming();

    // Handle control messages
    this.port.onmessage = (event) => {
      const { type, data } = event.data;

      switch (type) {
        case "start":
          this.isPlaying = true;
          // Reset master phasor
          this.masterPhasor = 0;
          this.currentCycleSample = 0;
          // Reset step tracking
          this.previousSteps.fill(-1);
          this.previousGlobalStep = -1;
          // Reset LFO phases
          for (let channel = 0; channel < 8; channel++) {
            this.channels[channel].lfoPhase = 0;
          }
          break;

        case "stop":
          this.isPlaying = false;
          // Clear all active triggers
          this.triggerStates.forEach((state) => {
            state.active = false;
            state.sampleCount = 0;
          });
          break;

        case "updatePattern":
          if (
            data.channel >= 0 && data.channel < 8 &&
            data.step >= 0 && data.step < 96
          ) {
            this.pattern[data.channel][data.step] = data.active;
          }
          break;

        case "clearPattern":
          this.pattern = Array(8).fill(null).map(() => Array(96).fill(false));
          // Also clear pitch data
          for (let channel = 0; channel < 8; channel++) {
            this.channels[channel].pitches = Array(96).fill(null);
          }
          break;

        case "setCycleTime":
          this.cycleTime = data;
          this.updateTiming();
          break;

        case "setSubdivisions": {
          const wasPlaying = this.isPlaying;
          if (wasPlaying) this.isPlaying = false;

          this.subdivisions = data;
          this.currentStep = 0;
          this.samplesSinceLastStep = 0;
          this.updateTiming();

          if (wasPlaying) this.isPlaying = true;
          break;
        }

        case "setChannelMode":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].mode = data.mode;
            this.channels[data.channel].cvMode = data.cvMode;
            if (data.lfo) {
              this.channels[data.channel].lfo = data.lfo;
            }
            if (data.sh) {
              this.channels[data.channel].sh = data.sh;
            }
          }
          break;

        case "setCVMode":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].cvMode = data.cvMode;
          }
          break;

        case "updateLFO":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].lfo = data.lfo;
          }
          break;

        case "updatePitch":
          if (
            data.channel >= 0 && data.channel < 8 &&
            data.step >= 0 && data.step < 96
          ) {
            this.channels[data.channel].pitches[data.step] = data.pitch;
          }
          break;

        case "updateSH":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].sh = data.sh;
          }
          break;

        case "setSHValues":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].sh.values = data.values;
          }
          break;

        case "setChannelSubdivisions":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].useCustomSubdivisions = true;
            this.channels[data.channel].subdivisions = data.subdivisions;
          }
          break;
      }
    };
  }

  updateTiming() {
    // Calculate samples per step based on cycle time and subdivisions
    this.samplesPerStep = Math.floor(
      (this.cycleTime * sampleRate) / this.subdivisions,
    );
    // Calculate total samples in one cycle
    this.totalCycleSamples = Math.floor(this.cycleTime * sampleRate);
  }

  process(_inputs, outputs, _parameters) {
    const output = outputs[0];

    // Process each sample in the block
    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex++) {
      // Handle sequencer timing
      if (this.isPlaying) {
        // Update master phasor
        this.masterPhasor = this.currentCycleSample / this.totalCycleSamples;

        // Calculate global step from phasor
        const globalStep = Math.floor(this.masterPhasor * this.subdivisions) %
          this.subdivisions;

        // Check for global step change
        if (globalStep !== this.previousGlobalStep) {
          this.previousGlobalStep = globalStep;

          // Send step change for UI indicator
          this.port.postMessage({
            type: "stepChange",
            step: globalStep,
            channel: -1, // -1 indicates global
            time: currentTime + (sampleIndex / sampleRate),
            audioTime: currentTime,
          });
        }

        // Process each channel using the master phasor
        for (let channel = 0; channel < 8; channel++) {
          const channelConfig = this.channels[channel];

          // Get channel-specific subdivisions
          const channelSubdivisions = channelConfig.useCustomSubdivisions
            ? channelConfig.subdivisions
            : this.subdivisions;

          // Calculate current step from master phasor
          const currentStep =
            Math.floor(this.masterPhasor * channelSubdivisions) %
            channelSubdivisions;

          // Check if step changed
          if (currentStep !== this.previousSteps[channel]) {
            this.previousSteps[channel] = currentStep;

            // Send per-channel step change for UI
            this.port.postMessage({
              type: "stepChange",
              step: currentStep,
              channel: channel,
              time: currentTime + (sampleIndex / sampleRate),
              audioTime: currentTime,
            });

            // Check if we've wrapped around to beginning of pattern
            if (currentStep === 0 && this.masterPhasor < 0.5) {
              // We're at the start of a new cycle
              // Regenerate S&H values for this channel if in rand mode
              if (
                channelConfig.mode === "cv" &&
                channelConfig.cvMode === "sh" &&
                channelConfig.sh.mode === "rand"
              ) {
                for (let i = 0; i < channelSubdivisions; i++) {
                  channelConfig.sh.values[i] = Math.random() * 2 - 1;
                }
                // Notify UI of new values
                this.port.postMessage({
                  type: "shValuesUpdated",
                  channel: channel,
                  values: channelConfig.sh.values.slice(0, channelSubdivisions),
                });
              }
            }

            // Process channel based on its mode
            if (channelConfig.mode === "trigger") {
              // Trigger mode - check pattern
              if (this.pattern[channel][currentStep]) {
                this.triggerStates[channel].active = true;
                this.triggerStates[channel].sampleCount = 0;
              }
            } else if (
              channelConfig.mode === "cv" && channelConfig.cvMode === "1voct"
            ) {
              // 1V/Oct mode - update pitch on step change
              const pitch = channelConfig.pitches[currentStep];
              if (pitch !== null) {
                channelConfig.currentPitch = pitch;
              }
            } else if (
              channelConfig.mode === "cv" && channelConfig.cvMode === "sh"
            ) {
              // S&H mode - update value on step change
              channelConfig.sh.currentValue =
                channelConfig.sh.values[currentStep];
            }
          }
        }

        // Increment cycle position
        this.currentCycleSample = (this.currentCycleSample + 1) %
          this.totalCycleSamples;
      }

      // Generate output for each channel
      for (let channel = 0; channel < 8 && channel < output.length; channel++) {
        const channelData = output[channel];
        if (!channelData) continue;

        const channelConfig = this.channels[channel];
        const triggerState = this.triggerStates[channel];

        if (channelConfig.mode === "trigger") {
          // Generate trigger pulse (20ms = 960 samples at 48kHz)
          if (triggerState.active && triggerState.sampleCount < 960) {
            channelData[sampleIndex] = 1.0; // +10V
            triggerState.sampleCount++;
          } else {
            channelData[sampleIndex] = 0; // 0V
            if (triggerState.sampleCount >= 960) {
              triggerState.active = false;
              triggerState.sampleCount = 0;
            }
          }
        } else if (channelConfig.mode === "cv") {
          if (channelConfig.cvMode === "lfo") {
            // LFO mode
            const lfo = channelConfig.lfo;
            let value = 0;

            if (this.isPlaying) {
              // Calculate LFO phase directly from master phasor
              // lfo.rate determines how many complete cycles per pattern
              // Add phase offset (0-1 mapped to 0-2π)
              const phaseOffset = (lfo.phase || 0) * 2 * Math.PI;
              channelConfig.lfoPhase =
                (this.masterPhasor * lfo.rate * 2 * Math.PI + phaseOffset) % (2 * Math.PI);

              if (lfo.waveform === "sine") {
                // Sine wave
                value = Math.sin(channelConfig.lfoPhase) * lfo.width;
              } else {
                // Ramp with duty cycle
                const normalizedPhase = channelConfig.lfoPhase / (2 * Math.PI);
                if (normalizedPhase < lfo.duty) {
                  // Rising phase
                  value = (normalizedPhase / lfo.duty) * 2 - 1;
                } else {
                  // Falling phase
                  value = ((1 - normalizedPhase) / (1 - lfo.duty)) * 2 - 1;
                }
                value *= lfo.width;
              }
            }

            channelData[sampleIndex] = value;
          } else if (channelConfig.cvMode === "1voct") {
            // 1V/Oct mode - output scaled pitch CV
            // -120 to +120 semitones maps to -1.0 to +1.0 (-10V to +10V)
            const voltage = channelConfig.currentPitch / 120.0; // 12 semitones per volt, /10 for audio range
            channelData[sampleIndex] = voltage;
          } else if (channelConfig.cvMode === "sh") {
            // S&H mode - output random voltage scaled by width
            // Apply width scaling: as width approaches 0, value approaches 0
            const scaledValue = channelConfig.sh.currentValue *
              channelConfig.sh.width;
            channelData[sampleIndex] = scaledValue; // -1 to +1 range (±10V)
          }
        }
      }
    }

    return true; // Keep processor running
  }
}

registerProcessor("sequencer-processor", SequencerProcessor);

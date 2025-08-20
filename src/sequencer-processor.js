// Constants
const DEFAULT_TRIGGER_DURATION_SAMPLES = 960; // 20ms at 48kHz
const MAX_SUBDIVISIONS = 96;
const NUM_CHANNELS = 8;
const SAMPLE_RATE = 48000;

// Envelope time constants (for reference)
const MS_TO_SAMPLES = SAMPLE_RATE / 1000; // Convert milliseconds to samples

class SequencerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Sequencer state
    this.isPlaying = false;
    this.isStopped = true; // Track if we're in stopped state
    this.subdivisions = 8;
    this.cycleTime = 2.0;
    this.debugMode = false; // Toggle for debug logging
    this.currentStep = 0;
    this.samplesSinceLastStep = 0;
    this.samplesPerStep = 0;
    this.lastGlobalStepTime = 0;

    // Master phasor for all timing
    this.masterPhasor = 0; // 0-1 representing position in cycle
    this.totalCycleSamples = 0; // Total samples in one cycle
    this.currentCycleSample = 0; // Current sample position in cycle

    // Track previous steps for edge detection
    this.previousSteps = Array(NUM_CHANNELS).fill(-1);
    this.previousGlobalStep = -1;

    // Pattern storage - 8 channels x 96 max steps
    this.pattern = Array(NUM_CHANNELS)
      .fill(null)
      .map(() => Array(MAX_SUBDIVISIONS).fill(false));

    // Channel configurations
    this.channels = Array(NUM_CHANNELS)
      .fill(null)
      .map(() => ({
        mode: "trigger", // 'trigger' or 'cv'
        cvMode: "lfo", // 'lfo' or '1voct' or 'sh'
        triggerDuration: DEFAULT_TRIGGER_DURATION_SAMPLES, // Trigger duration in samples
        useCustomSubdivisions: false, // Whether this channel uses custom subdivisions
        subdivisions: 8, // Per-channel subdivisions (2-96)
        usePolyrhythm: false, // Whether this channel uses polyrhythm
        polyrhythmSteps: 8, // Polyrhythm loop length (1-96)
        polyrhythmSampleCount: 0, // Track samples instead of phasor for accuracy
        polyrhythmCycleSamples: 0, // Cached cycle length in samples

        // Logging
        lastStepTime: 0,

        lfo: {
          waveform: "ramp",
          rate: 1,
          duty: 0.5,
          width: 1.0,
          phase: 0,
        },
        pitches: Array(MAX_SUBDIVISIONS).fill(null),
        currentPitch: 0, // Current CV output for 1V/Oct mode
        lfoPhase: 0, // Current phase for LFO
        sh: {
          mode: "rand", // 'rand' or 'shuf'
          width: 1.0,
          values: Array(MAX_SUBDIVISIONS).fill(0),
          currentValue: 0, // Current S&H output
        },
      }));

    // Trigger states for each channel
    this.triggerStates = Array(NUM_CHANNELS)
      .fill(null)
      .map(() => ({
        active: false,
        sampleCount: 0,
      }));

    // Calculate initial timing
    this.updateTiming();

    // Handle control messages
    this.port.onmessage = (event) => {
      const { type, state } = event.data;

      switch (type) {
        case "start":
          // First, apply the complete state that comes with the start command.
          this._applyState(state);
          
          // Then, initialize playback.
          this.isPlaying = true;
          this.isStopped = false;
          this.masterPhasor = 0;
          this.currentCycleSample = 0;
          this.previousSteps.fill(-1);
          this.previousGlobalStep = -1;
          this.lastGlobalStepTime = currentTime;

          for (let channel = 0; channel < NUM_CHANNELS; channel++) {
            this.channels[channel].lfoPhase = 0;
            this.channels[channel].lastStepTime = currentTime;
          }
          break;

        case "stop":
          this.isPlaying = false;
          this.isStopped = true;
          this.masterPhasor = 0;
          this.currentCycleSample = 0;

          // Reset polyrhythm counters and LFO phase on a full stop
          for (let channel = 0; channel < NUM_CHANNELS; channel++) {
            this.channels[channel].polyrhythmSampleCount = 0;
            this.channels[channel].lfoPhase = 0;
          }

          // Clear any active (stuck) triggers
          this.triggerStates.forEach((trigger) => {
            trigger.active = false;
            trigger.sampleCount = 0;
          });
          break;

        case "setState":
          // For live updates while the sequencer is running, apply the new state.
          this._applyState(state);
          break;
      }
    };
  }

  // Applies a complete state object to the worklet instance
  _applyState(state) {
    if (!state) return;

    // Update timing parameters
    if (state.cycleTime !== undefined) {
      this.cycleTime = state.cycleTime;
    }
    if (state.subdivisions !== undefined) {
      this.subdivisions = state.subdivisions;
    }

    // Update pattern data
    if (state.pattern) {
      this.pattern = state.pattern;
    }

    // Update detailed channel configurations
    if (state.channels) {
      for (let i = 0; i < NUM_CHANNELS && i < state.channels.length; i++) {
        // Use Object.assign for a safe merge of properties
        Object.assign(this.channels[i], state.channels[i]);
      }
    }

    // After applying state, always recalculate timing values
    this.updateTiming();
  }

  // Helper method to get the phasor for a channel
  getChannelPhasor(channelConfig) {
    return channelConfig.usePolyrhythm
      ? channelConfig.polyrhythmSampleCount /
        channelConfig.polyrhythmCycleSamples
      : this.masterPhasor;
  }

  // Helper method to get the pattern length for a channel
  getPatternLength(channelConfig) {
    if (channelConfig.usePolyrhythm) {
      return channelConfig.useCustomSubdivisions
        ? channelConfig.subdivisions
        : channelConfig.polyrhythmSteps;
    }
    return channelConfig.useCustomSubdivisions
      ? channelConfig.subdivisions
      : this.subdivisions;
  }

  // Get trigger duration for a channel
  getTriggerDuration(channel) {
    return this.channels[channel].triggerDuration;
  }

  // Generate trigger output for a channel
  generateTriggerOutput(channel, triggerState) {
    if (!triggerState.active) {
      return 0; // No trigger active
    }

    // Increment sample count
    triggerState.sampleCount++;

    // Get the trigger duration for this channel
    const triggerDuration = this.getTriggerDuration(channel);

    // Output 1.0 for the configured duration, then deactivate
    if (triggerState.sampleCount <= triggerDuration) {
      return 1.0;
    } else {
      // Trigger complete
      triggerState.active = false;
      triggerState.sampleCount = 0;
      return 0;
    }
  }

  // Update timing state for the sequencer
  updateTimingState() {
    if (!this.isPlaying) return -1; // Return -1 if not playing

    // Update master phasor
    this.masterPhasor = this.currentCycleSample / this.totalCycleSamples;

    // Calculate global step from phasor
    // Since masterPhasor is 0-1, the modulo is unnecessary
    const globalStep = Math.floor(this.masterPhasor * this.subdivisions);

    // Increment cycle position
    this.currentCycleSample = (this.currentCycleSample + 1) %
      this.totalCycleSamples;

    return globalStep;
  }

  // Generate CV output for a channel
  generateCVOutput(channelConfig) {
    if (channelConfig.cvMode === "lfo") {
      // LFO mode
      const lfo = channelConfig.lfo;
      let value = 0;

      if (this.isPlaying) {
        // Calculate LFO phase from appropriate phasor
        // lfo.rate determines how many complete cycles per pattern
        // Add phase offset (0-1 mapped to 0-2π)
        const phaseOffset = (lfo.phase || 0) * 2 * Math.PI;
        // Get the phasor for this channel
        const basePhasor = this.getChannelPhasor(channelConfig);
        channelConfig.lfoPhase =
          (basePhasor * lfo.rate * 2 * Math.PI + phaseOffset) %
          (2 * Math.PI);

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

      return value;
    } else if (channelConfig.cvMode === "1voct") {
      // 1V/Oct mode - output scaled pitch CV
      // -120 to +120 semitones maps to -1.0 to +1.0 (-10V to +10V)
      const voltage = channelConfig.currentPitch / 120.0; // 12 semitones per volt, /10 for audio range
      return voltage;
    } else if (channelConfig.cvMode === "sh") {
      // S&H mode - output random voltage scaled by width
      // Apply width scaling: as width approaches 0, value approaches 0
      const scaledValue = channelConfig.sh.currentValue *
        channelConfig.sh.width;
      return scaledValue; // -1 to +1 range (±10V)
    }

    return 0; // Default
  }

  // Process a channel's step changes
  processChannelStep(
    channel,
    channelConfig,
    currentStep,
    channelPhasor,
    patternLength,
    currentTime,
    sampleIndex,
    sampleRate,
    stepChanges,
  ) {
    // Check if step changed
    if (currentStep === this.previousSteps[channel]) {
      return; // No step change
    }

    // --- LOGGING ---
    if (this.debugMode && channelConfig.usePolyrhythm) {
      const now = currentTime + sampleIndex / sampleRate;
      const duration = (now - channelConfig.lastStepTime) * 1000;
      this.port.postMessage({
        type: "log",
        message: `[STEP PLAYED] Chan ${
          channel + 1
        } Polyrhythm Step ${currentStep} took ${
          duration.toFixed(2)
        }ms | phasor=${
          channelPhasor.toFixed(4)
        } | sampleCount=${channelConfig.polyrhythmSampleCount} | patternLength=${patternLength}`,
      });
      channelConfig.lastStepTime = now;
    }

    this.previousSteps[channel] = currentStep;

    // Add to step changes array for bulk update
    stepChanges.push({
      channel: channel,
      step: currentStep,
      totalSteps: patternLength,
      isPolyrhythm: channelConfig.usePolyrhythm,
      time: currentTime + sampleIndex / sampleRate,
      audioTime: currentTime,
    });

    // Check if we've wrapped around to beginning of pattern
    if (currentStep === 0 && channelPhasor < 0.5) {
      // We're at the start of a new cycle
      // Regenerate S&H values for this channel if in rand mode
      if (
        channelConfig.mode === "cv" &&
        channelConfig.cvMode === "sh" &&
        channelConfig.sh.mode === "rand"
      ) {
        for (let i = 0; i < patternLength; i++) {
          channelConfig.sh.values[i] = Math.random() * 2 - 1;
        }
        // Notify UI of new values
        this.port.postMessage({
          type: "shValuesUpdated",
          channel: channel,
          values: channelConfig.sh.values.slice(0, patternLength),
        });
      }
    }

    // Process channel based on its mode
    if (channelConfig.mode === "trigger") {
      // Trigger mode - check pattern
      if (this.pattern[channel][currentStep]) {
        this.triggerStates[channel].active = true;
        this.triggerStates[channel].sampleCount = 0;
        
        // Log trigger activation for debugging
        if (!this.triggerLogCount) this.triggerLogCount = {};
        if (!this.triggerLogCount[channel]) this.triggerLogCount[channel] = 0;
        if (this.triggerLogCount[channel]++ < 3) {
          this.port.postMessage({
            type: "log",
            message: `Trigger fired on channel ${channel + 1}, step ${currentStep}`
          });
        }
      }
    } else if (
      channelConfig.mode === "cv" &&
      channelConfig.cvMode === "1voct"
    ) {
      // 1V/Oct mode - update pitch on step change
      const pitch = channelConfig.pitches[currentStep];
      if (pitch !== null) {
        channelConfig.currentPitch = pitch;
      }
    } else if (
      channelConfig.mode === "cv" &&
      channelConfig.cvMode === "sh"
    ) {
      // S&H mode - update value on step change
      channelConfig.sh.currentValue = channelConfig.sh.values[currentStep];
    }
  }

  updateTiming() {
    // Calculate samples per step based on cycle time and global subdivisions
    this.samplesPerStep = (this.cycleTime * sampleRate) / this.subdivisions;

    // Calculate total samples in one cycle precisely
    this.totalCycleSamples = this.samplesPerStep * this.subdivisions;

    // Update polyrhythm cycle samples for each channel
    for (let channel = 0; channel < 8; channel++) {
      const channelConfig = this.channels[channel];
      if (channelConfig.usePolyrhythm) {
        // Polyrhythm cycle length is ALWAYS based on polyrhythm steps
        // regardless of custom subdivisions
        channelConfig.polyrhythmCycleSamples = channelConfig.polyrhythmSteps *
          this.samplesPerStep;
      }
    }

    // --- LOGGING ---
    if (this.debugMode) {
      this.port.postMessage({
        type: "log",
        message: `[TIMING SET] Global Step: ${
          ((this.samplesPerStep / sampleRate) * 1000).toFixed(2)
        }ms (${this.samplesPerStep} samples)`,
      });
    }
    for (let i = 0; i < NUM_CHANNELS; i++) {
      if (this.channels[i].usePolyrhythm) {
        const effectiveSteps = this.channels[i].useCustomSubdivisions
          ? this.channels[i].subdivisions
          : this.channels[i].polyrhythmSteps;
        const polyStepMs = (
          (this.channels[i].polyrhythmCycleSamples /
            effectiveSteps /
            sampleRate) *
          1000
        ).toFixed(2);

        // Check invariant
        const invariantOk = this.channels[i].useCustomSubdivisions ||
          this.channels[i].subdivisions === this.channels[i].polyrhythmSteps;

        if (this.debugMode) {
          this.port.postMessage({
            type: "log",
            message: `[TIMING SET] Chan ${
              i + 1
            } Polyrhythm Step: ${polyStepMs}ms | polyrhythmSteps: ${
              this.channels[i].polyrhythmSteps
            } | cycleSamples: ${
              this.channels[i].polyrhythmCycleSamples
            } | useCustomSub: ${
              this.channels[i].useCustomSubdivisions
            } | subdivisions: ${
              this.channels[i].subdivisions
            } | effectiveSteps: ${effectiveSteps} | invariantOk: ${invariantOk}`,
          });
        }
      }
    }
  }

  process(_inputs, outputs, _parameters) {
    const output = outputs[0];
    
    // Log channel availability once
    if (!this.channelsLogged) {
      this.channelsLogged = true;
      this.port.postMessage({
        type: "log",
        message: `AudioWorklet: ${output.length} output channels available`
      });
      for (let i = 0; i < output.length; i++) {
        this.port.postMessage({
          type: "log",
          message: `Channel ${i + 1}: ${output[i] ? 'Available' : 'Null'}, length: ${output[i]?.length || 0}`
        });
      }
    }

    // Track if any steps changed for bulk update
    const stepChanges = [];
    
    // Process each sample in the block
    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex++) {
      // Update polyrhythm counters for free-running behavior (but not when stopped)
      if (!this.isStopped) {
        for (let channel = 0; channel < NUM_CHANNELS; channel++) {
          const channelConfig = this.channels[channel];
          // Skip channels not using polyrhythm
          if (!channelConfig.usePolyrhythm) continue;

          // Increment independent sample counter
          channelConfig.polyrhythmSampleCount++;

          // Wrap around when reaching cycle length
          if (
            channelConfig.polyrhythmSampleCount >=
              channelConfig.polyrhythmCycleSamples
          ) {
            channelConfig.polyrhythmSampleCount = 0;
          }
        }
      }

      // Handle sequencer timing
      const globalStep = this.updateTimingState();

      if (this.isPlaying) {
        // Check for global step change
        if (globalStep !== this.previousGlobalStep) {
          const now = currentTime + sampleIndex / sampleRate;
          const duration = (now - this.lastGlobalStepTime) * 1000;
          if (this.debugMode) {
            this.port.postMessage({
              type: "log",
              message: `[STEP PLAYED] Global Step ${globalStep} took ${
                duration.toFixed(2)
              }ms`,
            });
          }
          this.lastGlobalStepTime = now;
          this.previousGlobalStep = globalStep;

          // Send step change for UI indicator
          this.port.postMessage({
            type: "stepChange",
            step: globalStep,
            channel: -1, // -1 indicates global
            time: now,
            audioTime: currentTime,
          });
        }

        // Process each channel
        for (let channel = 0; channel < NUM_CHANNELS; channel++) {
          const channelConfig = this.channels[channel];

          // Determine effective pattern length for this channel
          const patternLength = this.getPatternLength(channelConfig);

          // Calculate position in pattern
          const channelPhasor = this.getChannelPhasor(channelConfig);

          // Debug log for specific samples to track step changes
          if (
            this.debugMode &&
            channelConfig.usePolyrhythm &&
            channelConfig.polyrhythmSampleCount % 4500 === 0 &&
            channel === 1
          ) {
            const expectedStep = Math.floor(channelPhasor * patternLength);
            this.port.postMessage({
              type: "log",
              message: `[DEBUG] Chan ${
                channel + 1
              } @ sample ${channelConfig.polyrhythmSampleCount}: phasor=${
                channelPhasor.toFixed(4)
              }, expectedStep=${expectedStep}, patternLength=${patternLength}, cycleSamples=${channelConfig.polyrhythmCycleSamples}`,
            });
          }

          // Calculate current step
          // Since channelPhasor is 0-1, the modulo is unnecessary
          const currentStep = Math.floor(channelPhasor * patternLength);

          // Process step changes
          this.processChannelStep(
            channel,
            channelConfig,
            currentStep,
            channelPhasor,
            patternLength,
            currentTime,
            sampleIndex,
            sampleRate,
            stepChanges,
          );
        }
      }

      // Generate output for each channel
      for (
        let channel = 0;
        channel < NUM_CHANNELS && channel < output.length;
        channel++
      ) {
        const channelData = output[channel];
        if (!channelData) {
          // Log missing channel data for channels 3-8
          if (channel >= 2 && !this.missingChannelLogged) {
            this.missingChannelLogged = true;
            this.port.postMessage({
              type: "log",
              message: `Channel ${channel + 1} output buffer is null - only ${output.length} channels available`
            });
          }
          continue;
        }

        const channelConfig = this.channels[channel];
        const triggerState = this.triggerStates[channel];

        if (channelConfig.mode === "trigger") {
          // Generate trigger pulse
          const triggerValue = this.generateTriggerOutput(channel, triggerState);
          channelData[sampleIndex] = triggerValue;
          
          // Debug log for channels 3-8 when triggers fire
          if (channel >= 2 && triggerValue > 0 && !this.triggerDebugLogged) {
            this.triggerDebugLogged = true;
            this.port.postMessage({
              type: "log",
              message: `Channel ${channel + 1} trigger active: ${triggerValue}`
            });
          }
        } else if (channelConfig.mode === "cv") {
          // Generate CV output
          channelData[sampleIndex] = this.generateCVOutput(channelConfig);
        }
      }
    }

    // Send step updates if any steps changed
    if (stepChanges.length > 0) {
      // Send individual step changes for minimalist.js compatibility
      stepChanges.forEach(change => {
        this.port.postMessage({
          type: "stepChange",
          channel: change.channel,
          step: change.step,
          totalSteps: change.totalSteps,
          isPolyrhythm: change.isPolyrhythm,
          time: change.time,
          audioTime: change.audioTime,
        });
      });
      
      // Also send bulk update for sequencer.js compatibility
      const channelSteps = Array(NUM_CHANNELS).fill(null).map((_, channel) => {
        const change = stepChanges.find(c => c.channel === channel);
        return change ? { step: change.step } : { step: this.previousSteps[channel] || 0 };
      });
      
      this.port.postMessage({
        type: "stepUpdate",
        channels: channelSteps,
      });
    }

    return true; // Keep processor running
  }
}

registerProcessor("sequencer-processor", SequencerProcessor);

class SequencerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Sequencer state
    this.isPlaying = false;
    this.isStopped = true; // Track if we're in stopped state
    this.subdivisions = 8;
    this.cycleTime = 2.0;
    this.currentStep = 0;
    this.samplesSinceLastStep = 0;
    this.samplesPerStep = 0;
    this.lastGlobalStepTime = 0;

    // Master phasor for all timing
    this.masterPhasor = 0; // 0-1 representing position in cycle
    this.totalCycleSamples = 0; // Total samples in one cycle
    this.currentCycleSample = 0; // Current sample position in cycle

    // Track previous steps for edge detection
    this.previousSteps = Array(8).fill(-1);
    this.previousGlobalStep = -1;

    // Pattern storage - 8 channels x 96 max steps
    this.pattern = Array(8)
      .fill(null)
      .map(() => Array(96).fill(false));

    // Channel configurations
    this.channels = Array(8)
      .fill(null)
      .map(() => ({
        mode: "trigger", // 'trigger' or 'cv'
        cvMode: "lfo", // 'lfo' or '1voct' or 'sh'
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
    this.triggerStates = Array(8)
      .fill(null)
      .map(() => ({
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
          this.isStopped = false;
          // Reset master phasor
          this.masterPhasor = 0;
          this.currentCycleSample = 0;
          // Reset step tracking
          this.previousSteps.fill(-1);
          this.previousGlobalStep = -1;
          // Reset LFO phases and timing logs
          this.lastGlobalStepTime = currentTime;
          for (let channel = 0; channel < 8; channel++) {
            this.channels[channel].lfoPhase = 0;
            this.channels[channel].lastStepTime = currentTime;
            // Don't reset polyrhythm sample count - let it free run
            // this.channels[channel].polyrhythmSampleCount = 0;
          }
          break;

        case "stop":
          this.isPlaying = false;
          this.isStopped = true;
          // Reset all channel phasors
          this.masterPhasor = 0;
          this.currentCycleSample = 0;
          for (let channel = 0; channel < 8; channel++) {
            // Reset polyrhythm counters on stop (full reset)
            this.channels[channel].polyrhythmSampleCount = 0;
            this.channels[channel].lfoPhase = 0;
          }
          // Clear all active triggers
          this.triggerStates.forEach((state) => {
            state.active = false;
            state.sampleCount = 0;
          });
          break;

        case "pause":
          this.isPlaying = false;
          this.isStopped = false;
          // Don't reset phasors - maintain position
          break;

        case "updatePattern":
          if (
            data.channel >= 0 &&
            data.channel < 8 &&
            data.step >= 0 &&
            data.step < 96
          ) {
            this.pattern[data.channel][data.step] = data.active;
          }
          break;

        case "clearPattern":
          this.pattern = Array(8)
            .fill(null)
            .map(() => Array(96).fill(false));
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
            data.channel >= 0 &&
            data.channel < 8 &&
            data.step >= 0 &&
            data.step < 96
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
            this.channels[data.channel].subdivisions = data.subdivisions;
            // Note: useCustomSubdivisions flag is managed by the UI separately
            // Don't set it here - just update the subdivision value
          }
          break;

        case "setPolyrhythm":
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].usePolyrhythm = data.enabled;
            if (data.steps !== undefined) {
              this.channels[data.channel].polyrhythmSteps = data.steps;

              // CRITICAL: When polyrhythm is enabled and custom subdivisions are disabled,
              // the subdivisions MUST equal polyrhythmSteps
              if (
                data.enabled &&
                !this.channels[data.channel].useCustomSubdivisions
              ) {
                this.channels[data.channel].subdivisions = data.steps;
              }
            }
            this.updateTiming(); // Recalculate timing
          }
          break;
      }
    };
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
        channelConfig.polyrhythmCycleSamples =
          channelConfig.polyrhythmSteps * this.samplesPerStep;
      }
    }

    // --- LOGGING ---
    this.port.postMessage({
      type: "log",
      message: `[TIMING SET] Global Step: ${((this.samplesPerStep / sampleRate) * 1000).toFixed(2)}ms (${this.samplesPerStep} samples)`,
    });
    for (let i = 0; i < 8; i++) {
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
        const invariantOk =
          this.channels[i].useCustomSubdivisions ||
          this.channels[i].subdivisions === this.channels[i].polyrhythmSteps;

        this.port.postMessage({
          type: "log",
          message: `[TIMING SET] Chan ${i + 1} Polyrhythm Step: ${polyStepMs}ms | polyrhythmSteps: ${this.channels[i].polyrhythmSteps} | cycleSamples: ${this.channels[i].polyrhythmCycleSamples} | useCustomSub: ${this.channels[i].useCustomSubdivisions} | subdivisions: ${this.channels[i].subdivisions} | effectiveSteps: ${effectiveSteps} | invariantOk: ${invariantOk}`,
        });
      }
    }
  }

  process(_inputs, outputs, _parameters) {
    const output = outputs[0];

    // Process each sample in the block
    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex++) {
      // Update polyrhythm counters for free-running behavior (but not when stopped)
      if (!this.isStopped) {
        for (let channel = 0; channel < 8; channel++) {
          const channelConfig = this.channels[channel];
          if (channelConfig.usePolyrhythm) {
            // Increment independent sample counter
            channelConfig.polyrhythmSampleCount++;
            
            // Wrap around when reaching cycle length
            if (channelConfig.polyrhythmSampleCount >= channelConfig.polyrhythmCycleSamples) {
              channelConfig.polyrhythmSampleCount = 0;
            }
          }
        }
      }

      // Handle sequencer timing
      if (this.isPlaying) {
        // Update master phasor
        this.masterPhasor = this.currentCycleSample / this.totalCycleSamples;

        // Calculate global step from phasor
        const globalStep =
          Math.floor(this.masterPhasor * this.subdivisions) % this.subdivisions;

        // Check for global step change
        if (globalStep !== this.previousGlobalStep) {
          const now = currentTime + sampleIndex / sampleRate;
          const duration = (now - this.lastGlobalStepTime) * 1000;
          this.port.postMessage({
            type: "log",
            message: `[STEP PLAYED] Global Step ${globalStep} took ${duration.toFixed(2)}ms`,
          });
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
        for (let channel = 0; channel < 8; channel++) {
          const channelConfig = this.channels[channel];

          // Determine effective pattern length for this channel
          let patternLength;
          if (
            channelConfig.usePolyrhythm &&
            channelConfig.useCustomSubdivisions
          ) {
            // When both polyrhythm and custom subdivisions are active,
            // the polyrhythm cycle is divided into custom subdivisions
            patternLength = channelConfig.subdivisions;
          } else if (channelConfig.usePolyrhythm) {
            // Polyrhythm without custom subdivisions uses polyrhythm steps as BOTH
            // the pattern length AND the implicit subdivision count
            patternLength = channelConfig.polyrhythmSteps;
          } else if (channelConfig.useCustomSubdivisions) {
            // Custom subdivisions without polyrhythm
            patternLength = channelConfig.subdivisions;
          } else {
            // Standard behavior uses global subdivisions
            patternLength = this.subdivisions;
          }

          // Calculate position in pattern
          let channelPhasor;

          if (channelConfig.usePolyrhythm) {
            // Use the pre-calculated polyrhythm cycle samples
            const polyrhythmCycleSamples = channelConfig.polyrhythmCycleSamples;

            // Calculate phasor from independent counter (already incremented above)
            channelPhasor =
              channelConfig.polyrhythmSampleCount / polyrhythmCycleSamples;

            // Debug log for specific samples to track step changes
            if (
              channelConfig.polyrhythmSampleCount % 4500 === 0 &&
              channel === 1
            ) {
              const expectedStep = Math.floor(channelPhasor * patternLength);
              this.port.postMessage({
                type: "log",
                message: `[DEBUG] Chan ${channel + 1} @ sample ${channelConfig.polyrhythmSampleCount}: phasor=${channelPhasor.toFixed(4)}, expectedStep=${expectedStep}, patternLength=${patternLength}, cycleSamples=${polyrhythmCycleSamples}`,
              });
            }
          } else {
            // Use master phasor
            channelPhasor = this.masterPhasor;
          }

          // Calculate current step
          const currentStep =
            Math.floor(channelPhasor * patternLength) % patternLength;

          // Check if step changed
          if (currentStep !== this.previousSteps[channel]) {
            // --- LOGGING ---
            if (channelConfig.usePolyrhythm) {
              const now = currentTime + sampleIndex / sampleRate;
              const duration = (now - channelConfig.lastStepTime) * 1000;
              this.port.postMessage({
                type: "log",
                message: `[STEP PLAYED] Chan ${channel + 1} Polyrhythm Step ${currentStep} took ${duration.toFixed(2)}ms | phasor=${channelPhasor.toFixed(4)} | sampleCount=${channelConfig.polyrhythmSampleCount} | patternLength=${patternLength}`,
              });
              channelConfig.lastStepTime = now;
            }

            this.previousSteps[channel] = currentStep;

            // Send per-channel step change for UI
            this.port.postMessage({
              type: "stepChange",
              step: currentStep,
              channel: channel,
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
              channelConfig.sh.currentValue =
                channelConfig.sh.values[currentStep];
            }
          }
        }

        // Increment cycle position
        this.currentCycleSample =
          (this.currentCycleSample + 1) % this.totalCycleSamples;
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
              // Calculate LFO phase from appropriate phasor
              // lfo.rate determines how many complete cycles per pattern
              // Add phase offset (0-1 mapped to 0-2π)
              const phaseOffset = (lfo.phase || 0) * 2 * Math.PI;
              const basePhasor = channelPhasor; // Use the same phasor we calculated above
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

            channelData[sampleIndex] = value;
          } else if (channelConfig.cvMode === "1voct") {
            // 1V/Oct mode - output scaled pitch CV
            // -120 to +120 semitones maps to -1.0 to +1.0 (-10V to +10V)
            const voltage = channelConfig.currentPitch / 120.0; // 12 semitones per volt, /10 for audio range
            channelData[sampleIndex] = voltage;
          } else if (channelConfig.cvMode === "sh") {
            // S&H mode - output random voltage scaled by width
            // Apply width scaling: as width approaches 0, value approaches 0
            const scaledValue =
              channelConfig.sh.currentValue * channelConfig.sh.width;
            channelData[sampleIndex] = scaledValue; // -1 to +1 range (±10V)
          }
        }
      }
    }

    return true; // Keep processor running
  }
}

registerProcessor("sequencer-processor", SequencerProcessor);

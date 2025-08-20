import { SEQUENCER_CONSTANTS } from './constants.js';

const { NUM_CHANNELS, NUM_SEQUENCER_CHANNELS, SAMPLE_RATE } = SEQUENCER_CONSTANTS;

// --- Audio Generation Helper Functions ---

function generateTrigger(triggerState, durationSamples) {
  if (triggerState.active) {
    if (triggerState.sampleCount < durationSamples) {
      triggerState.sampleCount++;
      return 1.0; // 1.0 represents +10V
    } else {
      triggerState.active = false;
    }
  }
  return 0.0;
}

function generatePitchCV(currentPitch) {
  return (currentPitch || 0) / 120.0;
}

function generateRampCV(masterPhasor, polarity, amplitude) {
  const polarityMultiplier = polarity === '-ve' ? -1 : 1;
  const normalizedAmplitude = amplitude / 10.0; // Scale volts to audio range
  let value = masterPhasor * polarityMultiplier * normalizedAmplitude;
  
  // Offset negative ramp to keep it positive
  if (polarityMultiplier === -1) {
    value += normalizedAmplitude;
  }
  
  return value;
}

// --- Timing Calculation Helpers ---

function calculateEffectiveSteps(channel, channelIndex, channels, defaultSubdivisions) {
  if (channel.mode === 'pitch' && channel.isCoupled && channelIndex > 0) {
    const parent = channels[channelIndex - 1];
    if (parent?.mode === 'trigger') {
      return parent.steps || defaultSubdivisions;
    }
  }
  return channel.steps || defaultSubdivisions;
}

function shouldUseParentTiming(channel, channelIndex, channels) {
  return channel.mode === 'pitch' && channel.isCoupled && channelIndex > 0 && channels[channelIndex - 1]?.mode === 'trigger';
}

class SequencerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isPlaying = false;
    this.masterPhasor = 0.0;
    this.masterPhaseIncrement = 0.0;
    this.channelPhasors = new Float64Array(NUM_SEQUENCER_CHANNELS).fill(0.0);
    this.phaseIncrements = new Float64Array(NUM_SEQUENCER_CHANNELS).fill(0.0);
    this.triggerStates = Array(NUM_CHANNELS).fill(null).map(() => ({ active: false, sampleCount: 0 }));
    this.previousSteps = new Int16Array(NUM_CHANNELS).fill(-1);
    this.previousGlobalStep = -1;
    this._applyState({});

    this.port.onmessage = (event) => {
      const { type, state } = event.data;
      if (type === "start") {
        this._applyState(state);
        this.isPlaying = true;
        this.masterPhasor = 0.0;
        this.channelPhasors.fill(0.0);
        this.previousSteps.fill(-1);
        this.previousGlobalStep = -1;
      } else if (type === "stop") {
        this.isPlaying = false;
        this.triggerStates.forEach(s => s.active = false);
      } else if (type === "setState") {
        this._applyState(state);
      }
    };
  }

  _applyState(state = {}) {
    this.subdivisions = state.subdivisions || 16;
    this.cycleTime = state.cycleTime || 2.0;
    
    // Preserve currentPitch values when updating channels
    if (state.channels) {
      const oldChannels = this.channels || [];
      this.channels = state.channels.map((newChannel, i) => {
        const oldChannel = oldChannels[i];
        // Preserve currentPitch if it exists
        if (oldChannel && oldChannel.currentPitch !== undefined && newChannel.mode === 'pitch') {
          return { ...newChannel, currentPitch: oldChannel.currentPitch };
        }
        return newChannel;
      });
    } else {
      this.channels = [];
    }
    
    this.pattern = state.pattern || [];
    this._recalculateTiming();
  }

  _recalculateTiming() {
    const globalCycleSamples = this.cycleTime * SAMPLE_RATE;
    if (globalCycleSamples <= 0) return;
    
    this.masterPhaseIncrement = 1.0 / globalCycleSamples;

    for (let i = 0; i < NUM_SEQUENCER_CHANNELS; i++) {
      const channel = this.channels[i] || {};
      const effectiveSteps = calculateEffectiveSteps(channel, i, this.channels, this.subdivisions);
      const channelCycleSamples = (globalCycleSamples / this.subdivisions) * effectiveSteps;
      this.phaseIncrements[i] = channelCycleSamples > 0 ? 1.0 / channelCycleSamples : 0;
    }
  }

  process(_inputs, outputs, _parameters) {
    const output = outputs[0];

    // The main per-sample processing loop. All logic must be inside here.
    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex++) {
      if (this.isPlaying) {
        // --- 1. Advance all phasors for this single sample ---
        this.masterPhasor += this.masterPhaseIncrement;
        if (this.masterPhasor >= 1.0) this.masterPhasor -= 1.0;

        for (let i = 0; i < NUM_SEQUENCER_CHANNELS; i++) {
          this.channelPhasors[i] += this.phaseIncrements[i];
          if (this.channelPhasors[i] >= 1.0) this.channelPhasors[i] -= 1.0;
        }

        // --- 2. Check for step changes based on the new phasor positions ---
        const globalStep = Math.floor(this.masterPhasor * this.subdivisions);
        if (globalStep !== this.previousGlobalStep) {
          this.previousGlobalStep = globalStep;
          if (this.channels[7]?.mode === "clock") {
            this.triggerStates[7].active = true;
            this.triggerStates[7].sampleCount = 0;
          }
          this.port.postMessage({ type: "stepChange", step: globalStep, channel: -1 });
        }

        for (let i = 0; i < NUM_SEQUENCER_CHANNELS; i++) {
          const channel = this.channels[i];
          
          // Calculate step position based on coupling
          let patternLength, currentStep;
          if (shouldUseParentTiming(channel, i, this.channels)) {
            const parent = this.channels[i - 1];
            patternLength = parent.steps || this.subdivisions;
            currentStep = Math.floor(this.channelPhasors[i-1] * patternLength);
          } else {
            patternLength = channel.steps || this.subdivisions;
            currentStep = Math.floor(this.channelPhasors[i] * patternLength);
          }

          if (currentStep !== this.previousSteps[i]) {
            this.previousSteps[i] = currentStep;
            
            if (channel.mode === 'pitch') {
              // Initialize currentPitch if it doesn't exist
              if (channel.currentPitch === undefined) {
                channel.currentPitch = 0;
              }
              
              if (channel.isCoupled && i > 0) {
                const parent = this.channels[i - 1];
                if (parent?.mode === 'trigger') {
                  const parentPatternLength = parent.steps || this.subdivisions;
                  const parentStep = Math.floor(this.channelPhasors[i-1] * parentPatternLength);
                  if (this.pattern[i-1]?.[parentStep]) {
                    const newPitch = channel.pitches?.[currentStep];
                    if (newPitch !== null && newPitch !== undefined) {
                      channel.currentPitch = newPitch;
                    }
                  }
                }
              } else {
                // Uncoupled pitch channel - update on every step
                const newPitch = channel.pitches?.[currentStep];
                if (newPitch !== null && newPitch !== undefined) {
                  channel.currentPitch = newPitch;
                }
              }
            }
            
            if (channel.mode === 'trigger' && this.pattern[i]?.[currentStep]) {
              this.triggerStates[i].active = true;
              this.triggerStates[i].sampleCount = 0;
            }
            
            this.port.postMessage({ type: "stepChange", channel: i, step: currentStep });
          }
        }
      }

      // --- 3. Generate audio output for all 8 channels for this single sample ---
      for (let ch = 0; ch < NUM_CHANNELS && ch < output.length; ch++) {
        const channelConfig = this.channels[ch];
        if (!output[ch]) continue;
        
        let value = 0.0;
        
        // If channel is muted, output silence
        if (channelConfig?.isMuted) {
          output[ch][sampleIndex] = 0.0;
          continue;
        }
        
        switch(channelConfig?.mode) {
          case 'trigger':
            value = generateTrigger(this.triggerStates[ch], channelConfig.triggerDuration);
            break;
          case 'pitch':
            value = generatePitchCV(channelConfig.currentPitch);
            break;
          case 'clock':
            value = generateTrigger(this.triggerStates[ch], channelConfig.duration);
            break;
          case 'ramp':
            value = generateRampCV(this.masterPhasor, channelConfig.polarity, channelConfig.amplitude || 10);
            break;
        }
        output[ch][sampleIndex] = value;
      }
    }
    
    return true;
  }
}

registerProcessor("sequencer-processor", SequencerProcessor);
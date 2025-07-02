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
    
    // Pattern storage - 8 channels x 24 max steps
    this.pattern = Array(8).fill(null).map(() => Array(24).fill(false));
    
    // Channel configurations
    this.channels = Array(8).fill(null).map(() => ({
      mode: 'trigger', // 'trigger' or 'cv'
      cvMode: 'lfo', // 'lfo' or '1voct' or 'sh'
      lfo: {
        waveform: 'ramp',
        rate: 1,
        duty: 0.5,
        width: 1.0
      },
      pitches: Array(24).fill(null),
      currentPitch: 0, // Current CV output for 1V/Oct mode
      lfoPhase: 0, // Current phase for LFO
      sh: {
        mode: 'rand', // 'rand' or 'shuf'
        width: 1.0,
        values: Array(24).fill(0),
        currentValue: 0 // Current S&H output
      }
    }));
    
    // Trigger states for each channel
    this.channelStates = Array(8).fill(null).map(() => ({
      triggerActive: false,
      triggerSampleCount: 0
    }));
    
    // Calculate initial timing
    this.updateTiming();
    
    // Handle control messages
    this.port.onmessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'start':
          this.isPlaying = true;
          this.currentStep = -1; // Start at -1 so first increment goes to 0
          this.samplesSinceLastStep = this.samplesPerStep; // Ready to trigger immediately
          // Reset LFO phases
          for (let channel = 0; channel < 8; channel++) {
            this.channels[channel].lfoPhase = 0;
          }
          break;
          
        case 'stop':
          this.isPlaying = false;
          // Clear all active triggers
          this.channelStates.forEach(state => {
            state.triggerActive = false;
            state.triggerSampleCount = 0;
          });
          break;
          
        case 'updatePattern':
          if (data.channel >= 0 && data.channel < 8 && 
              data.step >= 0 && data.step < this.subdivisions) {
            this.pattern[data.channel][data.step] = data.active;
          }
          break;
          
        case 'clearPattern':
          this.pattern = Array(8).fill(null).map(() => Array(24).fill(false));
          // Also clear pitch data
          for (let channel = 0; channel < 8; channel++) {
            this.channels[channel].pitches = Array(24).fill(null);
          }
          break;
          
        case 'setCycleTime':
          this.cycleTime = data;
          this.updateTiming();
          break;
          
        case 'setSubdivisions':
          const wasPlaying = this.isPlaying;
          if (wasPlaying) this.isPlaying = false;
          
          this.subdivisions = data;
          this.currentStep = 0;
          this.samplesSinceLastStep = 0;
          this.updateTiming();
          
          if (wasPlaying) this.isPlaying = true;
          break;
          
        case 'setChannelMode':
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
          
        case 'setCVMode':
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].cvMode = data.cvMode;
          }
          break;
          
        case 'updateLFO':
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].lfo = data.lfo;
          }
          break;
          
        case 'updatePitch':
          if (data.channel >= 0 && data.channel < 8 && 
              data.step >= 0 && data.step < this.subdivisions) {
            this.channels[data.channel].pitches[data.step] = data.pitch;
          }
          break;
          
        case 'updateSH':
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].sh = data.sh;
          }
          break;
          
        case 'setSHValues':
          if (data.channel >= 0 && data.channel < 8) {
            this.channels[data.channel].sh.values = data.values;
          }
          break;
      }
    };
  }
  
  updateTiming() {
    // Calculate samples per step based on cycle time and subdivisions
    this.samplesPerStep = Math.floor((this.cycleTime * sampleRate) / this.subdivisions);
  }
  
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    
    // Process each sample in the block
    for (let sampleIndex = 0; sampleIndex < 128; sampleIndex++) {
      // Handle sequencer timing
      if (this.isPlaying) {
        // Look ahead for visual updates - send message 20ms early
        const lookAheadSamples = Math.floor(0.02 * sampleRate); // 20ms look-ahead
        if (this.samplesSinceLastStep === this.samplesPerStep - lookAheadSamples) {
          // Send early visual update
          const nextStep = (this.currentStep + 1) % this.subdivisions;
          this.port.postMessage({
            type: 'stepChange',
            step: nextStep,
            time: currentTime + (sampleIndex / sampleRate),
            audioTime: currentTime,
            isLookAhead: true
          });
        }
        
        // Check if we've reached the next step
        if (this.samplesSinceLastStep >= this.samplesPerStep) {
          // Move to next step
          this.currentStep = (this.currentStep + 1) % this.subdivisions;
          this.samplesSinceLastStep = 0;
          
          // Check if we've wrapped around to beginning of pattern
          if (this.currentStep === 0) {
            // Regenerate S&H values for channels in rand mode
            for (let channel = 0; channel < 8; channel++) {
              if (this.channels[channel].mode === 'cv' && 
                  this.channels[channel].cvMode === 'sh' && 
                  this.channels[channel].sh.mode === 'rand') {
                for (let i = 0; i < this.subdivisions; i++) {
                  this.channels[channel].sh.values[i] = (Math.random() * 2 - 1);
                }
                // Notify UI of new values
                this.port.postMessage({
                  type: 'shValuesUpdated',
                  channel: channel,
                  values: this.channels[channel].sh.values.slice(0, this.subdivisions)
                });
              }
            }
          }
          
          // Process each channel based on its mode
          for (let channel = 0; channel < 8; channel++) {
            const channelConfig = this.channels[channel];
            
            if (channelConfig.mode === 'trigger') {
              // Trigger mode - check pattern
              if (this.pattern[channel][this.currentStep]) {
                this.channelStates[channel].triggerActive = true;
                this.channelStates[channel].triggerSampleCount = 0;
              }
            } else if (channelConfig.mode === 'cv' && channelConfig.cvMode === '1voct') {
              // 1V/Oct mode - update pitch on step change
              const pitch = channelConfig.pitches[this.currentStep];
              if (pitch !== null) {
                channelConfig.currentPitch = pitch;
              }
            } else if (channelConfig.mode === 'cv' && channelConfig.cvMode === 'sh') {
              // S&H mode - update value on step change
              channelConfig.sh.currentValue = channelConfig.sh.values[this.currentStep];
            }
          }
        }
        
        this.samplesSinceLastStep++;
      }
      
      // Generate output for each channel
      for (let channel = 0; channel < 8 && channel < output.length; channel++) {
        const channelData = output[channel];
        if (!channelData) continue;
        
        const channelConfig = this.channels[channel];
        const state = this.channelStates[channel];
        
        if (channelConfig.mode === 'trigger') {
          // Generate trigger pulse (20ms = 960 samples at 48kHz)
          if (state.triggerActive && state.triggerSampleCount < 960) {
            channelData[sampleIndex] = 1.0; // +10V
            state.triggerSampleCount++;
          } else {
            channelData[sampleIndex] = 0; // 0V
            if (state.triggerSampleCount >= 960) {
              state.triggerActive = false;
              state.triggerSampleCount = 0;
            }
          }
        } else if (channelConfig.mode === 'cv') {
          if (channelConfig.cvMode === 'lfo') {
            // LFO mode
            const lfo = channelConfig.lfo;
            let value = 0;
            
            if (this.isPlaying) {
              // Update LFO phase
              const phaseIncrement = (lfo.rate * 2 * Math.PI) / this.samplesPerStep / this.subdivisions;
              channelConfig.lfoPhase += phaseIncrement;
              
              // Wrap phase
              if (channelConfig.lfoPhase >= 2 * Math.PI) {
                channelConfig.lfoPhase -= 2 * Math.PI;
              }
              
              if (lfo.waveform === 'sine') {
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
          } else if (channelConfig.cvMode === '1voct') {
            // 1V/Oct mode - output scaled pitch CV
            // -36 to +36 semitones maps to -0.3 to +0.3 (-3V to +3V)
            const voltage = channelConfig.currentPitch / 120.0; // 12 semitones per volt, /10 for audio range
            channelData[sampleIndex] = voltage;
          } else if (channelConfig.cvMode === 'sh') {
            // S&H mode - output random voltage scaled by width
            // Apply width scaling: as width approaches 0, value approaches 0
            const scaledValue = channelConfig.sh.currentValue * channelConfig.sh.width;
            channelData[sampleIndex] = scaledValue; // -1 to +1 range (±10V)
          }
        }
      }
    }
    
    return true; // Keep processor running
  }
}

registerProcessor('sequencer-processor', SequencerProcessor);
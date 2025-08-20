/**
 * Simplified Timing System for ES-8 Sequencer
 * 
 * Key simplifications:
 * 1. Single master clock drives all timing
 * 2. Each channel has just subdivisions + optional multiplier
 * 3. No complex phasor calculations - just sample counting
 */

export class SimplifiedTimingSystem {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.cycleTime = 2.0; // seconds
    this.globalSubdivisions = 8;
    
    // Master timing
    this.masterSampleCount = 0;
    this.samplesPerCycle = 0;
    this.isPlaying = false;
    
    // Channel timing states
    this.channels = Array(8).fill(null).map(() => ({
      subdivisions: 8,      // Base subdivisions
      multiplier: 1,        // Timing multiplier for polyrhythm (1 = no polyrhythm)
      currentStep: 0,       // Current step position
      lastStepSample: 0,    // Sample count at last step change
      nextStepSample: 0,    // When next step should trigger
    }));
    
    this.updateTiming();
  }
  
  updateTiming() {
    this.samplesPerCycle = Math.floor(this.cycleTime * this.sampleRate);
  }
  
  setCycleTime(seconds) {
    this.cycleTime = seconds;
    this.updateTiming();
  }
  
  setGlobalSubdivisions(subdivisions) {
    this.globalSubdivisions = subdivisions;
  }
  
  setChannelSubdivisions(channel, subdivisions, multiplier = 1) {
    this.channels[channel].subdivisions = subdivisions;
    this.channels[channel].multiplier = multiplier;
  }
  
  start() {
    this.isPlaying = true;
    this.masterSampleCount = 0;
    
    // Reset all channels
    this.channels.forEach(ch => {
      ch.currentStep = 0;
      ch.lastStepSample = 0;
      ch.nextStepSample = this.calculateNextStepSample(ch, 0);
    });
  }
  
  stop() {
    this.isPlaying = false;
    this.masterSampleCount = 0;
    this.channels.forEach(ch => {
      ch.currentStep = 0;
      ch.lastStepSample = 0;
      ch.nextStepSample = 0;
    });
  }
  
  calculateNextStepSample(channel, fromSample) {
    const effectiveSubdivisions = channel.subdivisions * channel.multiplier;
    const samplesPerStep = Math.floor(this.samplesPerCycle / effectiveSubdivisions);
    return fromSample + samplesPerStep;
  }
  
  process(numSamples) {
    if (!this.isPlaying) return null;
    
    const stepChanges = [];
    
    for (let sample = 0; sample < numSamples; sample++) {
      // Check each channel for step changes
      this.channels.forEach((channel, idx) => {
        if (this.masterSampleCount >= channel.nextStepSample) {
          // Advance step
          const effectiveSubdivisions = channel.subdivisions * channel.multiplier;
          channel.currentStep = (channel.currentStep + 1) % effectiveSubdivisions;
          channel.lastStepSample = this.masterSampleCount;
          channel.nextStepSample = this.calculateNextStepSample(channel, this.masterSampleCount);
          
          // Record step change
          stepChanges.push({
            channel: idx,
            step: channel.currentStep,
            sample: sample,
            effectiveSubdivisions: effectiveSubdivisions
          });
        }
      });
      
      // Advance master clock
      this.masterSampleCount++;
      
      // Wrap around at cycle end
      if (this.masterSampleCount >= this.samplesPerCycle) {
        this.masterSampleCount = 0;
        
        // Recalculate all channel positions
        this.channels.forEach(ch => {
          ch.nextStepSample = this.calculateNextStepSample(ch, 0);
        });
      }
    }
    
    return stepChanges.length > 0 ? stepChanges : null;
  }
  
  getChannelProgress(channel) {
    const ch = this.channels[channel];
    const effectiveSubdivisions = ch.subdivisions * ch.multiplier;
    const samplesPerStep = Math.floor(this.samplesPerCycle / effectiveSubdivisions);
    const progressInStep = (this.masterSampleCount - ch.lastStepSample) / samplesPerStep;
    
    return {
      currentStep: ch.currentStep,
      effectiveSubdivisions: effectiveSubdivisions,
      progressInStep: Math.min(progressInStep, 1.0),
      cycleProgress: this.masterSampleCount / this.samplesPerCycle
    };
  }
}
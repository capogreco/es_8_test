import {
  CHANNEL_MODES,
  CV_MODES,
  DEFAULT_LFO,
  DEFAULT_SH,
  SEQUENCER_CONSTANTS,
} from "./constants.js";
import { stateManager } from "./StateManager.js";

/**
 * Base Channel class
 * Provides common functionality for all channel types
 */
export class BaseChannel {
  constructor(channelIndex) {
    this.index = channelIndex;
    this.mode = CHANNEL_MODES.TRIGGER;
    this.useCustomSubdivisions = false;
    this.subdivisions = SEQUENCER_CONSTANTS.DEFAULT_SUBDIVISIONS;
  }

  /**
   * Get current subdivisions (custom or global)
   */
  getSubdivisions() {
    return this.useCustomSubdivisions
      ? this.subdivisions
      : stateManager.get("subdivisions");
  }

  /**
   * Update channel state in the state manager
   */
  updateState(property, value) {
    stateManager.setChannelProperty(this.index, property, value);
  }

  /**
   * Get channel state from the state manager
   */
  getState(property) {
    return stateManager.getChannelProperty(this.index, property);
  }

  /**
   * Base method for handling mode changes
   */
  setMode(mode) {
    this.mode = mode;
    this.updateState("mode", mode);
  }

  /**
   * Toggle custom subdivisions
   */
  toggleCustomSubdivisions() {
    this.useCustomSubdivisions = !this.useCustomSubdivisions;
    this.updateState("useCustomSubdivisions", this.useCustomSubdivisions);
  }

  /**
   * Set subdivision count
   */
  setSubdivisions(value) {
    this.subdivisions = value;
    this.updateState("subdivisions", value);
  }
}

/**
 * Trigger Channel
 * Handles trigger/gate patterns
 */
export class TriggerChannel extends BaseChannel {
  constructor(channelIndex) {
    super(channelIndex);
    this.pattern = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false);
  }

  /**
   * Toggle a step in the pattern
   */
  toggleStep(step) {
    if (step < 0 || step >= SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS) return;

    const pattern = [...this.getState("pattern") || this.pattern];
    pattern[step] = !pattern[step];
    stateManager.set(`pattern.${this.index}`, pattern);

    return pattern[step];
  }

  /**
   * Set a step to a specific state
   */
  setStep(step, active) {
    if (step < 0 || step >= SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS) return;

    const pattern = [...this.getState("pattern") || this.pattern];
    pattern[step] = active;
    stateManager.set(`pattern.${this.index}`, pattern);
  }

  /**
   * Clear all steps
   */
  clear() {
    const emptyPattern = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(
      false,
    );
    stateManager.set(`pattern.${this.index}`, emptyPattern);
  }

  /**
   * Get the pattern for the current subdivisions
   */
  getCurrentPattern() {
    const pattern = this.getState("pattern") || this.pattern;
    const subdivisions = this.getSubdivisions();
    return pattern.slice(0, subdivisions);
  }
}

/**
 * Base CV Channel
 * Common functionality for CV-based channels
 */
export class CVChannel extends BaseChannel {
  constructor(channelIndex, cvMode) {
    super(channelIndex);
    this.mode = CHANNEL_MODES.CV;
    this.cvMode = cvMode;
  }

  /**
   * Set CV mode
   */
  setCVMode(cvMode) {
    this.cvMode = cvMode;
    this.updateState("cvMode", cvMode);
  }
}

/**
 * LFO Channel
 * Handles LFO generation with various waveforms
 */
export class LFOChannel extends CVChannel {
  constructor(channelIndex) {
    super(channelIndex, CV_MODES.LFO);
    this.lfo = { ...DEFAULT_LFO };
  }

  /**
   * Update LFO parameter
   */
  updateLFOParam(param, value) {
    const lfo = { ...this.getState("lfo") || this.lfo };
    lfo[param] = value;
    this.updateState("lfo", lfo);
    return lfo;
  }

  /**
   * Set waveform
   */
  setWaveform(waveform) {
    return this.updateLFOParam("waveform", waveform);
  }

  /**
   * Set rate
   */
  setRate(rate) {
    return this.updateLFOParam("rate", rate);
  }

  /**
   * Set depth
   */
  setDepth(depth) {
    return this.updateLFOParam("depth", depth);
  }

  /**
   * Set duty cycle (for ramp waveform)
   */
  setDuty(duty) {
    return this.updateLFOParam("duty", duty);
  }

  /**
   * Set phase offset (0-1)
   */
  setPhase(phase) {
    return this.updateLFOParam("phase", phase);
  }

  /**
   * Get current LFO configuration
   */
  getLFOConfig() {
    return this.getState("lfo") || this.lfo;
  }
}

/**
 * Pitch Channel (1V/Oct)
 * Handles pitch sequences
 */
export class PitchChannel extends CVChannel {
  constructor(channelIndex) {
    super(channelIndex, CV_MODES.PITCH);
    this.pitches = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null);
  }

  /**
   * Set pitch for a specific step
   */
  setPitch(step, pitch) {
    if (step < 0 || step >= SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS) return;

    const pitches = [...this.getState("pitches") || this.pitches];
    pitches[step] = pitch;
    this.updateState("pitches", pitches);
  }

  /**
   * Clear all pitches
   */
  clear() {
    const emptyPitches = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null);
    this.updateState("pitches", emptyPitches);
  }

  /**
   * Get pitches for current subdivisions
   */
  getCurrentPitches() {
    const pitches = this.getState("pitches") || this.pitches;
    const subdivisions = this.getSubdivisions();
    return pitches.slice(0, subdivisions);
  }

  /**
   * Transpose all pitches by semitones
   */
  transpose(semitones) {
    const pitches = [...this.getState("pitches") || this.pitches];
    const transposed = pitches.map((pitch) =>
      pitch !== null ? pitch + semitones : null
    );
    this.updateState("pitches", transposed);
  }
}

/**
 * Sample & Hold Channel
 * Handles S&H patterns with static or random values
 */
export class SHChannel extends CVChannel {
  constructor(channelIndex) {
    super(channelIndex, CV_MODES.SH);
    this.sh = {
      ...DEFAULT_SH,
      values: Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0),
    };
  }

  /**
   * Update S&H parameter
   */
  updateSHParam(param, value) {
    const sh = { ...this.getState("sh") || this.sh };
    sh[param] = value;
    this.updateState("sh", sh);
    return sh;
  }

  /**
   * Set S&H mode (static/random)
   */
  setMode(mode) {
    return this.updateSHParam("mode", mode);
  }

  /**
   * Set width
   */
  setWidth(width) {
    return this.updateSHParam("width", width);
  }

  /**
   * Generate new random values
   */
  generateRandomValues() {
    const sh = { ...this.getState("sh") || this.sh };
    const subdivisions = this.getSubdivisions();
    const newValues = [...sh.values];

    for (let i = 0; i < subdivisions; i++) {
      newValues[i] = Math.random() * 2 - 1; // -1 to 1
    }

    sh.values = newValues;
    this.updateState("sh", sh);
    return newValues;
  }

  /**
   * Get S&H configuration
   */
  getSHConfig() {
    return this.getState("sh") || this.sh;
  }

  /**
   * Get values for current subdivisions
   */
  getCurrentValues() {
    const sh = this.getState("sh") || this.sh;
    const subdivisions = this.getSubdivisions();
    return sh.values.slice(0, subdivisions);
  }
}

/**
 * Channel Factory
 * Creates appropriate channel instance based on mode
 */
export class ChannelFactory {
  static createChannel(channelIndex, mode, cvMode = null) {
    switch (mode) {
      case CHANNEL_MODES.TRIGGER:
        return new TriggerChannel(channelIndex);

      case CHANNEL_MODES.CV:
        switch (cvMode) {
          case CV_MODES.LFO:
            return new LFOChannel(channelIndex);
          case CV_MODES.PITCH:
            return new PitchChannel(channelIndex);
          case CV_MODES.SH:
            return new SHChannel(channelIndex);
          default:
            throw new Error(`Unknown CV mode: ${cvMode}`);
        }

      default:
        throw new Error(`Unknown channel mode: ${mode}`);
    }
  }

  /**
   * Create channel from existing state
   */
  static createFromState(channelIndex, state) {
    const channel = this.createChannel(
      channelIndex,
      state.mode,
      state.cvMode,
    );

    // Restore state
    channel.useCustomSubdivisions = state.useCustomSubdivisions;
    channel.subdivisions = state.subdivisions;

    if (channel instanceof TriggerChannel) {
      channel.pattern = state.pattern || channel.pattern;
    } else if (channel instanceof LFOChannel) {
      channel.lfo = state.lfo || channel.lfo;
    } else if (channel instanceof PitchChannel) {
      channel.pitches = state.pitches || channel.pitches;
    } else if (channel instanceof SHChannel) {
      channel.sh = state.sh || channel.sh;
    }

    return channel;
  }
}

/**
 * Channel Manager
 * Manages all channels in the sequencer
 */
export class ChannelManager {
  constructor() {
    this.channels = new Map();
  }

  /**
   * Initialize channels from state
   */
  initializeFromState(state) {
    for (let i = 0; i < SEQUENCER_CONSTANTS.MAX_CHANNELS; i++) {
      const channelState = state.channels[i];
      const channel = ChannelFactory.createFromState(i, channelState);
      this.channels.set(i, channel);
    }
  }

  /**
   * Get a channel by index
   */
  getChannel(index) {
    return this.channels.get(index);
  }

  /**
   * Change channel mode
   */
  changeChannelMode(index, mode, cvMode = null) {
    const newChannel = ChannelFactory.createChannel(index, mode, cvMode);

    // Preserve subdivision settings
    const oldChannel = this.channels.get(index);
    if (oldChannel) {
      newChannel.useCustomSubdivisions = oldChannel.useCustomSubdivisions;
      newChannel.subdivisions = oldChannel.subdivisions;
    }

    this.channels.set(index, newChannel);
    return newChannel;
  }

  /**
   * Get all channels
   */
  getAllChannels() {
    return Array.from(this.channels.values());
  }

  /**
   * Clear all patterns/data
   */
  clearAll() {
    this.channels.forEach((channel) => {
      if (channel.clear) {
        channel.clear();
      }
    });
  }
}

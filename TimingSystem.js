/**
 * TimingSystem.js
 *
 * Unified timing architecture for the ES-8 Web Sequencer.
 * Replaces the current boolean flags with a more maintainable and extensible system.
 */

/**
 * Timing mode enums - defines how a channel's pattern length is determined
 */
export const TIMING_MODES = Object.freeze({
  GLOBAL: "global", // Use global subdivisions
  CUSTOM: "custom", // Use channel-specific subdivisions
  POLYRHYTHM: "polyrhythm", // Use polyrhythm steps (independent of subdivisions)
});

/**
 * Timing configuration object that replaces multiple boolean flags
 */
export class TimingConfig {
  /**
   * @param {string} mode - One of TIMING_MODES values
   * @param {number} subdivisions - Number of subdivisions (used in GLOBAL and CUSTOM modes)
   * @param {number} polyrhythmSteps - Number of steps for polyrhythm (used in POLYRHYTHM mode)
   */
  constructor(
    mode = TIMING_MODES.GLOBAL,
    subdivisions = 8,
    polyrhythmSteps = 8,
  ) {
    this.mode = mode;
    this.subdivisions = subdivisions;
    this.polyrhythmSteps = polyrhythmSteps;
  }

  /**
   * Get the effective pattern length based on the timing mode
   * @param {number} globalSubdivisions - The global subdivisions value
   * @returns {number} The pattern length to use
   */
  getPatternLength(globalSubdivisions) {
    switch (this.mode) {
      case TIMING_MODES.GLOBAL:
        return globalSubdivisions;
      case TIMING_MODES.CUSTOM:
        return this.subdivisions;
      case TIMING_MODES.POLYRHYTHM:
        return this.polyrhythmSteps;
      default:
        console.warn(
          `Unknown timing mode: ${this.mode}, falling back to global`,
        );
        return globalSubdivisions;
    }
  }

  /**
   * Create from legacy boolean flags (for migration)
   * @param {boolean} useCustomSubdivisions
   * @param {boolean} usePolyrhythm
   * @param {number} subdivisions
   * @param {number} polyrhythmSteps
   * @returns {TimingConfig}
   */
  static fromLegacyFlags(
    useCustomSubdivisions,
    usePolyrhythm,
    subdivisions,
    polyrhythmSteps,
  ) {
    let mode = TIMING_MODES.GLOBAL;

    if (usePolyrhythm) {
      mode = TIMING_MODES.POLYRHYTHM;
    } else if (useCustomSubdivisions) {
      mode = TIMING_MODES.CUSTOM;
    }

    return new TimingConfig(mode, subdivisions, polyrhythmSteps);
  }

  /**
   * Convert to legacy boolean flags (for backward compatibility)
   * @returns {{useCustomSubdivisions: boolean, usePolyrhythm: boolean}}
   */
  toLegacyFlags() {
    return {
      useCustomSubdivisions: this.mode === TIMING_MODES.CUSTOM,
      usePolyrhythm: this.mode === TIMING_MODES.POLYRHYTHM,
    };
  }

  /**
   * Clone the timing configuration
   * @returns {TimingConfig}
   */
  clone() {
    return new TimingConfig(this.mode, this.subdivisions, this.polyrhythmSteps);
  }

  /**
   * Validate and ensure consistency of the timing configuration
   * @param {number} maxSubdivisions - Maximum allowed subdivisions
   * @returns {TimingConfig} Returns this for chaining
   */
  validate(maxSubdivisions = 64) {
    // Ensure subdivisions are within valid range
    this.subdivisions = Math.max(
      1,
      Math.min(maxSubdivisions, this.subdivisions),
    );
    this.polyrhythmSteps = Math.max(
      1,
      Math.min(maxSubdivisions, this.polyrhythmSteps),
    );

    // Ensure mode is valid
    if (!Object.values(TIMING_MODES).includes(this.mode)) {
      this.mode = TIMING_MODES.GLOBAL;
    }

    return this;
  }
}

/**
 * ChannelTiming class with static methods for pattern length calculation
 * and timing-related utilities
 */
export class ChannelTiming {
  /**
   * Calculate the effective pattern length for a channel
   * @param {TimingConfig} timingConfig - The channel's timing configuration
   * @param {number} globalSubdivisions - The global subdivisions value
   * @returns {number} The pattern length to use
   */
  static getPatternLength(timingConfig, globalSubdivisions) {
    return timingConfig.getPatternLength(globalSubdivisions);
  }

  /**
   * Calculate phase relationship between old and new pattern lengths
   * Used for pattern migration
   * @param {number} oldLength
   * @param {number} newLength
   * @returns {{ratio: number, isExpanding: boolean, gcd: number}}
   */
  static calculatePhaseRelationship(oldLength, newLength) {
    const gcd = this.greatestCommonDivisor(oldLength, newLength);
    const ratio = newLength / oldLength;
    const isExpanding = newLength > oldLength;

    return { ratio, isExpanding, gcd };
  }

  /**
   * Map a step index from one pattern length to another while preserving timing
   * @param {number} oldStep - Step index in the old pattern
   * @param {number} oldLength - Length of the old pattern
   * @param {number} newLength - Length of the new pattern
   * @returns {number} The corresponding step in the new pattern
   */
  static mapStepIndex(oldStep, oldLength, newLength) {
    const phase = oldStep / oldLength;
    return Math.round(phase * newLength) % newLength;
  }

  /**
   * Calculate the greatest common divisor of two numbers
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  static greatestCommonDivisor(a, b) {
    return b === 0 ? a : this.greatestCommonDivisor(b, a % b);
  }

  /**
   * Determine if a step should be active based on pattern density
   * Used for pattern expansion/contraction
   * @param {number} step - The step index
   * @param {number} totalSteps - Total number of steps
   * @param {number} targetDensity - Desired pattern density (0-1)
   * @returns {boolean}
   */
  static shouldStepBeActive(step, totalSteps, targetDensity) {
    const threshold = step / totalSteps;
    return threshold < targetDensity;
  }

  /**
   * Calculate timing offset for polyrhythmic patterns
   * @param {number} step - Current step
   * @param {number} patternLength - Length of the pattern
   * @param {number} cycleTime - Total cycle time in seconds
   * @returns {number} Offset in seconds
   */
  static calculatePolyrhythmOffset(step, patternLength, cycleTime) {
    return (step / patternLength) * cycleTime;
  }

  /**
   * Ensure state consistency when changing timing modes
   * @param {Object} channelState - The channel state object
   * @param {TimingConfig} newTimingConfig - The new timing configuration
   * @param {number} globalSubdivisions - Current global subdivisions
   * @returns {Object} Updated channel state
   */
  static ensureStateConsistency(
    channelState,
    newTimingConfig,
    globalSubdivisions,
  ) {
    const oldLength = channelState.timingConfig
      ? channelState.timingConfig.getPatternLength(globalSubdivisions)
      : globalSubdivisions;

    const newLength = newTimingConfig.getPatternLength(globalSubdivisions);

    // Update timing config
    const updatedState = {
      ...channelState,
      timingConfig: newTimingConfig.clone(),
    };

    // If pattern length changed, we might need to migrate data
    if (oldLength !== newLength) {
      updatedState._needsMigration = true;
      updatedState._oldLength = oldLength;
      updatedState._newLength = newLength;
    }

    return updatedState;
  }

  /**
   * Get display information for timing mode
   * @param {TimingConfig} timingConfig
   * @param {number} globalSubdivisions
   * @returns {{mode: string, steps: number, label: string}}
   */
  static getTimingDisplay(timingConfig, globalSubdivisions) {
    const steps = timingConfig.getPatternLength(globalSubdivisions);
    let label = "";

    switch (timingConfig.mode) {
      case TIMING_MODES.GLOBAL:
        label = `Global (${steps} steps)`;
        break;
      case TIMING_MODES.CUSTOM:
        label = `Custom (${steps} steps)`;
        break;
      case TIMING_MODES.POLYRHYTHM:
        label = `Poly ${steps}:${globalSubdivisions}`;
        break;
    }

    return { mode: timingConfig.mode, steps, label };
  }
}

/**
 * Helper function to migrate channel state from old to new timing system
 * @param {Object} oldChannelState - Channel state with boolean flags
 * @returns {Object} Channel state with TimingConfig
 */
export function migrateChannelToTimingConfig(oldChannelState) {
  const {
    useCustomSubdivisions = false,
    usePolyrhythm = false,
    subdivisions = 8,
    polyrhythmSteps = 8,
    ...rest
  } = oldChannelState;

  const timingConfig = TimingConfig.fromLegacyFlags(
    useCustomSubdivisions,
    usePolyrhythm,
    subdivisions,
    polyrhythmSteps,
  );

  return {
    ...rest,
    subdivisions, // Keep for backward compatibility
    polyrhythmSteps, // Keep for backward compatibility
    timingConfig,
  };
}

/**
 * Helper function to get pattern length for a channel
 * Works with both old and new timing systems
 * @param {Object} channelState
 * @param {number} globalSubdivisions
 * @returns {number}
 */
export function getChannelPatternLength(channelState, globalSubdivisions) {
  // New system
  if (channelState.timingConfig) {
    return channelState.timingConfig.getPatternLength(globalSubdivisions);
  }

  // Old system fallback
  if (channelState.usePolyrhythm) {
    return channelState.polyrhythmSteps || globalSubdivisions;
  } else if (channelState.useCustomSubdivisions) {
    return channelState.subdivisions || globalSubdivisions;
  }

  return globalSubdivisions;
}

// Export a default timing configuration
export const DEFAULT_TIMING_CONFIG = new TimingConfig(
  TIMING_MODES.GLOBAL,
  8,
  8,
);

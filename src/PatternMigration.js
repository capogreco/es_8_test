import { SEQUENCER_CONSTANTS } from "./constants.js";

/**
 * Pattern Migration Module
 * Handles all pattern, pitch, and value migrations when subdivisions change
 * Uses phase-based approach to preserve musical timing
 */

/**
 * Calculate phase (0-1) for a given step within total subdivisions
 * @param {number} step - The step index
 * @param {number} subdivisions - Total number of subdivisions
 * @returns {number} Phase value between 0 and 1
 */
export function calculatePhase(step, subdivisions) {
  return step / subdivisions;
}

/**
 * Find the closest step in new subdivision for a given phase
 * @param {number} phase - Phase value (0-1)
 * @param {number} newSubdivisions - New number of subdivisions
 * @returns {number} The closest step index
 */
export function phaseToStep(phase, newSubdivisions) {
  return Math.round(phase * newSubdivisions);
}

/**
 * Migrate a boolean pattern (triggers) from one subdivision to another
 * @param {Array<boolean>} oldPattern - Original pattern array
 * @param {number} oldSubdivisions - Original number of subdivisions
 * @param {number} newSubdivisions - New number of subdivisions
 * @returns {Array<boolean>} Migrated pattern array
 */
export function migratePattern(oldPattern, oldSubdivisions, newSubdivisions) {
  const newPattern = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(false);

  // Special case: no change
  if (oldSubdivisions === newSubdivisions) {
    return [...oldPattern];
  }

  // Special case: empty pattern
  if (!oldPattern.some((v) => v)) {
    return newPattern;
  }

  // Phase-based migration
  for (let oldStep = 0; oldStep < oldSubdivisions; oldStep++) {
    if (oldPattern[oldStep]) {
      const phase = calculatePhase(oldStep, oldSubdivisions);
      let newStep = phaseToStep(phase, newSubdivisions);

      // Ensure we don't exceed bounds
      if (newStep >= newSubdivisions) {
        newStep = newSubdivisions - 1;
      }

      // Handle collisions - if target is already occupied, find nearest free slot
      if (newPattern[newStep]) {
        // Look for nearest free slot
        for (let offset = 1; offset < newSubdivisions; offset++) {
          const before = newStep - offset;
          const after = newStep + offset;

          if (before >= 0 && !newPattern[before]) {
            newStep = before;
            break;
          }
          if (after < newSubdivisions && !newPattern[after]) {
            newStep = after;
            break;
          }
        }
      }

      newPattern[newStep] = true;
    }
  }

  return newPattern;
}

/**
 * Migrate pitch values from one subdivision to another
 * @param {Array<number|null>} oldPitches - Original pitch array
 * @param {number} oldSubdivisions - Original number of subdivisions
 * @param {number} newSubdivisions - New number of subdivisions
 * @returns {Array<number|null>} Migrated pitch array
 */
export function migratePitches(oldPitches, oldSubdivisions, newSubdivisions) {
  const newPitches = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(null);

  // Special case: no change
  if (oldSubdivisions === newSubdivisions) {
    return [...oldPitches];
  }

  // Special case: no pitches
  if (!oldPitches.some((p) => p !== null)) {
    return newPitches;
  }

  // Phase-based migration
  for (let oldStep = 0; oldStep < oldSubdivisions; oldStep++) {
    if (oldPitches[oldStep] !== null) {
      const phase = calculatePhase(oldStep, oldSubdivisions);
      let newStep = phaseToStep(phase, newSubdivisions);

      // Ensure we don't exceed bounds
      if (newStep >= newSubdivisions) {
        newStep = newSubdivisions - 1;
      }

      // For pitches, we can overwrite (last one wins)
      newPitches[newStep] = oldPitches[oldStep];
    }
  }

  return newPitches;
}

/**
 * Migrate S&H values from one subdivision to another
 * @param {Array<number>} oldValues - Original S&H values array
 * @param {number} oldSubdivisions - Original number of subdivisions
 * @param {number} newSubdivisions - New number of subdivisions
 * @returns {Array<number>} Migrated S&H values array
 */
export function migrateSHValues(oldValues, oldSubdivisions, newSubdivisions) {
  const newValues = Array(SEQUENCER_CONSTANTS.MAX_SUBDIVISIONS).fill(0);

  // Special case: no change
  if (oldSubdivisions === newSubdivisions) {
    return [...oldValues];
  }

  // For S&H, we interpolate/resample the values
  for (let newStep = 0; newStep < newSubdivisions; newStep++) {
    const phase = calculatePhase(newStep, newSubdivisions);
    const oldPosition = phase * oldSubdivisions;
    const oldStep = Math.floor(oldPosition);
    const fraction = oldPosition - oldStep;

    if (oldStep >= oldSubdivisions - 1) {
      // Last step
      newValues[newStep] = oldValues[oldSubdivisions - 1] || 0;
    } else {
      // Linear interpolation between adjacent values
      const value1 = oldValues[oldStep] || 0;
      const value2 = oldValues[oldStep + 1] || 0;
      newValues[newStep] = value1 + (value2 - value1) * fraction;
    }
  }

  return newValues;
}

/**
 * Migration strategy configuration
 */
export const MIGRATION_STRATEGIES = {
  PATTERN: "pattern",
  PITCH: "pitch",
  SH_VALUES: "sh_values",
};

/**
 * Get the appropriate migration function for a given strategy
 * @param {string} strategy - One of MIGRATION_STRATEGIES
 * @returns {Function} The migration function
 */
export function getMigrationFunction(strategy) {
  switch (strategy) {
    case MIGRATION_STRATEGIES.PATTERN:
      return migratePattern;
    case MIGRATION_STRATEGIES.PITCH:
      return migratePitches;
    case MIGRATION_STRATEGIES.SH_VALUES:
      return migrateSHValues;
    default:
      throw new Error(`Unknown migration strategy: ${strategy}`);
  }
}

/**
 * Batch migrate multiple data types
 * @param {Object} migrations - Object mapping data to migration strategies
 * @param {number} oldSubdivisions - Original number of subdivisions
 * @param {number} newSubdivisions - New number of subdivisions
 * @returns {Object} Object with migrated data
 */
export function batchMigrate(migrations, oldSubdivisions, newSubdivisions) {
  const results = {};

  for (const [key, { data, strategy }] of Object.entries(migrations)) {
    const migrationFn = getMigrationFunction(strategy);
    results[key] = migrationFn(data, oldSubdivisions, newSubdivisions);
  }

  return results;
}

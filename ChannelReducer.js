// Action types for channel operations
export const CHANNEL_ACTION_TYPES = {
  // Basic channel properties
  SET_ACTIVE: 'SET_ACTIVE',
  SET_WAVEFORM: 'SET_WAVEFORM',
  SET_VOLUME: 'SET_VOLUME',
  SET_PAN: 'SET_PAN',
  SET_PITCH: 'SET_PITCH',
  
  // Subdivision and timing
  SET_SUBDIVISION: 'SET_SUBDIVISION',
  SET_CUSTOM_SUBDIVISION: 'SET_CUSTOM_SUBDIVISION',
  TOGGLE_POLYRHYTHM: 'TOGGLE_POLYRHYTHM',
  
  // Pattern operations
  SET_PATTERN: 'SET_PATTERN',
  TOGGLE_STEP: 'TOGGLE_STEP',
  CLEAR_PATTERN: 'CLEAR_PATTERN',
  RANDOMIZE_PATTERN: 'RANDOMIZE_PATTERN',
  
  // Bulk operations
  UPDATE_MULTIPLE: 'UPDATE_MULTIPLE',
  RESET_CHANNEL: 'RESET_CHANNEL'
};

// Default channel state
export const defaultChannelState = {
  active: true,
  waveform: 'sine',
  volume: 0.5,
  pan: 0,
  pitch: 440,
  subdivision: 16,
  customSubdivision: 16,
  usePolyrhythm: false,
  pattern: new Array(16).fill(false)
};

// Validation helpers
const validateVolume = (volume) => {
  const val = parseFloat(volume);
  return isNaN(val) ? 0.5 : Math.max(0, Math.min(1, val));
};

const validatePan = (pan) => {
  const val = parseFloat(pan);
  return isNaN(val) ? 0 : Math.max(-1, Math.min(1, val));
};

const validatePitch = (pitch) => {
  const val = parseFloat(pitch);
  return isNaN(val) || val <= 0 ? 440 : val;
};

const validateSubdivision = (subdivision) => {
  const val = parseInt(subdivision, 10);
  const validSubdivisions = [1, 2, 4, 8, 16, 32];
  return validSubdivisions.includes(val) ? val : 16;
};

const validateCustomSubdivision = (customSubdivision) => {
  const val = parseInt(customSubdivision, 10);
  return isNaN(val) || val < 1 || val > 32 ? 16 : val;
};

const validateWaveform = (waveform) => {
  const validWaveforms = ['sine', 'square', 'triangle', 'sawtooth'];
  return validWaveforms.includes(waveform) ? waveform : 'sine';
};

// Helper to ensure pattern length matches subdivision
const adjustPatternLength = (pattern, newLength) => {
  if (pattern.length === newLength) return pattern;
  
  const newPattern = new Array(newLength).fill(false);
  const copyLength = Math.min(pattern.length, newLength);
  
  for (let i = 0; i < copyLength; i++) {
    newPattern[i] = pattern[i];
  }
  
  return newPattern;
};

// Helper to handle polyrhythm state transitions
const handlePolyrhythmTransition = (state, usePolyrhythm) => {
  if (usePolyrhythm === state.usePolyrhythm) {
    return state; // No change
  }
  
  if (usePolyrhythm) {
    // Enabling polyrhythm
    const effectiveSubdivision = state.customSubdivision;
    return {
      ...state,
      usePolyrhythm: true,
      pattern: adjustPatternLength(state.pattern, effectiveSubdivision)
    };
  } else {
    // Disabling polyrhythm
    return {
      ...state,
      usePolyrhythm: false,
      customSubdivision: state.subdivision,
      pattern: adjustPatternLength(state.pattern, state.subdivision)
    };
  }
};

// Main reducer function
export function channelReducer(state = defaultChannelState, action) {
  switch (action.type) {
    // Basic channel properties
    case CHANNEL_ACTION_TYPES.SET_ACTIVE:
      return {
        ...state,
        active: Boolean(action.payload)
      };
      
    case CHANNEL_ACTION_TYPES.SET_WAVEFORM:
      return {
        ...state,
        waveform: validateWaveform(action.payload)
      };
      
    case CHANNEL_ACTION_TYPES.SET_VOLUME:
      return {
        ...state,
        volume: validateVolume(action.payload)
      };
      
    case CHANNEL_ACTION_TYPES.SET_PAN:
      return {
        ...state,
        pan: validatePan(action.payload)
      };
      
    case CHANNEL_ACTION_TYPES.SET_PITCH:
      return {
        ...state,
        pitch: validatePitch(action.payload)
      };
      
    // Subdivision and timing
    case CHANNEL_ACTION_TYPES.SET_SUBDIVISION: {
      const newSubdivision = validateSubdivision(action.payload);
      
      if (state.usePolyrhythm) {
        // When polyrhythm is active, only update subdivision
        return {
          ...state,
          subdivision: newSubdivision
        };
      } else {
        // When polyrhythm is not active, sync customSubdivision and adjust pattern
        return {
          ...state,
          subdivision: newSubdivision,
          customSubdivision: newSubdivision,
          pattern: adjustPatternLength(state.pattern, newSubdivision)
        };
      }
    }
    
    case CHANNEL_ACTION_TYPES.SET_CUSTOM_SUBDIVISION: {
      const newCustomSubdivision = validateCustomSubdivision(action.payload);
      
      if (!state.usePolyrhythm) {
        // Custom subdivision changes are ignored when polyrhythm is disabled
        return state;
      }
      
      return {
        ...state,
        customSubdivision: newCustomSubdivision,
        pattern: adjustPatternLength(state.pattern, newCustomSubdivision)
      };
    }
    
    case CHANNEL_ACTION_TYPES.TOGGLE_POLYRHYTHM:
      return handlePolyrhythmTransition(state, !state.usePolyrhythm);
      
    // Pattern operations
    case CHANNEL_ACTION_TYPES.SET_PATTERN: {
      const effectiveSubdivision = state.usePolyrhythm ? 
        state.customSubdivision : state.subdivision;
      
      if (!Array.isArray(action.payload)) {
        return state;
      }
      
      // Ensure pattern matches effective subdivision
      const newPattern = adjustPatternLength(action.payload, effectiveSubdivision);
      
      return {
        ...state,
        pattern: newPattern.map(step => Boolean(step))
      };
    }
    
    case CHANNEL_ACTION_TYPES.TOGGLE_STEP: {
      const index = action.payload;
      const effectiveSubdivision = state.usePolyrhythm ? 
        state.customSubdivision : state.subdivision;
      
      if (typeof index !== 'number' || index < 0 || index >= effectiveSubdivision) {
        return state;
      }
      
      const newPattern = [...state.pattern];
      newPattern[index] = !newPattern[index];
      
      return {
        ...state,
        pattern: newPattern
      };
    }
    
    case CHANNEL_ACTION_TYPES.CLEAR_PATTERN: {
      const effectiveSubdivision = state.usePolyrhythm ? 
        state.customSubdivision : state.subdivision;
      
      return {
        ...state,
        pattern: new Array(effectiveSubdivision).fill(false)
      };
    }
    
    case CHANNEL_ACTION_TYPES.RANDOMIZE_PATTERN: {
      const effectiveSubdivision = state.usePolyrhythm ? 
        state.customSubdivision : state.subdivision;
      const density = action.payload || 0.5;
      
      const newPattern = new Array(effectiveSubdivision).fill(false)
        .map(() => Math.random() < density);
      
      return {
        ...state,
        pattern: newPattern
      };
    }
    
    // Bulk operations
    case CHANNEL_ACTION_TYPES.UPDATE_MULTIPLE: {
      if (!action.payload || typeof action.payload !== 'object') {
        return state;
      }
      
      // Process updates in a specific order to ensure consistency
      let newState = state;
      
      // First, handle non-polyrhythm updates
      const updates = { ...action.payload };
      delete updates.usePolyrhythm;
      delete updates.subdivision;
      delete updates.customSubdivision;
      delete updates.pattern;
      
      // Apply basic property updates
      Object.entries(updates).forEach(([key, value]) => {
        switch (key) {
          case 'active':
            newState = { ...newState, active: Boolean(value) };
            break;
          case 'waveform':
            newState = { ...newState, waveform: validateWaveform(value) };
            break;
          case 'volume':
            newState = { ...newState, volume: validateVolume(value) };
            break;
          case 'pan':
            newState = { ...newState, pan: validatePan(value) };
            break;
          case 'pitch':
            newState = { ...newState, pitch: validatePitch(value) };
            break;
        }
      });
      
      // Handle polyrhythm toggle if present
      if ('usePolyrhythm' in action.payload) {
        newState = handlePolyrhythmTransition(newState, action.payload.usePolyrhythm);
      }
      
      // Handle subdivision updates
      if ('subdivision' in action.payload) {
        const newSubdivision = validateSubdivision(action.payload.subdivision);
        
        if (newState.usePolyrhythm) {
          newState = { ...newState, subdivision: newSubdivision };
        } else {
          newState = {
            ...newState,
            subdivision: newSubdivision,
            customSubdivision: newSubdivision,
            pattern: adjustPatternLength(newState.pattern, newSubdivision)
          };
        }
      }
      
      if ('customSubdivision' in action.payload && newState.usePolyrhythm) {
        const newCustomSubdivision = validateCustomSubdivision(action.payload.customSubdivision);
        newState = {
          ...newState,
          customSubdivision: newCustomSubdivision,
          pattern: adjustPatternLength(newState.pattern, newCustomSubdivision)
        };
      }
      
      // Handle pattern update last
      if ('pattern' in action.payload && Array.isArray(action.payload.pattern)) {
        const effectiveSubdivision = newState.usePolyrhythm ? 
          newState.customSubdivision : newState.subdivision;
        
        newState = {
          ...newState,
          pattern: adjustPatternLength(
            action.payload.pattern.map(step => Boolean(step)),
            effectiveSubdivision
          )
        };
      }
      
      return newState;
    }
    
    case CHANNEL_ACTION_TYPES.RESET_CHANNEL:
      return { ...defaultChannelState };
      
    default:
      return state;
  }
}

// Action creators
export const channelActions = {
  setActive: (active) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_ACTIVE, 
    payload: active 
  }),
  
  setWaveform: (waveform) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_WAVEFORM, 
    payload: waveform 
  }),
  
  setVolume: (volume) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_VOLUME, 
    payload: volume 
  }),
  
  setPan: (pan) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_PAN, 
    payload: pan 
  }),
  
  setPitch: (pitch) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_PITCH, 
    payload: pitch 
  }),
  
  setSubdivision: (subdivision) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_SUBDIVISION, 
    payload: subdivision 
  }),
  
  setCustomSubdivision: (customSubdivision) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_CUSTOM_SUBDIVISION, 
    payload: customSubdivision 
  }),
  
  togglePolyrhythm: () => ({ 
    type: CHANNEL_ACTION_TYPES.TOGGLE_POLYRHYTHM 
  }),
  
  setPattern: (pattern) => ({ 
    type: CHANNEL_ACTION_TYPES.SET_PATTERN, 
    payload: pattern 
  }),
  
  toggleStep: (index) => ({ 
    type: CHANNEL_ACTION_TYPES.TOGGLE_STEP, 
    payload: index 
  }),
  
  clearPattern: () => ({ 
    type: CHANNEL_ACTION_TYPES.CLEAR_PATTERN 
  }),
  
  randomizePattern: (density = 0.5) => ({ 
    type: CHANNEL_ACTION_TYPES.RANDOMIZE_PATTERN, 
    payload: density 
  }),
  
  updateMultiple: (updates) => ({ 
    type: CHANNEL_ACTION_TYPES.UPDATE_MULTIPLE, 
    payload: updates 
  }),
  
  resetChannel: () => ({ 
    type: CHANNEL_ACTION_TYPES.RESET_CHANNEL 
  })
};

// Selector helpers
export const channelSelectors = {
  getEffectiveSubdivision: (state) => 
    state.usePolyrhythm ? state.customSubdivision : state.subdivision,
  
  getActiveStepCount: (state) => 
    state.pattern.filter(step => step).length,
  
  isValidState: (state) => {
    // Validate all state properties
    if (typeof state.active !== 'boolean') return false;
    if (!['sine', 'square', 'triangle', 'sawtooth'].includes(state.waveform)) return false;
    if (state.volume < 0 || state.volume > 1) return false;
    if (state.pan < -1 || state.pan > 1) return false;
    if (state.pitch <= 0) return false;
    if (![1, 2, 4, 8, 16, 32].includes(state.subdivision)) return false;
    if (state.customSubdivision < 1 || state.customSubdivision > 32) return false;
    if (typeof state.usePolyrhythm !== 'boolean') return false;
    if (!Array.isArray(state.pattern)) return false;
    
    // Validate pattern length
    const expectedLength = state.usePolyrhythm ? 
      state.customSubdivision : state.subdivision;
    if (state.pattern.length !== expectedLength) return false;
    
    return true;
  }
};
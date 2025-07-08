/**
 * Simple state management system with pub/sub pattern
 * Provides a reactive way to manage sequencer state and UI updates
 */
export class StateManager {
  constructor(initialState = {}) {
    this._state = this.deepClone(initialState);
    this._listeners = new Map();
    this._globalListeners = new Set();
    this._transactionDepth = 0;
    this._pendingNotifications = new Set();
  }

  /**
   * Get a value from the state using a path
   * @param {string} path - Dot-separated path (e.g., 'channels.0.mode')
   * @returns {*} The value at the path
   */
  get(path) {
    if (!path) return this.deepClone(this._state);
    
    const keys = path.split('.');
    let value = this._state;
    
    for (const key of keys) {
      if (value == null) return undefined;
      value = value[key];
    }
    
    return this.deepClone(value);
  }

  /**
   * Set a value in the state using a path
   * @param {string} path - Dot-separated path
   * @param {*} value - The value to set
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    let target = this._state;
    for (const key of keys) {
      if (!(key in target)) {
        target[key] = {};
      }
      target = target[key];
    }
    
    const oldValue = target[lastKey];
    target[lastKey] = value;
    
    this.notifyListeners(path, value, oldValue);
  }

  /**
   * Update multiple values in a transaction
   * @param {Function} updater - Function that performs state updates
   */
  transaction(updater) {
    this._transactionDepth++;
    
    try {
      updater();
    } finally {
      this._transactionDepth--;
      
      if (this._transactionDepth === 0) {
        // Notify all pending listeners
        for (const path of this._pendingNotifications) {
          const value = this.get(path);
          const listeners = this._listeners.get(path) || [];
          for (const listener of listeners) {
            listener(value, value); // TODO: Track old values properly
          }
        }
        this._pendingNotifications.clear();
      }
    }
  }

  /**
   * Subscribe to changes on a specific path
   * @param {string} path - Path to watch
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, listener) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }
    
    this._listeners.get(path).add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(path);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this._listeners.delete(path);
        }
      }
    };
  }

  /**
   * Subscribe to all state changes
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(listener) {
    this._globalListeners.add(listener);
    
    return () => {
      this._globalListeners.delete(listener);
    };
  }

  /**
   * Notify listeners of a change
   * @private
   */
  notifyListeners(path, newValue, oldValue) {
    if (this._transactionDepth > 0) {
      this._pendingNotifications.add(path);
      return;
    }
    
    // Notify specific path listeners
    const pathListeners = this._listeners.get(path) || [];
    for (const listener of pathListeners) {
      listener(newValue, oldValue, path);
    }
    
    // Notify parent path listeners
    const pathParts = path.split('.');
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.');
      const parentListeners = this._listeners.get(parentPath) || [];
      for (const listener of parentListeners) {
        const parentValue = this.get(parentPath);
        listener(parentValue, parentValue, parentPath);
      }
    }
    
    // Notify global listeners
    for (const listener of this._globalListeners) {
      listener(path, newValue, oldValue);
    }
  }

  /**
   * Helper method to update a channel property
   * @param {number} channel - Channel index
   * @param {string} property - Property name
   * @param {*} value - New value
   */
  setChannelProperty(channel, property, value) {
    this.set(`channels.${channel}.${property}`, value);
  }

  /**
   * Helper method to get a channel property
   * @param {number} channel - Channel index
   * @param {string} property - Property name
   * @returns {*} The property value
   */
  getChannelProperty(channel, property) {
    return this.get(`channels.${channel}.${property}`);
  }

  /**
   * Deep clone a value
   * @private
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (obj instanceof Object) {
      const cloned = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  /**
   * Get the entire state (for debugging)
   */
  getState() {
    return this.deepClone(this._state);
  }
}

// Create singleton instance
export const stateManager = new StateManager();
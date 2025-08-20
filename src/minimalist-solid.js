import { render, h } from 'https://cdn.skypack.dev/solid-js/web';
import { createSignal, createEffect, For, Show, batch } from 'https://cdn.skypack.dev/solid-js';
import { createStore } from 'https://cdn.skypack.dev/solid-js/store';

// Import sequencer constants and logic
import {
  CHANNEL_MODES,
  CV_MODES,
  MESSAGE_TYPES,
  SEQUENCER_CONSTANTS,
  DEFAULT_LFO,
  DEFAULT_SH,
} from "./constants.js";

// Constants
const MODE_CYCLE = ['trigger', 'pitch', 'lfo', 'sh'];
const MODE_ICONS = {
  'trigger': 'trig',
  'lfo': 'lfo',
  'pitch': 'pitch',
  'sh': 's+h'
};

// Create the Solid.js app
function App() {
  // Audio context
  let audioContext = null;
  let es8Node = null;

  // Signals for UI state
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [selectedChannel, setSelectedChannel] = createSignal(0);
  const [gridSubdivisions, setGridSubdivisions] = createSignal(16);
  const [visibleChannels, setVisibleChannels] = createSignal(new Set([0, 1, 2, 3, 4, 5, 6, 7])); // All visible by default
  const [status, setStatus] = createSignal('Ready');
  const [cycleTime, setCycleTime] = createSignal(2.0);
  const [subdivisions, setSubdivisions] = createSignal(16);

  // Store for sequencer state
  const [state, setState] = createStore({
    pattern: Array(8).fill(null).map(() => Array(96).fill(false)),
    channels: Array(8).fill(null).map(() => ({
      mode: CHANNEL_MODES.TRIGGER,
      cvMode: CV_MODES.LFO,
      useCustomSubdivisions: false,
      subdivisions: 16,
      usePolyrhythm: false,
      polyrhythmSteps: 16,
      triggerDuration: 960,
      lfo: { ...DEFAULT_LFO },
      pitches: Array(96).fill(null),
      sh: { ...DEFAULT_SH, values: Array(96).fill(0) },
      currentStep: 0,
    })),
  });

  // Helper functions
  const getChannelMode = (channel) => {
    if (channel.mode === CHANNEL_MODES.TRIGGER) return 'trigger';
    if (channel.cvMode === CV_MODES.LFO) return 'lfo';
    if (channel.cvMode === CV_MODES.PITCH) return 'pitch';
    if (channel.cvMode === CV_MODES.SH) return 'sh';
    return 'trigger';
  };

  const cycleChannelMode = (channelIndex) => {
    const channel = state.channels[channelIndex];
    const currentMode = getChannelMode(channel);
    const currentIndex = MODE_CYCLE.indexOf(currentMode);
    const nextMode = MODE_CYCLE[(currentIndex + 1) % MODE_CYCLE.length];
    
    batch(() => {
      if (nextMode === 'trigger') {
        setState('channels', channelIndex, 'mode', CHANNEL_MODES.TRIGGER);
      } else {
        setState('channels', channelIndex, 'mode', CHANNEL_MODES.CV);
        if (nextMode === 'lfo') setState('channels', channelIndex, 'cvMode', CV_MODES.LFO);
        if (nextMode === 'pitch') setState('channels', channelIndex, 'cvMode', CV_MODES.PITCH);
        if (nextMode === 'sh') setState('channels', channelIndex, 'cvMode', CV_MODES.SH);
      }
    });
    
    sendStateToWorklet();
  };

  const toggleChannelVisibility = (channel) => {
    const newVisible = new Set(visibleChannels());
    if (newVisible.has(channel)) {
      newVisible.delete(channel);
    } else {
      newVisible.add(channel);
    }
    setVisibleChannels(newVisible);
  };

  const toggleStep = (channel, step) => {
    setState('pattern', channel, step, !state.pattern[channel][step]);
    console.log(`Channel ${channel} step ${step} = ${state.pattern[channel][step]}`);
    sendStateToWorklet();
  };

  const updatePitch = (channel, step, value) => {
    const pitch = value === '' ? null : parseFloat(value);
    if (value === '' || (!isNaN(pitch) && pitch >= -120 && pitch <= 120)) {
      setState('channels', channel, 'pitches', step, pitch);
      sendStateToWorklet();
    }
  };

  const clearAll = () => {
    batch(() => {
      setState('pattern', Array(8).fill(null).map(() => Array(96).fill(false)));
      for (let i = 0; i < 8; i++) {
        setState('channels', i, 'pitches', Array(96).fill(null));
        setState('channels', i, 'sh', 'values', Array(96).fill(0));
      }
    });
    sendStateToWorklet();
    updateStatus('Cleared all patterns');
  };

  const updateStatus = (message) => {
    setStatus(message);
    setTimeout(() => setStatus('Ready'), 2000);
  };

  // Audio functions
  const initAudio = async () => {
    try {
      audioContext = new AudioContext({ sampleRate: 48000 });
      await audioContext.audioWorklet.addModule("sequencer-processor.js");
      
      es8Node = new AudioWorkletNode(audioContext, "sequencer-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [8],
        channelCount: 8,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
      });
      
      console.log('AudioWorkletNode created with:', {
        outputChannelCount: 8,
        channelCount: 8,
        actualDestinationChannels: audioContext.destination.channelCount,
        maxChannelCount: audioContext.destination.maxChannelCount
      });
      
      es8Node.port.onmessage = (e) => {
        if (e.data.type === 'stepChange') {
          if (e.data.channel >= 0 && e.data.channel < 8) {
            setState('channels', e.data.channel, 'currentStep', e.data.step);
          }
        } else if (e.data.type === 'log') {
          console.log('[AudioWorklet]:', e.data.message);
        }
      };
      
      es8Node.connect(audioContext.destination);
      
      // Check if we have multi-channel support
      if (audioContext.destination.channelCount < 8) {
        console.warn('Only', audioContext.destination.channelCount, 'channels available. For channels 3-8, create an aggregate device in Audio MIDI Setup.');
        updateStatus(`Audio initialized (${audioContext.destination.channelCount}ch)`);
      } else {
        updateStatus('Audio initialized (8ch)');
      }
      
      sendStateToWorklet();
    } catch (error) {
      console.error("Failed to initialize audio:", error);
      updateStatus(`Error: ${error.message}`);
    }
  };

  const togglePlayback = () => {
    if (!es8Node) {
      updateStatus('Initialize audio first');
      return;
    }
    
    const playing = !isPlaying();
    setIsPlaying(playing);
    es8Node.port.postMessage({
      type: playing ? MESSAGE_TYPES.START : MESSAGE_TYPES.STOP,
    });
    updateStatus(playing ? 'Playing' : 'Stopped');
  };

  const sendStateToWorklet = () => {
    if (!es8Node) return;
    
    console.log('=== Sending state to all 8 channels ===');
    
    // Send cycle time
    es8Node.port.postMessage({
      type: 'setCycleTime',
      data: cycleTime()
    });
    
    // Send subdivisions
    es8Node.port.postMessage({
      type: 'setSubdivisions',
      data: subdivisions()
    });
    
    // Send pattern data for each channel
    for (let channel = 0; channel < 8; channel++) {
      console.log(`Configuring channel ${channel + 1}:`, {
        mode: getChannelMode(state.channels[channel]),
        hasPatternData: state.pattern[channel].some(v => v),
        triggerDuration: state.channels[channel].triggerDuration
      });
      // Send channel mode
      es8Node.port.postMessage({
        type: 'setChannelMode',
        data: {
          channel: channel,
          mode: state.channels[channel].mode,
          cvMode: state.channels[channel].cvMode,
          lfo: state.channels[channel].lfo,
          sh: state.channels[channel].sh,
          useCustomSubdivisions: state.channels[channel].useCustomSubdivisions,
          subdivisions: state.channels[channel].subdivisions
        }
      });
      
      // Send trigger pattern
      for (let step = 0; step < 96; step++) {
        es8Node.port.postMessage({
          type: 'updatePattern',
          data: {
            channel: channel,
            step: step,
            active: state.pattern[channel][step]
          }
        });
      }
      
      // Send pitch data
      for (let step = 0; step < 96; step++) {
        if (state.channels[channel].pitches[step] !== null) {
          es8Node.port.postMessage({
            type: 'updatePitch',
            data: {
              channel: channel,
              step: step,
              pitch: state.channels[channel].pitches[step]
            }
          });
        }
      }
      
      // Send trigger duration
      es8Node.port.postMessage({
        type: 'setTriggerDuration',
        data: {
          channel: channel,
          duration: state.channels[channel].triggerDuration
        }
      });
      
      // Send subdivision settings
      if (state.channels[channel].useCustomSubdivisions) {
        es8Node.port.postMessage({
          type: 'setChannelSubdivisions',
          data: {
            channel: channel,
            subdivisions: state.channels[channel].subdivisions
          }
        });
      }
      
      // Send polyrhythm settings
      es8Node.port.postMessage({
        type: 'setPolyrhythm',
        data: {
          channel: channel,
          enabled: state.channels[channel].usePolyrhythm,
          steps: state.channels[channel].polyrhythmSteps
        }
      });
    }
  };

  // Return the app using hyperscript
  return h('div', { class: 'container' }, [
    h('div', { class: 'sequencer' }, [
      // Transport
      h('div', { class: 'transport' }, [
        h('button', { 
          class: 'transport-btn', 
          onClick: initAudio 
        }, '●'),
        h('button', { 
          class: () => `transport-btn ${isPlaying() ? 'active' : ''}`,
          onClick: togglePlayback
        }, () => isPlaying() ? '■' : '▶'),
        h('button', { 
          class: 'transport-btn', 
          onClick: clearAll 
        }, '✕'),
        
        h('div', { class: 'transport-spacer' }),
        
        h('input', {
          type: 'text',
          class: 'param-input',
          value: cycleTime(),
          onInput: (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val >= 0.5 && val <= 8) {
              setCycleTime(val);
              sendStateToWorklet();
            }
          }
        }),
        h('span', { class: 'param-label' }, 's'),
        
        h('input', {
          type: 'text',
          class: 'param-input',
          value: subdivisions(),
          onInput: (e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val >= 2 && val <= 96) {
              setSubdivisions(val);
              setGridSubdivisions(Math.min(gridSubdivisions(), val));
              sendStateToWorklet();
            }
          }
        }),
        h('span', { class: 'param-label' }, 'div'),
        
        h('div', { class: 'grid-controls' }, [
          h('span', { style: 'color: #444; font-size: 10px; padding: 0 5px;' }, 
            () => gridSubdivisions()
          ),
          h('button', {
            class: 'zoom-btn',
            onClick: () => setGridSubdivisions(Math.max(Math.floor(gridSubdivisions() / 2), 8))
          }, '−'),
          h('button', {
            class: 'zoom-btn',
            onClick: () => setGridSubdivisions(Math.min(gridSubdivisions() * 2, subdivisions(), 96))
          }, '+')
        ])
      ]),

      // Channel Selector
      h('div', { class: 'channels' }, 
        h(For, { each: () => Array(8).fill(0).map((_, i) => i) }, (i) =>
          h('div', { class: () => `channel-block ${selectedChannel() === i ? 'active' : ''}` }, [
            h('div', { class: 'step-indicator' }, 
              h('div', {
                class: 'step-indicator-bar',
                style: () => `left: ${(state.channels[i].currentStep / subdivisions()) * 100}%`
              })
            ),
            h('div', {
              class: () => `channel-select ${selectedChannel() === i ? 'active' : ''}`,
              onClick: () => setSelectedChannel(i)
            }, i + 1),
            h('div', { class: 'channel-controls' }, [
              h('div', {
                class: () => `channel-mode ${getChannelMode(state.channels[i])}`,
                onClick: () => cycleChannelMode(i)
              }, () => MODE_ICONS[getChannelMode(state.channels[i])]),
              h('div', {
                class: () => `visibility-checkbox ${visibleChannels().has(i) ? 'checked' : ''}`,
                onClick: () => toggleChannelVisibility(i)
              }, () => visibleChannels().has(i) ? '■' : '□')
            ])
          ])
        )
      ),

      // Pattern Container
      h('div', { class: 'pattern-container' },
        h('div', { class: 'multi-channel-view' },
          h(For, { each: () => Array(8).fill(0).map((_, i) => i) }, (ch) =>
            h(Show, { when: () => ch === selectedChannel() || visibleChannels().has(ch) }, () =>
              h('div', { class: () => `channel-row ${ch === selectedChannel() ? 'selected' : ''}` }, [
                h('div', { class: 'channel-label' }, ch + 1),
                h('div', {
                  class: 'pattern-grid',
                  style: () => `grid-template-columns: repeat(${gridSubdivisions()}, 1fr)`
                },
                  h(For, { each: () => Array(gridSubdivisions()).fill(0).map((_, i) => i) }, (step) => {
                    const mode = () => getChannelMode(state.channels[ch]);
                    
                    if (mode() === 'pitch') {
                      return h('input', {
                        type: 'text',
                        class: () => `pitch-cell ${step === state.channels[ch].currentStep ? 'current' : ''}`,
                        value: () => state.channels[ch].pitches[step] ?? '',
                        onInput: (e) => updatePitch(ch, step, e.target.value),
                        onFocus: (e) => e.target.select()
                      });
                    } else {
                      return h('div', {
                        class: () => `pattern-step ${state.pattern[ch][step] ? 'active' : ''} ${step === state.channels[ch].currentStep ? 'current' : ''}`,
                        onMouseDown: () => toggleStep(ch, step)
                      });
                    }
                  })
                )
              ])
            )
          )
        )
      ),

      // Status Bar
      h('div', { class: 'status-bar' }, [
        h('span', { class: 'status-message' }, () => status()),
        h('span', {}, 'ES-8 SEQUENCER')
      ])
    ])
  ]);
}

export { App };
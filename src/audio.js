import { stateManager } from "./StateManager.js";
import { els, updateStatus, updateVisibleGrids } from "./ui.js";

let audioContext;
let es8Node;
let isPlaying = false;

export function sendStateToWorklet() {
  if (!es8Node) return;
  const state = stateManager.getState();
  es8Node.port.postMessage({ type: 'setState', state: state });
}

export function togglePlayback() {
  if (!es8Node) {
    updateStatus('Initialize audio first');
    return;
  }

  isPlaying = !isPlaying;

  if (isPlaying) {
    const state = stateManager.getState();
    // Reset visual state before starting
    for (let i = 0; i < state.channels.length; i++) {
      stateManager.set(`channels.${i}.currentStep`, -1);
    }
    
    es8Node.port.postMessage({ type: 'start', state: stateManager.getState() });
  } else {
    es8Node.port.postMessage({ type: 'stop' });
  }

  els.playBtn.textContent = isPlaying ? '■' : '▶';
  els.playBtn.classList.toggle('active', isPlaying);
  updateStatus(isPlaying ? 'Playing' : 'Stopped');
}

export async function initAudio() {
  if (audioContext) return;
  try {
    audioContext = new AudioContext({ sampleRate: 48000 });
    
    // Configure destination for 8 channels (like the working test)
    if (audioContext.destination.maxChannelCount >= 8) {
      audioContext.destination.channelCount = 8;
      audioContext.destination.channelCountMode = 'explicit';
      audioContext.destination.channelInterpretation = 'discrete';
      console.log('Configured audio destination for 8 channels');
    } else {
      console.warn('Only', audioContext.destination.maxChannelCount, 'channels available');
    }

    await audioContext.audioWorklet.addModule("/src/sequencer-processor.js");
    
    es8Node = new AudioWorkletNode(audioContext, "sequencer-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });

    // --- NEW, CORRECTED MESSAGE HANDLER ---
    es8Node.port.onmessage = (e) => {
      if (e.data.type !== 'stepChange') return;
      
      const { channel, step } = e.data;

      if (channel === -1) { 
        // The global step message is now our single, reliable UI sync signal.
        // On this "tick", we update the main grid highlights.
        updateVisibleGrids();
      } else if (channel >= 0 && channel < 6) {
        // For messages from individual sequencer channels, we just update the state
        // silently in the background. The rendering will happen on the next global tick.
        stateManager.set(`channels.${channel}.currentStep`, step);
        
        // If this is a trigger channel, also update any coupled pitch channel below it
        const state = stateManager.getState();
        const currentChannel = state.channels[channel];
        if (currentChannel.mode === 'trigger' && channel < 5) {
          const channelBelow = state.channels[channel + 1];
          if (channelBelow && channelBelow.mode === 'pitch' && channelBelow.isCoupled) {
            // Coupled pitch channel should mirror the trigger channel's step position
            stateManager.set(`channels.${channel + 1}.currentStep`, step);
          }
        }
      }
    };
    
    es8Node.connect(audioContext.destination);
    sendStateToWorklet();
    
    els.initBtn.classList.add('active');
    els.playBtn.disabled = false;
    updateStatus('Audio initialized');
    
  } catch (error) {
    console.error("Failed to initialize audio:", error);
    updateStatus(`Error: ${error.message}`);
  }
}
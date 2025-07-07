# ES-8 Multi-Channel Troubleshooting Guide

## Problem: Only Channels 1-2 Working, Channels 3-8 Not Responding

This is a common issue when using multi-channel audio interfaces with web
browsers. Here's a systematic approach to diagnose and fix the problem.

## Quick Diagnosis

1. **Open the diagnostic tool**: Navigate to
   `http://localhost:8000/debug/multichannel-test.html`
2. **Run the channel sweep test** to identify which channels are actually
   working
3. **Check the console logs** for channel availability information

## Most Common Causes & Solutions

### 1. Browser Defaulting to Stereo Output (Most Likely)

**Issue**: Browsers typically default to 2-channel (stereo) output even when
connected to multi-channel interfaces.

**Solutions**:

- **Use the diagnostic tool** to explicitly select the ES-8 as the output device
- **Try the ScriptProcessor fallback**: In the main interface, check "Use
  ScriptProcessor" before starting
- **Check browser console** for the actual channel count being used

### 2. Operating System Audio Configuration

**macOS**:

1. Open **Audio MIDI Setup** (Applications > Utilities)
2. Find the ES-8 device
3. Right-click and select "Configure Speakers..."
4. Ensure it's set to "8ch" or "Multichannel"
5. In the Format section, verify it shows 8 channels

**Windows**:

1. Right-click the speaker icon in system tray
2. Select "Sounds" > "Playback" tab
3. Find ES-8, right-click > "Configure Speakers"
4. Select "7.1 Surround" (closest to 8 channels)
5. In Properties > Advanced, check supported formats

### 3. Browser-Specific Issues

**Chrome/Edge**:

- Generally has the best multi-channel support
- May require HTTPS for certain audio features
- Try running with flag: `--enable-exclusive-audio`

**Firefox**:

- Limited multi-channel support
- May only output stereo regardless of configuration
- Consider using Chrome for multi-channel audio

**Safari**:

- Requires user gesture to start audio
- Multi-channel support varies by version
- Check Safari > Develop > Web Audio for debugging

### 4. ES-8 Configuration

**Check ES-8 Control Panel** (if available):

- Ensure firmware is up to date
- Verify sample rate matches browser (48kHz recommended)
- Check that all outputs are enabled
- Try different USB ports (USB 3.0 recommended)

### 5. Web Audio API Limitations

**AudioWorklet Channel Limitations**:

```javascript
// Instead of direct connection, try explicit channel routing:
const splitter = audioContext.createChannelSplitter(8);
const merger = audioContext.createChannelMerger(8);

es8Node.connect(splitter);
for (let i = 0; i < 8; i++) {
  splitter.connect(merger, i, i);
}
merger.connect(audioContext.destination);
```

## Step-by-Step Debugging Process

### Step 1: Verify Hardware

1. Test ES-8 with native software (DAW, Max/MSP, etc.)
2. Confirm all 8 channels work outside the browser
3. Check all cable connections

### Step 2: Check System Configuration

1. Run the diagnostic tool
2. Note the "Max Channel Count" reported
3. If less than 8, fix OS audio configuration (see above)

### Step 3: Test Different Approaches

1. **Try ScriptProcessor mode** (check the box in main interface)
2. **Use the diagnostic page** to test individual channels
3. **Try different browsers** (Chrome usually works best)

### Step 4: Console Debugging

Open browser console and look for:

```javascript
// Should show:
maxChannelCount: 8;
channelCount: 8;

// If it shows:
maxChannelCount: 2;
// Then it's an OS/browser configuration issue
```

## Alternative Solutions

### 1. Multiple Stereo Pairs

Some systems present the ES-8 as multiple stereo devices:

- ES-8 (1-2)
- ES-8 (3-4)
- ES-8 (5-6)
- ES-8 (7-8)

In this case, you may need to use multiple AudioContext instances.

### 2. ASIO/Core Audio Routing

Use a virtual audio router to combine channels:

- **macOS**: Loopback, BlackHole, or Soundflower
- **Windows**: VoiceMeeter, ASIO4ALL

### 3. Server-Side Processing

Consider using a server-side solution:

- WebRTC for real-time audio streaming
- OSC to Max/MSP or Pure Data
- Jack Audio Connection Kit

## Verification Tests

### Test 1: Channel Count Check

```javascript
console.log("Max channels:", audioContext.destination.maxChannelCount);
console.log("Current channels:", audioContext.destination.channelCount);
```

### Test 2: Manual Channel Test

1. Set all channels to different CV values
2. Measure outputs with multimeter
3. Only channels with changing voltage are active

### Test 3: Audio Interface Monitor

Use your OS's audio interface monitor to verify:

- Sample rate matches (48kHz)
- Bit depth is appropriate (24-bit)
- All 8 channels show activity

## When All Else Fails

1. **File a browser bug report** with your specific configuration
2. **Use the working channels** (1-2) with a hardware CV distributor
3. **Consider alternative interfaces** known to work with Web Audio
4. **Use a desktop application** that can receive OSC/MIDI from the browser

## Known Working Configurations

- **Chrome 90+ on macOS 11+** with ES-8 firmware 2.0+
- **Chrome on Windows 10** with ASIO4ALL
- **Edge on Windows 11** with native WDM drivers

## Additional Resources

- [Web Audio API Specification](https://www.w3.org/TR/webaudio/)
- [Expert Sleepers ES-8 Manual](https://www.expert-sleepers.co.uk/es8.html)
- [Chrome Audio Team Issue Tracker](https://bugs.chromium.org/p/chromium/issues/list)

---

Remember: If channels 1-2 are working, your hardware is fine! This is almost
certainly a software configuration issue that can be resolved.

# macOS ES-8 Multi-Channel Configuration Guide

## Quick Fix for "Only Channels 1-2 Working" Issue

Your ES-8 is connected and recognized, but macOS is only sending audio to channels 1-2. Here's how to fix it:

## Step 1: Open Audio MIDI Setup

1. Press `Cmd + Space` to open Spotlight
2. Type "Audio MIDI Setup" and press Enter
3. Or navigate to: `/Applications/Utilities/Audio MIDI Setup.app`

## Step 2: Configure ES-8 for 8 Channels

1. In Audio MIDI Setup, find "ES-8 (20b1:308d)" in the device list
2. **Right-click** on the ES-8 device
3. Select **"Configure Speakers..."**
4. You'll see a configuration window:
   - If it shows "Stereo" - this is your problem!
   - Change it to **"8ch"** or **"7.1 Surround"** (closest option)
   - Click "Apply" or "Done"

## Step 3: Set Output Format

1. **Select the ES-8** device in Audio MIDI Setup
2. Look at the **Format** section in the right panel
3. Ensure it shows:
   - **8 ch** (not "2 ch")
   - **48000.0 Hz** (to match your context)
   - **24-bit Integer** (or 32-bit Float)

If it shows "2 ch":
- Click the dropdown and select a format with "8 ch"
- Choose "8 ch 24-bit Integer 48000 Hz" if available

## Step 4: Create Aggregate Device (Alternative Method)

If the above doesn't work, create an aggregate device:

1. Click the **"+"** button at bottom-left
2. Select **"Create Aggregate Device"**
3. Name it "ES-8 8-Channel"
4. Check the box next to ES-8 in the device list
5. In the right panel, ensure it shows 8 channels
6. Use this aggregate device in your browser instead

## Step 5: Verify in Browser

1. Refresh your ES-8 test page
2. In the device selector, you should now see:
   - ES-8 with proper channel count
   - Or your new aggregate device
3. Select it and test all 8 channels

## Common Issues & Solutions

### ES-8 Still Shows as 2-channel
- **Restart Core Audio**: 
  ```bash
  sudo killall coreaudiod
  ```
- **Disconnect and reconnect** the ES-8
- **Try a different USB port** (preferably USB 3.0)

### "Configure Speakers" Option Missing
- Make sure ES-8 is the selected device
- Try clicking the gear icon instead of right-clicking
- Update macOS if you're on an older version

### Browser Still Only Uses 2 Channels
1. Close all browser tabs using audio
2. Quit and restart the browser
3. Clear the browser's audio device cache:
   - Chrome: `chrome://settings/content/sound`
   - Clear site settings for localhost

## Terminal Commands for Debugging

Check ES-8 audio configuration:
```bash
# List audio devices with channel info
system_profiler SPAudioDataType | grep -A 10 "ES-8"

# Check Core Audio device properties
/usr/local/bin/ffmpeg -f avfoundation -list_devices true -i ""
```

## Visual Guide

Your Audio MIDI Setup should show:

```
ES-8 (20b1:308d)
├─ Format: 8 ch 24-bit Integer 48000.0 Hz
├─ Input: 8 channels
└─ Output: 8 channels
```

NOT:
```
ES-8 (20b1:308d)
├─ Format: 2 ch 24-bit Integer 48000.0 Hz  ❌
```

## If All Else Fails

1. **Reset Core Audio preferences**:
   ```bash
   rm ~/Library/Preferences/com.apple.audio.Core* 
   sudo killall coreaudiod
   ```

2. **Check ES-8 firmware**: Ensure you have the latest firmware from Expert Sleepers

3. **Try USB 2.0 mode**: Some Macs have issues with USB 3.0 audio devices

4. **Create separate stereo pairs**: If macOS insists on stereo, create 4 aggregate devices:
   - ES-8 Ch 1-2
   - ES-8 Ch 3-4  
   - ES-8 Ch 5-6
   - ES-8 Ch 7-8

## Success Indicators

When properly configured:
- Audio MIDI Setup shows "8 ch" for ES-8
- Browser diagnostic shows "Active channels: 8/8"
- All channel test tones are audible
- CV outputs respond on all 8 channels

## Need More Help?

- Check Console.app for Core Audio errors
- Run the diagnostic page in Debug mode
- Contact Expert Sleepers support with your macOS version and Audio MIDI Setup screenshot
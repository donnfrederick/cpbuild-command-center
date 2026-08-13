#!/usr/bin/env python3
"""
diagnose.py — Step-by-step diagnostic for the Cursor Voice Agent.
Run: python3 scripts/cursor-agent/diagnose.py
"""
import os, sys, time, struct, wave, io, subprocess

OK  = "✅"
ERR = "❌"
ASK = "🎤"

def hr(): print("─" * 52)

# ── TEST 1: Packages installed ────────────────────────────────
hr()
print("TEST 1 — Python packages")
hr()
for pkg, import_name in [
    ("pvporcupine",       "pvporcupine"),
    ("sounddevice",       "sounddevice"),
    ("openai-whisper",    "whisper"),
    ("google-generativeai","google.generativeai"),
    ("numpy",             "numpy"),
]:
    try:
        __import__(import_name)
        print(f"  {OK}  {pkg}")
    except ImportError:
        print(f"  {ERR}  {pkg}  ← MISSING — run: pip3 install {pkg}")

# ── TEST 2: API keys present ──────────────────────────────────
hr()
print("TEST 2 — API keys")
hr()
gk = os.environ.get("GEMINI_API_KEY","")
pk = os.environ.get("PICOVOICE_ACCESS_KEY","")
print(f"  {'✅' if gk else '❌'}  GEMINI_API_KEY       {'set (present)' if gk else 'NOT SET'}")
print(f"  {'✅' if pk else '❌'}  PICOVOICE_ACCESS_KEY {'set (present)' if pk else 'NOT SET'}")

# ── TEST 3: Microphone — can sounddevice open it? ─────────────
hr()
print("TEST 3 — Microphone access (sounddevice)")
hr()
try:
    import sounddevice as sd
    import numpy as np
    devices = sd.query_devices()
    default_in = sd.query_devices(kind='input')
    print(f"  {OK}  Default input device: {default_in['name']}")
    print(f"       Sample rate: {int(default_in['default_samplerate'])} Hz")

    # Find built-in mic (avoids Bluetooth HFP quality issue)
    builtin_idx = None
    for i, d in enumerate(devices):
        name = d.get("name","").lower()
        if d.get("max_input_channels",0) > 0 and ("macbook" in name or "built-in" in name or "internal" in name):
            builtin_idx = i
            print(f"  {OK}  Found built-in mic at index {i}: {d['name']}")
            break
    if builtin_idx is None:
        print(f"  ⚠️   No built-in mic found — will use default input")

    device_to_use = builtin_idx  # None = system default

    subprocess.run(["say", "Test three. Say something after the beep."], check=False)
    subprocess.run(["afplay", "/System/Library/Sounds/Tink.aiff"], check=False)
    time.sleep(1.5)  # wait for echo cancellation to clear after AirPods output
    print(f"\n  {ASK} Recording 4 seconds — SPEAK NOW...")
    recording = sd.rec(int(4 * 16000), samplerate=16000, channels=1, dtype='int16', device=device_to_use)
    sd.wait()
    peak = int(np.abs(recording).max())
    rms  = int(np.sqrt(np.mean(recording.astype(np.float32)**2)))
    print(f"  Peak amplitude : {peak}  (> 500 means mic is picking up audio)")
    print(f"  RMS level      : {rms}")
    if peak < 50:
        print(f"  {ERR}  Essentially silent — mic may not be enabled or wrong device selected.")
    elif peak < 300:
        print(f"  ⚠️   Low signal ({peak}) — proceeding with tests anyway. Speak up if they fail.")
    else:
        print(f"  {OK}  Mic is capturing audio well.")
    mic_ok = peak > 50  # only skip downstream tests if truly silent
except Exception as e:
    print(f"  {ERR}  sounddevice error: {e}")
    mic_ok = False

# ── TEST 4: Whisper transcription ─────────────────────────────
hr()
print("TEST 4 — Whisper transcription")
hr()
if not mic_ok:
    print("  ⏭️   Skipped — fix mic first (Test 3)")
else:
    try:
        import whisper, numpy as np
        print(f"  Loading whisper tiny.en model...")
        model = whisper.load_model("tiny.en")
        subprocess.run(["say", "Test four. Say any phrase after the beep."], check=False)
        subprocess.run(["afplay", "/System/Library/Sounds/Tink.aiff"], check=False)
        time.sleep(1.5)
        print(f"  {ASK} Say any phrase NOW (4 seconds)...")
        import numpy as np
        recording2 = sd.rec(int(4 * 16000), samplerate=16000, channels=1, dtype='int16', device=device_to_use)
        sd.wait()
        # Pass float32 numpy array directly — no ffmpeg needed
        audio_float = recording2.flatten().astype(np.float32) / 32768.0
        result = model.transcribe(audio_float, language="en", fp16=False)
        transcript = result.get("text","").strip()
        if transcript:
            print(f"  {OK}  Whisper heard: '{transcript}'")
        else:
            print(f"  {ERR}  Whisper returned empty — mic signal too quiet or no speech detected")
    except Exception as e:
        print(f"  {ERR}  Whisper error: {e}")

# ── TEST 5: Porcupine wake word ───────────────────────────────
hr()
print("TEST 5 — Porcupine wake word detection")
hr()
if not pk:
    print(f"  {ERR}  Skipped — PICOVOICE_ACCESS_KEY not set")
elif not mic_ok:
    print("  ⏭️   Skipped — fix mic first (Test 3)")
else:
    try:
        import pvporcupine, sounddevice as sd, numpy as np
        porcupine = pvporcupine.create(access_key=pk, keywords=["computer"])
        print(f"  {OK}  Porcupine initialized (frame_length={porcupine.frame_length}, rate={porcupine.sample_rate})")
        subprocess.run(["say", "Test five. Say the word computer after the beep. You have 15 seconds."], check=False)
        subprocess.run(["afplay", "/System/Library/Sounds/Tink.aiff"], check=False)
        time.sleep(1.5)
        print(f"\n  {ASK} Say 'computer' now — you have 15 seconds...")

        detected = False
        buf = []
        def cb(indata, frames, t, status): buf.append(indata.copy())

        with sd.InputStream(device=builtin_idx, samplerate=porcupine.sample_rate, channels=1,
                            dtype='int16', blocksize=porcupine.frame_length, callback=cb):
            deadline = time.time() + 15
            while time.time() < deadline and not detected:
                if buf:
                    frame = buf.pop(0).flatten().tolist()
                    if porcupine.process(frame) >= 0:
                        detected = True
                else:
                    time.sleep(0.01)

        porcupine.delete()
        if detected:
            print(f"  {OK}  Wake word detected!")
        else:
            print(f"  {ERR}  'computer' not detected in 15 seconds.")
            print("       Try speaking clearly and firmly: 'computer'")
    except Exception as e:
        print(f"  {ERR}  Porcupine error: {e}")

hr()
print("Diagnostic complete.")
hr()

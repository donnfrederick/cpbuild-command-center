# Cursor Voice Agent

Monitors your Cursor terminal output and reads meaningful events aloud through your AirPods. Listens for a wake word ("computer") so you can control it by voice while walking around.

---

## What it does

- Watches every Cursor terminal file for this project in real time
- Speaks errors, build results, deploy events, test failures, PR/CI updates — silences HTTP noise
- Learns your preferences via voice feedback ("computer, less errors", "computer, more deploys")
- Uses Gemini 1.5 Flash to intelligently filter ambiguous lines and summarise recent activity
- Falls back to fast regex filtering if Gemini is unavailable (works fully offline)

---

## One-time setup

### 1. Fix Homebrew permissions (if needed) and install portaudio

```bash
sudo chown -R $(whoami) /opt/homebrew /opt/homebrew/Cellar /opt/homebrew/bin \
  /opt/homebrew/lib /opt/homebrew/include /opt/homebrew/opt \
  /opt/homebrew/share /opt/homebrew/etc /opt/homebrew/var
chmod u+w /opt/homebrew /opt/homebrew/Cellar /opt/homebrew/bin \
  /opt/homebrew/lib /opt/homebrew/include /opt/homebrew/opt

brew install portaudio
```

### 2. Install Python dependencies

```bash
cd scripts/cursor-agent
pip3 install -r requirements.txt
```

> First run downloads the Whisper `tiny.en` model (~75 MB). Subsequent starts are instant.

### 3. Set environment variables

Add these to your `~/.zshrc` (or `~/.zprofile`):

```bash
# Gemini — smart filtering and preference learning
export GEMINI_API_KEY="your-key-here"

# Picovoice — wake word detection (free tier at https://picovoice.ai)
# Sign up, create an app, copy the Access Key. No credit card needed.
export PICOVOICE_ACCESS_KEY="your-key-here"
```

Then reload: `source ~/.zshrc`

### 4. Grant microphone access

macOS will prompt for microphone permission the first time you run the agent. Allow it.

---

## Running

Open a terminal window (can be in the background):

```bash
cd scripts/cursor-agent
python3 main.py
```

The agent announces itself through your speakers/AirPods and begins monitoring immediately.

---

## Voice commands

Say **"computer"** to activate, then speak your command within 4 seconds:

| Say this                            | What happens                                          |
|-------------------------------------|-------------------------------------------------------|
| `mute` / `quiet`                    | Silence all output                                    |
| `unmute` / `I'm back`               | Resume output                                         |
| `stop` / `shut down`                | Kill the agent                                        |
| `status`                            | Hear your current mute state and active rules         |
| `what just happened`                | Gemini summarises the last 2 minutes of activity      |
| `less errors`                       | Add "errors" to the exclusion list                    |
| `ignore API calls`                  | Add "API calls" to the exclusion list                 |
| `more deploys`                      | Boost deploy-related lines                            |
| `focus on builds`                   | Boost build-related lines                             |
| `forget errors rule`                | Remove a previously added rule                        |

Preferences are saved to `~/.cursor-agent-prefs.json` and persist across restarts.

---

## Stopping

Press `Ctrl+C` in the terminal window, or say `"computer" → "stop"`.

---

## Degraded mode (no API keys)

The agent works without either key:

| Missing key           | Behaviour                                                        |
|-----------------------|------------------------------------------------------------------|
| `GEMINI_API_KEY`      | Regex-only filtering (still very useful), no summarise command   |
| `PICOVOICE_ACCESS_KEY`| No wake word — voice commands unavailable, TTS output still runs |

---

## Architecture

```
AirPods mic ──→ Porcupine ("computer") ──→ Whisper transcription
                                               ↓
                                        Gemini command parser
                                               ↓
                                        Action dispatcher ──→ macOS say (AirPods)
                                               ↓
                                        preferences.json (learned rules)

Cursor terminal files ──→ terminal_monitor ──→ Gemini filter ──→ macOS say (AirPods)
```

---

## Files

| File                   | Purpose                                                       |
|------------------------|---------------------------------------------------------------|
| `main.py`              | Entry point — wires all modules, signal handling              |
| `terminal_monitor.py`  | Tails all `.txt` files in the Cursor terminals folder         |
| `gemini_filter.py`     | should_speak(), summarize(), parse_command() via Gemini       |
| `tts.py`               | Non-blocking TTS queue wrapping macOS `say`                   |
| `voice_controller.py`  | Porcupine wake word + Whisper post-wake transcription         |
| `preferences.py`       | Loads/saves `~/.cursor-agent-prefs.json`, add/remove rules    |
| `requirements.txt`     | All Python dependencies                                       |

---

## Adjusting the voice speed

Edit `~/.cursor-agent-prefs.json` directly:

```json
{
  "speak_rate": 190,
  "voice": "Samantha"
}
```

Available voices: run `say -v '?'` in a terminal. Good options: `Samantha`, `Daniel`, `Karen`.

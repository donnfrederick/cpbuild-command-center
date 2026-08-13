"""
voice_controller.py — Wake word detection + voice command transcription.

Flow:
  1. Porcupine listens continuously for the wake word "computer".
  2. On detection: play a soft chime (macOS afplay), record 4 seconds of audio.
  3. Whisper transcribes the recording locally (no network call).
  4. Return the transcript string to the caller for command parsing.

Requirements:
  - PICOVOICE_ACCESS_KEY environment variable (free tier at picovoice.ai)
  - pip install pvporcupine sounddevice openai-whisper
  - No system-level portaudio install needed — sounddevice bundles its own.

If Porcupine or sounddevice is not available, the module degrades gracefully:
  - voice_available() returns False
  - start() is a no-op
  - The rest of the agent still works via regex filtering + TTS output only.
"""

import io
import math
import os
import struct
import subprocess
import tempfile
import threading
import time
import wave
from collections import deque
from typing import Callable, Optional

_stop_event = threading.Event()
_listener_thread: Optional[threading.Thread] = None

RECORD_SECONDS = 4       # how long to record after wake word
SAMPLE_RATE = 16000      # Porcupine requires 16kHz
CHANNELS = 1


def voice_available() -> bool:
    """Return True if Porcupine, sounddevice, whisper, and numpy are installed and key is set."""
    try:
        import pvporcupine  # type: ignore  # noqa: F401
        import sounddevice  # type: ignore  # noqa: F401
        import whisper      # type: ignore  # noqa: F401
        import numpy        # type: ignore  # noqa: F401
        return bool(os.environ.get("PICOVOICE_ACCESS_KEY", "").strip())
    except ImportError:
        return False


def _chime() -> None:
    """Play the macOS 'Tink' system sound as a wake-word acknowledgement."""
    try:
        subprocess.run(
            ["afplay", "/System/Library/Sounds/Tink.aiff"],
            check=False, timeout=2,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass


def _record_audio(frame_length: int) -> bytes:
    """Record RECORD_SECONDS of audio after the wake word is detected."""
    import sounddevice as sd  # type: ignore
    import numpy as np

    frames = math.ceil(SAMPLE_RATE * RECORD_SECONDS)
    recording = sd.rec(frames, samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16")
    sd.wait()  # block until recording is done

    # Wrap raw PCM in a WAV container so Whisper can read it
    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(recording.tobytes())
    return wav_buf.getvalue()


def _transcribe(wav_bytes: bytes) -> str:
    """Run Whisper tiny.en on the audio bytes and return the transcript."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            tmp_path = f.name

        try:
            model = _get_whisper_model()
            result = model.transcribe(tmp_path, language="en", fp16=False)
            return result.get("text", "").strip()
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        return ""


# Lazy-load Whisper model once (avoids 1s delay on every command)
_whisper_model = None
_whisper_lock = threading.Lock()


def _get_whisper_model():
    global _whisper_model
    with _whisper_lock:
        if _whisper_model is None:
            import whisper  # type: ignore
            _whisper_model = whisper.load_model("tiny.en")
    return _whisper_model


def _preload_whisper() -> None:
    """Pre-load Whisper in a background thread so first command is instant."""
    if voice_available():
        threading.Thread(target=_get_whisper_model, daemon=True, name="whisper-preload").start()


def start(on_transcript: Callable[[str], None]) -> None:
    """
    Start the wake-word listener in a background thread.
    on_transcript is called with the Whisper transcript string each time
    the wake word is detected and the user finishes speaking.
    """
    if not voice_available():
        return

    _stop_event.clear()
    _preload_whisper()

    def _listen():
        try:
            import pvporcupine              # type: ignore
            import sounddevice as sd        # type: ignore

            access_key = os.environ.get("PICOVOICE_ACCESS_KEY", "").strip()
            porcupine = pvporcupine.create(
                access_key=access_key,
                keywords=["computer"],
            )

            print("[voice] Listening for wake word 'computer'...")

            # sounddevice callback — called repeatedly with frame_length samples
            buf: deque = deque()

            def audio_callback(indata, frames, time_info, status):
                buf.append(indata.copy())

            with sd.InputStream(
                samplerate=porcupine.sample_rate,
                channels=CHANNELS,
                dtype="int16",
                blocksize=porcupine.frame_length,
                callback=audio_callback,
            ):
                while not _stop_event.is_set():
                    if not buf:
                        time.sleep(0.01)
                        continue
                    frame = buf.popleft()
                    pcm = frame.flatten().tolist()
                    keyword_index = porcupine.process(pcm)

                    if keyword_index >= 0:
                        _chime()
                        print("[voice] Wake word detected — recording command...")
                        wav_bytes = _record_audio(porcupine.frame_length)
                        transcript = _transcribe(wav_bytes)
                        print(f"[voice] Heard: '{transcript}'")
                        if transcript:
                            on_transcript(transcript)
                        buf.clear()  # discard audio captured during recording

        except Exception as e:
            print(f"[voice] Wake word listener error: {e}")
        finally:
            try:
                porcupine.delete()
            except Exception:
                pass

    global _listener_thread
    _listener_thread = threading.Thread(target=_listen, daemon=True, name="wake-word-listener")
    _listener_thread.start()


def stop() -> None:
    """Signal the wake-word listener to stop."""
    _stop_event.set()
    if _listener_thread:
        _listener_thread.join(timeout=3)

# Speech to text for worker/media.mjs — faster-whisper on this machine (AI Soul /workspace/tools/whisper/transcribe.py, same engine).
# stt.py <16 kHz wav> <model> [<language code or empty = detect>] → one JSON line {"text","lang"}.
import json, os, sys, wave
import numpy as np
from faster_whisper import WhisperModel

wav, model = sys.argv[1], sys.argv[2]
lang = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
m = WhisperModel(model, device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("WHISPER_THREADS", "4")), download_root=os.environ.get("WHISPER_DIR", "/models"))
# ffmpeg already made it 16 kHz mono 16-bit — read it here, not through PyAV (a newer PyAV dropped an argument faster-whisper passes).
with wave.open(wav, "rb") as w:
    audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
segs, info = m.transcribe(audio, language=lang, vad_filter=True, beam_size=1)
print(json.dumps({"text": "\n".join(s.text.strip() for s in segs if s.text.strip()), "lang": info.language}, ensure_ascii=False))

import os
import re
import tempfile
import threading
import time
import wave

os.environ.setdefault("GENIE_DATA_DIR", "/home/swlinux/GenieData")
os.environ["HF_HUB_ENABLE_PROGRESS_BAR"] = "0"

import genie_tts as genie
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel


CHARACTER = os.getenv("AIRI_TTS_CHARACTER", "silverwolf_lv999")
MODEL_DIR = os.getenv("AIRI_TTS_MODEL_DIR", "/home/swlinux/silver_wolf_genie_onnx")
REF_AUDIO = os.getenv(
    "AIRI_TTS_REF_AUDIO",
    "/home/swlinux/silver_wolf_clean_voice/extracted/archive_silverwolflv999_1.wav",
)
REF_TEXT_PATH = os.getenv(
    "AIRI_TTS_REF_TEXT",
    "/home/swlinux/silver_wolf_clean_voice/extracted/archive_silverwolflv999_1.lab",
)
LANGUAGE = os.getenv("AIRI_TTS_LANGUAGE", "ko")
SPOKEN_LOG = os.getenv("AIRI_SPOKEN_LOG", "/home/swlinux/airi_spoken.log")

_lock = threading.Lock()
_busy_lock = threading.Lock()
_busy = False
_busy_until = 0.0
_ready = False


class SpeechRequest(BaseModel):
    model: str = CHARACTER
    input: str
    voice: str = CHARACTER
    response_format: str = "wav"
    speed: float = 1.0


def _clean_spoken_text(text: str) -> str:
    text = text.replace("\ufeff", "")
    text = re.sub(r"^\s*(?:\*\*)?(?:시작|끝|start|end)(?:\*\*)?\s*$", "", text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"!?\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[이미지로\]", "", text)
    text = re.sub(r"^\s*(?:>{1,}|#{1,6})\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*|__|~~|`", "", text)
    text = re.sub(r"[^\w\s.,!?%\-—–~…:;()'\"가-힣]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _ensure_loaded():
    global _ready
    if _ready:
        return
    with open(REF_TEXT_PATH, encoding="utf-8") as f:
        ref_text = f.read().strip()
    genie.load_character(CHARACTER, MODEL_DIR, LANGUAGE)
    genie.set_reference_audio(CHARACTER, REF_AUDIO, ref_text, LANGUAGE)
    _ready = True


app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/v1/models")
def models():
    return {
        "object": "list",
        "data": [
            {
                "id": CHARACTER,
                "object": "model",
                "created": 0,
                "owned_by": "local",
            }
        ],
    }


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest):
    global _busy, _busy_until

    if not req.input.strip():
        return Response(status_code=400)

    spoken_text = _clean_spoken_text(req.input)
    if not spoken_text:
        return Response(status_code=400)

    with _busy_lock:
        if _busy or time.monotonic() < _busy_until:
            return Response(status_code=409)
        _busy = True

    print(f"[은랑] {spoken_text}", flush=True)
    try:
        with open(SPOKEN_LOG, "a", encoding="utf-8") as f:
            f.write(f"{spoken_text}\n")
    except OSError:
        pass

    try:
        with _lock:
            _ensure_loaded()
            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            genie.tts(
                character_name=CHARACTER,
                text=spoken_text,
                play=False,
                split_sentence=False,
                save_path=path,
            )

        with wave.open(path, "rb") as wav_file:
            duration = wav_file.getnframes() / wav_file.getframerate()

        with _busy_lock:
            _busy = False
            _busy_until = time.monotonic() + duration
    except Exception:
        with _busy_lock:
            _busy = False
            _busy_until = 0.0
        raise

    with open(path, "rb") as f:
        data = f.read()
    try:
        os.remove(path)
    except OSError:
        pass
    return Response(content=data, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    threading.Thread(target=_ensure_loaded, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000)

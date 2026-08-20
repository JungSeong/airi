import os
import tempfile
import threading
import time
import wave

from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

from tts_engine import (
    CHARACTER,
    clean_spoken_text,
    ensure_loaded,
    shorten_spoken_text,
    split_sentences,
    synthesize_sentences,
)


SPOKEN_LOG = os.getenv("AIRI_SPOKEN_LOG", "/home/swlinux/airi_spoken.log")

_lock = threading.Lock()
_busy_lock = threading.Lock()
_busy = False
_busy_until = 0.0


class SpeechRequest(BaseModel):
    model: str = CHARACTER
    input: str
    voice: str = CHARACTER
    response_format: str = "wav"
    speed: float = 1.0


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

    spoken_text = shorten_spoken_text(clean_spoken_text(req.input))
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
            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            synthesize_sentences(split_sentences(spoken_text), path)

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

    threading.Thread(target=ensure_loaded, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000)

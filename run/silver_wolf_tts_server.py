import os
import tempfile
import threading

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
_ready = False


class SpeechRequest(BaseModel):
    model: str = CHARACTER
    input: str
    voice: str = CHARACTER
    response_format: str = "wav"
    speed: float = 1.0


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
    if not req.input.strip():
        return Response(status_code=400)

    spoken_text = req.input.strip()
    print(f"[은랑] {spoken_text}", flush=True)
    try:
        with open(SPOKEN_LOG, "a", encoding="utf-8") as f:
            f.write(f"{spoken_text}\n")
    except OSError:
        pass

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

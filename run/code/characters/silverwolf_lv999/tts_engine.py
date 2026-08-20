import os
import re
import tempfile
import wave

os.environ.setdefault("GENIE_DATA_DIR", "/home/swlinux/GenieData")
os.environ["HF_HUB_ENABLE_PROGRESS_BAR"] = "0"

import genie_tts as genie


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
SENTENCE_PAUSE_S = float(os.getenv("AIRI_TTS_SENTENCE_PAUSE_S", "0.3"))

_ready = False


def clean_spoken_text(text: str) -> str:
    text = text.replace("\ufeff", "")
    text = re.sub(r"^\s*(?:\*\*)?(?:시작|끝|start|end)(?:\*\*)?\s*$", "", text, flags=re.IGNORECASE | re.MULTILINE)
    text = re.sub(r"!?\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[이미지로\]", "", text)
    text = re.sub(r"^\s*(?:>{1,}|#{1,6})\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*|__|~~|`", "", text)
    text = re.sub(r"[^\w\s.,!?%\-—–~…:;()'\"가-힣]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def shorten_spoken_text(text: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    text = " ".join(sentences[:2]).strip()

    if len(text) <= 120:
        return text

    cut = max(text.rfind(".", 0, 120), text.rfind("!", 0, 120), text.rfind("?", 0, 120))
    return text[:cut + 1].strip() if cut >= 30 else text[:120].rsplit(" ", 1)[0].strip()


def split_sentences(text: str):
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def concat_wavs(paths, out_path: str, pause_seconds: float = SENTENCE_PAUSE_S) -> None:
    with wave.open(out_path, "wb") as out:
        for index, path in enumerate(paths):
            with wave.open(path, "rb") as wav_file:
                if index == 0:
                    out.setparams(wav_file.getparams())
                out.writeframes(wav_file.readframes(wav_file.getnframes()))

            if index < len(paths) - 1 and pause_seconds > 0:
                with wave.open(paths[index], "rb") as wav_file:
                    silence_bytes = b"\x00" * (
                        wav_file.getsampwidth()
                        * wav_file.getnchannels()
                        * int(wav_file.getframerate() * pause_seconds)
                    )
                out.writeframes(silence_bytes)


def ensure_loaded():
    global _ready
    if _ready:
        return
    with open(REF_TEXT_PATH, encoding="utf-8") as f:
        ref_text = f.read().strip()
    genie.load_character(CHARACTER, MODEL_DIR, LANGUAGE)
    genie.set_reference_audio(CHARACTER, REF_AUDIO, ref_text, LANGUAGE)
    _ready = True


def synthesize_sentences(sentences, out_path: str, pause_seconds: float = SENTENCE_PAUSE_S) -> None:
    ensure_loaded()
    chunk_paths = []
    try:
        for sentence in sentences:
            fd, chunk_path = tempfile.mkstemp(dir=os.path.dirname(out_path) or ".", suffix=".wav")
            os.close(fd)
            chunk_paths.append(chunk_path)
            genie.tts(
                character_name=CHARACTER,
                text=sentence,
                play=False,
                split_sentence=False,
                save_path=chunk_path,
            )
        concat_wavs(chunk_paths, out_path, pause_seconds)
    finally:
        for chunk_path in chunk_paths:
            try:
                os.remove(chunk_path)
            except OSError:
                pass


def synthesize_wav(text: str, out_path: str) -> None:
    synthesize_sentences(split_sentences(text), out_path)

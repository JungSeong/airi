#!/usr/bin/env python3
import argparse
import json
import os
import time

from tts_engine import CHARACTER, clean_spoken_text, synthesize_wav


OUTPUT_ROOT = os.getenv(
    "AIRI_DAILY_BRIEFING_DIR",
    "/home/swlinux/.config/ai.moeru.airi/daily-briefing",
)
OUTPUT_DIR = os.path.join(OUTPUT_ROOT, CHARACTER)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", help="briefing text")
    parser.add_argument("--text-file", help="read briefing text from file")
    args = parser.parse_args()

    if args.text_file:
        with open(args.text_file, encoding="utf-8") as f:
            text = f.read()
    else:
        text = args.text or ""

    spoken_text = clean_spoken_text(text)
    if not spoken_text:
        raise SystemExit("empty briefing text")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    created_at = int(time.time())
    briefing_id = str(created_at)
    audio_path = os.path.join(OUTPUT_DIR, f"{briefing_id}.wav")
    synthesize_wav(spoken_text, audio_path)

    briefing = {
        "id": briefing_id,
        "date": time.strftime("%Y-%m-%d"),
        "text": spoken_text,
        "createdAt": created_at,
        "audioPath": audio_path,
    }
    json_path = os.path.join(OUTPUT_DIR, f"{briefing_id}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(briefing, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(json.dumps(briefing, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

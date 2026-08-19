#!/usr/bin/env python3
import json
import os
import struct
import sys


ASAR = os.environ.get("AIRI_ASAR", "/opt/AIRI/resources/app.asar")
ALLOW_TARGET = "out/renderer/assets/providers-BW0Se-st.js"
SPEECH_TARGET = "out/renderer/assets/speech-runtime-D7bduiCD.js"


def read_file(asar: str, target: str) -> tuple[int, int, bytes]:
    with open(asar, "rb") as f:
        header = f.read(16)
        values = struct.unpack("<IIII", header)
        raw_header = f.read(values[2])
        obj, _ = json.JSONDecoder().raw_decode(raw_header.decode("utf-8"))

    node = obj
    for part in target.split("/"):
        node = node["files"][part]

    base = 16 + values[1]
    start = base + int(node["offset"])
    size = int(node["size"])
    with open(asar, "rb") as f:
        f.seek(start)
        data = f.read(size)
    return start, size, data


def replace_exact(asar: str, start: int, data: bytes, old: bytes, new: bytes) -> bool:
    index = data.find(old)
    if index < 0 or len(old) != len(new):
        return False
    with open(asar, "r+b") as f:
        f.seek(start + index)
        f.write(new)
    return True


def speech_patched(data: bytes) -> bool:
    lines = data.split(b"\n")
    return b"new Set([])" in lines[800] and b"boost = 0" in lines[803]


def apply_speech(asar: str, start: int, data: bytes) -> bool:
    lines = data.split(b"\n")
    patches = [
        (
            800,
            b"var hardPunctuations = /* @__PURE__ */ new Set([]);",
            b"new Set([])",
        ),
        (
            803,
            b"\tconst { boost = 0, minimumWords=9e9, maximumWords=9e9 } = options ?? {} ;",
            b"boost = 0",
        ),
    ]
    changed = False
    for index, base_line, marker in patches:
        old = lines[index]
        if marker in old:
            continue
        new = base_line[:-1] + b" " * (len(old) - len(base_line)) + b";"
        if len(new) != len(old):
            raise RuntimeError("speech line replacement length mismatch")
        line_offset = sum(len(line) + 1 for line in lines[:index])
        with open(asar, "r+b") as f:
            f.seek(start + line_offset)
            f.write(new)
        changed = True
    return changed


def main() -> int:
    allow_start, _, allow_data = read_file(ASAR, ALLOW_TARGET)
    speech_start, _, speech_data = read_file(ASAR, SPEECH_TARGET)

    allow_ok = b"allowNoResponse: 0==1" in allow_data
    speech_ok = speech_patched(speech_data)

    if allow_ok and speech_ok:
        print("airi patches ok")
        return 0

    if os.geteuid() != 0:
        print("airi patches required; rerun with sudo")
        return 2

    if not allow_ok:
        replace_exact(
            ASAR,
            allow_start,
            allow_data,
            b"allowNoResponse: true",
            b"allowNoResponse: 0==1",
        )

    if not speech_ok:
        apply_speech(ASAR, speech_start, speech_data)

    print("airi patches applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())

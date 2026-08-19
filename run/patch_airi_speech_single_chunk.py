#!/usr/bin/env python3
import json
import os
import struct
import sys


ASAR = os.environ.get("AIRI_ASAR", "/opt/AIRI/resources/app.asar")
TARGET = "out/renderer/assets/speech-runtime-D7bduiCD.js"
LINE_INDEXES = (800, 803)  # 1-based lines 801 and 804


def main() -> int:
    with open(ASAR, "rb") as f:
        header = f.read(16)
        values = struct.unpack("<IIII", header)
        raw_header = f.read(values[2])
        obj, _ = json.JSONDecoder().raw_decode(raw_header.decode("utf-8"))

    node = obj
    for part in TARGET.split("/"):
        node = node["files"][part]

    base = 16 + values[1]
    start = base + int(node["offset"])
    size = int(node["size"])

    with open(ASAR, "r+b") as f:
        f.seek(start)
        data = f.read(size)
        lines = data.split(b"\n")
        patches = [
            (
                LINE_INDEXES[0],
                b"var hardPunctuations = /* @__PURE__ */ new Set([]);",
                b"new Set([])",
            ),
            (
                LINE_INDEXES[1],
                b"\tconst { boost = 0, minimumWords=9e9, maximumWords=9e9 } = options ?? {} ;",
                b"boost = 0",
            ),
        ]

        for index, base_line, marker in patches:
            old = lines[index]
            if marker in old:
                continue

            target_len = len(old)
            if len(base_line) > target_len:
                raise RuntimeError("replacement too long")

            new = base_line[:-1] + b" " * (target_len - len(base_line)) + b";"
            if len(new) != target_len:
                raise RuntimeError("replacement length mismatch")

            line_offset = sum(len(line) + 1 for line in lines[:index])
            absolute = start + line_offset
            f.seek(absolute)
            f.write(new)

    print("patched speech chunker to single flush")
    return 0


if __name__ == "__main__":
    sys.exit(main())

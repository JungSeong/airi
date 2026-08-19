#!/usr/bin/env python3
import json
import struct
import sys


ASAR = "/opt/AIRI/resources/app.asar"
TARGET = "out/renderer/assets/providers-BW0Se-st.js"
OLD = b"allowNoResponse: true"
NEW = b"allowNoResponse: 0==1"


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
        index = data.find(OLD)
        if index < 0:
            print("already patched or target not found")
            return 0

        absolute = start + index
        f.seek(absolute)
        assert f.read(len(OLD)) == OLD, "unexpected bytes at target offset"
        f.seek(absolute)
        f.write(NEW)

    print("patched allowNoResponse=false")
    return 0


if __name__ == "__main__":
    sys.exit(main())

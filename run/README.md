# AIRI desktop Silver Wolf runtime

이 폴더는 Project AIRI 데스크톱 펫을 은랑 LV.999로 띄우고, 랜덤 자발 발화 + 로컬 TTS를 실행하는 런타임이다.

## 준비물

- Linux desktop, Node.js 22+
- Project AIRI 설치: `/opt/AIRI/airi`
- Python 3.11 venv
- TTS 모델과 참조 음성

```text
run/assets/silver_wolf_genie_onnx
run/assets/silver_wolf_clean_voice/extracted/archive_silverwolflv999_1.wav
run/assets/silver_wolf_clean_voice/extracted/archive_silverwolflv999_1.lab
```

## 설치

```bash
cd run
python3 -m venv .venv
.venv/bin/pip install fastapi uvicorn pydantic onnxruntime genie-tts
sudo python3 patch_airi_allow_no_response.py
```

`genie-tts` 설치 방식은 환경에 따라 다르다. 기존 `genie-tts-env`를 그대로 쓰려면:

```bash
export AIRI_TTS_PYTHON=/path/to/genie-tts-env/bin/python
```

## 실행

```bash
cd run
./airi --silver_wolf stop
AIRI_SPONTANEOUS_MIN_S=60 AIRI_SPONTANEOUS_MAX_S=300 ./airi --silver_wolf start
tmux attach -t airi-bridge
```

## AIRI 음성 provider 설정

AIRI 설정에서 speech provider를 `openai-compatible-audio-speech`로 고른다.

```text
Base URL: http://127.0.0.1:8000/v1
Model: silverwolf_lv999
Voice: silverwolf_lv999
```

## 카드

`card/silverwolf_lv999.airi-character-card.zip` 또는 `card/silverwolf_lv999/card.json`을 AIRI에 import한다.

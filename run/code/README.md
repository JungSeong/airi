# AIRI runtime Python code

이 디렉터리는 데스크톱 AIRI 런타임에서 쓰는 Python 코드를 기능 단위로 모아 둔다.

## Layout

```text
code/
  characters/
    <character-slug>/
      tts_engine.py
      tts_server.py
      daily_briefing.py
  patches/
    ensure_airi_patches.py
    patch_airi_allow_no_response.py
    patch_airi_speech_single_chunk.py
  shared/  # 캐릭터 무관 코드가 생기면 추가
```

## Naming rules

- 파일/디렉터리: `snake_case`.
- 캐릭터 slug: `AIRI_TTS_CHARACTER` 값과 정확히 같게. 표시 이름을 파일명에 쓰지 않는다.
  - 현재: `silverwolf_lv999`
  - 추가 예: `march7`
- 캐릭터별 진입점 이름은 고정한다: `tts_engine.py`, `tts_server.py`, `daily_briefing.py`.
- 캐릭터 무관 로직은 `code/shared/`에 두고, 캐릭터 디렉터리에는 하드코딩된 절대 경로나 다른 캐릭터 설정을 넣지 않는다.
- Python 상수: `UPPER_SNAKE_CASE`, 함수: `snake_case`, 내부 함수: `_snake_case`.
- TTS 설정은 `AIRI_TTS_*` 환경 변수로만 주입한다.
- 브리핑 산출물은 캐릭터별로 격리한다:
  - `${AIRI_DAILY_BRIEFING_DIR:-$HOME/.config/ai.moeru.airi/daily-briefing}/<character-slug>/<created-at>.json`
  - 같은 디렉터리에 `<created-at>.wav`.
  - JSON의 `readAt`은 데스크톱 앱이 브리핑을 처음 재생한 시각이다.
  - 데스크톱 앱은 `readAt`이 없는 브리핑만 표시하고, 선택한 브리핑은 목록에서 제거한다.

## New character checklist

1. `code/characters/<character-slug>/` 생성.
2. `tts_engine.py`, `tts_server.py`, `daily_briefing.py` 추가.
3. `run/airi`의 `configure_character()`와 프로세스 종료 패턴에 slug/경로 추가.
4. `run/airi` 실행 전에 필요한 `AIRI_TTS_*` 환경 변수를 주입한다.

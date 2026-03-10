# .agent_class/tools/local_cli/ui_viewer

## 목적

- `ui_viewer/` 는 Soulforge의 첫 `Render` 단계인 read-only UI prototype 을 둔다.
- viewer 는 정본 파일을 직접 읽지 않고 `derive-ui-state --json` 출력만 소비한다.
- viewer 는 구조 검증용 로컬 프로토타입이며 배포용 앱이 아니다.
- 9차에서는 구조 계약을 바꾸지 않고 typography, card hierarchy, badge tone, icon language, long-text overflow 안전성을 다듬는다.
- 게임풍 감성은 renderer 표현 계층에만 얹고, derive 계약과 owner 경계는 그대로 유지한다.

## 현재 포함 도구

- `ui_viewer.py`
- 로컬 HTTP viewer
- `--once` standalone HTML snapshot 생성

## 실행 예시

```bash
python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py
python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py --port 8765
python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py --once
python .agent_class/tools/local_cli/ui_viewer/ui_viewer.py --once --output /tmp/soulforge-ui.html
```

## 범위

- `sys.executable` 로 `ui_sync.py derive-ui-state --json` 을 실행한다.
- `종합(Overview)`, `본체(.agent)`, `직업(.agent_class)`, `워크스페이스(_workspaces)` 4탭을 렌더링한다.
- `diagnostics` 를 하단 패널로 함께 렌더링한다.
- empty state, partial render, `bound/unbound/invalid`, `present`, `dependency_status` 를 구분해 표시한다.
- 긴 path, command/code strip, diagnostics message, workflow dependency list 가 카드 폭을 깨지 않도록 wrap/scroll-safe 처리를 유지한다.
- body/class/workspace 를 game-flavored professional viewer 톤으로만 표현한다.

## 제외 범위

- 정본 파일 직접 수정
- 편집, 저장, patch UI
- 캐시 파일 강제 저장
- 무거운 웹 프레임워크와 대형 빌드 체인
- fake data 생성

## 관련 경로

- [`.agent_class/tools/local_cli/README.md`](../README.md)
- [`.agent_class/tools/local_cli/ui_sync/README.md`](../ui_sync/README.md)
- [`docs/architecture/UI_SYNC_CONTRACT.md`](../../../../docs/architecture/UI_SYNC_CONTRACT.md)
- [`docs/architecture/UI_DERIVED_STATE_CONTRACT.md`](../../../../docs/architecture/UI_DERIVED_STATE_CONTRACT.md)

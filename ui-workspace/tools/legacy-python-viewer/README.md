# tools/legacy-python-viewer

## 목적

- `legacy-python-viewer/` 는 historical read-only python viewer 를 둔다.
- viewer 는 canonical 정본을 직접 읽지 않고 `derive-ui-state --json` 출력만 소비한다.
- fixture-first workspace 기본 개발 경로와는 분리된 optional integration tool 이다.

## 현재 포함 도구

- `ui_viewer.py`
- 로컬 HTTP viewer
- `--once` standalone HTML snapshot 생성

## 실행 예시

```bash
python ui-workspace/tools/legacy-python-viewer/ui_viewer.py
python ui-workspace/tools/legacy-python-viewer/ui_viewer.py --port 8765
python ui-workspace/tools/legacy-python-viewer/ui_viewer.py --once
python ui-workspace/tools/legacy-python-viewer/ui_viewer.py --once --output /tmp/soulforge-ui.html
```

## 범위

- `sys.executable` 로 canonical repo 의 `.agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json` 을 실행한다.
- `종합(Overview)`, `본체(.agent)`, `직업(.agent_class)`, `워크스페이스(_workspaces)` 4탭을 렌더링한다.
- `diagnostics` 를 하단 패널로 함께 렌더링한다.
- empty state, partial render, `bound/unbound/invalid`, `present`, `dependency_status` 를 구분해 표시한다.
- body/class/workspace 를 game-flavored professional viewer 톤으로만 표현한다.

## 제외 범위

- 정본 파일 직접 수정
- 편집, 저장, patch UI
- `derive-ui-state` 생성 로직
- 캐시 파일 강제 저장
- 무거운 웹 프레임워크와 대형 빌드 체인

## 관련 경로

- [tools/README.md](../README.md)
- [ui-workspace README](../../README.md)

## 상태

- Draft
- legacy viewer 는 optional integration tool 로만 유지한다.
- richer panel 이나 편집 기능은 범위 밖으로 둔다.

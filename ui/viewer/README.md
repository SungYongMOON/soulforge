# ui/viewer

## 목적

- `viewer/` 는 Soulforge의 read-only renderer entrypoint 를 둔다.
- viewer 는 `.agent`, `.agent_class`, `_workspaces` 전체 파생 상태를 렌더링하는 저장소 공용 surface 다.
- viewer 는 정본 파일을 직접 읽지 않고 `derive-ui-state --json` 출력만 소비한다.

## 현재 포함 도구

- `ui_viewer.py`
- 로컬 HTTP viewer
- `--once` standalone HTML snapshot 생성

## 실행 예시

```bash
python ui/viewer/ui_viewer.py
python ui/viewer/ui_viewer.py --port 8765
python ui/viewer/ui_viewer.py --once
python ui/viewer/ui_viewer.py --once --output /tmp/soulforge-ui.html
```

## 범위

- `sys.executable` 로 `.agent_class/tools/local_cli/ui_sync/ui_sync.py derive-ui-state --json` 을 실행한다.
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

- [ui/README.md](../README.md)
- [.agent_class/tools/local_cli/ui_sync/README.md](../../.agent_class/tools/local_cli/ui_sync/README.md)
- [docs/architecture/UI_SYNC_CONTRACT.md](../../docs/architecture/UI_SYNC_CONTRACT.md)
- [docs/architecture/UI_DERIVED_STATE_CONTRACT.md](../../docs/architecture/UI_DERIVED_STATE_CONTRACT.md)

## 상태

- Draft
- renderer 는 루트 `ui/` 아래에서 관리하지만, 여전히 `derive-ui-state` 소비자 역할에만 머문다.
- richer panel 이나 편집 기능은 범위 밖으로 둔다.

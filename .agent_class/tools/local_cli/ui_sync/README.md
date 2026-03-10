# .agent_class/tools/local_cli/ui_sync

## 목적

- `ui_sync/` 는 Soulforge 메타 동기화와 구조 검증을 위한 최소 로컬 CLI 도구를 둔다.
- 이번 차수에서는 UI renderer 가 아니라 `body_state.yaml` 재생성과 Scan/Validate 흐름만 책임진다.

## 현재 포함 도구

- `ui_sync.py`
- `sync-body-state` = `.agent/body.yaml` 과 실제 `.agent/` 구조를 기준으로 `.agent/body_state.yaml` 을 결정론적으로 재생성한다.
- `validate` = body, class, loadout 메타와 실제 구조의 최소 정합성을 검사한다.

## 실행 예시

```bash
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state
python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate
python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json
```

## 범위

- `body_state.yaml` 의 `body_id`, `sections.*.path`, `sections.*.present`, `status.summary`, `status.warnings` 를 재생성한다.
- `class.yaml` 과 `loadout.yaml` 은 구조적 필드와 기본 경로만 검증한다.
- `loadout.equipped.*` 의 실제 모듈 resolve 규칙은 아직 정의하지 않는다.
- equipped 엔트리가 비어 있지 않으면 `module reference contract not defined yet` 경고를 출력한다.

## 제외 범위

- 웹 UI, TUI, renderer, runtime 구현
- 임의의 모듈 참조 해석 규칙
- host-local 상태, 캐시, 실행 중 임시 상태

## 관련 경로

- [`.agent_class/tools/local_cli/README.md`](../README.md)
- [`.agent/docs/architecture/BODY_METADATA_CONTRACT.md`](../../../../.agent/docs/architecture/BODY_METADATA_CONTRACT.md)
- [`docs/architecture/UI_SYNC_CONTRACT.md`](../../../../docs/architecture/UI_SYNC_CONTRACT.md)

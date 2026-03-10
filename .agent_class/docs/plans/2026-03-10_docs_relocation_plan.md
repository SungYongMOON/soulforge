# 2026-03-10 문서 relocation 계획

## 목적

root `docs/` 에 남아 있는 body/class 소유 문서를 owner 기준 위치로 이동하기 위한 사전 계획이다.

이번 단계에서는 대량 이동을 수행하지 않는다.
먼저 현재 위치, 이동 대상, 이유, 영향을 고정한다.

## 이동 후보

| 현재 위치 | 이동 대상 | 이유 | 영향 |
| --- | --- | --- | --- |
| `docs/architecture/AGENT_BODY_MODEL.md` | `.agent/docs/architecture/AGENT_BODY_MODEL.md` | body 소유 문서이기 때문 | body 문서 루트 정리 필요 |
| `docs/architecture/AGENT_CLASS_MODEL.md` | `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md` | class 소유 문서이기 때문 | root 링크와 참조 갱신 필요 |
| `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md` | `.agent_class/docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md` | class 메타와 loadout 문서이기 때문 | `README.md`, `CURRENT_DECISIONS.md` 참조 수정 필요 |

## root 에 남길 문서

- `REPOSITORY_PURPOSE.md`
- `AGENT_WORLD_MODEL.md`
- `WORKSPACE_PROJECT_MODEL.md`
- `PROJECT_AGENT_MINIMUM_SCHEMA.md`
- `TARGET_TREE.md`
- `CURRENT_DECISIONS.md`
- `MIGRATION_REFERENCE.md`

## 선행 조건

1. `.agent/docs/architecture/` 경로 준비
2. `.agent_class/docs/architecture/` 기준 문서 정리
3. root 문서 링크 갱신 순서 결정

## 주의 사항

- 무계획 대량 이동 금지
- 실제 경로 변경 전, 참조 링크와 소유 경계를 먼저 점검
- project 전용 문서는 relocation 대상에 포함하지 않음

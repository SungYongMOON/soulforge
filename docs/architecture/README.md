# docs/architecture

## 목적

- `docs/architecture/` 는 저장소 전체 구조 원칙과 메타 규약을 둔다.
- 루트 README가 다루지 않는 구조 기준 문서를 이곳에서 관리한다.
- 문서 수가 늘어난 만큼 root-owned 문서를 성격별 하위 묶음으로 나눠 탐색성을 유지한다.

## 구성

- `foundation/`: 저장소 목적, 목표 구조, 문서 소유 기준, 세계관 같은 활성 기준 문서
- `workspace/`: `_workspaces` 와 `.project_agent` 공용 구조/resolve 계약
- `ui/`: root-owned UI source, sync, derived state, control center 편집 모델 계약
- `lifecycle/`: v1 closeout, limitation, 운영 경고 문서
- `archive/`: 과거 보고서, 초기 이행 참고, 활성 정본에서 내려온 배경 문서

## 제외 대상

- `.agent` 전용 구조 문서
- `.agent_class` 전용 구조 문서
- 특정 프로젝트 전용 문서

## 읽는 순서

1. [`foundation/REPOSITORY_PURPOSE.md`](foundation/REPOSITORY_PURPOSE.md)
2. [`foundation/TARGET_TREE.md`](foundation/TARGET_TREE.md)
3. [`foundation/DOCUMENT_OWNERSHIP.md`](foundation/DOCUMENT_OWNERSHIP.md)
4. [`workspace/README.md`](workspace/README.md)
5. [`ui/README.md`](ui/README.md)
6. [`lifecycle/README.md`](lifecycle/README.md)
7. 필요 시 [`archive/README.md`](archive/README.md)

## 관련 경로

- [루트 README](../../README.md)
- [`docs/README.md`](../README.md)
- [`foundation/README.md`](foundation/README.md)
- [`workspace/README.md`](workspace/README.md)
- [`ui/README.md`](ui/README.md)
- [`lifecycle/README.md`](lifecycle/README.md)
- [`archive/README.md`](archive/README.md)
- [`.agent/README.md`](../../.agent/README.md)
- [`.agent_class/docs/architecture/README.md`](../../.agent_class/docs/architecture/README.md)
- [`.agent_class/README.md`](../../.agent_class/README.md)
- [`docs/ui/README.md`](../ui/README.md)

## 상태

- Stable
- 저장소 공용 아키텍처 문서의 정본 위치다.
- root 에는 index 역할의 `README.md` 만 두고, 실제 문서는 하위 묶음에서 owner 성격별로 읽게 한다.
- manual 기준선으로 쓰는 활성 문서와, 배경 설명용 archive 문서를 분리한다.
- renderer consumer model, selection model, theme plan 정본은 계속 `ui-workspace/docs/` 에서 분리 관리한다.
- owner-local body/loadout-era 문서는 historical reference 로만 취급한다.

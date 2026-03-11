# .agent_class/docs/plans

## 목적

- `plans/` 는 class 계층 작업의 수행 전 계획을 둔다.
- 실제 수행 로그와 분리해서 변경 의도와 작업 범위를 관리한다.

## 포함 대상

- 작업 계획 문서
- relocation 계획과 수정 계획
- 수행 후 체크 결과까지 갱신되는 실행 체크리스트

## 제외 대상

- 수행 후 결과 로그
- 저장소 전체 원칙 문서와 프로젝트 전용 계획

## 관련 경로

- [`.agent_class/docs/README.md`](../README.md)
- [`.agent_class/docs/devlog/README.md`](../devlog/README.md)

## 상태

- Stable
- 현재 파일명은 `YYYY-MM-DD_<topic>_plan.md` 형식을 우선 사용한다.
- 계획 문서는 완료 후 실제 수행 결과에 맞게 체크 상태를 갱신한다.
- 현재 계획 세트에는 class loadout resolve 확장, workspace project contract resolve 확장, UI derive state generator 단계, read-only UI prototype 단계, 첫 happy-path reference sample baseline 단계, 첫 invalid reference sample baseline 단계, 첫 unbound reference sample baseline 단계, v1 closeout 단계가 포함된다.

# tests

## 목적

- `tests/` 는 numbered disposable lab 을 두고, 재현 실행이나 재검증을 기존 baseline 과 분리해서 돌린다.
- 각 lab 은 `codex-thread-lab-###` 형식으로 만들고, 폴더째 제거할 수 있게 유지한다.

## 운영 방식

- 새 검증은 새 번호 폴더에서 실행한다.
- 각 lab 은 자체 `scripts/`, `lab_root/`, `artifacts/`를 가진다.
- 실험 종료 후 해당 lab 폴더를 통째로 지워도 다른 실험에 영향을 주지 않게 한다.

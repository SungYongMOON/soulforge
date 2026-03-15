# dev/experiments

## 목적

- `experiments/` 는 저장소 정본 구조와 분리해서 짧게 돌리고 버릴 수 있는 실험 harness 와 lab 을 둔다.
- 실험용 스크립트, 전용 fixture root, 산출물 경로를 한 폴더 아래에 몰아 나중에 폴더 단위로 제거할 수 있게 유지한다.

## 포함 대상

- 폐기 가능한 실험 harness
- 실험 전용 README 와 실행 절차
- 실험 중 생성되는 `artifacts/`, `lab_root/` 같은 국소 산출물 경로

## 제외 대상

- 저장소 정본 계약 문서
- 장기 유지할 runtime 구현
- 프로젝트 정본 데이터

## 운영 원칙

- 실험은 가능한 한 한 폴더 안에서 끝나야 한다.
- 실험 전용 데이터는 해당 lab 폴더 밖으로 퍼지지 않게 한다.
- 실험이 끝나면 해당 폴더만 잘라서 버릴 수 있어야 한다.

## 관련 경로

- [dev/README.md](../README.md)
- [dev/log/README.md](../log/README.md)
- [dev/plan/README.md](../plan/README.md)
- [dev/experiments/tests/README.md](tests/README.md)

# .agent/autonomic/checks

## 목적

- `checks/` 는 preflight 와 consistency self-check 를 둔다.

## 포함 대상

- preflight check
- consistency check
- stale checkpoint 감지

## 제외 대상

- daemonized monitoring
- workflow orchestration
- transcript scan

## 대표 파일

- [`../README.md`](../README.md): autonomic 상위 owner 경계

## 참조 관계

- `checks/` 는 runtime 과 policy 를 참조하지만 독립 실행 엔진이 아니다.

## 변경 원칙

- 조용한 검증 루틴만 두고 noisy polling 으로 확장하지 않는다.

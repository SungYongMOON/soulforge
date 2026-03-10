# .agent_class/_local

## 목적

- `_local/` 은 host-local 전용 상태를 둔다.
- 공유 저장소가 아닌 현재 호스트 환경의 비추적 상태를 분리한다.

## 포함 대상

- 캐시, 임시 상태, 로컬 설정
- 기본적으로 비추적 상태를 유지하기 위한 제어 파일
- 추적 예외로 두는 `README.md` 와 `.gitignore`

## 제외 대상

- 공유해야 하는 문서와 메타 파일
- 장기 보관이 필요한 클래스 자산

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/_local/.gitignore`](.gitignore)
- [`docs/architecture/DOCUMENT_OWNERSHIP.md`](../../docs/architecture/DOCUMENT_OWNERSHIP.md)

## 상태

- Stable
- 로컬 상태 자체는 비추적이다. 문서 운영을 위해 `README.md` 와 `.gitignore` 만 예외로 둔다.

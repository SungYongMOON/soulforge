# .agent_class/_local

## 목적

- `_local/` 은 host-local 전용 상태를 둔다.
- 공유 저장소가 아닌 현재 호스트 환경의 비추적 로컬 상태를 분리한다.

## 포함 대상

- 캐시, 임시 상태, 로컬 설정
- 기본적으로 비추적 상태를 유지하기 위한 로컬 제어 파일
- 구조 설명과 ignore 정책 고정을 위해 예외적으로 추적하는 `README.md` 와 `.gitignore`

## 제외 대상

- 공유해야 하는 문서와 메타 파일
- 장기 보관이 필요한 클래스 자산
- 실제 클래스 자산을 설명하는 정본 문서는 `docs/` 나 각 owner 폴더로 보낸다

## 관련 경로

- [`.agent_class/README.md`](../README.md)
- [`.agent_class/_local/.gitignore`](.gitignore)
- [`docs/architecture/DOCUMENT_OWNERSHIP.md`](../../docs/architecture/DOCUMENT_OWNERSHIP.md)

## 상태

- Stable
- `_local/` 의 실제 로컬 상태는 기본적으로 비추적이다.
- 구조 설명과 ignore 정책 고정을 위해 `README.md` 와 `.gitignore` 만 예외적으로 추적한다.

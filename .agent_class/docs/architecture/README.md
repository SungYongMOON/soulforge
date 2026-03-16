# .agent_class/docs/architecture

## 목적

- `.agent_class/docs/architecture/` 는 클래스 구조 문서의 정본 위치다.
- 클래스 계층의 문서와 app server 설계 문서를 루트 문서와 분리해서 관리한다.

## 포함 대상

- `CODEX_APP_SERVER_AGENT_START_CHECKLIST.md`
- `CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md`
- `CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md`
- `DEVELOPER_INSTRUCTION_TIPS.md`
- Codex App Server 1EA thread / 2EA multi-instance 설계 참고 문서
- Codex App Server 실전 설계 시작 체크리스트
- 실험 기반 developer instruction 구성 팁
- 현재 운영에 필요한 class owner / tooling 참고 문서

## 제외 대상

- 저장소 전체 아키텍처 문서
- 수행 전 계획, 수행 로그, 재사용 프롬프트

## 관련 경로

- [`.agent_class/docs/README.md`](../README.md)
- [`.agent_class/docs/architecture/CODEX_APP_SERVER_AGENT_START_CHECKLIST.md`](CODEX_APP_SERVER_AGENT_START_CHECKLIST.md)
- [`.agent_class/docs/architecture/CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md`](CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md)
- [`.agent_class/docs/architecture/CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md`](CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md)
- [`.agent_class/docs/architecture/DEVELOPER_INSTRUCTION_TIPS.md`](DEVELOPER_INSTRUCTION_TIPS.md)
- [`docs/architecture/README.md`](../../../docs/architecture/README.md)

## 상태

- Stable
- `CODEX_APP_SERVER_AGENT_START_CHECKLIST.md`, `CODEX_APP_SERVER_MULTI_AGENT_GUIDE.md`, `CODEX_APP_SERVER_MULTI_INSTANCE_GUIDE.md`, `DEVELOPER_INSTRUCTION_TIPS.md` 는 현재 운영 참고 문서다.
- loadout-era architecture 문서는 live owner path 에서 제거했다.
- historical 설명이 필요하면 `dev/log/**`, `dev/plan/**`, `docs/architecture/archive/**` 를 참조한다.

# 2026-03-15 Soulforge / OpenClaw / Codex 브리지 구상 계획

## 목적

- Soulforge를 정본으로 유지하면서 OpenClaw와 Codex를 어떤 역할로 배치할지 기준을 고정한다.
- ACP, MCP, Codex App Server의 관계를 구분하고, 실제 연결 가능한 경로를 정리한다.
- 추후 multi-agent workflow 실험 전에 어떤 검증을 먼저 해야 하는지 남긴다.

## 현재 판단

- Soulforge는 에이전트, 워크플로우, handoff, owner 경계를 정의하는 정본 구조다.
- OpenClaw는 agent별 독립 세션과 오케스트레이션에 강한 실행기다.
- Codex는 고품질 coding worker 와 Codex App Server / MCP server 표면을 제공하는 런타임이다.
- Codex가 공식적으로 ACP server 를 제공한다는 근거는 아직 확보하지 못했다.
- OpenClaw의 `codex` ACP 경로는 Codex를 external harness target 으로 쓰는 해석이 가장 안전하다.

## 핵심 질문

1. Soulforge 정본을 OpenClaw agent 정의로 어떻게 투영할 것인가?
2. OpenClaw가 Codex를 붙일 때 기본 ACP 경로를 쓸지, Codex App Server 브리지를 쓸지?
3. 회사 업무용 PC 와 오케스트레이터 PC 가 분리될 때 파일 접근을 어떻게 제한할 것인가?
4. workflow 실행 결과를 텍스트 응답으로 받을지, artifact ref 중심으로 받을지?

## 현재 구조 해석

### 1. Soulforge

- 정본 owner
- agent / workflow / handoff / workspace 규칙 정의
- 실행 로그나 외부 runtime 상태의 정본은 아님

### 2. OpenClaw

- 오케스트레이터
- agent별 세션 분리
- inbox / outbox / handoff 중심의 workflow 제어

### 3. Codex

- coding worker
- repo 읽기, 수정, 테스트, review 에 강함
- 외부 표면은 App Server 와 MCP server 가 공식 확인됨

## 프로토콜 구분

| 항목 | 의미 | 현재 계획에서의 역할 |
| --- | --- | --- |
| ACP | client 와 agent 사이 프로토콜 | OpenClaw가 worker agent 를 호출할 때 검토 대상 |
| MCP | AI 앱과 tool/data server 사이 프로토콜 | Codex 또는 다른 host 가 외부 도구를 붙일 때 사용 |
| Codex App Server | Codex 런타임의 bidirectional JSON-RPC 표면 | OpenClaw 직접 연동이 안 되면 브리지 대상으로 사용 |

## 우선 결론

- 기본 목표는 `Soulforge = 정본`, `OpenClaw = orchestration`, `Codex = worker` 로 둔다.
- OpenClaw 기본 ACP 경로가 회사 PC 의 Codex를 직접 붙이기 어렵다면, 노트북/업무용 PC 쪽에 브리지나 로컬 endpoint 가 필요하다.
- 보안상 기본 정책은 `OpenClaw = 상태/요약/artifact ref 만 수신`, `실제 파일 = 업무용 PC 또는 사내 저장소에 유지` 로 둔다.

## 검증 우선순위

- [ ] OpenClaw의 `codex` ACP 경로가 실제로 어떤 Codex 표면을 호출하는지 공식 문서와 최소 실험으로 재확인
- [ ] Codex App Server 프로토콜과 ACP 세션 요구사항 차이를 정리
- [ ] 회사 PC 파일시스템을 직접 열지 않고 artifact ref 만 반환하는 결과 스키마 초안 작성
- [ ] Soulforge workflow 를 OpenClaw agent/session 생성 payload 로 투영하는 최소 adapter 형태 정의
- [ ] `mail -> classify -> file_move -> calendar -> notify` 기준 첫 workflow 상태기계 초안 작성

## 비가역 원칙

- Soulforge 정본을 OpenClaw 런타임 구조에 종속시키지 않는다.
- OpenClaw 세션 로그를 Soulforge canonical memory 로 승격하지 않는다.
- 업무용 PC 파일 전체를 오케스트레이터에 직접 노출하지 않는다.
- Codex App Server 와 ACP 를 같은 프로토콜이라고 전제하지 않는다.

## 다음 단계

1. ACP 와 Codex App Server 메시지 구조 차이를 정리한다.
2. 회사 PC 기준 remote worker 배치안을 2안으로 압축한다.
3. Soulforge adapter 초안과 result/artifact ref 스키마를 만든다.

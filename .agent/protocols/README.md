# .agent/protocols

## 목적

- `protocols/` 는 body 공통 운영 프로토콜을 둔다.
- request intake, handoff, decision, incident, escalation 사이를 잇는 durable operating contract 를 본체 소유 경계에서 관리한다.

## 포함 대상

- `request_contract.yaml`, `handoff_contract.yaml`, `decision_contract.yaml`, `incident_contract.yaml`, `escalation_contract.yaml`
- 본체 공통 운영 프로토콜
- `policy/`, `communication/`, `runtime/`, `sessions/` 를 잇는 참조 규칙

## 제외 대상

- 채널 tone 과 reply shape 자체
- species-free floor 자체
- class workflow 정의
- 프로젝트별 `.project_agent/` 계약
- team shared collaboration playbook

## 대표 파일

- [`request_contract.yaml`](request_contract.yaml): human/peer 요청을 정규화할 intake 계약
- [`handoff_contract.yaml`](handoff_contract.yaml): continuity only handoff 계약
- [`escalation_contract.yaml`](escalation_contract.yaml): escalation trigger 와 target 계약

## 참조 관계

- `communication/` vs `protocols/`: `communication/` 이 채널 semantics 와 표현 규범을 소유하면, `protocols/` 는 그 규범을 언제 어떤 request/handoff 절차로 사용할지의 operating contract 를 소유한다.
- `protocols/` 는 `policy/` 와 `runtime/` 을 참조하지만, runtime 설정이나 floor 정책을 직접 소유하지 않는다.
- `sessions/` 의 continuity template 는 handoff contract 의 입력이 될 수 있지만, raw transcript 는 protocol canonical data 가 아니다.
- [`../communication/README.md`](../communication/README.md)
- [`../policy/README.md`](../policy/README.md)
- [`../runtime/README.md`](../runtime/README.md)
- [`../sessions/README.md`](../sessions/README.md)

## 변경 원칙

- 협업용 shared 프로토콜이 생기면 canonical owner 는 `_teams/shared/` 로 두고, 여기에는 body private default 만 남긴다.
- contract YAML 에는 runtime 관측 결과를 넣지 않고 필수 필드, 금지 필드, 참조 규칙만 선언한다.
- 운영 프로토콜이 세분화되면 protocol 문서군을 추가하되, channel semantics 나 floor rule 본문을 이 폴더로 흡수하지 않는다.

# .agent/communication

## 목적

- `communication/` 는 본체의 외부 상호작용 규칙을 둔다.
- human 과 peer 채널별 전달 규범, tone, payload shape 같은 본체 공통 커뮤니케이션 경계를 관리한다.

## 포함 대상

- `human_channel_profile.yaml`, `peer_channel_profile.yaml`
- 채널별 상호작용 메타와 공통 정책 참조
- 본체 기본 응답 형식과 전달 규범

## 제외 대상

- universal floor 정책과 permission rule
- request, handoff, decision, incident, escalation 같은 운영 프로토콜
- 개별 도구 연결 구현
- 프로젝트별 커뮤니케이션 산출물
- team shared 커뮤니케이션 운영 규정

## 대표 파일

- [`human_channel_profile.yaml`](human_channel_profile.yaml): human-facing 전달 우선순위와 경계 규칙을 정의하는 파일
- [`peer_channel_profile.yaml`](peer_channel_profile.yaml): peer handoff 에 필요한 payload order 와 continuity 경계를 정의하는 파일
- [`../body.yaml`](../body.yaml): communication section ownership 과 file index 를 고정하는 body 메타

## 참조 관계

- `policy/` vs `communication/`: `policy/` 가 허용 범위와 금지선을 고정하면, `communication/` 은 그 범위 안에서 어떤 말투와 형식으로 전달할지 정한다.
- `communication/` vs `protocols/`: `communication/` 은 채널 semantics 와 표현 규범을 다루고, `protocols/` 는 request, handoff, escalation 같은 운영 계약을 다룬다.
- `communication/` 은 실제 연결 구현을 소유하지 않으며, tool 계층이나 runtime layer 는 여기의 규범을 소비하는 쪽이다.
- [`../README.md`](../README.md)
- [`../policy/README.md`](../policy/README.md)
- [`../protocols/README.md`](../protocols/README.md)

## 변경 원칙

- 채널별 세부 규약이 늘어나면 `policy/` 와 `protocols/` 와의 교차 참조를 같은 변경 안에서 명시한다.
- floor 규칙이나 운영 절차를 communication 문서 안에 복제하지 않고 링크로만 연결한다.
- human/peer profile 에 관측되지 않은 runtime 상태를 적지 않고, 전달 규범과 금지선만 선언한다.

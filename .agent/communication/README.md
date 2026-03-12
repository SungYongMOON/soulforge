# .agent/communication

## 목적

- `communication/` 는 사람과 바깥 채널에 어떻게 말할지의 표현 계층을 둔다.
- human 과 peer 채널별 tone, response shape, status update 규범을 관리한다.

## 포함 대상

- `human_channel_profile.yaml`, `peer_channel_profile.yaml`, `response_contract.md`
- human-facing tone, peer-facing tone
- 응답 구조와 질문 예산

## 제외 대상

- species-free floor 정책
- 운영 프로토콜 원문
- 세션 상태 데이터
- runtime 실행 순서

## 대표 파일

- [`human_channel_profile.yaml`](human_channel_profile.yaml): human-facing 전달 우선순위와 경계 규칙
- [`peer_channel_profile.yaml`](peer_channel_profile.yaml): peer handoff payload order 와 continuity 경계
- [`response_contract.md`](response_contract.md): 기본 응답 shape 와 상태 업데이트 규칙

## 참조 관계

- `policy/` vs `communication/`: `policy/` 가 허용 범위와 금지선을 고정하면, `communication/` 은 그 범위 안에서 어떤 말투와 형식으로 전달할지 정한다.
- `communication/` vs `protocols/`: `communication/` 은 채널 semantics 와 표현 규범을 다루고, `protocols/` 는 request, handoff, escalation 같은 운영 계약을 다룬다.
- [`../policy/README.md`](../policy/README.md)
- [`../protocols/README.md`](../protocols/README.md)

## 변경 원칙

- floor 규칙이나 운영 절차를 communication 문서 안에 복제하지 않고 링크로만 연결한다.
- human/peer profile 에 관측되지 않은 runtime 상태를 적지 않는다.
- 응답 형식이 바뀌면 `response_contract.md` 와 관련 protocol contract 를 함께 갱신한다.

# .agent/sessions

## 목적

- `sessions/` 는 transcript 저장소가 아니라 continuity 저장소다.
- 세션 재개, handoff, carry-forward 에 필요한 연결 상태를 continuity only 원칙으로 본체 차원에서 보존한다.

## 포함 대상

- `checkpoint_template.yaml`
- 세션 식별 정보
- continuity checkpoint, resume cursor, handoff 메타

## 제외 대상

- raw conversation transcript
- 장기 기억과 project 전용 작업 로그
- loadout 별 임시 작업 버퍼
- host-local runtime state

## 대표 파일

- [`checkpoint_template.yaml`](checkpoint_template.yaml): continuity only checkpoint 가 포함해야 할 필드와 금지 필드를 정의하는 템플릿
- [`README.md`](README.md): sessions owner 경계와 continuity 저장 책임을 정의하는 현재 정본
- [`../body_state.yaml`](../body_state.yaml): sessions section 이 body continuity 계층으로 존재함을 재생성하는 메타

## 참조 관계

- `memory/` vs `sessions/`: `sessions/` 는 resume 와 handoff 를 위한 현재성 있는 continuity 상태를 다루고, `memory/` 는 세션이 끝나도 남는 장기 기억을 다룬다.
- `protocols/handoff_contract.yaml` 은 `sessions/checkpoint_template.yaml` 을 참조할 수 있지만 raw transcript 를 canonical input 으로 쓰지 않는다.
- transcript archive 가 필요해도 canonical owner 는 `sessions/` 가 아니며, transcript 자체는 별도 owner 아래로 분리한다.
- [`../README.md`](../README.md)
- [`../memory/README.md`](../memory/README.md)
- [`../protocols/README.md`](../protocols/README.md)

## 변경 원칙

- continuity 품질을 높이기 위한 요약, 압축, handoff 포맷은 추가할 수 있지만 장기 기억으로 승격되는 내용은 `memory/` 로 넘긴다.
- raw transcript, mission log 원본, project-local 버퍼를 여기의 canonical 데이터로 두지 않는다.
- continuity only 원칙이 바뀌면 `checkpoint_template.yaml`, protocol contract, body operating constraints 를 같은 변경 안에서 함께 갱신한다.

# .agent/sessions

## 목적

- `sessions/` 는 transcript 저장소가 아니라 작업 연속성을 잇는 continuity 저장소다.
- 세션 재개, handoff, carry-forward 에 필요한 연결 상태를 continuity only 원칙으로 보존한다.

## 포함 대상

- `checkpoints/`, `checkpoint_template.yaml`, `active_session.example.yaml`
- 현재 task id, 현재 목표, 마지막 결정, 다음 액션, 열린 리스크
- continuity checkpoint 와 handoff 메타
- task lineage, artifact refs, verification summary 같은 carry-forward 요약

## 제외 대상

- raw conversation transcript
- 장기 기억과 project 전용 작업 로그
- host-local runtime state
- policy 원문

## 대표 파일

- [`checkpoint_template.yaml`](checkpoint_template.yaml): continuity only 원칙 안에서 lineage 와 verification summary 를 담는 checkpoint 템플릿
- [`active_session.example.yaml`](active_session.example.yaml): active session 예시
- [`checkpoints/README.md`](checkpoints/README.md): checkpoint 저장 경계

## 참조 관계

- `memory/` vs `sessions/`: `sessions/` 는 resume 와 handoff 를 위한 현재성 있는 continuity 상태를 다루고, `memory/` 는 세션이 끝나도 남는 장기 기억을 다룬다.
- `protocols/handoff_contract.yaml` 은 `sessions/checkpoint_template.yaml` 을 참조할 수 있지만 raw transcript 를 canonical input 으로 쓰지 않는다.
- [`../memory/README.md`](../memory/README.md)
- [`../protocols/README.md`](../protocols/README.md)

## 변경 원칙

- 요약, 압축, handoff 포맷은 추가할 수 있지만 장기 기억으로 승격되는 내용은 `memory/` 로 넘긴다.
- raw transcript, mission log 원본, project-local 버퍼를 여기의 canonical 데이터로 두지 않는다.
- continuity only 원칙이 바뀌면 `checkpoint_template.yaml`, protocol contract, body operating profiles 를 같은 변경 안에서 함께 갱신한다.
